import { randomBytes } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { Cita, RehEjercicio, RehPlan, RehSesion, User } from '../../payload-types'
import { ARTICULACIONES, LADOS, MOVIMIENTOS } from '../../collections/clinica/rehabilitacion'
import { folioParaId } from '../../collections/clinica/acceso'
import { diaLocal } from '../localTime'
import { calcularPermisos } from '../permisosBase'
import { paquetesDeMascota, sumarDias } from './paquetes'
import { type Ctx, type CtxTutor, contextoDesdeHeaders, contextoTutor, ErrorClinica, idDe, mascotaDelTutor, urlFoto } from './servicio'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Ruta ortopédica · fase 4: rehabilitación
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PLAN (`reh-planes`, folio REH-): uno activo por mascota. Motivo, objetivo,
 * servicio de la sesión (el que se agenda), sesiones previstas, frecuencia y
 * los EJERCICIOS PARA CASA (copiados del catálogo `reh-ejercicios` con las
 * repeticiones y las veces al día que fija el equipo).
 *
 * SESIONES (`reh-sesiones`): lo que mide el equipo en cada sesión: dolor 0–10,
 * cojera 0–5, goniometría (articulación, lado, flexión o extensión, grados) y
 * perímetro del muslo. Son rangos de CAPTURA (evitan teclazos); la plataforma
 * no interpreta los valores ni diagnostica. Una sesión puede ligarse a su cita.
 *
 * COBRO (decisión de Jano: «paquetes y por sesión»): cada sesión es una cita
 * de la agenda con el servicio del plan. Si la mascota tiene un paquete con
 * saldo de ese servicio, la agenda lo liga y lo descuenta al finalizar; si no,
 * la cita se cobra como siempre (`cita-<id>`). Este archivo no cobra nada.
 *
 * TUTOR: en su app ve el plan, sus próximas citas, los ejercicios con foto o
 * video, marca cuántas veces los hizo hoy (o ayer) y ve la gráfica de dolor y
 * cojera con la nota que le deja el equipo. Nunca ve la nota interna ni la
 * goniometría.
 *
 * PERMISOS: crear, editar y terminar planes, asignar ejercicios y registrar
 * sesiones = «Escribir expediente». Leer = «Ver expediente» o «Agenda».
 *
 * Toda escritura de un plan toma `pg_advisory_xact_lock(6 900 000 + id)`.
 */

const prohibido = (m: string) => new ErrorClinica(403, m)
const invalido = (m: string) => new ErrorClinica(400, m)
const noEncontrado = (m = 'No encontramos ese plan de rehabilitación.') => new ErrorClinica(404, m)

const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const quien = (ctx: Ctx) => ctx.user.name || ctx.user.email
const DIAS_CASA = 14
const DIAS_PORTAL_TERMINADO = 14

export type EjercicioCatalogo = { id: number; nombre: string; comoSeHace: string; foto: string | null; video: string | null }
export type EjercicioPlan = { clave: string; ejercicioId: number | null; nombre: string; comoSeHace: string | null; foto: string | null; video: string | null; repeticiones: string | null; vecesAlDia: number; nota: string | null; activo: boolean; desde: string | null; por: string | null; quitadoEn: string | null }
export type Medicion = { articulacion: string; lado: string; movimiento: string; grados: number }
export type SesionVista = { id: number; numero: number; fecha: string; cita: { id: number; folio: string } | null; por: string | null; dolor: number | null; cojera: number | null; mediciones: Medicion[]; perimetroIzq: number | null; perimetroDer: number | null; terapias: string | null; notaInterna: string | null; notaTutor: string | null; quitable: boolean }
export type PlanBreve = {
  id: number
  folio: string
  mascota: { id: number; nombre: string; especie: string; foto: string | null }
  motivo: string
  estado: 'activo' | 'terminado'
  inicio: string
  fin: string | null
  sesiones: number
  sesionesPrevistas: number | null
  ultimaSesion: string | null
  /** % de lo esperado en casa los últimos 7 días (null sin ejercicios). */
  cumplimiento7: number | null
  responsable: string | null
}
export type CasaVista = { dias: string[]; filas: { clave: string; nombre: string; vecesAlDia: number; hechas: (number | null)[] }[] }
export type PlanVista = PlanBreve & {
  cliente: { id: number; nombre: string; telefono: string | null } | null
  objetivo: string | null
  frecuencia: string | null
  servicio: { id: number; nombre: string } | null
  hoja: { id: number; folio: string } | null
  ejercicios: EjercicioPlan[]
  sesionesLista: SesionVista[]
  casa: CasaVista
  paquete: { folio: string; nombre: string; quedan: number; total: number } | null
  proximas: { id: number; dia: string; hora: string; servicio: string }[]
  /** Citas de hoy de la mascota (llegada, en atención o finalizada) que aún no tienen sesión. */
  citasHoy: { id: number; folio: string; hora: string; servicio: string }[]
  resumenFinal: string | null
}

const ARTIC = new Map<string, string>(ARTICULACIONES.map((a) => [a.value, a.label]))
const LADO = new Map<string, string>(LADOS.map((a) => [a.value, a.label]))
const MOV = new Map<string, string>(MOVIMIENTOS.map((a) => [a.value, a.label]))
/** «Rodilla derecha», «Codo izquierdo»: el lado concuerda con la articulación. */
const ladoDe = (articulacion: string, lado: string) => {
  const l = (LADO.get(lado) ?? lado).toLowerCase()
  return articulacion === 'cadera' || articulacion === 'rodilla' ? l.replace(/o$/, 'a') : l
}
export const nombreMedicion = (m: Pick<Medicion, 'articulacion' | 'lado' | 'movimiento'>) => `${ARTIC.get(m.articulacion) ?? m.articulacion} ${ladoDe(m.articulacion, m.lado)} · ${(MOV.get(m.movimiento) ?? m.movimiento).toLowerCase()}`

