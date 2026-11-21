import type { Payload } from 'payload'
import { z } from 'zod'

import type { AgendaConfiguracion, SitioConfiguracion, Tutor } from '../../payload-types'
import { folioParaId } from '../../collections/clinica/acceso'
import { diaLocal } from '../localTime'
import { leerModulos } from '../modulos'
import { rateLimit } from '../rateLimit'
import { site } from '../site'
import { enlaceWhatsApp, fechaLarga } from '../whatsapp'

/**
 * Solicitud de primera cita desde el sitio (nov-2026). Un visitante sin cuenta
 * deja sus datos y su preferencia; recepción le escribe y agenda. No aparta
 * horario ni crea fichas. Frenos: 5 por hora por conexión, campo trampa para
 * robots y una sola solicitud nueva por WhatsApp cada 10 minutos.
 */
export class ErrorSolicitud extends Error {
  constructor(
    public status: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}

const TURNOS = { manana: 'por la mañana', tarde: 'por la tarde', cualquiera: 'a cualquier hora' } as const

const esquema = z.object({
  nombre: z.string().trim().min(2, 'Escribe tu nombre.').max(80),
  whatsapp: z.string().trim().max(30),
  correo: z.string().trim().max(120).email('Revisa tu correo.').optional().or(z.literal('')),
  mascota: z.string().trim().min(1, 'Escribe el nombre de tu mascota.').max(60),
  especie: z.enum(['perro', 'gato', 'otra']),
  servicioId: z.number().int().positive().nullable().optional(),
  /** Paquetes (nov-2026): el visitante pide un paquete del catálogo en línea. */
  paqueteId: z.number().int().positive().nullable().optional(),
  diaPreferido: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('')),
  turno: z.enum(['manana', 'tarde', 'cualquiera']).optional().default('cualquiera'),
  nota: z.string().trim().max(500).optional().default(''),
  privacidad: z.literal(true, { errorMap: () => ({ message: 'Para enviar la solicitud acepta el aviso de privacidad.' }) }),
  /** Campo trampa: las personas no lo ven; si llega lleno, es un robot. */
  sitioWeb: z.string().max(200).optional().default(''),
})

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

export function ipDe(headers: Headers): string {
  return (headers.get('x-forwarded-for') || headers.get('x-real-ip') || 'local').split(',')[0].trim()
}

/** ¿El sitio acepta solicitudes? Clínica encendida y sitio publicado. */
export async function solicitudesAbiertas(payload: Payload): Promise<boolean> {
  const [m, g] = await Promise.all([leerModulos(payload), payload.findGlobal({ slug: 'sitio-configuracion', depth: 0, overrideAccess: true }) as Promise<SitioConfiguracion>])
  return m.clinica && Boolean(g.publicado)
}

