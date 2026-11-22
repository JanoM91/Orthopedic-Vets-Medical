import type { Payload, PayloadRequest } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { CirHoja, User } from '../../payload-types'
import { CLASES_ASA, MOMENTOS_FARMACO } from '../../collections/clinica/cirugia'
import { folioParaId } from '../../collections/clinica/acceso'
import { site } from '../site'
import { fechaLarga } from '../whatsapp'
import { type Ctx, ErrorClinica, idDe } from './servicio'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Ruta ortopédica · fase 2: hoja quirúrgica y de anestesia
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Una hoja por cirugía (ligada a su cita, o sin cita en una urgencia). La
 * abre y la llena quien tiene «Escribir expediente»; la leen quienes tienen
 * «Ver expediente». Fármacos y signos se AGREGAN renglón por renglón (con
 * candado por hoja, pg_advisory_xact_lock 6 700 000 + id) para que dos
 * personas en el quirófano no se pisen. Al cerrarla queda inmutable.
 *
 * La plataforma solo REGISTRA lo que escribe el médico: nunca calcula,
 * sugiere ni valida dosis. Los rangos de los signos solo evitan errores de
 * captura (un 9 de más), no interpretan nada.
 */

const prohibido = (m = 'Tu rol no incluye el expediente.') => new ErrorClinica(403, m)
const invalido = (m: string) => new ErrorClinica(400, m)
const noEncontrado = (m = 'No encontramos esa hoja quirúrgica.') => new ErrorClinica(404, m)

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/
const SIGNOS = ['fc', 'fr', 'spo2', 'etco2', 'temp', 'pas', 'pad', 'pam'] as const
type ClaveSigno = (typeof SIGNOS)[number]
/** Rangos de captura (no clínicos): evitan teclazos, no juzgan al paciente. */
const RANGO: Record<ClaveSigno, [number, number]> = { fc: [0, 400], fr: [0, 200], spo2: [0, 100], etco2: [0, 150], temp: [25, 45], pas: [0, 350], pad: [0, 300], pam: [0, 320] }
export const TIEMPOS = ['entrada', 'inicioAnestesia', 'inicioCirugia', 'finCirugia', 'extubacion', 'salida'] as const
export type ClaveTiempo = (typeof TIEMPOS)[number]

export type SignoVista = { indice: number; hora: string; notas: string | null; por: string | null } & Record<ClaveSigno, number | null>
export type FarmacoVista = { indice: number; momento: string; medicamento: string; dosis: string; via: string | null; hora: string; por: string | null }
export type HojaVista = {
  id: number
  folio: string
  estado: 'abierta' | 'cerrada'
  fecha: string
  procedimiento: string
  mascota: { id: number; nombre: string; especie: string; raza: string | null; alergias: string | null; alertas: string[]; ultimoPesoKg: number | null }
  cita: { id: number; folio: string; dia: string; hora: string; estado: string } | null
  presupuesto: { id: number; folio: string; estado: string; consentimiento: { folio: string; nombreFirmante: string; firmadoEn: string } | null } | null
  cirujano: { id: number; nombre: string } | null
  anestesista: { id: number; nombre: string } | null
  ayudantes: string | null
  asa: string | null
  urgencia: boolean
  pesoKg: number | null
  ayunoHoras: number | null
  valoracion: string | null
  farmacos: FarmacoVista[]
  tiempos: Record<ClaveTiempo, string | null>
  signos: SignoVista[]
  realizado: string | null
  hallazgos: string | null
  implantes: string | null
  complicaciones: string | null
  recuperacion: string | null
  indicacionesPost: string | null
  cerradaPor: string | null
  cerradaEn: string | null
}
export type HojaBreve = { id: number; folio: string; estado: 'abierta' | 'cerrada'; fecha: string; procedimiento: string; cita: string | null; presupuesto: string | null }

const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const nombreDe = (u: unknown): string | null => (u && typeof u === 'object' ? ((u as User).name || (u as User).email) : null)

