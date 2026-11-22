import { createHash, randomBytes } from 'node:crypto'
import type { Payload, PayloadRequest } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { AgendaConfiguracion, CirConsentimiento, CirPresupuesto, CirugiaConfiguracion, Cita, Cliente, Mascota, User } from '../../payload-types'
import { CONSENTIMIENTO_BASE } from '../../collections/clinica/cirugia'
import { folioParaId } from '../../collections/clinica/acceso'
import { aCentavos, aPesos } from '../finanzas/reglas'
import { site } from '../site'
import { contactoClinica } from '../sitio/contacto'
import { enlaceWhatsApp, fechaLarga } from '../whatsapp'
import { correoDelTutor } from './avisos'
import { firmaValida } from './firma'
import { sumarDias } from './paquetes'
import { type Ctx, type CtxTutor, ErrorClinica, idDe } from './servicio'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Ruta ortopédica · fase 1: presupuesto de cirugía y consentimiento informado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * EQUIPO: el médico («Escribir expediente») arma el presupuesto en el
 * expediente → Cirugía (borrador), lo envía (vence en N días; se manda la liga
 * por correo y queda lista para WhatsApp), lo regresa a borrador o lo cancela.
 * En la clínica, quien tenga «Agenda» o «Escribir expediente» puede recoger la
 * firma del tutor en una tableta.
 *
 * TUTOR: abre `/presupuesto/<id>/<token>` (sin cuenta; la misma liga sale en
 * los Pendientes de su app), revisa, firma con el dedo y acepta; o lo rechaza.
 *
 * FIRMA: dentro de una transacción con candado por presupuesto
 * (pg_advisory_xact_lock 6 600 000 + id) se arma el texto del consentimiento
 * con los datos del presupuesto, se guarda tal cual junto con el resumen, la
 * firma, quién, cuándo, IP y navegador, y una huella SHA-256 de todo. El
 * presupuesto pasa a «aceptado». Después ya no cambia.
 *
 * AGENDA: la cirugía se agenda desde el presupuesto aceptado (`citas.presupuesto`);
 * al finalizar la cita se cobra el TOTAL del presupuesto (ver agenda.ts).
 * La plataforma nunca calcula ni sugiere dosis.
 */

const prohibido = (m = 'Tu rol no incluye esta acción.') => new ErrorClinica(403, m)
const invalido = (m: string) => new ErrorClinica(400, m)
const noEncontrado = (m = 'No encontramos ese presupuesto.') => new ErrorClinica(404, m)

export type EstadoPresupuesto = 'borrador' | 'enviado' | 'aceptado' | 'rechazado' | 'cancelado' | 'vencido'
export type RenglonPresupuesto = { concepto: string; servicioId: number | null; cantidad: number; precioUnitario: number; importe: number }
export type ConsentimientoVista = { id: number; folio: string; nombreFirmante: string; firmadoEn: string; via: 'portal' | 'clinica'; huella: string; testigo: string | null }
export type PresupuestoVista = {
  id: number
  folio: string
  mascota: { id: number; nombre: string; especie: string }
  cliente: { id: number; nombre: string; telefono: string | null; email: string | null } | null
  medico: { id: number; nombre: string } | null
  procedimiento: string
  explicacion: string | null
  riesgos: string | null
  indicaciones: string | null
  renglones: RenglonPresupuesto[]
  total: number
  anticipo: number | null
  vence: string | null
  estado: EstadoPresupuesto
  enviadoEn: string | null
  respondidoEn: string | null
  motivoRechazo: string | null
  consentimiento: ConsentimientoVista | null
  cita: { id: number; folio: string; dia: string; hora: string; estado: string } | null
  creadoEn: string
  /** Solo el equipo. */
  notasInternas?: string | null
  motivoCancelacion?: string | null
  /** Solo el equipo: liga para el tutor (con su token). */
  liga?: string | null
}

const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const ESPECIE: Record<string, string> = { perro: 'perro', gato: 'gato', ave: 'ave', conejo: 'conejo', roedor: 'roedor', reptil: 'reptil', otra: 'otra especie' }

export const ligaPresupuesto = (p: Pick<CirPresupuesto, 'id' | 'token'>) => (p.token ? `${site.url.replace(/\/$/, '')}/presupuesto/${p.id}/${p.token}` : null)

function estadoDe(p: CirPresupuesto, hoy: string): EstadoPresupuesto {
  if (p.estado === 'enviado' && p.vence && p.vence < hoy) return 'vencido'
  return p.estado
}