export async function crearSolicitud(payload: Payload, entrada: unknown, headers: Headers): Promise<{ folio: string }> {
  if (!(await solicitudesAbiertas(payload))) throw new ErrorSolicitud(404, 'Por ahora no recibimos solicitudes en línea.')
  const r = esquema.safeParse(entrada)
  if (!r.success) throw new ErrorSolicitud(400, r.error.issues[0]?.message || 'Revisa los datos.')
  const d = r.data
  /* Robot: se le responde como si hubiera funcionado y no se guarda nada. */
  if (d.sitioWeb) return { folio: 'SOL-00000' }
  const whatsapp = d.whatsapp.replace(/\D+/g, '').replace(/^52(?=\d{10}$)/, '')
  if (!/^\d{10}$/.test(whatsapp)) throw new ErrorSolicitud(400, 'Escribe tu WhatsApp a 10 dígitos.')
  const hoy = diaLocal(new Date())
  if (d.diaPreferido && d.diaPreferido < hoy) throw new ErrorSolicitud(400, 'Elige un día de hoy en adelante.')
  if (!rateLimit(`solicitud:${ipDe(headers)}`, 5, 60 * 60 * 1000)) throw new ErrorSolicitud(429, 'Recibimos varias solicitudes seguidas desde esta conexión. Espera un rato o escríbenos por WhatsApp.')

  /* La misma persona tocando «Enviar» dos veces: se le devuelve la que ya dejó. */
  const reciente = await payload.find({ collection: 'solicitudes', depth: 0, limit: 1, sort: '-createdAt', overrideAccess: true, where: { and: [{ whatsapp: { equals: whatsapp } }, { estado: { equals: 'nueva' } }, { createdAt: { greater_than: new Date(Date.now() - 10 * 60 * 1000).toISOString() } }] } })
  if (reciente.docs[0]) return { folio: folioParaId('SOL', reciente.docs[0].id) }

  const servicio = d.servicioId ? await payload.findByID({ collection: 'servicios', id: d.servicioId, depth: 0, overrideAccess: true }).catch(() => null) : null
  const paquete = d.paqueteId ? await paqueteEnLinea(payload, d.paqueteId) : null
  const sitio = (await payload.findGlobal({ slug: 'sitio-configuracion', depth: 0, overrideAccess: true })) as SitioConfiguracion
  const campana = sitio.campana?.activa && sitio.campana.titulo?.trim() && (!sitio.campana.hasta?.trim() || sitio.campana.hasta.trim() >= hoy) ? sitio.campana.titulo.trim() : null
  const doc = await payload.create({
    collection: 'solicitudes',
    overrideAccess: true,
    data: {
      estado: 'nueva',
      nombre: d.nombre,
      whatsapp,
      correo: d.correo || undefined,
      mascota: d.mascota,
      especie: d.especie,
      servicio: servicio?.activo ? servicio.id : undefined,
      servicioNombre: paquete ? `Paquete: ${paquete.nombre}` : servicio?.activo ? servicio.nombre : undefined,
      paquete: paquete?.id,
      diaPreferido: d.diaPreferido || undefined,
      turno: d.turno,
      nota: d.nota || undefined,
      origen: campana ? `Campaña: ${campana}` : undefined,
    },
  })
  const folio = folioParaId('SOL', doc.id)
  await avisarClinica(payload, { folio, id: doc.id, nombre: d.nombre, whatsapp, mascota: d.mascota, especie: d.especie, servicio: servicio?.activo ? servicio.nombre : null, paquete: paquete?.nombre ?? null, dia: d.diaPreferido || null, turno: d.turno, nota: d.nota || null, origen: campana })
  return { folio }
}

/** Paquete activo que se muestra en línea, o error. */
async function paqueteEnLinea(payload: Payload, id: number): Promise<{ id: number; nombre: string }> {
  const p = await payload.findByID({ collection: 'paquetes', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!p || !p.activo || !p.enLinea) throw new ErrorSolicitud(400, 'Ese paquete ya no está disponible. Elige otro o escríbenos por WhatsApp.')
  return { id: p.id, nombre: p.nombre }
}

/**
 * Paquetes desde la app del tutor (nov-2026): con su ficha ya ligada, la
 * solicitud lleva cliente y mascota. Recepción la confirma y vende el paquete
 * en el expediente → Paquetes. Una sola solicitud nueva por mascota y paquete.
 */
export async function portalSolicitarPaquete(payload: Payload, tutor: Tutor, entrada: unknown): Promise<{ folio: string }> {
  const d = z.object({ paqueteId: z.number().int().positive(), mascotaId: z.number().int().positive(), nota: z.string().trim().max(500).optional().default('') }).safeParse(entrada)
  if (!d.success) throw new ErrorSolicitud(400, 'Elige el paquete y la mascota.')
  const clienteId = typeof tutor.cliente === 'object' && tutor.cliente ? tutor.cliente.id : (tutor.cliente ?? null)
  if (!clienteId) throw new ErrorSolicitud(403, 'Primero vincula tu cuenta con el código que te dan en la clínica.')
  if (!rateLimit(`solicitud-paquete:${tutor.id}`, 5, 60 * 60 * 1000)) throw new ErrorSolicitud(429, 'Enviaste varias solicitudes seguidas. Espera un rato o escríbenos por WhatsApp.')
  const paquete = await paqueteEnLinea(payload, d.data.paqueteId)
  const mascota = await payload.findByID({ collection: 'mascotas', id: d.data.mascotaId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!mascota || !(mascota.tutores ?? []).some((x) => (typeof x.cliente === 'object' && x.cliente ? x.cliente.id : x.cliente) === clienteId)) throw new ErrorSolicitud(404, 'Esa mascota no está entre las tuyas.')
  const cliente = await payload.findByID({ collection: 'clientes', id: clienteId, depth: 0, overrideAccess: true })
  const ya = await payload.find({ collection: 'solicitudes', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ paquete: { equals: paquete.id } }, { mascotaFicha: { equals: mascota.id } }, { estado: { in: ['nueva', 'contactada'] } }] } })
  if (ya.docs[0]) return { folio: folioParaId('SOL', ya.docs[0].id) }
  const whatsapp = (cliente.telefono ?? '').replace(/\D+/g, '').replace(/^52(?=\d{10}$)/, '')
  const especie = mascota.especie === 'perro' || mascota.especie === 'gato' ? mascota.especie : 'otra'
  const nombre = cliente.nombreCompleto || cliente.nombre
  const doc = await payload.create({
    collection: 'solicitudes',
    overrideAccess: true,
    data: {
      estado: 'nueva',
      nombre,
      whatsapp: whatsapp || 'Sin teléfono',
      correo: cliente.email || tutor.email || undefined,
      mascota: mascota.nombre,
      especie,
      servicioNombre: `Paquete: ${paquete.nombre}`,
      paquete: paquete.id,
      cliente: clienteId,
      mascotaFicha: mascota.id,
      turno: 'cualquiera',
      nota: d.data.nota || undefined,
      origen: 'App del cliente',
    },
  })
  const folio = folioParaId('SOL', doc.id)
  await avisarClinica(payload, { folio, id: doc.id, nombre, whatsapp, mascota: mascota.nombre, especie, servicio: null, paquete: paquete.nombre, dia: null, turno: 'cualquiera', nota: d.data.nota || null, origen: 'App del cliente (ya tiene ficha)' })
  return { folio }
}

