import { randomBytes } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { HosInternamiento, User } from '../../payload-types'
import { APETITO } from '../../collections/clinica/hospital'
import { folioParaId } from '../../collections/clinica/acceso'
import { registrar as registrarEnFinanzas } from '../finanzas/servicio'
import { aCentavos, aPesos } from '../finanzas/reglas'
import { MAX_FOTO_BASE64 } from '../fotosBase64'
import { diaLocal, instanteDesdeLocal, partesLocales } from '../localTime'
import { calcularPermisos } from '../permisosBase'
import { site } from '../site'
import { contactoClinica } from '../sitio/contacto'
import { fechaLarga } from '../whatsapp'
import { correoDelTutor } from './avisos'
import { type Ctx, type CtxTutor, ErrorClinica, idDe, urlFoto } from './servicio'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Ruta ortopédica · fase 3: hospitalización
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PERMISOS: internar, indicar, publicar partes y dar de alta = «Escribir
 * expediente». Registrar aplicaciones, observaciones y cargos = «Escribir
 * expediente» o «Agenda» (auxiliares y recepción). Leer = «Ver expediente» o
 * «Agenda».
 *
 * INDICACIONES: el médico escribe el tratamiento, la dosis, la vía, la
 * frecuencia y las HORAS en que se aplica. La plataforma solo arma la lista
 * del día con esas horas y marca qué se aplicó, qué se omitió (con motivo) y
 * qué va atrasado (más de 30 minutos). Nunca calcula ni sugiere dosis ni
 * horarios.
 *
 * COBRO: solo lo que captura el equipo (decisión de Jano). Al dar de alta, la
 * suma de los cargos entra a Finanzas como entrada por cobrar
 * (`hospitalizacion-<id>`).
 *
 * TUTOR: lee los partes (texto y foto) y, al alta, las indicaciones para casa
 * en su app o con la liga `/hospital/<id>/<token>` (sin cuenta). Nunca ve
 * indicaciones, medicamentos ni cargos.
 *
 * Toda escritura toma el candado `pg_advisory_xact_lock(6 800 000 + id)`.
 */

const prohibido = (m: string) => new ErrorClinica(403, m)
const invalido = (m: string) => new ErrorClinica(400, m)
const noEncontrado = (m = 'No encontramos ese internamiento.') => new ErrorClinica(404, m)

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const ATRASO_MIN = 30
const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const quien = (ctx: Ctx) => ctx.user.name || ctx.user.email

export type EstadoToma = 'aplicada' | 'omitida' | 'pendiente' | 'atrasada'
export type IndicacionVista = { clave: string; tratamiento: string; dosis: string | null; via: string | null; frecuencia: string | null; horas: string[]; nota: string | null; activa: boolean; desde: string | null; por: string | null; suspendidaEn: string | null; suspendidaPor: string | null }
export type TomaVista = { clave: string; tratamiento: string; dosis: string | null; via: string | null; programada: string | null; hora: string | null; estado: EstadoToma; en: string | null; por: string | null; motivo: string | null; nota: string | null }
export type ObservacionVista = { indice: number; en: string; temp: number | null; fc: number | null; fr: number | null; dolor: number | null; apetito: string | null; orina: boolean; heces: boolean; notas: string | null; por: string | null }
export type CargoVista = { indice: number; concepto: string; cantidad: number; precioUnitario: number; importe: number; fecha: string; por: string | null }
export type ParteVista = { indice: number; en: string; texto: string; foto: string | null; por: string | null }
export type InternamientoBreve = {
  id: number
  folio: string
  mascota: { id: number; nombre: string; especie: string; foto: string | null }
  motivo: string
  espacio: string | null
  estado: 'internado' | 'alta'
  ingreso: string
  alta: string | null
  dias: number
  medico: string | null
  atrasadas: number
  pendientesHoy: number
  ultimoParte: string | null
}
export type InternamientoVista = InternamientoBreve & {
  cliente: { id: number; nombre: string; telefono: string | null } | null
  alergias: string | null
  alertas: string[]
  hoja: { id: number; folio: string } | null
  presupuesto: { id: number; folio: string } | null
  dia: string
  indicaciones: IndicacionVista[]
  tomas: TomaVista[]
  porNecesidad: TomaVista[]
  observaciones: ObservacionVista[]
  cargos: CargoVista[]
  totalCargos: number
  partes: ParteVista[]
  resumenAlta: string | null
  indicacionesAlta: string | null
  liga: string | null
  cargoFinanzas: number | null
}