async function configuracion(payload: Payload): Promise<{ texto: string; vigenciaDias: number }> {
  const g = (await payload.findGlobal({ slug: 'cirugia-configuracion', depth: 0, overrideAccess: true }).catch(() => null)) as CirugiaConfiguracion | null
  return { texto: t(g?.textoConsentimiento) ?? CONSENTIMIENTO_BASE, vigenciaDias: g?.vigenciaDias ?? 15 }
}

type Cargado = { p: CirPresupuesto; mascota: Mascota; cliente: Cliente | null; medico: User | null; consentimiento: CirConsentimiento | null; cita: Cita | null }

async function cargar(payload: Payload, id: number, req?: PayloadRequest): Promise<Cargado> {
  const p = await payload.findByID({ collection: 'cir-presupuestos', id, depth: 0, overrideAccess: true, req, showHiddenFields: true }).catch(() => null)
  if (!p) throw noEncontrado()
  const [mascota, cliente, medico, consentimiento, citas] = await Promise.all([
    payload.findByID({ collection: 'mascotas', id: idDe(p.mascota)!, depth: 0, overrideAccess: true, req }),
    idDe(p.cliente) ? payload.findByID({ collection: 'clientes', id: idDe(p.cliente)!, depth: 0, overrideAccess: true, req }).catch(() => null) : Promise.resolve(null),
    idDe(p.medico) ? payload.findByID({ collection: 'users', id: idDe(p.medico)!, depth: 0, overrideAccess: true, req }).catch(() => null) : Promise.resolve(null),
    idDe(p.consentimiento) ? payload.findByID({ collection: 'cir-consentimientos', id: idDe(p.consentimiento)!, depth: 0, overrideAccess: true, req }).catch(() => null) : Promise.resolve(null),
    payload.find({ collection: 'citas', depth: 0, limit: 1, sort: '-createdAt', overrideAccess: true, req, where: { and: [{ presupuesto: { equals: id } }, { estado: { not_in: ['cancelada', 'no_asistio'] } }] } }),
  ])
  return { p, mascota, cliente, medico: medico as User | null, consentimiento, cita: citas.docs[0] ?? null }
}

function vista(c: Cargado, hoy: string, equipo: boolean): PresupuestoVista {
  const { p, mascota, cliente, medico, consentimiento, cita } = c
  return {
    id: p.id,
    folio: folioParaId('PRE', p.id),
    mascota: { id: mascota.id, nombre: mascota.nombre, especie: mascota.especie },
    cliente: cliente ? { id: cliente.id, nombre: cliente.nombreCompleto || cliente.nombre, telefono: cliente.telefono ?? null, email: cliente.email ?? null } : null,
    medico: medico ? { id: medico.id, nombre: medico.name || medico.email } : null,
    procedimiento: p.procedimiento,
    explicacion: t(p.explicacion),
    riesgos: t(p.riesgos),
    indicaciones: t(p.indicaciones),
    renglones: (p.renglones ?? []).map((r) => ({ concepto: r.concepto, servicioId: idDe(r.servicio), cantidad: r.cantidad, precioUnitario: r.precioUnitario, importe: r.importe })),
    total: p.total,
    anticipo: p.anticipo ?? null,
    vence: p.vence ?? null,
    estado: estadoDe(p, hoy),
    enviadoEn: p.enviadoEn ?? null,
    respondidoEn: p.respondidoEn ?? null,
    motivoRechazo: p.motivoRechazo ?? null,
    consentimiento: consentimiento ? { id: consentimiento.id, folio: folioParaId('CON', consentimiento.id), nombreFirmante: consentimiento.nombreFirmante, firmadoEn: consentimiento.firmadoEn, via: consentimiento.via, huella: consentimiento.huella, testigo: null } : null,
    cita: cita ? { id: cita.id, folio: folioParaId('CIT', cita.id), dia: cita.dia, hora: cita.horaInicio, estado: cita.estado } : null,
    creadoEn: p.createdAt,
    ...(equipo ? { notasInternas: p.notasInternas ?? null, motivoCancelacion: p.motivoCancelacion ?? null, liga: p.estado === 'enviado' || p.estado === 'aceptado' ? ligaPresupuesto(p) : null } : {}),
  }
}