const urlFotoEjercicio = (e: Pick<RehEjercicio, 'id' | 'foto' | 'updatedAt'> | null | undefined) => (e?.foto ? `/api/clinica/rehabilitacion/ejercicios/${e.id}/foto?v=${encodeURIComponent(e.updatedAt)}` : null)

/** Día local (AAAA-MM-DD) desde el que cuenta un ejercicio y el último día en que contó. */
function vigencia(e: NonNullable<RehPlan['ejercicios']>[number]): { de: string; hasta: string | null } {
  return { de: e.desde ? diaLocal(new Date(e.desde)) : '0000-00-00', hasta: e.quitadoEn ? sumarDias(diaLocal(new Date(e.quitadoEn)), -1) : null }
}
const vigenteEn = (e: NonNullable<RehPlan['ejercicios']>[number], dia: string) => {
  const v = vigencia(e)
  return v.de <= dia && (!v.hasta || dia <= v.hasta)
}

/** Lo hecho en casa por día y ejercicio. */
function mapaCasa(p: RehPlan): Map<string, number> {
  const m = new Map<string, number>()
  for (const r of p.casa ?? []) m.set(`${r.dia}|${r.clave}`, r.veces)
  return m
}

function cumplimiento(p: RehPlan, hasta: string, dias: number): number | null {
  const casa = mapaCasa(p)
  let esperadas = 0
  let hechas = 0
  for (let i = 0; i < dias; i++) {
    const dia = sumarDias(hasta, -i)
    if (dia < diaLocal(new Date(p.inicio))) break
    for (const e of p.ejercicios ?? []) {
      if (!vigenteEn(e, dia)) continue
      esperadas += e.vecesAlDia
      hechas += Math.min(e.vecesAlDia, casa.get(`${dia}|${e.clave}`) ?? 0)
    }
  }
  return esperadas ? Math.round((hechas / esperadas) * 100) : null
}

async function cargar(payload: Payload, id: number, req?: PayloadRequest): Promise<RehPlan> {
  try {
    return await payload.findByID({ collection: 'reh-planes', id, depth: 0, overrideAccess: true, req })
  } catch {
    throw noEncontrado()
  }
}

async function sesionesDe(payload: Payload, planIds: number[]): Promise<RehSesion[]> {
  if (!planIds.length) return []
  const r = await payload.find({ collection: 'reh-sesiones', depth: 0, pagination: false, overrideAccess: true, sort: 'fecha', where: { plan: { in: planIds } } })
  return r.docs
}

async function breve(payload: Payload, p: RehPlan, sesiones: RehSesion[], hoy: string): Promise<PlanBreve> {
  const m = await payload.findByID({ collection: 'mascotas', id: idDe(p.mascota)!, depth: 0, overrideAccess: true })
  const resp = idDe(p.responsable) ? await payload.findByID({ collection: 'users', id: idDe(p.responsable)!, depth: 0, overrideAccess: true }).catch(() => null) : null
  const propias = sesiones.filter((s) => idDe(s.plan) === p.id)
  return {
    id: p.id,
    folio: folioParaId('REH', p.id),
    mascota: { id: m.id, nombre: m.nombre, especie: m.especie, foto: urlFoto(m.id, m.fotoFecha) },
    motivo: p.motivo,
    estado: p.estado,
    inicio: p.inicio,
    fin: p.fin ?? null,
    sesiones: propias.length,
    sesionesPrevistas: p.sesionesPrevistas ?? null,
    ultimaSesion: propias.length ? propias[propias.length - 1].fecha : null,
    cumplimiento7: cumplimiento(p, p.estado === 'terminado' && p.fin ? diaLocal(new Date(p.fin)) : hoy, 7),
    responsable: resp ? (resp as User).name || (resp as User).email : null,
  }
}

function vistaEjercicios(p: RehPlan, catalogo: Map<number, RehEjercicio>): EjercicioPlan[] {
  return (p.ejercicios ?? []).map((e) => {
    const c = idDe(e.ejercicio) ? catalogo.get(idDe(e.ejercicio)!) : undefined
    return { clave: e.clave, ejercicioId: idDe(e.ejercicio), nombre: e.nombre, comoSeHace: e.comoSeHace ?? null, foto: urlFotoEjercicio(c), video: t(c?.video), repeticiones: e.repeticiones ?? null, vecesAlDia: e.vecesAlDia, nota: e.nota ?? null, activo: e.activo !== false, desde: e.desde ?? null, por: e.por ?? null, quitadoEn: e.quitadoEn ?? null }
  })
}

async function catalogoDe(payload: Payload, p: RehPlan): Promise<Map<number, RehEjercicio>> {
  const ids = [...new Set((p.ejercicios ?? []).map((e) => idDe(e.ejercicio)).filter((x): x is number => Boolean(x)))]
  if (!ids.length) return new Map()
  const r = await payload.find({ collection: 'reh-ejercicios', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: ids } } })
  return new Map(r.docs.map((e) => [e.id, e]))
}