const ligaDe = (h: Pick<HosInternamiento, 'id' | 'token'>) => (h.token ? `${site.url.replace(/\/$/, '')}/hospital/${h.id}/${h.token}` : null)
const horasDe = (s: string | null | undefined): string[] => (s ?? '').split(/[,\s]+/).filter((x) => HORA.test(x))

function diasDe(h: HosInternamiento): number {
  const fin = h.alta ? new Date(h.alta).getTime() : Date.now()
  return Math.max(1, Math.ceil((fin - new Date(h.ingreso).getTime()) / 86400000))
}

/** Minutos «ahora» en la zona del negocio y el día local. */
function ahoraLocal(): { dia: string; min: number } {
  const p = partesLocales(new Date())
  return { dia: diaLocal(new Date()), min: p.hour * 60 + p.minute }
}

/** Lista de tomas de un día: una por cada hora fijada de cada indicación activa ese día. */
function tomasDelDia(h: HosInternamiento, dia: string): { programadas: TomaVista[]; porNecesidad: TomaVista[] } {
  const ahora = ahoraLocal()
  const ingresoDia = diaLocal(new Date(h.ingreso))
  const altaDia = h.alta ? diaLocal(new Date(h.alta)) : null
  const programadas: TomaVista[] = []
  const porNecesidad: TomaVista[] = []
  const aps = h.aplicaciones ?? []
  for (const ind of h.indicaciones ?? []) {
    const desde = ind.desde ? new Date(ind.desde) : new Date(h.ingreso)
    const hasta = ind.suspendidaEn ? new Date(ind.suspendidaEn) : h.alta ? new Date(h.alta) : null
    const horas = horasDe(ind.horas)
    const base = { clave: ind.clave, tratamiento: ind.tratamiento, dosis: ind.dosis ?? null, via: ind.via ?? null }
    if (!horas.length) {
      for (const a of aps.filter((x) => x.indicacion === ind.clave && !x.programada && diaLocal(new Date(x.en)) === dia)) porNecesidad.push({ ...base, programada: null, hora: null, estado: a.estado, en: a.en, por: a.por ?? null, motivo: a.motivo ?? null, nota: a.nota ?? null })
      continue
    }
    if (dia < ingresoDia || (altaDia && dia > altaDia)) continue
    for (const hora of horas) {
      const programada = `${dia} ${hora}`
      const instante = instanteLocal(dia, hora)
      const hecha = aps.find((x) => x.indicacion === ind.clave && x.programada === programada)
      /* Fuera de la vigencia de la indicación (antes de indicarla o después de suspenderla) y sin registro: no se lista. */
      if (!hecha && (instante < desde.getTime() - 60000 || (hasta && instante > hasta.getTime()))) continue
      let estado: EstadoToma = hecha ? hecha.estado : 'pendiente'
      if (!hecha) {
        const min = Number(hora.slice(0, 2)) * 60 + Number(hora.slice(3))
        if (dia < ahora.dia || (dia === ahora.dia && ahora.min - min > ATRASO_MIN)) estado = 'atrasada'
      }
      programadas.push({ ...base, programada, hora, estado, en: hecha?.en ?? null, por: hecha?.por ?? null, motivo: hecha?.motivo ?? null, nota: hecha?.nota ?? null })
    }
  }
  programadas.sort((a, b) => (a.hora ?? '').localeCompare(b.hora ?? '') || a.tratamiento.localeCompare(b.tratamiento))
  porNecesidad.sort((a, b) => (a.en ?? '').localeCompare(b.en ?? ''))
  return { programadas, porNecesidad }
}

/** Instante (ms) de un día y hora locales del negocio. */
function instanteLocal(dia: string, hora: string): number {
  const [y, m, d] = dia.split('-').map(Number)
  return instanteDesdeLocal(y, m, d, Number(hora.slice(0, 2)), Number(hora.slice(3, 5))).getTime()
}

async function breve(payload: Payload, h: HosInternamiento, hoy: string): Promise<InternamientoBreve> {
  const m = typeof h.mascota === 'object' && h.mascota ? h.mascota : await payload.findByID({ collection: 'mascotas', id: idDe(h.mascota)!, depth: 0, overrideAccess: true })
  const medico = typeof h.medico === 'object' && h.medico ? h.medico : idDe(h.medico) ? await payload.findByID({ collection: 'users', id: idDe(h.medico)!, depth: 0, overrideAccess: true }).catch(() => null) : null
  const { programadas } = h.estado === 'internado' ? tomasDelDia(h, hoy) : { programadas: [] }
  const partes = h.partes ?? []
  return {
    id: h.id,
    folio: folioParaId('HOS', h.id),
    mascota: { id: m.id, nombre: m.nombre, especie: m.especie, foto: urlFoto(m.id, m.fotoFecha) },
    motivo: h.motivo,
    espacio: t(h.espacio),
    estado: h.estado,
    ingreso: h.ingreso,
    alta: h.alta ?? null,
    dias: diasDe(h),
    medico: medico ? (medico as User).name || (medico as User).email : null,
    atrasadas: programadas.filter((x) => x.estado === 'atrasada').length,
    pendientesHoy: programadas.filter((x) => x.estado === 'pendiente').length,
    /* Día local del último parte (AAAA-MM-DD), para «Sin parte hoy». */
    ultimoParte: partes.length ? diaLocal(new Date(partes[partes.length - 1].en)) : null,
  }
}