async function vista(payload: Payload, h: CirHoja): Promise<HojaVista> {
  const mascota = await payload.findByID({ collection: 'mascotas', id: idDe(h.mascota)!, depth: 0, overrideAccess: true })
  const [peso, cita, pre, cirujano, anest, cerro] = await Promise.all([
    payload.find({ collection: 'mas-pesos', depth: 0, limit: 1, sort: '-fecha', overrideAccess: true, where: { mascota: { equals: mascota.id } } }),
    idDe(h.cita) ? payload.findByID({ collection: 'citas', id: idDe(h.cita)!, depth: 0, overrideAccess: true }).catch(() => null) : Promise.resolve(null),
    idDe(h.presupuesto) ? payload.findByID({ collection: 'cir-presupuestos', id: idDe(h.presupuesto)!, depth: 1, overrideAccess: true }).catch(() => null) : Promise.resolve(null),
    idDe(h.cirujano) ? payload.findByID({ collection: 'users', id: idDe(h.cirujano)!, depth: 0, overrideAccess: true }).catch(() => null) : Promise.resolve(null),
    idDe(h.anestesista) ? payload.findByID({ collection: 'users', id: idDe(h.anestesista)!, depth: 0, overrideAccess: true }).catch(() => null) : Promise.resolve(null),
    idDe(h.cerradaPor) ? payload.findByID({ collection: 'users', id: idDe(h.cerradaPor)!, depth: 0, overrideAccess: true }).catch(() => null) : Promise.resolve(null),
  ])
  const con = pre && typeof pre.consentimiento === 'object' && pre.consentimiento ? pre.consentimiento : null
  return {
    id: h.id,
    folio: folioParaId('HQ', h.id),
    estado: h.estado,
    fecha: h.fecha,
    procedimiento: h.procedimiento,
    mascota: {
      id: mascota.id,
      nombre: mascota.nombre,
      especie: mascota.especie,
      raza: t(mascota.raza),
      alergias: t(mascota.alergias),
      alertas: (mascota.alertasManejo ?? []).map((a) => a.texto).filter(Boolean),
      ultimoPesoKg: peso.docs[0]?.kg ?? null,
    },
    cita: cita ? { id: cita.id, folio: folioParaId('CIT', cita.id), dia: cita.dia, hora: cita.horaInicio, estado: cita.estado } : null,
    presupuesto: pre ? { id: pre.id, folio: folioParaId('PRE', pre.id), estado: pre.estado, consentimiento: con ? { folio: folioParaId('CON', con.id), nombreFirmante: con.nombreFirmante, firmadoEn: con.firmadoEn } : null } : null,
    cirujano: cirujano ? { id: cirujano.id, nombre: nombreDe(cirujano)! } : null,
    anestesista: anest ? { id: anest.id, nombre: nombreDe(anest)! } : null,
    ayudantes: t(h.ayudantes),
    asa: h.asa ?? null,
    urgencia: Boolean(h.urgencia),
    pesoKg: h.pesoKg ?? null,
    ayunoHoras: h.ayunoHoras ?? null,
    valoracion: t(h.valoracion),
    farmacos: (h.farmacos ?? []).map((f, i) => ({ indice: i, momento: f.momento, medicamento: f.medicamento, dosis: f.dosis, via: f.via ?? null, hora: f.hora, por: f.por ?? null })),
    tiempos: Object.fromEntries(TIEMPOS.map((k) => [k, t(h.tiempos?.[k])])) as Record<ClaveTiempo, string | null>,
    signos: (h.signos ?? []).map((s, i) => ({ indice: i, hora: s.hora, notas: s.notas ?? null, por: s.por ?? null, ...(Object.fromEntries(SIGNOS.map((k) => [k, s[k] ?? null])) as Record<ClaveSigno, number | null>) })),
    realizado: t(h.realizado),
    hallazgos: t(h.hallazgos),
    implantes: t(h.implantes),
    complicaciones: t(h.complicaciones),
    recuperacion: t(h.recuperacion),
    indicacionesPost: t(h.indicacionesPost),
    cerradaPor: nombreDe(cerro),
    cerradaEn: h.cerradaEn ?? null,
  }
}

async function cargar(payload: Payload, id: number, req?: PayloadRequest): Promise<CirHoja> {
  try {
    return await payload.findByID({ collection: 'cir-hojas', id, depth: 0, overrideAccess: true, req })
  } catch {
    throw noEncontrado()
  }
}

