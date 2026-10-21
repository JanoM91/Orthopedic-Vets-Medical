import type { Payload, PayloadRequest, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { sql } from '@payloadcms/db-postgres'
import { z } from 'zod'

import type { AgendaConfiguracion, Cita, Recurso, Servicio, Tutor, User } from '../../payload-types'
import { ESTADOS_OCUPAN, type EstadoCita, TRANSICIONES } from '../../collections/clinica/agenda'
import { folioParaId } from '../../collections/clinica/acceso'
import { registrar as registrarEnFinanzas } from '../finanzas/servicio'
import { instanteDesdeLocal, minutosDesdeTexto, partesLocales, textoDesdeMinutos } from '../localTime'
import { calcularPermisos } from '../permisosBase'
import { site } from '../site'
import { type Ctx, type CtxTutor, ErrorClinica, idDe, vistaMascota } from './servicio'
import type { CitaVista, ConfiguracionAgenda, DisponibilidadDia, RecursoVista, ServicioVista } from './tipos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Agenda y citas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * HORARIO: todo se calcula en la zona del negocio (site.location.timeZone).
 * La cita guarda `dia` y `horaInicio` como texto (lo que ve la gente) y
 * `inicio`/`fin` como instantes (para detectar choques y ordenar).
 *
 * CHOQUES: al crear o reprogramar, dentro de una transacción se toma un
 * candado de Postgres por recurso (pg_advisory_xact_lock) y se vuelve a
 * buscar traslapes; así dos personas que piden el mismo hueco al mismo tiempo
 * no lo obtienen las dos.
 *
 * PORTAL: el tutor pide citas solo de sus mascotas, en servicios que se
 * puedan pedir en línea, con la anticipación mínima y dentro del horario;
 * nacen «solicitadas». Reprograma o cancela solo si falta más de
 * `cancelacionHoras`. Lo demás lo hace el equipo con «agenda».
 *
 * CARGO: al pasar a «finalizada», si el servicio tiene precio se registra en
 * Finanzas una entrada pendiente de cobro (asignada al área del servicio) a
 * nombre del tutor. Lo hace el sistema aunque quien finaliza no tenga permisos
 * de Finanzas; queda capturado por esa persona en la bitácora de Finanzas.
 */

const prohibido = (m = 'Tu rol no incluye la agenda.') => new ErrorClinica(403, m)
const invalido = (m: string) => new ErrorClinica(400, m)
const noEncontrado = (m = 'No encontramos esa cita.') => new ErrorClinica(404, m)

const hora = z.string().regex(/^\d{2}:\d{2}$/, 'Hora como HH:MM.')
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Día como AAAA-MM-DD.')

/* ───────────────────────────── configuración ───────────────────────────── */

type Horario = { dia: number; abierto: boolean; de: number; a: number }[]

const HORARIO_POR_OMISION: Horario = [1, 2, 3, 4, 5, 6].map((d) => ({ dia: d, abierto: true, de: 9 * 60, a: d === 6 ? 14 * 60 : 19 * 60 })).concat([{ dia: 0, abierto: false, de: 0, a: 0 }])

export async function configuracion(payload: Payload): Promise<ConfiguracionAgenda & { horarioMin: Horario }> {
  const g = (await payload.findGlobal({ slug: 'agenda-configuracion', depth: 0, overrideAccess: true })) as AgendaConfiguracion
  const filas = (g.horario ?? [])
    .map((h) => ({ dia: Number(h.dia), abierto: Boolean(h.abierto), de: minutosDesdeTexto(h.de) ?? 0, a: minutosDesdeTexto(h.a) ?? 0 }))
    .filter((h) => h.dia >= 0 && h.dia <= 6)
  const horarioMin = filas.length ? filas : HORARIO_POR_OMISION
  return {
    horario: horarioMin.map((h) => ({ dia: h.dia, abierto: h.abierto && h.a > h.de, de: textoDesdeMinutos(h.de), a: textoDesdeMinutos(h.a) })),
    horarioMin,
    intervaloMin: g.intervaloMin || 30,
    anticipacionHoras: g.anticipacionHoras ?? 2,
    diasAdelante: g.diasAdelante || 60,
    cancelacionHoras: g.cancelacionHoras ?? 12,
    configurada: filas.length > 0,
  }
}

const diaDeSemana = (d: string): number => new Date(d + 'T12:00:00Z').getUTCDay()
function instante(d: string, minutos: number): Date {
  const [y, m, dd] = d.split('-').map(Number)
  return instanteDesdeLocal(y, m, dd, Math.floor(minutos / 60), minutos % 60, site.location.timeZone)
}
export function ahoraLocal(): { dia: string; minutos: number } {
  const p = partesLocales(new Date(), site.location.timeZone)
  return { dia: `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`, minutos: p.hour * 60 + p.minute }
}

/* ───────────────────────────── vistas ───────────────────────────── */

const vistaRecurso = (r: Recurso): RecursoVista => ({ id: r.id, nombre: r.nombre, tipo: r.tipo, activo: r.activo ?? true, orden: r.orden ?? 0 })
const vistaServicio = (s: Servicio): ServicioVista => ({
  id: s.id,
  nombre: s.nombre,
  descripcion: s.descripcion ?? null,
  indicaciones: s.indicaciones ?? null,
  duracionMin: s.duracionMin,
  precio: s.precio ?? null,
  recursoPorDefecto: idDe(s.recursoPorDefecto) ?? 0,
  area: idDe(s.area),
  reservaEnLinea: s.reservaEnLinea,
  activo: s.activo ?? true,
  orden: s.orden ?? 0,
})
const nombreDe = (v: unknown, campo = 'nombre'): string => (v && typeof v === 'object' ? String((v as Record<string, unknown>)[campo] ?? '') : '')

export function vistaCita(c: Cita, hoy: string): CitaVista {
  const m = typeof c.mascota === 'object' && c.mascota ? c.mascota : null
  const cl = typeof c.cliente === 'object' && c.cliente ? c.cliente : null
  const prof = typeof c.profesional === 'object' && c.profesional ? c.profesional : null
  return {
    id: c.id,
    folio: folioParaId('CIT', c.id),
    mascota: m ? { id: m.id, nombre: m.nombre, especie: m.especie, folio: folioParaId('MAS', m.id), alertas: [...(m.alertasManejo ?? []).map((a) => a.texto), m.alergias ? `Alergia: ${m.alergias}` : ''].filter(Boolean) } : { id: idDe(c.mascota) ?? 0, nombre: 'Mascota', especie: 'otra', folio: '', alertas: [] },
    cliente: cl ? { id: cl.id, nombre: cl.nombreCompleto || cl.nombre, telefono: cl.telefono ?? null } : null,
    servicio: { id: idDe(c.servicio) ?? 0, nombre: nombreDe(c.servicio) },
    recurso: { id: idDe(c.recurso) ?? 0, nombre: nombreDe(c.recurso) },
    profesional: prof ? { id: prof.id, nombre: prof.name || prof.email } : null,
    dia: c.dia,
    horaInicio: c.horaInicio,
    horaFin: textoDesdeMinutos((minutosDesdeTexto(c.horaInicio) ?? 0) + c.duracionMin),
    duracionMin: c.duracionMin,
    estado: c.estado,
    origen: c.origen,
    notasTutor: c.notasTutor ?? null,
    notasInternas: c.notasInternas ?? null,
    motivoCancelacion: c.motivoCancelacion ?? null,
    historial: (c.historial ?? []).map((h) => ({ estado: h.estado, fecha: h.fecha, por: h.por ?? null, detalle: h.detalle ?? null })),
    cargoFinanzas: idDe(c.cargoFinanzas),
    esHoy: c.dia === hoy,
    siguientes: TRANSICIONES[c.estado as EstadoCita] ?? [],
    creadoEn: c.createdAt,
  }
}

/* ───────────────────────────── catálogos ───────────────────────────── */

export async function catalogoAgenda(payload: Payload, soloEnLinea = false): Promise<{ recursos: RecursoVista[]; servicios: ServicioVista[]; configuracion: ConfiguracionAgenda }> {
  const [r, s, cfg] = await Promise.all([
    payload.find({ collection: 'recursos', depth: 0, pagination: false, sort: 'orden', overrideAccess: true }),
    payload.find({ collection: 'servicios', depth: 0, pagination: false, sort: 'orden', overrideAccess: true, where: soloEnLinea ? { and: [{ activo: { equals: true } }, { reservaEnLinea: { not_equals: 'no' } }] } : undefined }),
    configuracion(payload),
  ])
  const { horarioMin: _h, ...conf } = cfg
  void _h
  return { recursos: r.docs.map(vistaRecurso), servicios: s.docs.map(vistaServicio), configuracion: conf }
}

/** Catálogo inicial (recursos y servicios del prototipo). Solo si no hay nada. */
export async function arranqueAgenda(ctx: Ctx): Promise<{ hecho: string[] }> {
  if (!ctx.p.clinica.configurarAgenda) throw prohibido('Los catálogos de la agenda los crea quien tiene «Configurar agenda».')
  const ya = await ctx.payload.count({ collection: 'recursos', overrideAccess: true })
  if (ya.totalDocs) throw invalido('Ya hay recursos. Edítalos en Clínica → Recursos y Servicios del panel.')
  const areas = (await ctx.payload.find({ collection: 'fin-actividades', depth: 0, pagination: false, overrideAccess: true })).docs
  const area = (patron: RegExp) => areas.find((a) => patron.test(a.nombre))?.id ?? null
  const recursos: { nombre: string; tipo: Recurso['tipo']; orden: number }[] = [
    { nombre: 'Consultorio 1', tipo: 'consultorio', orden: 1 },
    { nombre: 'Consultorio 2', tipo: 'consultorio', orden: 2 },
    { nombre: 'Quirófano', tipo: 'quirofano', orden: 3 },
    { nombre: 'Estética', tipo: 'estetica', orden: 4 },
  ]
  const ids: Record<string, number> = {}
  for (const r of recursos) ids[r.nombre] = (await ctx.payload.create({ collection: 'recursos', overrideAccess: true, data: { ...r, activo: true } })).id
  const servicios: { nombre: string; duracionMin: number; recurso: string; area: number | null; reservaEnLinea: Servicio['reservaEnLinea']; descripcion: string; indicaciones?: string }[] = [
    { nombre: 'Consulta general', duracionMin: 30, recurso: 'Consultorio 1', area: area(/consulta/i), reservaEnLinea: 'inmediata', descripcion: 'Exploración, historia clínica, plan de atención e indicaciones por escrito.', indicaciones: 'Traer cartilla y estudios previos, si los hay.' },
    { nombre: 'Consulta de ortopedia', duracionMin: 45, recurso: 'Consultorio 2', area: area(/consulta/i), reservaEnLinea: 'inmediata', descripcion: 'Valoración de marcha, articulaciones y columna; plan de estudios y tratamiento.', indicaciones: 'Traer radiografías o estudios anteriores.' },
    { nombre: 'Vacunación y desparasitación', duracionMin: 20, recurso: 'Consultorio 1', area: area(/consulta/i), reservaEnLinea: 'inmediata', descripcion: 'Revisión previa, aplicación según el protocolo de la clínica y registro en la cartilla.', indicaciones: 'Traer cartilla.' },
    { nombre: 'Rehabilitación y fisioterapia', duracionMin: 45, recurso: 'Consultorio 2', area: area(/rehabilita/i), reservaEnLinea: 'valoracion', descripcion: 'Sesiones indicadas por el médico tratante.', indicaciones: 'Requiere indicación médica.' },
    { nombre: 'Cirugía ortopédica', duracionMin: 120, recurso: 'Quirófano', area: area(/cirug/i), reservaEnLinea: 'valoracion', descripcion: 'Valoración previa, estudios, presupuesto, consentimiento, procedimiento, alta y seguimiento.' },
    { nombre: 'Revisión postquirúrgica', duracionMin: 30, recurso: 'Consultorio 2', area: area(/cirug/i), reservaEnLinea: 'inmediata', descripcion: 'Control de herida, retiro de puntos e indicaciones.' },
    { nombre: 'Baño', duracionMin: 60, recurso: 'Estética', area: null, reservaEnLinea: 'inmediata', descripcion: 'Baño, secado, cepillado y limpieza de oídos.', indicaciones: 'Avisar si tiene alergias o indicaciones de piel.' },
    { nombre: 'Baño y corte de raza', duracionMin: 90, recurso: 'Estética', area: null, reservaEnLinea: 'inmediata', descripcion: 'Baño completo y corte según la raza o la preferencia del tutor.' },
    { nombre: 'Corte de uñas', duracionMin: 15, recurso: 'Estética', area: null, reservaEnLinea: 'inmediata', descripcion: 'Corte y limado.' },
  ]
  let n = 0
  for (const s of servicios) {
    await ctx.payload.create({ collection: 'servicios', overrideAccess: true, data: { nombre: s.nombre, descripcion: s.descripcion, indicaciones: s.indicaciones ?? null, duracionMin: s.duracionMin, recursoPorDefecto: ids[s.recurso], area: s.area, reservaEnLinea: s.reservaEnLinea, activo: true, orden: ++n } })
  }
  return { hecho: [`${recursos.length} recursos`, `${servicios.length} servicios (sin precio: cápturalo en Clínica → Servicios)`] }
}

/* ───────────────────────────── disponibilidad ───────────────────────────── */

async function citasQueOcupan(payload: Payload, recursoId: number, d: string, req?: PayloadRequest): Promise<Cita[]> {
  return (await payload.find({ collection: 'citas', depth: 0, pagination: false, overrideAccess: true, req, where: { and: [{ recurso: { equals: recursoId } }, { dia: { equals: d } }, { estado: { in: ESTADOS_OCUPAN } }] } })).docs
}

/**
 * Huecos de un día para un servicio (en su recurso por defecto o en otro):
 * cada intervalo del horario donde cabe la duración sin chocar. `paraPortal`
 * aplica además anticipación mínima y ventana de días.
 */
export async function disponibilidad(payload: Payload, servicioId: number, d: string, opciones: { recursoId?: number | null; paraPortal?: boolean; ignorarCita?: number } = {}): Promise<DisponibilidadDia> {
  const servicio = await payload.findByID({ collection: 'servicios', id: servicioId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!servicio || !servicio.activo) throw invalido('Ese servicio no está disponible.')
  if (opciones.paraPortal && servicio.reservaEnLinea === 'no') throw invalido('Ese servicio no se pide en línea. Llámanos.')
  const recursoId = opciones.recursoId ?? idDe(servicio.recursoPorDefecto)!
  const cfg = await configuracion(payload)
  const h = cfg.horarioMin.find((x) => x.dia === diaDeSemana(d))
  const ahora = ahoraLocal()
  const huecos: DisponibilidadDia['huecos'] = []
  if (opciones.paraPortal) {
    const limite = new Date(Date.now() + cfg.diasAdelante * 86400000)
    if (d < ahora.dia) return { dia: d, abierto: false, huecos: [], motivo: 'Ese día ya pasó.' }
    if (instante(d, 0).getTime() > limite.getTime()) return { dia: d, abierto: false, huecos: [], motivo: `Solo se puede pedir hasta ${cfg.diasAdelante} días adelante.` }
  }
  if (!h || !h.abierto) return { dia: d, abierto: false, huecos: [], motivo: 'La clínica no abre ese día.' }
  const ocupadas = (await citasQueOcupan(payload, recursoId, d)).filter((c) => c.id !== opciones.ignorarCita)
  const minimoPortal = opciones.paraPortal ? Date.now() + cfg.anticipacionHoras * 3600000 : 0
  for (let t = h.de; t + servicio.duracionMin <= h.a; t += cfg.intervaloMin) {
    const ini = instante(d, t), fin = instante(d, t + servicio.duracionMin)
    const choca = ocupadas.some((c) => new Date(c.inicio).getTime() < fin.getTime() && new Date(c.fin).getTime() > ini.getTime())
    const pasado = ini.getTime() < (opciones.paraPortal ? minimoPortal : Date.now() - 86400000 * 365) // el equipo puede capturar citas pasadas (registro histórico)
    huecos.push({ hora: textoDesdeMinutos(t), disponible: !choca && !pasado })
  }
  return { dia: d, abierto: true, huecos, recursoId, duracionMin: servicio.duracionMin }
}

/* ───────────────────────────── crear y mover ───────────────────────────── */

const esquemaNueva = z.object({
  mascotaId: z.number().int().positive(),
  servicioId: z.number().int().positive(),
  dia,
  hora,
  recursoId: z.number().int().positive().nullable().optional(),
  profesionalId: z.number().int().positive().nullable().optional(),
  notasTutor: z.string().trim().max(600).optional().default(''),
  notasInternas: z.string().trim().max(1000).optional().default(''),
  /** Equipo: crear ya confirmada (recepción agenda por teléfono). */
  confirmar: z.boolean().optional().default(false),
})

type Actor = { tipo: 'equipo'; user: User; nombre: string } | { tipo: 'tutor'; tutor: Tutor; clienteId: number; nombre: string }

async function conCandado<T>(payload: Payload, actor: Actor, recursoId: number, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq(actor.tipo === 'equipo' ? { user: actor.user as User & { collection: 'users' } } : {}, payload)
  const propia = await initTransaction(req)
  try {
    /* Candado por recurso dentro de la transacción: dos peticiones simultáneas por el mismo hueco se ordenan. */
    const sesiones = (payload.db as unknown as { sessions?: Record<string, { db: { execute: (q: unknown) => Promise<unknown> } }> }).sessions
    const tx = req.transactionID ? sesiones?.[String(await req.transactionID)]?.db : null
    if (tx) await tx.execute(sql`select pg_advisory_xact_lock(${7000000 + recursoId})`)
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

function revisarTraslape(ocupadas: Cita[], ini: Date, fin: Date, ignorar?: number): void {
  if (ocupadas.some((c) => c.id !== ignorar && new Date(c.inicio).getTime() < fin.getTime() && new Date(c.fin).getTime() > ini.getTime())) {
    throw new ErrorClinica(409, 'Ese horario ya se ocupó. Elige otro.')
  }
}

async function crear(payload: Payload, actor: Actor, entrada: unknown, hoy: string): Promise<CitaVista> {
  const d = esquemaNueva.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  const mascota = await payload.findByID({ collection: 'mascotas', id: d.data.mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!mascota) throw noEncontrado('No encontramos esa mascota.')
  if (actor.tipo === 'tutor' && !(mascota.tutores ?? []).some((t) => idDe(t.cliente) === actor.clienteId)) throw noEncontrado('Esa mascota no está entre las tuyas.')
  if (mascota.estado === 'fallecido') throw invalido('La mascota está registrada como fallecida.')
  const servicio = await payload.findByID({ collection: 'servicios', id: d.data.servicioId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!servicio || !servicio.activo) throw invalido('Ese servicio no está disponible.')
  if (actor.tipo === 'tutor' && servicio.reservaEnLinea === 'no') throw invalido('Ese servicio no se pide en línea. Llámanos.')
  const recursoId = (actor.tipo === 'equipo' && d.data.recursoId) || idDe(servicio.recursoPorDefecto)!
  const recurso = await payload.findByID({ collection: 'recursos', id: recursoId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!recurso || !recurso.activo) throw invalido('Ese consultorio o recurso no está activo.')
  const minutos = minutosDesdeTexto(d.data.hora)
  if (minutos == null) throw invalido('Hora no válida.')
  const cfg = await configuracion(payload)
  const h = cfg.horarioMin.find((x) => x.dia === diaDeSemana(d.data.dia))
  const ini = instante(d.data.dia, minutos), fin = instante(d.data.dia, minutos + servicio.duracionMin)
  if (actor.tipo === 'tutor') {
    if (!h || !h.abierto || minutos < h.de || minutos + servicio.duracionMin > h.a) throw invalido('Fuera del horario de atención.')
    if (ini.getTime() < Date.now() + cfg.anticipacionHoras * 3600000) throw invalido(`Las citas se piden con al menos ${cfg.anticipacionHoras} h de anticipación.`)
    if (ini.getTime() > Date.now() + cfg.diasAdelante * 86400000) throw invalido(`Solo se puede pedir hasta ${cfg.diasAdelante} días adelante.`)
  }
  const clienteId = actor.tipo === 'tutor' ? actor.clienteId : (idDe((mascota.tutores ?? []).find((t) => t.principal)?.cliente ?? mascota.tutores?.[0]?.cliente) ?? null)
  const estado: EstadoCita = actor.tipo === 'equipo' && d.data.confirmar ? 'confirmada' : 'solicitada'

  const creada = await conCandado(payload, actor, recursoId, async (req) => {
    revisarTraslape(await citasQueOcupan(payload, recursoId, d.data.dia, req), ini, fin)
    return payload.create({
      collection: 'citas',
      req,
      overrideAccess: true,
      depth: 1,
      data: {
        mascota: mascota.id,
        cliente: clienteId,
        servicio: servicio.id,
        recurso: recursoId,
        profesional: actor.tipo === 'equipo' ? d.data.profesionalId ?? null : null,
        dia: d.data.dia,
        horaInicio: textoDesdeMinutos(minutos),
        duracionMin: servicio.duracionMin,
        inicio: ini.toISOString(),
        fin: fin.toISOString(),
        estado,
        origen: actor.tipo === 'tutor' ? 'portal' : 'panel',
        notasTutor: d.data.notasTutor || null,
        notasInternas: actor.tipo === 'equipo' ? d.data.notasInternas || null : null,
        historial: [{ estado, fecha: new Date().toISOString(), por: actor.nombre, detalle: actor.tipo === 'tutor' ? 'Pedida desde el portal' : 'Agendada en el panel' }],
        creadoPor: actor.tipo === 'equipo' ? actor.user.id : null,
        creadoPorTutor: actor.tipo === 'tutor' ? actor.tutor.id : null,
      },
    })
  })
  return vistaCita(creada, hoy)
}

async function cargarCita(payload: Payload, id: number, req?: PayloadRequest): Promise<Cita> {
  try {
    return await payload.findByID({ collection: 'citas', id, depth: 0, overrideAccess: true, req })
  } catch {
    throw noEncontrado()
  }
}

async function mover(payload: Payload, actor: Actor, id: number, entrada: unknown, hoy: string): Promise<CitaVista> {
  const d = z.object({ dia, hora, recursoId: z.number().int().positive().nullable().optional() }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  const cita = await cargarCita(payload, id)
  if (actor.tipo === 'tutor') await exigirDelTutor(payload, cita, actor)
  if (!['solicitada', 'confirmada'].includes(cita.estado)) throw invalido('Solo se reprograman citas solicitadas o confirmadas.')
  const cfg = await configuracion(payload)
  if (actor.tipo === 'tutor' && new Date(cita.inicio).getTime() - Date.now() < cfg.cancelacionHoras * 3600000) throw invalido(`Para reprogramar hace falta avisar con ${cfg.cancelacionHoras} h de anticipación. Llámanos.`)
  const minutos = minutosDesdeTexto(d.data.hora)
  if (minutos == null) throw invalido('Hora no válida.')
  const recursoId = (actor.tipo === 'equipo' && d.data.recursoId) || idDe(cita.recurso)!
  const ini = instante(d.data.dia, minutos), fin = instante(d.data.dia, minutos + cita.duracionMin)
  const h = cfg.horarioMin.find((x) => x.dia === diaDeSemana(d.data.dia))
  if (actor.tipo === 'tutor') {
    if (!h || !h.abierto || minutos < h.de || minutos + cita.duracionMin > h.a) throw invalido('Fuera del horario de atención.')
    if (ini.getTime() < Date.now() + cfg.anticipacionHoras * 3600000) throw invalido(`Las citas se piden con al menos ${cfg.anticipacionHoras} h de anticipación.`)
  }
  const nueva = await conCandado(payload, actor, recursoId, async (req) => {
    revisarTraslape(await citasQueOcupan(payload, recursoId, d.data.dia, req), ini, fin, cita.id)
    return payload.update({
      collection: 'citas',
      id,
      req,
      overrideAccess: true,
      depth: 1,
      data: {
        recurso: recursoId,
        dia: d.data.dia,
        horaInicio: textoDesdeMinutos(minutos),
        inicio: ini.toISOString(),
        fin: fin.toISOString(),
        /* Si la reprograma el tutor, vuelve a «solicitada» para que recepción la confirme. */
        estado: actor.tipo === 'tutor' ? 'solicitada' : cita.estado,
        historial: [...(cita.historial ?? []).map(limpiarHistorial), { estado: actor.tipo === 'tutor' ? 'solicitada' : cita.estado, fecha: new Date().toISOString(), por: actor.nombre, detalle: `Reprogramada de ${cita.dia} ${cita.horaInicio} a ${d.data.dia} ${textoDesdeMinutos(minutos)}` }],
      },
    })
  })
  return vistaCita(nueva, hoy)
}

const limpiarHistorial = (h: NonNullable<Cita['historial']>[number]) => ({ estado: h.estado, fecha: h.fecha, por: h.por ?? null, detalle: h.detalle ?? null })

async function exigirDelTutor(payload: Payload, cita: Cita, actor: Extract<Actor, { tipo: 'tutor' }>): Promise<void> {
  const m = await payload.findByID({ collection: 'mascotas', id: idDe(cita.mascota)!, depth: 0, overrideAccess: true }).catch(() => null)
  if (!m || !(m.tutores ?? []).some((t) => idDe(t.cliente) === actor.clienteId)) throw noEncontrado()
}

/* ───────────────────────────── estados ───────────────────────────── */

export async function cambiarEstado(ctx: Ctx, id: number, entrada: unknown): Promise<CitaVista> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  const d = z.object({ estado: z.enum(['confirmada', 'llegada', 'atencion', 'finalizada', 'cancelada', 'no_asistio']), motivo: z.string().trim().max(300).optional().default(''), profesionalId: z.number().int().positive().nullable().optional() }).safeParse(entrada)
  if (!d.success) throw invalido('Estado no válido.')
  const cita = await cargarCita(ctx.payload, id)
  const permitidos = TRANSICIONES[cita.estado as EstadoCita] ?? []
  if (!permitidos.includes(d.data.estado)) throw invalido(`Una cita ${cita.estado.replace('_', ' ')} no puede pasar a ${d.data.estado.replace('_', ' ')}.`)
  if (d.data.estado === 'cancelada' && !d.data.motivo) throw invalido('Escribe el motivo de la cancelación.')
  const nombre = ctx.user.name || ctx.user.email
  let cargoId: number | null = null
  if (d.data.estado === 'finalizada') cargoId = await registrarCargo(ctx, cita)
  const nueva = await ctx.payload.update({
    collection: 'citas',
    id,
    overrideAccess: true,
    depth: 1,
    data: {
      estado: d.data.estado,
      motivoCancelacion: d.data.estado === 'cancelada' ? d.data.motivo : cita.motivoCancelacion,
      profesional: d.data.profesionalId ?? cita.profesional ?? null,
      cargoFinanzas: cargoId ?? cita.cargoFinanzas ?? null,
      historial: [...(cita.historial ?? []).map(limpiarHistorial), { estado: d.data.estado, fecha: new Date().toISOString(), por: nombre, detalle: d.data.motivo || (cargoId ? `Cargo registrado en Finanzas` : null) }],
    },
  })
  return vistaCita(nueva, ctx.hoy)
}

/** Entrada por cobrar en Finanzas cuando el servicio tiene precio. Acción del sistema (con permisos completos de Finanzas). */
async function registrarCargo(ctx: Ctx, cita: Cita): Promise<number | null> {
  const servicio = await ctx.payload.findByID({ collection: 'servicios', id: idDe(cita.servicio)!, depth: 0, overrideAccess: true }).catch(() => null)
  if (!servicio || !servicio.precio || servicio.precio <= 0) return null
  const mascota = await ctx.payload.findByID({ collection: 'mascotas', id: idDe(cita.mascota)!, depth: 0, overrideAccess: true }).catch(() => null)
  const cliente = cita.cliente ? await ctx.payload.findByID({ collection: 'clientes', id: idDe(cita.cliente)!, depth: 0, overrideAccess: true }).catch(() => null) : null
  const ctxSistema = { ...ctx, p: calcularPermisos({ esSuperadmin: true }, null) }
  const areaId = idDe(servicio.area)
  const r = await registrarEnFinanzas(ctxSistema, {
    tipo: 'entrada',
    importe: servicio.precio,
    fechaReal: ctx.hoy,
    estado: 'pendiente',
    concepto: `${servicio.nombre} · ${mascota?.nombre ?? 'mascota'}`,
    categoria: idDe(servicio.categoriaFinanzas),
    asignacion: areaId ? 'actividad' : 'pendiente',
    actividad: areaId,
    contraparte: cliente ? cliente.nombreCompleto || cliente.nombre : null,
    notas: `Cita ${folioParaId('CIT', cita.id)} del ${cita.dia} ${cita.horaInicio}.`,
  }, `cita-${cita.id}`)
  return r.operacion.id
}

/* ───────────────────────────── consultas ───────────────────────────── */

export async function agendaDelDia(ctx: Ctx, d: string): Promise<{ dia: string; citas: CitaVista[]; porConfirmar: CitaVista[]; abierto: boolean; de: string; a: string }> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw invalido('Día no válido.')
  const cfg = await configuracion(ctx.payload)
  const h = cfg.horario.find((x) => x.dia === diaDeSemana(d))
  const [citas, porConfirmar] = await Promise.all([
    ctx.payload.find({ collection: 'citas', depth: 1, pagination: false, overrideAccess: true, sort: 'inicio', where: { dia: { equals: d } } }),
    ctx.payload.find({ collection: 'citas', depth: 1, limit: 50, overrideAccess: true, sort: 'inicio', where: { and: [{ estado: { equals: 'solicitada' } }, { dia: { greater_than_equal: ctx.hoy } }] } }),
  ])
  return { dia: d, citas: citas.docs.map((c) => vistaCita(c, ctx.hoy)), porConfirmar: porConfirmar.docs.map((c) => vistaCita(c, ctx.hoy)), abierto: Boolean(h?.abierto), de: h?.de ?? '', a: h?.a ?? '' }
}

export async function citasDeMascota(ctx: Ctx, mascotaId: number): Promise<CitaVista[]> {
  if (!ctx.p.clinica.verPacientes) throw prohibido('Tu rol no incluye pacientes.')
  const r = await ctx.payload.find({ collection: 'citas', depth: 1, pagination: false, overrideAccess: true, sort: '-inicio', where: { mascota: { equals: mascotaId } } })
  return r.docs.map((c) => vistaCita(c, ctx.hoy))
}

export async function cita(ctx: Ctx, id: number): Promise<CitaVista> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  try {
    return vistaCita(await ctx.payload.findByID({ collection: 'citas', id, depth: 1, overrideAccess: true }), ctx.hoy)
  } catch {
    throw noEncontrado()
  }
}

export async function crearCita(ctx: Ctx, entrada: unknown): Promise<CitaVista> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  return crear(ctx.payload, { tipo: 'equipo', user: ctx.user, nombre: ctx.user.name || ctx.user.email }, entrada, ctx.hoy)
}
export async function reprogramarCita(ctx: Ctx, id: number, entrada: unknown): Promise<CitaVista> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  return mover(ctx.payload, { tipo: 'equipo', user: ctx.user, nombre: ctx.user.name || ctx.user.email }, id, entrada, ctx.hoy)
}
export async function anotarCita(ctx: Ctx, id: number, entrada: unknown): Promise<CitaVista> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  const d = z.object({ notasInternas: z.string().trim().max(1000).optional(), profesionalId: z.number().int().positive().nullable().optional() }).safeParse(entrada)
  if (!d.success) throw invalido('Datos no válidos.')
  await cargarCita(ctx.payload, id)
  const n = await ctx.payload.update({ collection: 'citas', id, overrideAccess: true, depth: 1, data: { ...(d.data.notasInternas !== undefined ? { notasInternas: d.data.notasInternas || null } : {}), ...(d.data.profesionalId !== undefined ? { profesional: d.data.profesionalId } : {}) } })
  return vistaCita(n, ctx.hoy)
}
export async function disponibilidadEquipo(ctx: Ctx, servicioId: number, d: string, recursoId: number | null, ignorarCita?: number): Promise<DisponibilidadDia> {
  if (!ctx.p.clinica.agenda) throw prohibido()
  return disponibilidad(ctx.payload, servicioId, d, { recursoId, ignorarCita })
}

/* ───────────────────────────── portal ───────────────────────────── */

function actorTutor(c: CtxTutor): Extract<Actor, { tipo: 'tutor' }> {
  const clienteId = idDe(c.tutor.cliente)
  if (!clienteId) throw invalido('Tu cuenta aún no está vinculada a una ficha. Pide tu código en la clínica.')
  return { tipo: 'tutor', tutor: c.tutor, clienteId, nombre: `${c.tutor.nombre} (portal)` }
}
const accesoTutor = (c: CtxTutor) => ({ user: c.tutor as Tutor & { collection: 'tutores' }, overrideAccess: false as const })

export async function portalCitas(c: CtxTutor): Promise<{ proximas: CitaVista[]; pasadas: CitaVista[]; servicios: ServicioVista[]; configuracion: ConfiguracionAgenda; mascotas: { id: number; nombre: string; especie: string }[] }> {
  const [citas, cat, mascotas] = await Promise.all([
    c.payload.find({ collection: 'citas', depth: 1, pagination: false, sort: '-inicio', ...accesoTutor(c) }),
    catalogoAgenda(c.payload, true),
    c.payload.find({ collection: 'mascotas', depth: 0, pagination: false, sort: 'nombre', ...accesoTutor(c), where: { estado: { equals: 'activo' } } }),
  ])
  const todas = citas.docs.map((x) => vistaCita(x, c.hoy))
  const abierta = (x: CitaVista) => ['solicitada', 'confirmada', 'llegada', 'atencion'].includes(x.estado) && x.dia >= c.hoy
  return {
    proximas: todas.filter(abierta).sort((a, b) => (a.dia + a.horaInicio).localeCompare(b.dia + b.horaInicio)),
    pasadas: todas.filter((x) => !abierta(x)),
    servicios: cat.servicios,
    configuracion: cat.configuracion,
    mascotas: mascotas.docs.map((m) => ({ id: m.id, nombre: m.nombre, especie: m.especie })),
  }
}
export async function portalDisponibilidad(c: CtxTutor, servicioId: number, d: string, ignorarCita?: number): Promise<DisponibilidadDia> {
  actorTutor(c)
  return disponibilidad(c.payload, servicioId, d, { paraPortal: true, ignorarCita })
}
export async function portalCrearCita(c: CtxTutor, entrada: unknown): Promise<CitaVista> {
  return crear(c.payload, actorTutor(c), entrada, c.hoy)
}
export async function portalReprogramar(c: CtxTutor, id: number, entrada: unknown): Promise<CitaVista> {
  return mover(c.payload, actorTutor(c), id, entrada, c.hoy)
}
export async function portalCancelar(c: CtxTutor, id: number, entrada: unknown): Promise<CitaVista> {
  const actor = actorTutor(c)
  const d = z.object({ motivo: z.string().trim().max(300).optional().default('') }).safeParse(entrada)
  const cita = await cargarCita(c.payload, id)
  await exigirDelTutor(c.payload, cita, actor)
  if (!['solicitada', 'confirmada'].includes(cita.estado)) throw invalido('Esa cita ya no se puede cancelar desde el portal.')
  const cfg = await configuracion(c.payload)
  if (new Date(cita.inicio).getTime() - Date.now() < cfg.cancelacionHoras * 3600000) throw invalido(`Para cancelar hace falta avisar con ${cfg.cancelacionHoras} h de anticipación. Llámanos.`)
  const n = await c.payload.update({
    collection: 'citas',
    id,
    overrideAccess: true,
    depth: 1,
    data: { estado: 'cancelada', motivoCancelacion: d.success && d.data.motivo ? d.data.motivo : 'Cancelada por el tutor desde el portal', historial: [...(cita.historial ?? []).map(limpiarHistorial), { estado: 'cancelada', fecha: new Date().toISOString(), por: actor.nombre, detalle: d.success ? d.data.motivo || null : null }] },
  })
  return vistaCita(n, c.hoy)
}

/** Para el inicio del portal: la próxima cita de cada mascota. */
export async function proximasPorMascota(c: CtxTutor, ids: number[]): Promise<Map<number, CitaVista>> {
  const mapa = new Map<number, CitaVista>()
  if (!ids.length) return mapa
  const r = await c.payload.find({ collection: 'citas', depth: 1, pagination: false, sort: 'inicio', ...accesoTutor(c), where: { and: [{ mascota: { in: ids } }, { estado: { in: ['solicitada', 'confirmada'] } }, { dia: { greater_than_equal: c.hoy } }] } })
  for (const x of r.docs) {
    const mid = idDe(x.mascota)!
    if (!mapa.has(mid)) mapa.set(mid, vistaCita(x, c.hoy))
  }
  return mapa
}

export type { Where }
export { vistaMascota }