/** El texto del consentimiento, ya con los datos del presupuesto. */
export async function textoConsentimiento(payload: Payload, c: Cargado, nombreFirmante?: string, fecha?: string): Promise<string> {
  const { texto } = await configuracion(payload)
  const valores: Record<string, string> = {
    tutor: nombreFirmante || (c.cliente ? c.cliente.nombreCompleto || c.cliente.nombre : 'el tutor'),
    mascota: c.mascota.nombre,
    especie: ESPECIE[c.mascota.especie] ?? c.mascota.especie,
    procedimiento: c.p.procedimiento,
    riesgos: t(c.p.riesgos) ?? 'los propios del procedimiento que me explicó el médico.',
    clinica: site.brand.name,
    medico: c.medico ? c.medico.name || c.medico.email : 'el médico veterinario tratante',
    total: pesos(c.p.total),
    fecha: fechaLarga(fecha ?? new Date().toISOString().slice(0, 10)),
  }
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (m, k: string) => valores[k] ?? m)
}

/* ───────────────────────────── equipo ───────────────────────────── */

const puedeVer = (ctx: Ctx) => ctx.p.clinica.verExpediente || ctx.p.clinica.agenda

export async function presupuestosDeMascota(ctx: Ctx, mascotaId: number): Promise<{ presupuestos: PresupuestoVista[]; vigenciaDias: number; puedeEditar: boolean; puedeFirmar: boolean }> {
  if (!puedeVer(ctx)) throw prohibido('Tu rol no incluye el expediente.')
  const r = await ctx.payload.find({ collection: 'cir-presupuestos', depth: 0, pagination: false, sort: '-createdAt', overrideAccess: true, where: { mascota: { equals: mascotaId } } })
  const lista = await Promise.all(r.docs.map((p) => cargar(ctx.payload, p.id)))
  return {
    presupuestos: lista.map((c) => vista(c, ctx.hoy, true)),
    vigenciaDias: (await configuracion(ctx.payload)).vigenciaDias,
    puedeEditar: ctx.p.clinica.escribirExpediente,
    puedeFirmar: ctx.p.clinica.escribirExpediente || ctx.p.clinica.agenda,
  }
}

export async function presupuesto(ctx: Ctx, id: number): Promise<PresupuestoVista & { texto: string }> {
  if (!puedeVer(ctx)) throw prohibido('Tu rol no incluye el expediente.')
  const c = await cargar(ctx.payload, id)
  const texto = c.consentimiento ? c.consentimiento.texto : await textoConsentimiento(ctx.payload, c)
  return { ...vista(c, ctx.hoy, true), texto }
}

const esquemaPresupuesto = z.object({
  procedimiento: z.string().trim().min(3, 'Escribe el procedimiento.').max(160),
  medicoId: z.number().int().positive().nullable().optional(),
  explicacion: z.string().trim().max(3000).optional().default(''),
  riesgos: z.string().trim().max(2000).optional().default(''),
  indicaciones: z.string().trim().max(1500).optional().default(''),
  renglones: z
    .array(
      z.object({
        concepto: z.string().trim().min(1, 'Cada renglón necesita su concepto.').max(160),
        servicioId: z.number().int().positive().nullable().optional(),
        cantidad: z.number().positive('La cantidad debe ser mayor que cero.').max(1000),
        precioUnitario: z.number().min(0, 'El precio no puede ser negativo.').max(10_000_000),
      }),
    )
    .min(1, 'Agrega al menos un renglón.')
    .max(40),
  anticipo: z.number().min(0).nullable().optional(),
  notasInternas: z.string().trim().max(1000).optional().default(''),
})