async function vista(payload: Payload, h: HosInternamiento, dia: string, equipo: boolean): Promise<InternamientoVista> {
  const hoy = diaLocal(new Date())
  const b = await breve(payload, h, hoy)
  const m = await payload.findByID({ collection: 'mascotas', id: idDe(h.mascota)!, depth: 0, overrideAccess: true })
  const cliente = idDe(h.cliente) ? await payload.findByID({ collection: 'clientes', id: idDe(h.cliente)!, depth: 0, overrideAccess: true }).catch(() => null) : null
  const { programadas, porNecesidad } = tomasDelDia(h, dia)
  const cargos = (h.cargos ?? []).map((c, i) => ({ indice: i, concepto: c.concepto, cantidad: c.cantidad, precioUnitario: c.precioUnitario, importe: c.importe, fecha: c.fecha, por: c.por ?? null }))
  return {
    ...b,
    cliente: cliente ? { id: cliente.id, nombre: cliente.nombreCompleto || cliente.nombre, telefono: cliente.telefono ?? null } : null,
    alergias: t(m.alergias),
    alertas: (m.alertasManejo ?? []).map((a) => a.texto).filter(Boolean),
    hoja: idDe(h.hoja) ? { id: idDe(h.hoja)!, folio: folioParaId('HQ', idDe(h.hoja)!) } : null,
    presupuesto: idDe(h.presupuesto) ? { id: idDe(h.presupuesto)!, folio: folioParaId('PRE', idDe(h.presupuesto)!) } : null,
    dia,
    indicaciones: (h.indicaciones ?? []).map((i) => ({ clave: i.clave, tratamiento: i.tratamiento, dosis: i.dosis ?? null, via: i.via ?? null, frecuencia: i.frecuencia ?? null, horas: horasDe(i.horas), nota: i.nota ?? null, activa: i.activa !== false, desde: i.desde ?? null, por: i.por ?? null, suspendidaEn: i.suspendidaEn ?? null, suspendidaPor: i.suspendidaPor ?? null })),
    tomas: programadas,
    porNecesidad,
    observaciones: (h.observaciones ?? []).map((o, i) => ({ indice: i, en: o.en, temp: o.temp ?? null, fc: o.fc ?? null, fr: o.fr ?? null, dolor: o.dolor ?? null, apetito: o.apetito ?? null, orina: Boolean(o.orina), heces: Boolean(o.heces), notas: o.notas ?? null, por: o.por ?? null })).reverse(),
    cargos: equipo ? cargos : [],
    totalCargos: equipo ? aPesos(cargos.reduce((s, c) => s + (aCentavos(c.importe) || 0), 0)) : 0,
    partes: (h.partes ?? []).map((p, i) => ({ indice: i, en: p.en, texto: p.texto, foto: p.foto ?? null, por: p.por ?? null })).reverse(),
    resumenAlta: equipo ? (h.resumenAlta ?? null) : null,
    indicacionesAlta: h.indicacionesAlta ?? null,
    liga: equipo ? ligaDe(h) : null,
    cargoFinanzas: equipo ? idDe(h.cargoFinanzas) : null,
  }
}

async function cargar(payload: Payload, id: number, req?: PayloadRequest): Promise<HosInternamiento> {
  try {
    return await payload.findByID({ collection: 'hos-internamientos', id, depth: 0, overrideAccess: true, req, showHiddenFields: true })
  } catch {
    throw noEncontrado()
  }
}