async function conCandado<T>(payload: Payload, user: User, id: number, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({ user: user as User & { collection: 'users' } }, payload)
  const propia = await initTransaction(req)
  try {
    const sesiones = (payload.db as unknown as { sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions
    const tx = req.transactionID ? sesiones?.[String(await req.transactionID)]?.db : null
    if (tx) await tx.execute(sql`select pg_advisory_xact_lock(${6700000 + id})`)
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

const exigirEscribir = (ctx: Ctx) => {
  if (!ctx.p.clinica.escribirExpediente) throw prohibido('La hoja quirúrgica la llena quien tiene «Escribir expediente».')
}
const exigirAbierta = (h: CirHoja) => {
  if (h.estado === 'cerrada') throw invalido('La hoja ya está cerrada: no se puede cambiar.')
}
const quien = (ctx: Ctx) => ctx.user.name || ctx.user.email

/* ───────────────────────────── abrir y leer ───────────────────────────── */

/**
 * Abre (o devuelve la que ya existe) la hoja de una cita; o, sin cita, una
 * hoja de urgencia para una mascota. Toma el procedimiento y el cirujano del
 * presupuesto aceptado si la cita lo tiene, y el último peso registrado.
 */
export async function abrirHoja(ctx: Ctx, entrada: unknown): Promise<HojaVista> {
  exigirEscribir(ctx)
  const d = z.object({ citaId: z.number().int().positive().nullable().optional(), mascotaId: z.number().int().positive().nullable().optional(), procedimiento: z.string().trim().max(160).optional() }).safeParse(entrada)
  if (!d.success || (!d.data.citaId && !d.data.mascotaId)) throw invalido('Falta la cita o la mascota.')
  if (d.data.citaId) {
    const ya = await ctx.payload.find({ collection: 'cir-hojas', depth: 0, limit: 1, overrideAccess: true, where: { cita: { equals: d.data.citaId } } })
    if (ya.docs[0]) return vista(ctx.payload, ya.docs[0])
  }
  const cita = d.data.citaId ? await ctx.payload.findByID({ collection: 'citas', id: d.data.citaId, depth: 1, overrideAccess: true }).catch(() => null) : null
  if (d.data.citaId && !cita) throw noEncontrado('No encontramos esa cita.')
  if (cita && (cita.estado === 'cancelada' || cita.estado === 'no_asistio')) throw invalido('La cita está cancelada o no asistió.')
  const mascotaId = cita ? idDe(cita.mascota)! : d.data.mascotaId!
  const mascota = await ctx.payload.findByID({ collection: 'mascotas', id: mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!mascota) throw noEncontrado('No encontramos esa mascota.')
  const pre = cita && idDe(cita.presupuesto) ? await ctx.payload.findByID({ collection: 'cir-presupuestos', id: idDe(cita.presupuesto)!, depth: 0, overrideAccess: true }).catch(() => null) : null
  const peso = await ctx.payload.find({ collection: 'mas-pesos', depth: 0, limit: 1, sort: '-fecha', overrideAccess: true, where: { mascota: { equals: mascotaId } } })
  const servicio = cita && typeof cita.servicio === 'object' && cita.servicio ? cita.servicio.nombre : null
  const procedimiento = t(d.data.procedimiento) ?? pre?.procedimiento ?? servicio
  if (!procedimiento) throw invalido('Escribe el procedimiento.')
  const doc = await ctx.payload.create({
    collection: 'cir-hojas',
    overrideAccess: true,
    depth: 0,
    data: {
      cita: cita?.id ?? null,
      mascota: mascotaId,
      presupuesto: pre?.id ?? null,
      procedimiento,
      fecha: cita?.dia ?? ctx.hoy,
      estado: 'abierta',
      cirujano: idDe(pre?.medico) ?? idDe(cita?.profesional) ?? ctx.user.id,
      urgencia: !cita,
      pesoKg: peso.docs[0]?.kg ?? null,
      tiempos: {},
      farmacos: [],
      signos: [],
      creadoPor: ctx.user.id,
    },
  })
  return vista(ctx.payload, doc)
}

export async function hojaQuirurgica(ctx: Ctx, id: number): Promise<HojaVista & { puedeEscribir: boolean }> {
  if (!ctx.p.clinica.verExpediente) throw prohibido()
  return { ...(await vista(ctx.payload, await cargar(ctx.payload, id))), puedeEscribir: ctx.p.clinica.escribirExpediente }
}

export async function hojasDeMascota(ctx: Ctx, mascotaId: number): Promise<HojaBreve[]> {
  if (!ctx.p.clinica.verExpediente) throw prohibido()
  const r = await ctx.payload.find({ collection: 'cir-hojas', depth: 0, pagination: false, sort: '-createdAt', overrideAccess: true, where: { mascota: { equals: mascotaId } } })
  return r.docs.map((h) => ({ id: h.id, folio: folioParaId('HQ', h.id), estado: h.estado, fecha: h.fecha, procedimiento: h.procedimiento, cita: idDe(h.cita) ? folioParaId('CIT', idDe(h.cita)!) : null, presupuesto: idDe(h.presupuesto) ? folioParaId('PRE', idDe(h.presupuesto)!) : null }))
}

/* ───────────────────────────── escribir ───────────────────────────── */

const hora = z.string().regex(HORA, 'Hora como HH:MM.')
const textoOpc = (max: number) => z.string().trim().max(max).nullable().optional()
const esquemaDatos = z
  .object({
    procedimiento: z.string().trim().min(3).max(160).optional(),
    cirujanoId: z.number().int().positive().nullable().optional(),
    anestesistaId: z.number().int().positive().nullable().optional(),
    ayudantes: textoOpc(200),
    asa: z.enum(CLASES_ASA).nullable().optional(),
    urgencia: z.boolean().optional(),
    pesoKg: z.number().min(0).max(200).nullable().optional(),
    ayunoHoras: z.number().min(0).max(72).nullable().optional(),
    valoracion: textoOpc(3000),
    tiempos: z.object(Object.fromEntries(TIEMPOS.map((k) => [k, z.union([hora, z.literal(''), z.null()]).optional()])) as Record<ClaveTiempo, z.ZodOptional<z.ZodUnion<[typeof hora, z.ZodLiteral<''>, z.ZodNull]>>>).partial().optional(),
    realizado: textoOpc(4000),
    hallazgos: textoOpc(3000),
    implantes: textoOpc(1500),
    complicaciones: textoOpc(2000),
    recuperacion: textoOpc(2000),
    indicacionesPost: textoOpc(3000),
  })
  .strict()

/** Guarda lo que llegue (solo esos campos). */
export async function guardarHoja(ctx: Ctx, id: number, entrada: unknown): Promise<HojaVista> {
  exigirEscribir(ctx)
  const d = esquemaDatos.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa los datos.')
  const x = d.data
  await conCandado(ctx.payload, ctx.user, id, async (req) => {
    const h = await cargar(ctx.payload, id, req)
    exigirAbierta(h)
    const data: Record<string, unknown> = {}
    if (x.procedimiento !== undefined) data.procedimiento = x.procedimiento
    if (x.cirujanoId !== undefined) data.cirujano = x.cirujanoId
    if (x.anestesistaId !== undefined) data.anestesista = x.anestesistaId
    for (const k of ['ayudantes', 'valoracion', 'realizado', 'hallazgos', 'implantes', 'complicaciones', 'recuperacion', 'indicacionesPost'] as const) if (x[k] !== undefined) data[k] = x[k] || null
    if (x.asa !== undefined) data.asa = x.asa
    if (x.urgencia !== undefined) data.urgencia = x.urgencia
    if (x.pesoKg !== undefined) data.pesoKg = x.pesoKg
    if (x.ayunoHoras !== undefined) data.ayunoHoras = x.ayunoHoras
    if (x.tiempos) data.tiempos = { ...(h.tiempos ?? {}), ...Object.fromEntries(Object.entries(x.tiempos).map(([k, v]) => [k, v || null])) }
    await ctx.payload.update({ collection: 'cir-hojas', id, overrideAccess: true, req, data })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id))
}

const esquemaFarmaco = z.object({
  momento: z.enum(MOMENTOS_FARMACO.map((m) => m.value) as [string, ...string[]]),
  medicamento: z.string().trim().min(2, 'Escribe el medicamento.').max(120),
  dosis: z.string().trim().min(1, 'Escribe la dosis tal como la indicó el médico.').max(80),
  via: z.string().trim().max(40).optional().default(''),
  hora,
})

export async function agregarFarmaco(ctx: Ctx, id: number, entrada: unknown): Promise<HojaVista> {
  exigirEscribir(ctx)
  const d = esquemaFarmaco.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa el fármaco.')
  await conCandado(ctx.payload, ctx.user, id, async (req) => {
    const h = await cargar(ctx.payload, id, req)
    exigirAbierta(h)
    const lista = (h.farmacos ?? []).map(({ id: _i, ...f }) => (void _i, f))
    if (lista.length >= 80) throw invalido('La hoja ya tiene 80 fármacos registrados.')
    lista.push({ momento: d.data.momento as (typeof lista)[number]['momento'], medicamento: d.data.medicamento, dosis: d.data.dosis, via: d.data.via || null, hora: d.data.hora, por: quien(ctx) })
    await ctx.payload.update({ collection: 'cir-hojas', id, overrideAccess: true, req, data: { farmacos: lista } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id))
}

const esquemaSignos = z
  .object({
    hora,
    notas: z.string().trim().max(200).optional().default(''),
    ...(Object.fromEntries(SIGNOS.map((k) => [k, z.number().nullable().optional()])) as Record<ClaveSigno, z.ZodOptional<z.ZodNullable<z.ZodNumber>>>),
  })
  .superRefine((v, c) => {
    const algun = SIGNOS.some((k) => v[k] != null)
    if (!algun && !v.notas) c.addIssue({ code: 'custom', message: 'Captura al menos un signo o una nota.' })
    for (const k of SIGNOS) {
      const n = v[k]
      if (n != null && (n < RANGO[k][0] || n > RANGO[k][1])) c.addIssue({ code: 'custom', message: `El valor de ${k.toUpperCase()} (${n}) parece un error de captura.` })
    }
  })

export async function agregarSignos(ctx: Ctx, id: number, entrada: unknown): Promise<HojaVista> {
  exigirEscribir(ctx)
  const d = esquemaSignos.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Revisa los signos.')
  await conCandado(ctx.payload, ctx.user, id, async (req) => {
    const h = await cargar(ctx.payload, id, req)
    exigirAbierta(h)
    const lista = (h.signos ?? []).map(({ id: _i, ...s }) => (void _i, s))
    if (lista.length >= 300) throw invalido('La hoja ya tiene 300 tomas de signos.')
    lista.push({ hora: d.data.hora, notas: d.data.notas || null, por: quien(ctx), ...(Object.fromEntries(SIGNOS.map((k) => [k, d.data[k] != null ? Math.round(d.data[k]! * 100) / 100 : null])) as Record<ClaveSigno, number | null>) })
    lista.sort((a, b) => a.hora.localeCompare(b.hora))
    await ctx.payload.update({ collection: 'cir-hojas', id, overrideAccess: true, req, data: { signos: lista } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id))
}

/** Quita un renglón capturado por error (solo con la hoja abierta). */
export async function quitarRenglon(ctx: Ctx, id: number, entrada: unknown): Promise<HojaVista> {
  exigirEscribir(ctx)
  const d = z.object({ lista: z.enum(['farmacos', 'signos']), indice: z.number().int().min(0) }).safeParse(entrada)
  if (!d.success) throw invalido('Renglón no válido.')
  await conCandado(ctx.payload, ctx.user, id, async (req) => {
    const h = await cargar(ctx.payload, id, req)
    exigirAbierta(h)
    const actual = (d.data.lista === 'farmacos' ? h.farmacos : h.signos) ?? []
    if (!actual[d.data.indice]) throw invalido('Ese renglón ya no existe.')
    const lista = actual.filter((_, i) => i !== d.data.indice).map(({ id: _i, ...r }) => (void _i, r))
    await ctx.payload.update({ collection: 'cir-hojas', id, overrideAccess: true, req, data: { [d.data.lista]: lista } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id))
}

/** Cerrar: queda inmutable. Pide lo mínimo para que la hoja sirva de registro. */
export async function cerrarHoja(ctx: Ctx, id: number): Promise<HojaVista> {
  exigirEscribir(ctx)
  await conCandado(ctx.payload, ctx.user, id, async (req) => {
    const h = await cargar(ctx.payload, id, req)
    exigirAbierta(h)
    const faltan: string[] = []
    if (!idDe(h.cirujano)) faltan.push('cirujano')
    if (!t(h.realizado)) faltan.push('lo realizado')
    if (!h.tiempos?.inicioCirugia || !h.tiempos?.finCirugia) faltan.push('inicio y fin de la cirugía')
    if (faltan.length) throw invalido(`Para cerrar la hoja falta: ${faltan.join(', ')}.`)
    await ctx.payload.update({ collection: 'cir-hojas', id, overrideAccess: true, req, data: { estado: 'cerrada', cerradaPor: ctx.user.id, cerradaEn: new Date().toISOString() } })
  })
  return vista(ctx.payload, await cargar(ctx.payload, id))
}

/* ───────────────────────────── imprimible ───────────────────────────── */

const esc = (s: string | null | undefined) => (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const ETIQ_TIEMPO: Record<ClaveTiempo, string> = { entrada: 'Entrada a quirófano', inicioAnestesia: 'Inicio de anestesia', inicioCirugia: 'Inicio de cirugía', finCirugia: 'Fin de cirugía', extubacion: 'Extubación', salida: 'Salida de quirófano' }
const ETIQ_MOMENTO: Record<string, string> = Object.fromEntries(MOMENTOS_FARMACO.map((m) => [m.value, m.label]))
const minutos = (h: string) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5))

/** Gráfica SVG sencilla de una serie (la usan el imprimible y la pantalla). */
export function svgSerie(puntos: { hora: string; valor: number }[], color: string, ancho = 320, alto = 90): string {
  if (puntos.length < 2) return ''
  const xs = puntos.map((p) => minutos(p.hora))
  const ys = puntos.map((p) => p.valor)
  const [x0, x1] = [Math.min(...xs), Math.max(...xs) || 1]
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)]
  const px = (x: number) => 6 + ((x - x0) / Math.max(1, x1 - x0)) * (ancho - 12)
  const py = (y: number) => alto - 8 - ((y - y0) / Math.max(1, y1 - y0)) * (alto - 16)
  const d = puntos.map((p, i) => `${i ? 'L' : 'M'}${px(minutos(p.hora)).toFixed(1)},${py(p.valor).toFixed(1)}`).join(' ')
  return `<svg viewBox="0 0 ${ancho} ${alto}" width="${ancho}" height="${alto}" role="img"><path d="${d}" fill="none" stroke="${color}" stroke-width="2"/>${puntos.map((p) => `<circle cx="${px(minutos(p.hora)).toFixed(1)}" cy="${py(p.valor).toFixed(1)}" r="2.5" fill="${color}"/>`).join('')}</svg>`
}

export async function htmlHoja(ctx: Ctx, id: number): Promise<string> {
  const v = await hojaQuirurgica(ctx, id)
  const fila = (k: string, val: string | null) => (val ? `<div><span>${k}</span>${esc(val)}</div>` : '')
  const series: [ClaveSigno, string, string][] = [['fc', 'FC (lpm)', '#b42330'], ['fr', 'FR (rpm)', '#1f4f7a'], ['spo2', 'SpO₂ (%)', '#0b6b59'], ['temp', 'Temp (°C)', '#9a5b00']]
  const graficas = series
    .map(([k, et, color]) => {
      const pts = v.signos.filter((s) => s[k] != null).map((s) => ({ hora: s.hora, valor: s[k]! }))
      const svg = svgSerie(pts, color)
      return svg ? `<figure><figcaption>${et}</figcaption>${svg}</figure>` : ''
    })
    .join('')
  const texto = (titulo: string, val: string | null) => (val ? `<h2>${titulo}</h2><p>${esc(val).replace(/\n/g, '<br>')}</p>` : '')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(v.folio)} · ${esc(v.procedimiento)} · ${esc(v.mascota.nombre)}</title>
<style>
body{font:13px/1.45 system-ui,-apple-system,sans-serif;color:#0f172a;margin:0;padding:18px;background:#fff}.hoja{max-width:900px;margin:0 auto}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:2px solid #0f172a;padding-bottom:8px;margin-bottom:12px}h1{font-size:20px;margin:0}h2{font-size:14px;margin:16px 0 6px}
.datos{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px 14px}.datos span{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:5px 6px;border-bottom:1px solid #e2e8f0}th{font-size:10.5px;text-transform:uppercase;color:#64748b;background:#f8fafc}
.alerta{border:1px solid #fecaca;background:#fef2f2;color:#991b1b;padding:6px 10px;border-radius:8px;margin-top:8px}.graficas{display:flex;flex-wrap:wrap;gap:12px}figure{margin:0}figcaption{font-size:11px;color:#64748b}
.pie{margin-top:16px;color:#64748b;font-size:11.5px}.no-print{margin:16px 0;text-align:center}.no-print button{font:inherit;padding:9px 16px;border-radius:8px;border:0;background:${site.brand.accent};color:#fff;cursor:pointer}
@media print{.no-print{display:none}body{padding:0}@page{margin:12mm}}
</style></head><body><div class="hoja">
<header><div><h1>Hoja quirúrgica · ${esc(v.procedimiento)}</h1><small>${esc(v.folio)} · ${esc(v.mascota.nombre)} (${esc(v.mascota.especie)}${v.mascota.raza ? `, ${esc(v.mascota.raza)}` : ''}) · ${esc(fechaLarga(v.fecha))}${v.urgencia ? ' · URGENCIA' : ''}</small></div><div style="text-align:right"><b>${esc(site.brand.name)}</b><br>${v.estado === 'cerrada' ? `Cerrada por ${esc(v.cerradaPor)}` : 'Abierta'}</div></header>
${v.mascota.alergias ? `<div class="alerta"><b>Alergias:</b> ${esc(v.mascota.alergias)}</div>` : ''}
<div class="datos">${fila('Cirujano', v.cirujano?.nombre ?? null)}${fila('Anestesia', v.anestesista?.nombre ?? null)}${fila('Ayudantes', v.ayudantes)}${fila('ASA', v.asa ? `ASA ${v.asa}${v.urgencia ? ' E' : ''}` : null)}${fila('Peso', v.pesoKg != null ? `${v.pesoKg} kg` : null)}${fila('Ayuno', v.ayunoHoras != null ? `${v.ayunoHoras} h` : null)}${fila('Presupuesto', v.presupuesto?.folio ?? null)}${fila('Consentimiento', v.presupuesto?.consentimiento ? `${v.presupuesto.consentimiento.folio} · ${v.presupuesto.consentimiento.nombreFirmante}` : null)}</div>
${texto('Valoración preanestésica', v.valoracion)}
<h2>Tiempos</h2><div class="datos">${TIEMPOS.map((k) => fila(ETIQ_TIEMPO[k], v.tiempos[k])).join('')}</div>
<h2>Fármacos aplicados</h2>${v.farmacos.length ? `<table><thead><tr><th>Hora</th><th>Momento</th><th>Medicamento</th><th>Dosis indicada</th><th>Vía</th><th>Registró</th></tr></thead><tbody>${v.farmacos.map((f) => `<tr><td>${esc(f.hora)}</td><td>${esc(ETIQ_MOMENTO[f.momento] ?? f.momento)}</td><td>${esc(f.medicamento)}</td><td>${esc(f.dosis)}</td><td>${esc(f.via)}</td><td>${esc(f.por)}</td></tr>`).join('')}</tbody></table>` : '<p><small>Sin registros.</small></p>'}
<h2>Monitoreo</h2>${graficas ? `<div class="graficas">${graficas}</div>` : ''}${v.signos.length ? `<table><thead><tr><th>Hora</th><th>FC</th><th>FR</th><th>SpO₂</th><th>EtCO₂</th><th>Temp</th><th>PAS/PAD (PAM)</th><th>Notas</th></tr></thead><tbody>${v.signos.map((s) => `<tr><td>${esc(s.hora)}</td><td>${s.fc ?? ''}</td><td>${s.fr ?? ''}</td><td>${s.spo2 ?? ''}</td><td>${s.etco2 ?? ''}</td><td>${s.temp ?? ''}</td><td>${s.pas ?? ''}${s.pad != null ? `/${s.pad}` : ''}${s.pam != null ? ` (${s.pam})` : ''}</td><td>${esc(s.notas)}</td></tr>`).join('')}</tbody></table>` : '<p><small>Sin registros.</small></p>'}
${texto('Procedimiento realizado', v.realizado)}${texto('Hallazgos', v.hallazgos)}${texto('Implantes', v.implantes)}${texto('Complicaciones', v.complicaciones)}${texto('Recuperación', v.recuperacion)}${texto('Indicaciones postoperatorias', v.indicacionesPost)}
<p class="pie">Registro clínico de ${esc(site.brand.name)}. Los fármacos y dosis son los que indicó y registró el equipo médico.</p>
<div class="no-print"><button onclick="window.print()">Imprimir o guardar PDF</button></div>
</div></body></html>`
}