/** Aviso a los correos de la clínica (Agenda → «Correos de la clínica para avisos»). Nunca hace fallar la solicitud. */
async function avisarClinica(payload: Payload, s: { folio: string; id: number; nombre: string; whatsapp: string; mascota: string; especie: string; servicio: string | null; paquete?: string | null; dia: string | null; turno: keyof typeof TURNOS; nota: string | null; origen: string | null }): Promise<void> {
  try {
    const g = (await payload.findGlobal({ slug: 'agenda-configuracion', depth: 0, overrideAccess: true }).catch(() => null)) as AgendaConfiguracion | null
    const correos = (g?.correoAvisos ?? '')
      .split(/[,;\s]+/)
      .map((x) => x.trim())
      .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
    if (!correos.length) return
    const wa = enlaceWhatsApp(s.whatsapp, s.paquete ? `Hola ${s.nombre.split(/\s+/)[0]}, te escribimos de ${site.brand.name} por el paquete «${s.paquete}» que pediste para ${s.mascota}.` : `Hola ${s.nombre.split(/\s+/)[0]}, te escribimos de ${site.brand.name} por la cita que pediste para ${s.mascota}. ¿Qué día y a qué hora te queda bien?`)
    const panel = `${site.url.replace(/\/$/, '')}/admin/collections/solicitudes/${s.id}`
    const filas: [string, string][] = [
      ['Persona', s.nombre],
      ['WhatsApp', s.whatsapp],
      ['Mascota', `${s.mascota} (${s.especie})`],
      s.paquete ? ['Paquete', s.paquete] : ['Servicio', s.servicio ?? 'No eligió'],
      ['Prefiere', `${s.dia ? fechaLarga(s.dia) : 'cualquier día'}, ${TURNOS[s.turno]}`],
    ]
    if (s.nota) filas.push(['Nos contó', s.nota])
    if (s.origen) filas.push(['Llegó por', s.origen])
    const html = `<div style="font:14px/1.5 system-ui,sans-serif;color:#0f172a;max-width:560px">
<p>${s.paquete ? `<b>${esc(s.nombre)}</b> pidió el paquete <b>${esc(s.paquete)}</b> (${s.folio}). Escríbele para confirmarlo; se vende en el expediente de la mascota → Paquetes.` : `<b>${esc(s.nombre)}</b> pidió su primera cita desde el sitio (${s.folio}). Todavía <b>no tiene día ni hora</b>: escríbele para acordarlos.`}</p>
<table style="border-collapse:collapse;margin:8px 0 14px">${filas.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#475569">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('')}</table>
<p>${wa ? `<a href="${wa}" style="background:${site.brand.accent};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">Escribirle por WhatsApp</a> · ` : ''}<a href="${panel}">Abrir la solicitud</a></p></div>`
    await payload.sendEmail({ to: correos, subject: s.paquete ? `Solicitud de paquete: ${s.paquete} · ${s.mascota}` : `Nueva solicitud de cita: ${s.mascota} · ${s.nombre}`, html })
  } catch (e) {
    payload.logger.error(`[solicitudes] aviso ${s.folio}: ${String((e as Error)?.message ?? e)}`)
  }
}

/** Para «Hoy» en el panel: cuántas solicitudes siguen sin atender. */
export async function solicitudesNuevas(payload: Payload): Promise<number> {
  const r = await payload.count({ collection: 'solicitudes', overrideAccess: true, where: { estado: { equals: 'nueva' } } })
  return r.totalDocs
}