async function conCandado<T>(payload: Payload, user: User, id: number, fn: (req: PayloadRequest, h: HosInternamiento) => Promise<T>): Promise<T> {
  const req = await createLocalReq({ user: user as User & { collection: 'users' } }, payload)
  const propia = await initTransaction(req)
  try {
    const sesiones = (payload.db as unknown as { sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions
    const tx = req.transactionID ? sesiones?.[String(await req.transactionID)]?.db : null
    if (tx) await tx.execute(sql`select pg_advisory_xact_lock(${6800000 + id})`)
    const h = await cargar(payload, id, req)
    const r = await fn(req, h)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

const puedeLeer = (ctx: Ctx) => ctx.p.clinica.verExpediente || ctx.p.clinica.agenda
const puedeIndicar = (ctx: Ctx) => ctx.p.clinica.escribirExpediente
const puedeAtender = (ctx: Ctx) => ctx.p.clinica.escribirExpediente || ctx.p.clinica.agenda
const exigir = (ok: boolean, m: string) => {
  if (!ok) throw prohibido(m)
}
const exigirInternado = (h: HosInternamiento) => {
  if (h.estado !== 'internado') throw invalido('La mascota ya fue dada de alta: el internamiento no se cambia.')
}
/** Sin arreglos con `id` de Payload (se reescriben completos). */
const limpio = <T extends { id?: unknown }>(xs: T[] | null | undefined): Omit<T, 'id'>[] => (xs ?? []).map(({ id: _i, ...r }) => (void _i, r))

/* ───────────────────────────── equipo: leer ───────────────────────────── */

export async function tableroHospital(ctx: Ctx): Promise<{ internados: InternamientoBreve[]; altasRecientes: InternamientoBreve[]; puedeInternar: boolean }> {
  exigir(puedeLeer(ctx), 'Tu rol no incluye el expediente.')
  const [int, altas] = await Promise.all([
    ctx.payload.find({ collection: 'hos-internamientos', depth: 1, pagination: false, sort: 'ingreso', overrideAccess: true, where: { estado: { equals: 'internado' } } }),
    ctx.payload.find({ collection: 'hos-internamientos', depth: 1, limit: 10, sort: '-alta', overrideAccess: true, where: { estado: { equals: 'alta' } } }),
  ])
  return { internados: await Promise.all(int.docs.map((h) => breve(ctx.payload, h, ctx.hoy))), altasRecientes: await Promise.all(altas.docs.map((h) => breve(ctx.payload, h, ctx.hoy))), puedeInternar: puedeIndicar(ctx) }
}

export async function internamiento(ctx: Ctx, id: number, dia?: string | null): Promise<InternamientoVista & { permisos: { indicar: boolean; atender: boolean } }> {
  exigir(puedeLeer(ctx), 'Tu rol no incluye el expediente.')
  const d = dia && /^\d{4}-\d{2}-\d{2}$/.test(dia) ? dia : ctx.hoy
  return { ...(await vista(ctx.payload, await cargar(ctx.payload, id), d, true)), permisos: { indicar: puedeIndicar(ctx), atender: puedeAtender(ctx) } }
}

export async function internamientosDeMascota(ctx: Ctx, mascotaId: number): Promise<InternamientoBreve[]> {
  exigir(puedeLeer(ctx), 'Tu rol no incluye el expediente.')
  const r = await ctx.payload.find({ collection: 'hos-internamientos', depth: 1, pagination: false, sort: '-ingreso', overrideAccess: true, where: { mascota: { equals: mascotaId } } })
  return Promise.all(r.docs.map((h) => breve(ctx.payload, h, ctx.hoy)))
}

/* ───────────────────────────── equipo: escribir ───────────────────────────── */

export async function internar(ctx: Ctx, entrada: unknown): Promise<InternamientoVista> {
  exigir(puedeIndicar(ctx), 'Internar pide «Escribir expediente».')
  const d = z
    .object({ mascotaId: z.number().int().positive(), motivo: z.string().trim().min(3, 'Escribe el motivo del internamiento.').max(200), espacio: z.string().trim().max(40).optional().default(''), hojaId: z.number().int().positive().nullable().optional(), medicoId: z.number().int().positive().nullable().optional() })
    .safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa los datos.')
  const mascota = await ctx.payload.findByID({ collection: 'mascotas', id: d.data.mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!mascota) throw noEncontrado('No encontramos esa mascota.')
  if (mascota.estado === 'fallecido') throw invalido('La mascota está registrada como fallecida.')
  const ya = await ctx.payload.find({ collection: 'hos-internamientos', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ mascota: { equals: mascota.id } }, { estado: { equals: 'internado' } }] } })
  if (ya.docs[0]) throw invalido(`${mascota.nombre} ya está internada (${folioParaId('HOS', ya.docs[0].id)}).`)
  const hoja = d.data.hojaId ? await ctx.payload.findByID({ collection: 'cir-hojas', id: d.data.hojaId, depth: 0, overrideAccess: true }).catch(() => null) : null
  if (d.data.hojaId && (!hoja || idDe(hoja.mascota) !== mascota.id)) throw invalido('Esa hoja quirúrgica no es de esta mascota.')
  const clienteId = idDe((mascota.tutores ?? []).find((x) => x.principal)?.cliente ?? mascota.tutores?.[0]?.cliente)
  const doc = await ctx.payload.create({
    collection: 'hos-internamientos',
    overrideAccess: true,
    depth: 0,
    data: {
      mascota: mascota.id,
      cliente: clienteId,
      hoja: hoja?.id ?? null,
      presupuesto: idDe(hoja?.presupuesto),
      medico: d.data.medicoId ?? idDe(hoja?.cirujano) ?? ctx.user.id,
      motivo: d.data.motivo,
      espacio: d.data.espacio || null,
      estado: 'internado',
      ingreso: new Date().toISOString(),
      indicaciones: [],
      aplicaciones: [],
      observaciones: [],
      cargos: [],
      partes: [],
      token: randomBytes(24).toString('hex'),
      creadoPor: ctx.user.id,
    },
  })
  return vista(ctx.payload, await cargar(ctx.payload, doc.id), ctx.hoy, true)
}

const esquemaIndicacion = z.object({
  tratamiento: z.string().trim().min(2, 'Escribe el tratamiento o medicamento.').max(120),
  dosis: z.string().trim().max(80).optional().default(''),
  via: z.string().trim().max(40).optional().default(''),
  frecuencia: z.string().trim().max(60).optional().default(''),
  horas: z.string().trim().max(120).optional().default(''),
  nota: z.string().trim().max(300).optional().default(''),
})

export async function agregarIndicacion(ctx: Ctx, id: number, entrada: unknown): Promise<InternamientoVista> {
  exigir(puedeIndicar(ctx), 'Las indicaciones las escribe quien tiene «Escribir expediente».')
  const d = esquemaIndicacion.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa la indicación.')
  const partes = d.data.horas.split(/[,\s]+/).filter(Boolean)
  const malas = partes.filter((x) => !HORA.test(x))
  if (malas.length) throw invalido(`Escribe las horas como HH:MM separadas por coma (revisa «${malas[0]}»).`)
  const horas = [...new Set(partes)].sort()
  if (horas.length > 24) throw invalido('Máximo 24 horas por indicación.')
  await conCandado(ctx.payload, ctx.user, id, async (req, h) => {
    exigirInternado(h)
    const lista = limpio(h.indicaciones)
    if (lista.length >= 60) throw invalido('El internamiento ya tiene 60 indicaciones.')
    lista.push({ clave: randomBytes(4).toString('hex'), tratamiento: d.data.tratamiento, dosis: d.data.dosis || null, via: d.data.via || null, frecuencia: d.data.frecuencia || null, horas: horas.join(', ') || null, nota: d.data.nota || null, activa: true, desde: new Date().toISOString(), por: quien(ctx) })
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, req, data: { indicaciones: lista } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id), ctx.hoy, true)
}

export async function suspenderIndicacion(ctx: Ctx, id: number, entrada: unknown): Promise<InternamientoVista> {
  exigir(puedeIndicar(ctx), 'Suspender una indicación pide «Escribir expediente».')
  const d = z.object({ clave: z.string().min(1) }).safeParse(entrada)
  if (!d.success) throw invalido('Indicación no válida.')
  await conCandado(ctx.payload, ctx.user, id, async (req, h) => {
    exigirInternado(h)
    const lista = limpio(h.indicaciones)
    const i = lista.find((x) => x.clave === d.data.clave)
    if (!i) throw invalido('Esa indicación no existe.')
    if (i.activa === false) return
    i.activa = false
    i.suspendidaEn = new Date().toISOString()
    i.suspendidaPor = quien(ctx)
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, req, data: { indicaciones: lista } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id), ctx.hoy, true)
}

export async function registrarAplicacion(ctx: Ctx, id: number, entrada: unknown): Promise<InternamientoVista> {
  exigir(puedeAtender(ctx), 'Registrar aplicaciones pide «Escribir expediente» o «Agenda».')
  const d = z
    .object({ clave: z.string().min(1), programada: z.string().regex(/^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(), estado: z.enum(['aplicada', 'omitida']).default('aplicada'), motivo: z.string().trim().max(200).optional().default(''), nota: z.string().trim().max(200).optional().default('') })
    .safeParse(entrada)
  if (!d.success) throw invalido('Revisa la aplicación.')
  if (d.data.estado === 'omitida' && d.data.motivo.length < 3) throw invalido('Escribe por qué no se aplicó.')
  await conCandado(ctx.payload, ctx.user, id, async (req, h) => {
    exigirInternado(h)
    const ind = (h.indicaciones ?? []).find((x) => x.clave === d.data.clave)
    if (!ind) throw invalido('Esa indicación no existe.')
    if (ind.activa === false) throw invalido('Esa indicación está suspendida.')
    const horas = horasDe(ind.horas)
    if (d.data.programada) {
      if (!horas.includes(d.data.programada.slice(11))) throw invalido('Esa hora no está en la indicación.')
      if ((h.aplicaciones ?? []).some((x) => x.indicacion === ind.clave && x.programada === d.data.programada)) throw invalido('Esa toma ya está registrada.')
    } else if (horas.length) throw invalido('Esta indicación tiene horas fijas: registra la toma de su hora.')
    const lista = limpio(h.aplicaciones)
    lista.push({ indicacion: ind.clave, programada: d.data.programada ?? null, estado: d.data.estado, en: new Date().toISOString(), motivo: d.data.motivo || null, nota: d.data.nota || null, por: quien(ctx) })
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, req, data: { aplicaciones: lista } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id), ctx.hoy, true)
}

const RANGO = { temp: [25, 45], fc: [0, 400], fr: [0, 200], dolor: [0, 10] } as const

export async function agregarObservacion(ctx: Ctx, id: number, entrada: unknown): Promise<InternamientoVista> {
  exigir(puedeAtender(ctx), 'Registrar observaciones pide «Escribir expediente» o «Agenda».')
  const d = z
    .object({ temp: z.number().nullable().optional(), fc: z.number().nullable().optional(), fr: z.number().nullable().optional(), dolor: z.number().int().nullable().optional(), apetito: z.enum(APETITO.map((a) => a.value) as [string, ...string[]]).nullable().optional(), orina: z.boolean().optional().default(false), heces: z.boolean().optional().default(false), notas: z.string().trim().max(500).optional().default('') })
    .safeParse(entrada)
  if (!d.success) throw invalido('Revisa la observación.')
  for (const k of ['temp', 'fc', 'fr', 'dolor'] as const) {
    const v = d.data[k]
    if (v != null && (v < RANGO[k][0] || v > RANGO[k][1])) throw invalido(`El valor de ${k === 'temp' ? 'temperatura' : k === 'dolor' ? 'dolor (0 a 10)' : k.toUpperCase()} (${v}) parece un error de captura.`)
  }
  if (![d.data.temp, d.data.fc, d.data.fr, d.data.dolor, d.data.apetito].some((x) => x != null) && !d.data.orina && !d.data.heces && !d.data.notas) throw invalido('Captura al menos un dato o una nota.')
  await conCandado(ctx.payload, ctx.user, id, async (req, h) => {
    exigirInternado(h)
    const lista = limpio(h.observaciones)
    lista.push({ en: new Date().toISOString(), temp: d.data.temp != null ? Math.round(d.data.temp * 10) / 10 : null, fc: d.data.fc ?? null, fr: d.data.fr ?? null, dolor: d.data.dolor ?? null, apetito: (d.data.apetito as (typeof lista)[number]['apetito']) ?? null, orina: d.data.orina, heces: d.data.heces, notas: d.data.notas || null, por: quien(ctx) })
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, req, data: { observaciones: lista } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id), ctx.hoy, true)
}

export async function agregarCargo(ctx: Ctx, id: number, entrada: unknown): Promise<InternamientoVista> {
  exigir(puedeAtender(ctx), 'Capturar cargos pide «Escribir expediente» o «Agenda».')
  const d = z.object({ concepto: z.string().trim().min(2, 'Escribe el concepto.').max(160), cantidad: z.number().positive().max(1000), precioUnitario: z.number().min(0).max(1_000_000) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa el cargo.')
  await conCandado(ctx.payload, ctx.user, id, async (req, h) => {
    exigirInternado(h)
    const lista = limpio(h.cargos)
    lista.push({ concepto: d.data.concepto, cantidad: d.data.cantidad, precioUnitario: d.data.precioUnitario, importe: aPesos(Math.round((aCentavos(d.data.precioUnitario) || 0) * d.data.cantidad)), fecha: ctx.hoy, por: quien(ctx) })
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, req, data: { cargos: lista } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id), ctx.hoy, true)
}

export async function quitarCargo(ctx: Ctx, id: number, entrada: unknown): Promise<InternamientoVista> {
  exigir(puedeAtender(ctx), 'Pide «Escribir expediente» o «Agenda».')
  const d = z.object({ indice: z.number().int().min(0) }).safeParse(entrada)
  if (!d.success) throw invalido('Cargo no válido.')
  await conCandado(ctx.payload, ctx.user, id, async (req, h) => {
    exigirInternado(h)
    if (!(h.cargos ?? [])[d.data.indice]) throw invalido('Ese cargo ya no existe.')
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, req, data: { cargos: limpio(h.cargos).filter((_, i) => i !== d.data.indice) } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id), ctx.hoy, true)
}

export async function publicarParte(ctx: Ctx, id: number, entrada: unknown): Promise<InternamientoVista & { correo: boolean }> {
  exigir(puedeIndicar(ctx), 'Los partes para el tutor los publica quien tiene «Escribir expediente».')
  const d = z
    .object({ texto: z.string().trim().min(10, 'Escribe cómo está (al menos una frase).').max(1500), foto: z.string().max(MAX_FOTO_BASE64, 'La foto pesa demasiado.').regex(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/, 'La foto no es válida.').nullable().optional() })
    .safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa el parte.')
  await conCandado(ctx.payload, ctx.user, id, async (req, h) => {
    exigirInternado(h)
    const lista = limpio(h.partes)
    lista.push({ en: new Date().toISOString(), texto: d.data.texto, foto: d.data.foto ?? null, por: quien(ctx), avisado: false })
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, req, data: { partes: lista } })
  })
  const h = await cargar(ctx.payload, id)
  const correo = await avisarTutor(ctx.payload, h, 'parte', d.data.texto)
  return { ...(await vista(ctx.payload, h, ctx.hoy, true)), correo }
}

export async function darAlta(ctx: Ctx, id: number, entrada: unknown): Promise<InternamientoVista> {
  exigir(puedeIndicar(ctx), 'Dar de alta pide «Escribir expediente».')
  const d = z.object({ resumen: z.string().trim().max(3000).optional().default(''), indicacionesAlta: z.string().trim().min(5, 'Escribe las indicaciones para casa.').max(3000) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa el alta.')
  let total = 0
  await conCandado(ctx.payload, ctx.user, id, async (req, h) => {
    exigirInternado(h)
    total = aPesos((h.cargos ?? []).reduce((s, c) => s + (aCentavos(c.importe) || 0), 0))
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, req, data: { estado: 'alta', alta: new Date().toISOString(), resumenAlta: d.data.resumen || null, indicacionesAlta: d.data.indicacionesAlta, altaPor: ctx.user.id } })
  })
  let h = await cargar(ctx.payload, id)
  /* Cobro: la suma de lo capturado, como entrada por cobrar (idempotente por clave). */
  if (total > 0) {
    const m = await ctx.payload.findByID({ collection: 'mascotas', id: idDe(h.mascota)!, depth: 0, overrideAccess: true })
    const cliente = idDe(h.cliente) ? await ctx.payload.findByID({ collection: 'clientes', id: idDe(h.cliente)!, depth: 0, overrideAccess: true }).catch(() => null) : null
    const r = await registrarEnFinanzas({ ...ctx, p: calcularPermisos({ esSuperadmin: true }, null) }, {
      tipo: 'entrada',
      importe: total,
      fechaReal: ctx.hoy,
      estado: 'pendiente',
      concepto: `Hospitalización · ${m.nombre} (${diasDe(h)} día${diasDe(h) === 1 ? '' : 's'})`,
      categoria: null,
      asignacion: 'pendiente',
      actividad: null,
      contraparte: cliente ? cliente.nombreCompleto || cliente.nombre : null,
      notas: `Internamiento ${folioParaId('HOS', h.id)}: ${(h.cargos ?? []).length} cargo(s) capturados por el equipo.`,
    }, `hospitalizacion-${h.id}`)
    await ctx.payload.update({ collection: 'hos-internamientos', id, overrideAccess: true, data: { cargoFinanzas: r.operacion.id } })
    h = await cargar(ctx.payload, id)
  }
  await avisarTutor(ctx.payload, h, 'alta', d.data.indicacionesAlta)
  return vista(ctx.payload, h, ctx.hoy, true)
}

/* ───────────────────────────── tutor ───────────────────────────── */

export type InternamientoTutor = { folio: string; mascota: string; foto: string | null; motivo: string; estado: 'internado' | 'alta'; ingreso: string; alta: string | null; dias: number; partes: ParteVista[]; indicacionesAlta: string | null; telefono: string | null }

/** Liga sin cuenta: vale mientras está internada y 30 días después del alta. */
export async function internamientoPorLiga(payload: Payload, id: number, token: string): Promise<InternamientoTutor> {
  if (!/^[a-f0-9]{48}$/.test(token)) throw noEncontrado('Esta liga no es válida.')
  const h = await cargar(payload, id)
  if (!h.token || h.token !== token) throw noEncontrado('Esta liga no es válida.')
  if (h.alta && Date.now() - new Date(h.alta).getTime() > 30 * 86400000) throw noEncontrado('Esta liga ya venció. Pide la información a la clínica.')
  const m = await payload.findByID({ collection: 'mascotas', id: idDe(h.mascota)!, depth: 0, overrideAccess: true })
  return {
    folio: folioParaId('HOS', h.id),
    mascota: m.nombre,
    foto: null,
    motivo: h.motivo,
    estado: h.estado,
    ingreso: h.ingreso,
    alta: h.alta ?? null,
    dias: diasDe(h),
    partes: (h.partes ?? []).map((p, i) => ({ indice: i, en: p.en, texto: p.texto, foto: p.foto ?? null, por: null })).reverse(),
    indicacionesAlta: h.estado === 'alta' ? (h.indicacionesAlta ?? null) : null,
    telefono: (await contactoClinica(payload)).telefono,
  }
}

/** Portal: internamientos vigentes (o dados de alta hace menos de 3 días) de sus mascotas, con su liga. */
export async function portalInternamientos(c: CtxTutor, mascotaIds: number[]): Promise<{ id: number; mascota: string; estado: 'internado' | 'alta'; ultimoParte: string | null; liga: string }[]> {
  if (!mascotaIds.length) return []
  const r = await c.payload.find({ collection: 'hos-internamientos', depth: 1, pagination: false, overrideAccess: true, showHiddenFields: true, where: { mascota: { in: mascotaIds } } })
  return r.docs
    .filter((h) => h.token && (h.estado === 'internado' || (h.alta && Date.now() - new Date(h.alta).getTime() < 3 * 86400000)))
    .map((h) => ({ id: h.id, mascota: typeof h.mascota === 'object' && h.mascota ? h.mascota.nombre : '', estado: h.estado, ultimoParte: (h.partes ?? []).at(-1)?.en ? diaLocal(new Date((h.partes ?? []).at(-1)!.en)) : null, liga: `/hospital/${h.id}/${h.token}` }))
}

/* ───────────────────────────── correos ───────────────────────────── */

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

async function avisarTutor(payload: Payload, h: HosInternamiento, evento: 'parte' | 'alta', texto: string): Promise<boolean> {
  try {
    const cliente = idDe(h.cliente) ? await payload.findByID({ collection: 'clientes', id: idDe(h.cliente)!, depth: 0, overrideAccess: true }).catch(() => null) : null
    const para = correoDelTutor(cliente)
    const liga = ligaDe(h)
    if (!para || !liga) return false
    const m = await payload.findByID({ collection: 'mascotas', id: idDe(h.mascota)!, depth: 0, overrideAccess: true })
    const html = `<div style="font:15px/1.55 system-ui,sans-serif;color:#0f172a;max-width:560px">
<p>Hola ${esc((cliente?.nombre ?? '').split(/\s+/)[0])},</p>
<p>${evento === 'parte' ? `Te compartimos cómo sigue <b>${esc(m.nombre)}</b>:` : `<b>${esc(m.nombre)}</b> ya está lista para irse a casa. Estas son las indicaciones:`}</p>
<blockquote style="margin:0;padding:10px 14px;border-left:3px solid ${site.brand.accent};background:#f8fafc;white-space:pre-line">${esc(texto)}</blockquote>
<p><a href="${liga}" style="background:${site.brand.accent};color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">${evento === 'parte' ? 'Ver todos los partes' : 'Ver las indicaciones'}</a></p>
<p style="color:#64748b;font-size:12px">${esc(site.brand.name)}. Recibes este correo porque aceptaste avisos de la clínica.</p></div>`
    await payload.sendEmail({ to: para, subject: evento === 'parte' ? `Así sigue ${m.nombre} · ${site.brand.name}` : `${m.nombre} ya puede irse a casa · ${site.brand.name}`, html })
    if (evento === 'parte') {
      const partes = limpio(h.partes)
      if (partes.length) {
        partes[partes.length - 1].avisado = true
        await payload.update({ collection: 'hos-internamientos', id: h.id, overrideAccess: true, data: { partes } })
      }
    }
    return true
  } catch (e) {
    payload.logger.error(`[hospital] correo ${folioParaId('HOS', h.id)}: ${String((e as Error)?.message ?? e)}`)
    return false
  }
}

/** Para el inicio del panel: cuántos internados hay y cuántas tomas atrasadas. */
export async function resumenHospital(payload: Payload): Promise<{ internados: number; atrasadas: number }> {
  const r = await payload.find({ collection: 'hos-internamientos', depth: 0, pagination: false, overrideAccess: true, where: { estado: { equals: 'internado' } } })
  const hoy = diaLocal(new Date())
  return { internados: r.docs.length, atrasadas: r.docs.reduce((s, h) => s + tomasDelDia(h, hoy).programadas.filter((x) => x.estado === 'atrasada').length, 0) }
}

export { fechaLarga }