const vistaSesion = (s: RehSesion, i: number, hoy: string, activo: boolean): SesionVista => ({
  id: s.id,
  numero: i + 1,
  fecha: s.fecha,
  cita: idDe(s.cita) ? { id: idDe(s.cita)!, folio: folioParaId('CIT', idDe(s.cita)!) } : null,
  por: s.por ?? null,
  dolor: s.dolor ?? null,
  cojera: s.cojera ?? null,
  mediciones: (s.mediciones ?? []).map((m) => ({ articulacion: m.articulacion, lado: m.lado, movimiento: m.movimiento, grados: m.grados })),
  perimetroIzq: s.perimetroIzq ?? null,
  perimetroDer: s.perimetroDer ?? null,
  terapias: s.terapias ?? null,
  notaInterna: s.notaInterna ?? null,
  notaTutor: s.notaTutor ?? null,
  /* Un registro capturado por error se quita el mismo día, con el plan activo. */
  quitable: activo && diaLocal(new Date(s.fecha)) === hoy,
})

function vistaCasa(p: RehPlan, hoy: string): CasaVista {
  const casa = mapaCasa(p)
  const dias = Array.from({ length: DIAS_CASA }, (_, i) => sumarDias(hoy, -(DIAS_CASA - 1 - i)))
  return {
    dias,
    filas: (p.ejercicios ?? [])
      .filter((e) => dias.some((d) => vigenteEn(e, d)))
      .map((e) => ({ clave: e.clave, nombre: e.nombre, vecesAlDia: e.vecesAlDia, hechas: dias.map((d) => (vigenteEn(e, d) ? (casa.get(`${d}|${e.clave}`) ?? 0) : null)) })),
  }
}

async function proximasCitas(payload: Payload, p: RehPlan, hoy: string): Promise<PlanVista['proximas']> {
  const r = await payload.find({ collection: 'citas', depth: 1, limit: 6, sort: 'dia', overrideAccess: true, where: { and: [{ mascota: { equals: idDe(p.mascota) } }, { dia: { greater_than_equal: hoy } }, { estado: { in: ['solicitada', 'confirmada'] } }, ...(idDe(p.servicio) ? [{ servicio: { equals: idDe(p.servicio) } }] : [])] } })
  return r.docs
    .map((c) => ({ id: c.id, dia: c.dia, hora: c.horaInicio, servicio: typeof c.servicio === 'object' && c.servicio ? c.servicio.nombre : '' }))
    .sort((a, b) => (a.dia + a.hora).localeCompare(b.dia + b.hora))
}

async function vista(ctx: Ctx, p: RehPlan): Promise<PlanVista> {
  const sesiones = await sesionesDe(ctx.payload, [p.id])
  const b = await breve(ctx.payload, p, sesiones, ctx.hoy)
  const cliente = idDe(p.cliente) ? await ctx.payload.findByID({ collection: 'clientes', id: idDe(p.cliente)!, depth: 0, overrideAccess: true }).catch(() => null) : null
  const servicio = idDe(p.servicio) ? await ctx.payload.findByID({ collection: 'servicios', id: idDe(p.servicio)!, depth: 0, overrideAccess: true }).catch(() => null) : null
  const [catalogo, proximas, citasHoy] = await Promise.all([
    catalogoDe(ctx.payload, p),
    proximasCitas(ctx.payload, p, ctx.hoy),
    ctx.payload.find({ collection: 'citas', depth: 1, pagination: false, overrideAccess: true, where: { and: [{ mascota: { equals: idDe(p.mascota) } }, { dia: { equals: ctx.hoy } }, { estado: { in: ['llegada', 'atencion', 'finalizada'] } }] } }),
  ])
  const ligadas = new Set(sesiones.map((s) => idDe(s.cita)).filter(Boolean))
  /* Saldo del paquete de ese servicio (solo lectura; el cobro lo hace la agenda). */
  let paquete: PlanVista['paquete'] = null
  if (servicio) {
    try {
      const d = await paquetesDeMascota({ ...ctx, p: calcularPermisos({ esSuperadmin: true }, null) }, b.mascota.id)
      for (const v of d.vendidos.filter((x) => x.estado === 'activo')) {
        const r = v.renglones.find((x) => x.tipo === 'servicio' && x.servicioId === servicio.id)
        if (r) {
          paquete = { folio: v.folio, nombre: v.nombre, quedan: r.quedan, total: r.total }
          break
        }
      }
    } catch {
      paquete = null
    }
  }
  return {
    ...b,
    cliente: cliente ? { id: cliente.id, nombre: cliente.nombreCompleto || cliente.nombre, telefono: cliente.telefono ?? null } : null,
    objetivo: p.objetivo ?? null,
    frecuencia: p.frecuencia ?? null,
    servicio: servicio ? { id: servicio.id, nombre: servicio.nombre } : null,
    hoja: idDe(p.hoja) ? { id: idDe(p.hoja)!, folio: folioParaId('HQ', idDe(p.hoja)!) } : null,
    ejercicios: vistaEjercicios(p, catalogo),
    sesionesLista: sesiones.map((s, i) => vistaSesion(s, i, ctx.hoy, p.estado === 'activo')).reverse(),
    casa: vistaCasa(p, ctx.hoy),
    paquete,
    proximas,
    citasHoy: citasHoy.docs.filter((c) => !ligadas.has(c.id)).map((c) => ({ id: c.id, folio: folioParaId('CIT', c.id), hora: c.horaInicio, servicio: typeof c.servicio === 'object' && c.servicio ? c.servicio.nombre : '' })),
    resumenFinal: p.resumenFinal ?? null,
  }
}