/** Crea (sin `id`) o cambia un presupuesto en borrador. */
export async function guardarPresupuesto(ctx: Ctx, mascotaId: number, entrada: unknown, id?: number): Promise<PresupuestoVista> {
  if (!ctx.p.clinica.escribirExpediente) throw prohibido('Armar presupuestos pide «Escribir expediente».')
  const d = esquemaPresupuesto.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa los datos.')
  const mascota = await ctx.payload.findByID({ collection: 'mascotas', id: mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!mascota) throw noEncontrado('No encontramos esa mascota.')
  if (mascota.estado === 'fallecido') throw invalido('La mascota está registrada como fallecida.')
  const renglones = d.data.renglones.map((r) => ({ concepto: r.concepto, servicio: r.servicioId ?? null, cantidad: r.cantidad, precioUnitario: r.precioUnitario, importe: aPesos(Math.round((aCentavos(r.precioUnitario) || 0) * r.cantidad)) }))
  const total = aPesos(renglones.reduce((s, r) => s + (aCentavos(r.importe) || 0), 0))
  if (d.data.anticipo != null && d.data.anticipo > total) throw invalido('El anticipo no puede ser mayor que el total.')
  const clienteId = idDe((mascota.tutores ?? []).find((x) => x.principal)?.cliente ?? mascota.tutores?.[0]?.cliente)
  const datos = {
    mascota: mascota.id,
    cliente: clienteId,
    medico: d.data.medicoId ?? ctx.user.id,
    procedimiento: d.data.procedimiento,
    explicacion: d.data.explicacion || null,
    riesgos: d.data.riesgos || null,
    indicaciones: d.data.indicaciones || null,
    renglones,
    total,
    anticipo: d.data.anticipo ?? null,
    notasInternas: d.data.notasInternas || null,
  }
  let doc: CirPresupuesto
  if (id) {
    const ya = (await cargar(ctx.payload, id)).p
    if (idDe(ya.mascota) !== mascotaId) throw noEncontrado()
    if (ya.estado !== 'borrador') throw invalido('Solo se cambia un presupuesto en borrador. Si ya lo enviaste, regrésalo a borrador primero.')
    doc = await ctx.payload.update({ collection: 'cir-presupuestos', id, overrideAccess: true, depth: 0, data: datos })
  } else {
    doc = await ctx.payload.create({ collection: 'cir-presupuestos', overrideAccess: true, depth: 0, data: { ...datos, estado: 'borrador', creadoPor: ctx.user.id } })
  }
  return vista(await cargar(ctx.payload, doc.id), ctx.hoy, true)
}

/** Envía al tutor: vence en N días, liga con token, correo (si acepta avisos). */
export async function enviarPresupuesto(ctx: Ctx, id: number): Promise<PresupuestoVista & { correo: boolean; whatsapp: string | null }> {
  if (!ctx.p.clinica.escribirExpediente) throw prohibido('Enviar presupuestos pide «Escribir expediente».')
  const c = await cargar(ctx.payload, id)
  if (c.p.estado !== 'borrador' && !(c.p.estado === 'enviado' && estadoDe(c.p, ctx.hoy) === 'vencido')) throw invalido('Solo se envía un presupuesto en borrador (o uno enviado que ya venció).')
  const { vigenciaDias } = await configuracion(ctx.payload)
  const token = c.p.token || randomBytes(24).toString('hex')
  await ctx.payload.update({ collection: 'cir-presupuestos', id, overrideAccess: true, data: { estado: 'enviado', enviadoEn: new Date().toISOString(), vence: sumarDias(ctx.hoy, vigenciaDias), token } })
  const nuevo = await cargar(ctx.payload, id)
  const liga = ligaPresupuesto(nuevo.p)!
  const correo = await avisarTutor(ctx.payload, nuevo, liga)
  const nombre = (nuevo.cliente?.nombre ?? '').split(/\s+/)[0]
  const whatsapp = enlaceWhatsApp(nuevo.cliente?.telefono, `Hola ${nombre}, te compartimos el presupuesto de ${nuevo.p.procedimiento} para ${nuevo.mascota.nombre}. Ahí mismo lo puedes revisar y firmar: ${liga}`)
  return { ...vista(nuevo, ctx.hoy, true), correo, whatsapp }
}

export async function regresarABorrador(ctx: Ctx, id: number): Promise<PresupuestoVista> {
  if (!ctx.p.clinica.escribirExpediente) throw prohibido('Pide «Escribir expediente».')
  const c = await cargar(ctx.payload, id)
  if (c.p.estado !== 'enviado' && c.p.estado !== 'rechazado') throw invalido('Solo un presupuesto enviado o rechazado regresa a borrador.')
  /* La liga anterior deja de servir: al volver a enviarlo sale una nueva. */
  await ctx.payload.update({ collection: 'cir-presupuestos', id, overrideAccess: true, data: { estado: 'borrador', token: null, vence: null, motivoRechazo: null } })
  return vista(await cargar(ctx.payload, id), ctx.hoy, true)
}

export async function cancelarPresupuesto(ctx: Ctx, id: number, entrada: unknown): Promise<PresupuestoVista> {
  if (!ctx.p.clinica.escribirExpediente) throw prohibido('Pide «Escribir expediente».')
  const d = z.object({ motivo: z.string().trim().min(5, 'Escribe el motivo (mínimo 5 caracteres).').max(300) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Escribe el motivo.')
  const c = await cargar(ctx.payload, id)
  if (c.p.estado === 'cancelado') return vista(c, ctx.hoy, true)
  if (c.cita && ['solicitada', 'confirmada', 'llegada', 'atencion', 'finalizada'].includes(c.cita.estado)) throw invalido(`La cirugía ya está en la agenda (${folioParaId('CIT', c.cita.id)}): cancela primero la cita.`)
  await ctx.payload.update({ collection: 'cir-presupuestos', id, overrideAccess: true, data: { estado: 'cancelado', motivoCancelacion: d.data.motivo, token: null } })
  return vista(await cargar(ctx.payload, id), ctx.hoy, true)
}

const esquemaFirma = z.object({
  nombre: z.string().trim().min(3, 'Escribe el nombre completo de quien firma.').max(120),
  firma: z.string().refine(firmaValida, 'Falta la firma: firma con el dedo en el recuadro.'),
  acepto: z.literal(true, { errorMap: () => ({ message: 'Para firmar, marca que leíste y aceptas el consentimiento.' }) }),
})

async function conCandado<T>(payload: Payload, id: number, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({}, payload)
  const propia = await initTransaction(req)
  try {
    const sesiones = (payload.db as unknown as { sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions
    const tx = req.transactionID ? sesiones?.[String(await req.transactionID)]?.db : null
    if (tx) await tx.execute(sql`select pg_advisory_xact_lock(${6600000 + id})`)
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

type Origen = { via: 'portal'; tutorId: number | null; ip: string | null; navegador: string | null } | { via: 'clinica'; testigo: User; ip: string | null; navegador: string | null }

async function firmar(payload: Payload, id: number, entrada: unknown, origen: Origen, hoy: string): Promise<void> {
  const d = esquemaFirma.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa la firma.')
  await conCandado(payload, id, async (req) => {
    const c = await cargar(payload, id, req)
    const estado = estadoDe(c.p, hoy)
    if (estado === 'aceptado') throw invalido('Este presupuesto ya está firmado.')
    if (estado === 'vencido') throw invalido('Este presupuesto ya venció. Pide a la clínica que te lo vuelva a enviar.')
    if (origen.via === 'portal' && estado !== 'enviado') throw invalido('Este presupuesto ya no está disponible para firmar.')
    if (origen.via === 'clinica' && estado !== 'enviado' && estado !== 'borrador') throw invalido('Este presupuesto no se puede firmar (cancelado o rechazado).')
    const firmadoEn = new Date().toISOString()
    const texto = await textoConsentimiento(payload, c, d.data.nombre, hoy)
    const resumen = {
      folio: folioParaId('PRE', c.p.id),
      procedimiento: c.p.procedimiento,
      mascota: { id: c.mascota.id, nombre: c.mascota.nombre },
      medico: c.medico ? c.medico.name || c.medico.email : null,
      renglones: (c.p.renglones ?? []).map((r) => ({ concepto: r.concepto, cantidad: r.cantidad, precioUnitario: r.precioUnitario, importe: r.importe })),
      total: c.p.total,
      anticipo: c.p.anticipo ?? null,
      indicaciones: c.p.indicaciones ?? null,
      vence: c.p.vence ?? null,
    }
    const huella = createHash('sha256').update(JSON.stringify({ presupuesto: c.p.id, texto, resumen, firma: d.data.firma, nombre: d.data.nombre, firmadoEn, via: origen.via })).digest('hex')
    const con = await payload.create({
      collection: 'cir-consentimientos',
      overrideAccess: true,
      req,
      data: {
        presupuesto: c.p.id,
        mascota: c.mascota.id,
        cliente: c.cliente?.id ?? null,
        texto,
        resumen,
        firma: d.data.firma,
        nombreFirmante: d.data.nombre,
        via: origen.via,
        tutor: origen.via === 'portal' ? origen.tutorId : null,
        testigo: origen.via === 'clinica' ? origen.testigo.id : null,
        firmadoEn,
        ip: origen.ip,
        navegador: origen.navegador?.slice(0, 300) ?? null,
        huella,
      },
    })
    await payload.update({ collection: 'cir-presupuestos', id: c.p.id, overrideAccess: true, req, data: { estado: 'aceptado', respondidoEn: firmadoEn, consentimiento: con.id } })
  })
  await avisarClinica(payload, id, 'aceptado')
}

/** En la clínica (tableta): firma el tutor y queda quien lo recibió. */
export async function firmarEnClinica(ctx: Ctx, id: number, entrada: unknown, headers: Headers): Promise<PresupuestoVista> {
  if (!(ctx.p.clinica.escribirExpediente || ctx.p.clinica.agenda)) throw prohibido('Recoger la firma pide «Agenda» o «Escribir expediente».')
  await firmar(ctx.payload, id, entrada, { via: 'clinica', testigo: ctx.user, ip: ipDe(headers), navegador: headers.get('user-agent') }, ctx.hoy)
  return vista(await cargar(ctx.payload, id), ctx.hoy, true)
}

export function ipDe(headers: Headers): string | null {
  return (headers.get('x-forwarded-for') || headers.get('x-real-ip') || '').split(',')[0].trim() || null
}

/* ───────────────────────────── liga del tutor ───────────────────────────── */

/** Presupuesto por su liga (id + token). Nunca los borradores ni los cancelados. */
async function porLiga(payload: Payload, id: number, token: string): Promise<Cargado> {
  if (!/^[a-f0-9]{48}$/.test(token)) throw noEncontrado('Esta liga no es válida.')
  const c = await cargar(payload, id)
  if (!c.p.token || c.p.token !== token || c.p.estado === 'borrador' || c.p.estado === 'cancelado') throw noEncontrado('Esta liga ya no es válida. Pide a la clínica que te envíe el presupuesto otra vez.')
  return c
}

export async function presupuestoPorLiga(payload: Payload, id: number, token: string, hoy: string): Promise<PresupuestoVista & { texto: string; firma: string | null }> {
  const c = await porLiga(payload, id, token)
  return { ...vista(c, hoy, false), texto: c.consentimiento ? c.consentimiento.texto : await textoConsentimiento(payload, c), firma: c.consentimiento?.firma ?? null }
}

export async function firmarPorLiga(payload: Payload, id: number, token: string, entrada: unknown, headers: Headers, hoy: string, tutorId: number | null): Promise<PresupuestoVista> {
  await porLiga(payload, id, token)
  await firmar(payload, id, entrada, { via: 'portal', tutorId, ip: ipDe(headers), navegador: headers.get('user-agent') }, hoy)
  return vista(await cargar(payload, id), hoy, false)
}

export async function rechazarPorLiga(payload: Payload, id: number, token: string, entrada: unknown, hoy: string): Promise<PresupuestoVista> {
  const d = z.object({ motivo: z.string().trim().max(300).optional().default('') }).safeParse(entrada)
  if (!d.success) throw invalido('Revisa el motivo.')
  await conCandado(payload, id, async (req) => {
    const c = await porLiga(payload, id, token)
    if (estadoDe(c.p, hoy) !== 'enviado') throw invalido('Este presupuesto ya no está pendiente.')
    await payload.update({ collection: 'cir-presupuestos', id, overrideAccess: true, req, data: { estado: 'rechazado', respondidoEn: new Date().toISOString(), motivoRechazo: d.data.motivo || null } })
  })
  await avisarClinica(payload, id, 'rechazado')
  return vista(await cargar(payload, id), hoy, false)
}

/** Portal: presupuestos por responder de sus mascotas, con su liga (para «Pendientes»). */
export async function portalPresupuestosPendientes(c: CtxTutor, mascotaIds: number[]): Promise<{ id: number; folio: string; procedimiento: string; mascota: string; total: number; vence: string | null; liga: string }[]> {
  if (!mascotaIds.length) return []
  const r = await c.payload.find({ collection: 'cir-presupuestos', depth: 0, pagination: false, overrideAccess: true, showHiddenFields: true, where: { and: [{ mascota: { in: mascotaIds } }, { estado: { equals: 'enviado' } }] } })
  const masc = await c.payload.find({ collection: 'mascotas', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: mascotaIds } }, select: { nombre: true } })
  const nombre = new Map(masc.docs.map((m) => [m.id, m.nombre]))
  return r.docs
    .filter((p) => estadoDe(p, c.hoy) === 'enviado' && p.token)
    .map((p) => ({ id: p.id, folio: folioParaId('PRE', p.id), procedimiento: p.procedimiento, mascota: nombre.get(idDe(p.mascota)!) ?? '', total: p.total, vence: p.vence ?? null, liga: `/presupuesto/${p.id}/${p.token}` }))
}

/* ───────────────────────────── citas ───────────────────────────── */

/** Al agendar la cirugía: el presupuesto debe estar aceptado, ser de esa mascota y no tener otra cita vigente. */
export async function revisarPresupuestoParaCita(payload: Payload, presupuestoId: number, mascotaId: number, req?: PayloadRequest): Promise<void> {
  const p = await payload.findByID({ collection: 'cir-presupuestos', id: presupuestoId, depth: 0, overrideAccess: true, req }).catch(() => null)
  if (!p || idDe(p.mascota) !== mascotaId) throw invalido('Ese presupuesto no es de esta mascota.')
  if (p.estado !== 'aceptado') throw invalido('La cirugía se agenda cuando el presupuesto está aceptado y firmado.')
  const otra = await payload.find({ collection: 'citas', depth: 0, limit: 1, overrideAccess: true, req, where: { and: [{ presupuesto: { equals: presupuestoId } }, { estado: { in: ['solicitada', 'confirmada', 'llegada', 'atencion', 'finalizada'] } }] } })
  if (otra.docs[0]) throw invalido(`Este presupuesto ya tiene su cirugía en la agenda (${folioParaId('CIT', otra.docs[0].id)}). Reprográmala si cambia la fecha.`)
}

/* ───────────────────────────── correos ───────────────────────────── */

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

async function avisarTutor(payload: Payload, c: Cargado, liga: string): Promise<boolean> {
  const para = correoDelTutor(c.cliente)
  if (!para) return false
  try {
    const contacto = await contactoClinica(payload)
    const html = `<div style="font:15px/1.55 system-ui,sans-serif;color:#0f172a;max-width:560px">
<p>Hola ${esc((c.cliente?.nombre ?? '').split(/\s+/)[0])},</p>
<p>Te compartimos el presupuesto de <b>${esc(c.p.procedimiento)}</b> para <b>${esc(c.mascota.nombre)}</b>: <b>${esc(pesos(c.p.total))}</b>${c.p.vence ? `, vigente hasta el ${esc(fechaLarga(c.p.vence))}` : ''}.</p>
<p>En la liga puedes ver el detalle, leer el consentimiento y firmarlo con el dedo desde tu celular. Si tienes dudas, escríbenos antes de firmar.</p>
<p><a href="${liga}" style="background:${site.brand.accent};color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;display:inline-block">Revisar y firmar</a></p>
${contacto.telefono ? `<p style="color:#475569">Teléfono de la clínica: ${esc(contacto.telefono)}</p>` : ''}
<p style="color:#64748b;font-size:12px">${esc(site.brand.name)}. Si no esperabas este correo, ignóralo.</p></div>`
    await payload.sendEmail({ to: para, subject: `Presupuesto de ${c.p.procedimiento} para ${c.mascota.nombre} · ${site.brand.name}`, html })
    return true
  } catch (e) {
    payload.logger.error(`[cirugia] correo al tutor ${folioParaId('PRE', c.p.id)}: ${String((e as Error)?.message ?? e)}`)
    return false
  }
}

async function avisarClinica(payload: Payload, id: number, evento: 'aceptado' | 'rechazado'): Promise<void> {
  try {
    const g = (await payload.findGlobal({ slug: 'agenda-configuracion', depth: 0, overrideAccess: true }).catch(() => null)) as AgendaConfiguracion | null
    const correos = (g?.correoAvisos ?? '')
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
    if (!correos.length) return
    const c = await cargar(payload, id)
    const panel = `${site.url.replace(/\/$/, '')}/admin/clinica/mascotas/${c.mascota.id}?ver=cirugia`
    const html = `<div style="font:14px/1.5 system-ui,sans-serif;color:#0f172a;max-width:560px">
<p>${evento === 'aceptado' ? `<b>${esc(c.consentimiento?.nombreFirmante ?? 'El tutor')}</b> aceptó y firmó` : `El tutor <b>rechazó</b>`} el presupuesto ${folioParaId('PRE', id)}: <b>${esc(c.p.procedimiento)}</b> para ${esc(c.mascota.nombre)} (${esc(pesos(c.p.total))}).</p>
${evento === 'rechazado' && c.p.motivoRechazo ? `<p>Motivo: ${esc(c.p.motivoRechazo)}</p>` : ''}
${evento === 'aceptado' ? '<p>Ya se puede agendar la cirugía desde el expediente → Cirugía.</p>' : ''}
<p><a href="${panel}">Abrir el expediente</a></p></div>`
    await payload.sendEmail({ to: correos, subject: `${evento === 'aceptado' ? 'Presupuesto aceptado' : 'Presupuesto rechazado'}: ${c.p.procedimiento} · ${c.mascota.nombre}`, html })
  } catch (e) {
    payload.logger.error(`[cirugia] aviso a la clínica ${folioParaId('PRE', id)}: ${String((e as Error)?.message ?? e)}`)
  }
}

/* ───────────────────────────── imprimible ───────────────────────────── */

/** Presupuesto (y, si ya se firmó, el consentimiento con la firma) como página imprimible. */
export function htmlPresupuesto(v: PresupuestoVista & { texto: string }, firma: string | null, telefono: string | null): string {
  const filas = v.renglones.map((r) => `<tr><td>${esc(r.concepto)}</td><td class="n">${r.cantidad}</td><td class="n">${esc(pesos(r.precioUnitario))}</td><td class="n">${esc(pesos(r.importe))}</td></tr>`).join('')
  const parrafos = v.texto
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')
  const con = v.consentimiento
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.folio)} · ${esc(v.procedimiento)} · ${esc(site.brand.name)}</title>
<style>
body{font:14px/1.5 system-ui,-apple-system,sans-serif;color:#0f172a;margin:0;padding:20px;background:#fff}
.hoja{max-width:820px;margin:0 auto}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #0f172a;padding-bottom:10px;margin-bottom:14px}
h1{font-size:21px;margin:0}h2{font-size:15px;margin:20px 0 6px}
.marca{text-align:right;font-size:13px;color:#475569}
table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:7px 8px;border-bottom:1px solid #e2e8f0;vertical-align:top}
th{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;background:#f8fafc}.n{text-align:right;white-space:nowrap}
tfoot td{font-weight:700;border-bottom:0}
.firma{margin-top:16px;display:flex;gap:24px;align-items:flex-end;flex-wrap:wrap}
.firma img{max-width:320px;max-height:140px;border-bottom:1px solid #0f172a}
small,.tenue{color:#64748b}
.huella{font:11px/1.4 ui-monospace,monospace;word-break:break-all;color:#64748b}
.no-print{margin:18px 0;text-align:center}
.no-print button{font:inherit;padding:10px 18px;border-radius:8px;border:0;background:${site.brand.accent};color:#fff;cursor:pointer}
@media print{.no-print{display:none}body{padding:0}@page{margin:14mm}}
</style></head><body><div class="hoja">
<header><div><h1>${esc(v.procedimiento)}</h1><small>Presupuesto ${esc(v.folio)} · ${esc(v.mascota.nombre)}${v.cliente ? ` · ${esc(v.cliente.nombre)}` : ''}</small></div><div class="marca"><b>${esc(site.brand.name)}</b>${site.location.city ? `<br>${esc(site.location.city)}` : ''}${telefono ? `<br>Tel. ${esc(telefono)}` : ''}</div></header>
${v.medico ? `<p><b>Médico a cargo:</b> ${esc(v.medico.nombre)}</p>` : ''}
${v.explicacion ? `<h2>Qué se va a hacer</h2><p>${esc(v.explicacion).replace(/\n/g, '<br>')}</p>` : ''}
<h2>Presupuesto</h2>
<table><thead><tr><th>Concepto</th><th class="n">Cant.</th><th class="n">Precio</th><th class="n">Importe</th></tr></thead><tbody>${filas}</tbody>
<tfoot><tr><td colspan="3">Total</td><td class="n">${esc(pesos(v.total))}</td></tr>${v.anticipo ? `<tr><td colspan="3">Anticipo para apartar la fecha</td><td class="n">${esc(pesos(v.anticipo))}</td></tr>` : ''}</tfoot></table>
${v.vence ? `<p class="tenue">Vigente hasta el ${esc(fechaLarga(v.vence))}.</p>` : ''}
${v.indicaciones ? `<h2>Antes de la cirugía</h2><p>${esc(v.indicaciones).replace(/\n/g, '<br>')}</p>` : ''}
<h2>Consentimiento informado</h2>${parrafos}
${con && firma ? `<div class="firma"><div><img src="${firma}" alt="Firma"><br><b>${esc(con.nombreFirmante)}</b></div><div class="tenue">Firmado el ${esc(new Date(con.firmadoEn).toLocaleString('es-MX', { timeZone: site.location.timeZone, dateStyle: 'long', timeStyle: 'short' }))}<br>${con.via === 'portal' ? 'Desde la liga enviada al tutor' : 'En la clínica'} · ${esc(con.folio)}</div></div><p class="huella">Huella SHA-256: ${esc(con.huella)}</p>` : '<p class="tenue">Pendiente de firma.</p>'}
<div class="no-print"><button onclick="window.print()">Imprimir o guardar PDF</button></div>
</div></body></html>`
}

export async function htmlPresupuestoEquipo(ctx: Ctx, id: number): Promise<string> {
  const v = await presupuesto(ctx, id)
  const c = await cargar(ctx.payload, id)
  return htmlPresupuesto(v, c.consentimiento?.firma ?? null, (await contactoClinica(ctx.payload)).telefono)
}