async function conCandado<T>(payload: Payload, user: User | null, id: number, fn: (req: PayloadRequest, p: RehPlan) => Promise<T>): Promise<T> {
  const req = await createLocalReq(user ? { user: user as User & { collection: 'users' } } : {}, payload)
  const propia = await initTransaction(req)
  try {
    const sesiones = (payload.db as unknown as { sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions
    const tx = req.transactionID ? sesiones?.[String(await req.transactionID)]?.db : null
    if (tx) await tx.execute(sql`select pg_advisory_xact_lock(${6900000 + id})`)
    const p = await cargar(payload, id, req)
    const r = await fn(req, p)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

const puedeLeer = (ctx: Ctx) => ctx.p.clinica.verExpediente || ctx.p.clinica.agenda
const puedeEscribir = (ctx: Ctx) => ctx.p.clinica.escribirExpediente
const exigir = (ok: boolean, m: string) => {
  if (!ok) throw prohibido(m)
}
const exigirActivo = (p: RehPlan) => {
  if (p.estado !== 'activo') throw invalido('El plan ya terminó: no se cambia.')
}
/** Sin arreglos con `id` de Payload (se reescriben completos). */
const limpio = <T extends { id?: unknown }>(xs: T[] | null | undefined): Omit<T, 'id'>[] => (xs ?? []).map(({ id: _i, ...r }) => (void _i, r))

/* ───────────────────────────── equipo: leer ───────────────────────────── */

export async function tableroRehabilitacion(ctx: Ctx): Promise<{ activos: PlanBreve[]; terminados: PlanBreve[]; puedeCrear: boolean }> {
  exigir(puedeLeer(ctx), 'Tu rol no incluye el expediente.')
  const [act, ter] = await Promise.all([
    ctx.payload.find({ collection: 'reh-planes', depth: 0, pagination: false, sort: 'inicio', overrideAccess: true, where: { estado: { equals: 'activo' } } }),
    ctx.payload.find({ collection: 'reh-planes', depth: 0, limit: 10, sort: '-fin', overrideAccess: true, where: { estado: { equals: 'terminado' } } }),
  ])
  const sesiones = await sesionesDe(ctx.payload, [...act.docs, ...ter.docs].map((p) => p.id))
  return {
    activos: await Promise.all(act.docs.map((p) => breve(ctx.payload, p, sesiones, ctx.hoy))),
    terminados: await Promise.all(ter.docs.map((p) => breve(ctx.payload, p, sesiones, ctx.hoy))),
    puedeCrear: puedeEscribir(ctx),
  }
}

export async function planRehabilitacion(ctx: Ctx, id: number): Promise<PlanVista & { permisos: { escribir: boolean } }> {
  exigir(puedeLeer(ctx), 'Tu rol no incluye el expediente.')
  return { ...(await vista(ctx, await cargar(ctx.payload, id))), permisos: { escribir: puedeEscribir(ctx) } }
}

export async function planesDeMascota(ctx: Ctx, mascotaId: number): Promise<PlanBreve[]> {
  exigir(puedeLeer(ctx), 'Tu rol no incluye el expediente.')
  const r = await ctx.payload.find({ collection: 'reh-planes', depth: 0, pagination: false, sort: '-inicio', overrideAccess: true, where: { mascota: { equals: mascotaId } } })
  const sesiones = await sesionesDe(ctx.payload, r.docs.map((p) => p.id))
  return Promise.all(r.docs.map((p) => breve(ctx.payload, p, sesiones, ctx.hoy)))
}

export async function catalogoEjercicios(ctx: Ctx): Promise<EjercicioCatalogo[]> {
  exigir(puedeLeer(ctx), 'Tu rol no incluye el expediente.')
  const r = await ctx.payload.find({ collection: 'reh-ejercicios', depth: 0, pagination: false, sort: 'orden', overrideAccess: true, where: { activo: { not_equals: false } } })
  return r.docs.map((e) => ({ id: e.id, nombre: e.nombre, comoSeHace: e.comoSeHace, foto: urlFotoEjercicio(e), video: t(e.video) }))
}

/** Para la agenda: el plan activo de la mascota de esa cita y, si ya existe, su sesión. */
export async function rehabilitacionDeCita(ctx: Ctx, citaId: number): Promise<{ planId: number; folio: string; sesionId: number | null } | null> {
  exigir(puedeLeer(ctx), 'Tu rol no incluye el expediente.')
  const c = await ctx.payload.findByID({ collection: 'citas', id: citaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!c) return null
  const ya = await ctx.payload.find({ collection: 'reh-sesiones', depth: 0, limit: 1, overrideAccess: true, where: { cita: { equals: citaId } } })
  if (ya.docs[0]) return { planId: idDe(ya.docs[0].plan)!, folio: folioParaId('REH', idDe(ya.docs[0].plan)!), sesionId: ya.docs[0].id }
  const p = await ctx.payload.find({ collection: 'reh-planes', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ mascota: { equals: idDe(c.mascota) } }, { estado: { equals: 'activo' } }] } })
  return p.docs[0] ? { planId: p.docs[0].id, folio: folioParaId('REH', p.docs[0].id), sesionId: null } : null
}

/* ───────────────────────────── equipo: escribir ───────────────────────────── */

const esquemaPlan = z.object({
  motivo: z.string().trim().min(3, 'Escribe el motivo (ej. «Postoperatorio de rodilla derecha»).').max(160),
  objetivo: z.string().trim().max(600).optional().default(''),
  servicioId: z.number().int().positive().nullable().optional(),
  sesionesPrevistas: z.number().int().min(1, 'Las sesiones previstas van de 1 a 100.').max(100, 'Las sesiones previstas van de 1 a 100.').nullable().optional(),
  frecuencia: z.string().trim().max(60).optional().default(''),
})

async function revisarServicio(payload: Payload, id: number | null | undefined): Promise<number | null> {
  if (!id) return null
  const s = await payload.findByID({ collection: 'servicios', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!s || s.activo === false) throw invalido('Ese servicio no existe o está inactivo.')
  return s.id
}

export async function crearPlan(ctx: Ctx, entrada: unknown): Promise<PlanVista> {
  exigir(puedeEscribir(ctx), 'Crear un plan de rehabilitación pide «Escribir expediente».')
  const d = esquemaPlan.extend({ mascotaId: z.number().int().positive(), hojaId: z.number().int().positive().nullable().optional() }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa los datos del plan.')
  const mascota = await ctx.payload.findByID({ collection: 'mascotas', id: d.data.mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!mascota) throw noEncontrado('No encontramos esa mascota.')
  if (mascota.estado === 'fallecido') throw invalido('La mascota está registrada como fallecida.')
  const ya = await ctx.payload.find({ collection: 'reh-planes', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ mascota: { equals: mascota.id } }, { estado: { equals: 'activo' } }] } })
  if (ya.docs[0]) throw invalido(`${mascota.nombre} ya tiene un plan activo (${folioParaId('REH', ya.docs[0].id)}). Termínalo o agrega ahí los ejercicios.`)
  const hoja = d.data.hojaId ? await ctx.payload.findByID({ collection: 'cir-hojas', id: d.data.hojaId, depth: 0, overrideAccess: true }).catch(() => null) : null
  if (d.data.hojaId && (!hoja || idDe(hoja.mascota) !== mascota.id)) throw invalido('Esa hoja quirúrgica no es de esta mascota.')
  const servicio = await revisarServicio(ctx.payload, d.data.servicioId)
  const clienteId = idDe((mascota.tutores ?? []).find((x) => x.principal)?.cliente ?? mascota.tutores?.[0]?.cliente)
  const doc = await ctx.payload.create({
    collection: 'reh-planes',
    overrideAccess: true,
    depth: 0,
    data: {
      mascota: mascota.id,
      cliente: clienteId,
      responsable: ctx.user.id,
      hoja: hoja?.id ?? null,
      motivo: d.data.motivo,
      objetivo: d.data.objetivo || null,
      servicio,
      sesionesPrevistas: d.data.sesionesPrevistas ?? null,
      frecuencia: d.data.frecuencia || null,
      estado: 'activo',
      inicio: new Date().toISOString(),
      ejercicios: [],
      casa: [],
      creadoPor: ctx.user.id,
    },
  })
  return vista(ctx, await cargar(ctx.payload, doc.id))
}

export async function editarPlan(ctx: Ctx, id: number, entrada: unknown): Promise<PlanVista> {
  exigir(puedeEscribir(ctx), 'Editar el plan pide «Escribir expediente».')
  const d = esquemaPlan.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa los datos del plan.')
  const servicio = await revisarServicio(ctx.payload, d.data.servicioId)
  await conCandado(ctx.payload, ctx.user, id, async (req, p) => {
    exigirActivo(p)
    await ctx.payload.update({ collection: 'reh-planes', id, overrideAccess: true, req, data: { motivo: d.data.motivo, objetivo: d.data.objetivo || null, servicio, sesionesPrevistas: d.data.sesionesPrevistas ?? null, frecuencia: d.data.frecuencia || null } })
  })
  return vista(ctx, await cargar(ctx.payload, id))
}

export async function agregarEjercicio(ctx: Ctx, id: number, entrada: unknown): Promise<PlanVista> {
  exigir(puedeEscribir(ctx), 'Asignar ejercicios pide «Escribir expediente».')
  const d = z
    .object({ ejercicioId: z.number().int().positive(), repeticiones: z.string().trim().max(80).optional().default(''), vecesAlDia: z.number().int().min(1, 'Veces al día: de 1 a 6.').max(6, 'Veces al día: de 1 a 6.'), nota: z.string().trim().max(300).optional().default('') })
    .safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa el ejercicio.')
  const e = await ctx.payload.findByID({ collection: 'reh-ejercicios', id: d.data.ejercicioId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!e || e.activo === false) throw invalido('Ese ejercicio no está disponible en el catálogo.')
  await conCandado(ctx.payload, ctx.user, id, async (req, p) => {
    exigirActivo(p)
    const lista = limpio(p.ejercicios)
    if (lista.some((x) => x.activo !== false && idDe(x.ejercicio) === e.id)) throw invalido(`«${e.nombre}» ya está en el plan.`)
    if (lista.length >= 40) throw invalido('El plan ya tiene 40 ejercicios.')
    lista.push({ clave: randomBytes(4).toString('hex'), ejercicio: e.id, nombre: e.nombre, comoSeHace: e.comoSeHace, repeticiones: d.data.repeticiones || null, vecesAlDia: d.data.vecesAlDia, nota: d.data.nota || null, activo: true, desde: new Date().toISOString(), por: quien(ctx) })
    await ctx.payload.update({ collection: 'reh-planes', id, overrideAccess: true, req, data: { ejercicios: lista } })
  })
  return vista(ctx, await cargar(ctx.payload, id))
}

export async function quitarEjercicio(ctx: Ctx, id: number, entrada: unknown): Promise<PlanVista> {
  exigir(puedeEscribir(ctx), 'Quitar ejercicios pide «Escribir expediente».')
  const d = z.object({ clave: z.string().min(1) }).safeParse(entrada)
  if (!d.success) throw invalido('Ejercicio no válido.')
  await conCandado(ctx.payload, ctx.user, id, async (req, p) => {
    exigirActivo(p)
    const lista = limpio(p.ejercicios)
    const e = lista.find((x) => x.clave === d.data.clave)
    if (!e) throw invalido('Ese ejercicio no está en el plan.')
    if (e.activo === false) return
    e.activo = false
    e.quitadoEn = new Date().toISOString()
    await ctx.payload.update({ collection: 'reh-planes', id, overrideAccess: true, req, data: { ejercicios: lista } })
  })
  return vista(ctx, await cargar(ctx.payload, id))
}

const esquemaSesion = z.object({
  citaId: z.number().int().positive().nullable().optional(),
  dolor: z.number().int().nullable().optional(),
  cojera: z.number().int().nullable().optional(),
  mediciones: z
    .array(z.object({ articulacion: z.enum(ARTICULACIONES.map((a) => a.value) as [string, ...string[]]), lado: z.enum(LADOS.map((a) => a.value) as [string, ...string[]]), movimiento: z.enum(MOVIMIENTOS.map((a) => a.value) as [string, ...string[]]), grados: z.number() }))
    .max(24, 'Máximo 24 mediciones por sesión.')
    .optional()
    .default([]),
  perimetroIzq: z.number().nullable().optional(),
  perimetroDer: z.number().nullable().optional(),
  terapias: z.string().trim().max(300).optional().default(''),
  notaInterna: z.string().trim().max(2000).optional().default(''),
  notaTutor: z.string().trim().max(1000).optional().default(''),
})

/** Rangos de CAPTURA (atrapan teclazos); no son rangos clínicos. */
const RANGO = { dolor: [0, 10], cojera: [0, 5], grados: [0, 200], perimetro: [1, 150] } as const
const fuera = (v: number | null | undefined, [a, b]: readonly [number, number]) => v != null && (v < a || v > b)

export async function registrarSesion(ctx: Ctx, id: number, entrada: unknown): Promise<PlanVista> {
  exigir(puedeEscribir(ctx), 'Registrar sesiones pide «Escribir expediente».')
  const d = esquemaSesion.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa la sesión.')
  const s = d.data
  if (fuera(s.dolor, RANGO.dolor)) throw invalido(`Dolor va de 0 a 10 (escribiste ${s.dolor}).`)
  if (fuera(s.cojera, RANGO.cojera)) throw invalido(`Cojera va de 0 a 5 (escribiste ${s.cojera}).`)
  const mala = s.mediciones.find((m) => fuera(m.grados, RANGO.grados))
  if (mala) throw invalido(`${nombreMedicion(mala)}: ${mala.grados}° parece un error de captura.`)
  const vistas = new Set<string>()
  for (const m of s.mediciones) {
    const k = `${m.articulacion}|${m.lado}|${m.movimiento}`
    if (vistas.has(k)) throw invalido(`${nombreMedicion(m)} aparece dos veces.`)
    vistas.add(k)
  }
  for (const k of ['perimetroIzq', 'perimetroDer'] as const) if (fuera(s[k], RANGO.perimetro)) throw invalido(`Perímetro de ${s[k]} cm parece un error de captura.`)
  if (s.dolor == null && s.cojera == null && !s.mediciones.length && s.perimetroIzq == null && s.perimetroDer == null && !s.terapias && !s.notaInterna && !s.notaTutor) throw invalido('Captura al menos una medición o una nota.')
  await conCandado(ctx.payload, ctx.user, id, async (req, p) => {
    exigirActivo(p)
    if (s.citaId) {
      const c = (await ctx.payload.findByID({ collection: 'citas', id: s.citaId, depth: 0, overrideAccess: true, req }).catch(() => null)) as Cita | null
      if (!c || idDe(c.mascota) !== idDe(p.mascota)) throw invalido('Esa cita no es de esta mascota.')
      if (!['llegada', 'atencion', 'finalizada'].includes(c.estado)) throw invalido('Liga la sesión a una cita que ya llegó, está en atención o terminó.')
      const ya = await ctx.payload.find({ collection: 'reh-sesiones', depth: 0, limit: 1, overrideAccess: true, req, where: { cita: { equals: c.id } } })
      if (ya.docs[0]) throw invalido('Esa cita ya tiene su sesión registrada.')
    }
    await ctx.payload.create({
      collection: 'reh-sesiones',
      overrideAccess: true,
      req,
      depth: 0,
      data: {
        plan: p.id,
        mascota: idDe(p.mascota)!,
        cita: s.citaId ?? null,
        fecha: new Date().toISOString(),
        terapeuta: ctx.user.id,
        por: quien(ctx),
        dolor: s.dolor ?? null,
        cojera: s.cojera ?? null,
        mediciones: s.mediciones.map((m) => ({ articulacion: m.articulacion as 'hombro', lado: m.lado as 'izq', movimiento: m.movimiento as 'flexion', grados: Math.round(m.grados) })),
        perimetroIzq: s.perimetroIzq != null ? Math.round(s.perimetroIzq * 10) / 10 : null,
        perimetroDer: s.perimetroDer != null ? Math.round(s.perimetroDer * 10) / 10 : null,
        terapias: s.terapias || null,
        notaInterna: s.notaInterna || null,
        notaTutor: s.notaTutor || null,
      },
    })
  })
  return vista(ctx, await cargar(ctx.payload, id))
}

export async function quitarSesion(ctx: Ctx, id: number, entrada: unknown): Promise<PlanVista> {
  exigir(puedeEscribir(ctx), 'Quitar una sesión pide «Escribir expediente».')
  const d = z.object({ sesionId: z.number().int().positive() }).safeParse(entrada)
  if (!d.success) throw invalido('Sesión no válida.')
  await conCandado(ctx.payload, ctx.user, id, async (req, p) => {
    exigirActivo(p)
    const s = await ctx.payload.findByID({ collection: 'reh-sesiones', id: d.data.sesionId, depth: 0, overrideAccess: true, req }).catch(() => null)
    if (!s || idDe(s.plan) !== p.id) throw invalido('Esa sesión no es de este plan.')
    if (diaLocal(new Date(s.fecha)) !== ctx.hoy) throw invalido('Solo se quita una sesión el mismo día en que se registró.')
    await ctx.payload.delete({ collection: 'reh-sesiones', id: s.id, overrideAccess: true, req })
  })
  return vista(ctx, await cargar(ctx.payload, id))
}

export async function terminarPlan(ctx: Ctx, id: number, entrada: unknown): Promise<PlanVista> {
  exigir(puedeEscribir(ctx), 'Terminar el plan pide «Escribir expediente».')
  const d = z.object({ resumenFinal: z.string().trim().min(10, 'Escribe un resumen para el tutor (al menos una frase).').max(2000) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa el resumen.')
  await conCandado(ctx.payload, ctx.user, id, async (req, p) => {
    exigirActivo(p)
    const ahora = new Date().toISOString()
    const ejercicios = limpio(p.ejercicios).map((e) => (e.activo !== false ? { ...e, activo: false, quitadoEn: ahora } : e))
    await ctx.payload.update({ collection: 'reh-planes', id, overrideAccess: true, req, data: { estado: 'terminado', fin: ahora, resumenFinal: d.data.resumenFinal, terminadoPor: ctx.user.id, ejercicios } })
  })
  return vista(ctx, await cargar(ctx.payload, id))
}

/* ───────────────────────────── foto de un ejercicio ───────────────────────────── */

/** La ve cualquiera del equipo o cualquier tutor con sesión (son ilustraciones del catálogo). */
export async function abrirFotoEjercicio(payload: Payload, headers: Headers, id: number): Promise<Response> {
  const equipo = await contextoDesdeHeaders(payload, headers)
  if (!equipo && !(await contextoTutor(payload, headers))) throw new ErrorClinica(401, 'Tu sesión terminó.')
  const e = await payload.findByID({ collection: 'reh-ejercicios', id, depth: 0, overrideAccess: true }).catch(() => null)
  const m = e?.foto && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(e.foto)
  if (!m) throw new ErrorClinica(404, 'Este ejercicio no tiene foto.')
  return new Response(new Uint8Array(Buffer.from(m[2], 'base64')), { headers: { 'Content-Type': m[1], 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
}

/* ───────────────────────────── tutor ───────────────────────────── */

export type EjercicioTutor = { clave: string; nombre: string; comoSeHace: string | null; foto: string | null; video: string | null; repeticiones: string | null; vecesAlDia: number; nota: string | null; hoy: number; ayer: number }
export type PlanTutor = {
  id: number
  folio: string
  mascota: { id: number; nombre: string; foto: string | null }
  motivo: string
  objetivo: string | null
  frecuencia: string | null
  estado: 'activo' | 'terminado'
  inicio: string
  fin: string | null
  sesiones: number
  sesionesPrevistas: number | null
  servicioId: number | null
  ejercicios: EjercicioTutor[]
  semana: { dia: string; hechas: number; esperadas: number }[]
  avance: { numero: number; fecha: string; dolor: number | null; cojera: number | null; notaTutor: string | null }[]
  proximas: PlanVista['proximas']
  resumenFinal: string | null
  hoy: string
  ayer: string
}

async function planDelTutor(c: CtxTutor, id: number): Promise<RehPlan> {
  const p = await cargar(c.payload, id)
  await mascotaDelTutor(c, idDe(p.mascota)!).catch(() => {
    throw noEncontrado()
  })
  return p
}

function vistaTutor(p: RehPlan, sesiones: RehSesion[], catalogo: Map<number, RehEjercicio>, mascota: { id: number; nombre: string; foto: string | null }, proximas: PlanVista['proximas'], hoy: string): PlanTutor {
  const casa = mapaCasa(p)
  const ayer = sumarDias(hoy, -1)
  const activos = (p.ejercicios ?? []).filter((e) => e.activo !== false)
  return {
    id: p.id,
    folio: folioParaId('REH', p.id),
    mascota,
    motivo: p.motivo,
    objetivo: p.objetivo ?? null,
    frecuencia: p.frecuencia ?? null,
    estado: p.estado,
    inicio: p.inicio,
    fin: p.fin ?? null,
    sesiones: sesiones.length,
    sesionesPrevistas: p.sesionesPrevistas ?? null,
    servicioId: idDe(p.servicio),
    ejercicios: vistaEjercicios({ ...p, ejercicios: activos }, catalogo).map((e) => ({ clave: e.clave, nombre: e.nombre, comoSeHace: e.comoSeHace, foto: e.foto, video: e.video, repeticiones: e.repeticiones, vecesAlDia: e.vecesAlDia, nota: e.nota, hoy: casa.get(`${hoy}|${e.clave}`) ?? 0, ayer: casa.get(`${ayer}|${e.clave}`) ?? 0 })),
    semana: Array.from({ length: 7 }, (_, i) => sumarDias(hoy, i - 6)).map((dia) => {
      const vig = (p.ejercicios ?? []).filter((e) => vigenteEn(e, dia))
      return { dia, esperadas: vig.reduce((s, e) => s + e.vecesAlDia, 0), hechas: vig.reduce((s, e) => s + Math.min(e.vecesAlDia, casa.get(`${dia}|${e.clave}`) ?? 0), 0) }
    }),
    avance: sesiones.map((s, i) => ({ numero: i + 1, fecha: s.fecha, dolor: s.dolor ?? null, cojera: s.cojera ?? null, notaTutor: s.notaTutor ?? null })),
    proximas,
    resumenFinal: p.estado === 'terminado' ? (p.resumenFinal ?? null) : null,
    hoy,
    ayer,
  }
}

export async function portalPlan(c: CtxTutor, id: number): Promise<PlanTutor> {
  const p = await planDelTutor(c, id)
  const m = await c.payload.findByID({ collection: 'mascotas', id: idDe(p.mascota)!, depth: 0, overrideAccess: true })
  const [sesiones, catalogo, proximas] = await Promise.all([sesionesDe(c.payload, [p.id]), catalogoDe(c.payload, p), proximasCitas(c.payload, p, c.hoy)])
  return vistaTutor(p, sesiones, catalogo, { id: m.id, nombre: m.nombre, foto: urlFoto(m.id, m.fotoFecha) }, proximas, c.hoy)
}

/** El tutor marca (o desmarca) una vez de un ejercicio, hoy o ayer. */
export async function portalMarcar(c: CtxTutor, id: number, entrada: unknown): Promise<PlanTutor> {
  const d = z.object({ clave: z.string().min(1), dia: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), accion: z.enum(['sumar', 'restar']) }).safeParse(entrada)
  if (!d.success) throw invalido('Revisa lo que marcaste.')
  await planDelTutor(c, id)
  const ayer = sumarDias(c.hoy, -1)
  if (d.data.dia !== c.hoy && d.data.dia !== ayer) throw invalido('Solo puedes marcar lo de hoy o lo de ayer.')
  await conCandado(c.payload, null, id, async (req, p) => {
    exigirActivo(p)
    const e = (p.ejercicios ?? []).find((x) => x.clave === d.data.clave)
    if (!e || e.activo === false || !vigenteEn(e, d.data.dia)) throw invalido('Ese ejercicio no está en el plan de ese día.')
    const casa = limpio(p.casa)
    const r = casa.find((x) => x.dia === d.data.dia && x.clave === e.clave)
    const antes = r?.veces ?? 0
    const despues = d.data.accion === 'sumar' ? antes + 1 : antes - 1
    if (despues < 0) return
    if (despues > e.vecesAlDia) throw invalido(`Ya marcaste las ${e.vecesAlDia} veces de hoy.`)
    if (r) {
      r.veces = despues
      r.en = new Date().toISOString()
    } else casa.push({ dia: d.data.dia, clave: e.clave, veces: despues, en: new Date().toISOString() })
    await c.payload.update({ collection: 'reh-planes', id, overrideAccess: true, req, data: { casa: casa.filter((x) => x.veces > 0) } })
  })
  return portalPlan(c, id)
}

/** Inicio del portal: planes activos (y terminados hace poco) de sus mascotas, con lo de hoy. */
export async function portalRehabilitaciones(c: CtxTutor, mascotaIds: number[]): Promise<{ id: number; mascota: string; estado: 'activo' | 'terminado'; hechasHoy: number; esperadasHoy: number }[]> {
  if (!mascotaIds.length) return []
  const r = await c.payload.find({ collection: 'reh-planes', depth: 1, pagination: false, overrideAccess: true, where: { mascota: { in: mascotaIds } } })
  return r.docs
    .filter((p) => p.estado === 'activo' || (p.fin && diaLocal(new Date(p.fin)) >= sumarDias(c.hoy, -DIAS_PORTAL_TERMINADO)))
    .map((p) => {
      const casa = mapaCasa(p)
      const vig = (p.ejercicios ?? []).filter((e) => e.activo !== false && vigenteEn(e, c.hoy))
      return {
        id: p.id,
        mascota: typeof p.mascota === 'object' && p.mascota ? p.mascota.nombre : '',
        estado: p.estado,
        esperadasHoy: p.estado === 'activo' ? vig.reduce((s, e) => s + e.vecesAlDia, 0) : 0,
        hechasHoy: p.estado === 'activo' ? vig.reduce((s, e) => s + Math.min(e.vecesAlDia, casa.get(`${c.hoy}|${e.clave}`) ?? 0), 0) : 0,
      }
    })
}

/** Ficha de la mascota en el portal: sus planes (para enlazarlos). */
export async function portalPlanesDeMascota(c: CtxTutor, mascotaId: number): Promise<{ id: number; motivo: string; estado: 'activo' | 'terminado'; inicio: string }[]> {
  await mascotaDelTutor(c, mascotaId)
  const r = await c.payload.find({ collection: 'reh-planes', depth: 0, pagination: false, sort: '-inicio', overrideAccess: true, where: { mascota: { equals: mascotaId } } })
  return r.docs.map((p) => ({ id: p.id, motivo: p.motivo, estado: p.estado, inicio: p.inicio }))
}
