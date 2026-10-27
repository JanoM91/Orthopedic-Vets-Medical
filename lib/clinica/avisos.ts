import type { Payload } from 'payload'

import type { AgendaConfiguracion, Cita, Cliente, Mascota, Servicio } from '../../payload-types'
import { folioParaId } from '../../collections/clinica/acceso'
import { diaEnZona } from '../finanzas/reglas'
import { site } from '../site'
import { contactoClinica, type ContactoClinica } from '../sitio/contacto'
import { enlaceWhatsApp, fechaLarga, horaLegible } from '../whatsapp'

/**
 * Avisos por correo de la agenda (reconstruidos el 27-oct-2026; el trabajo
 * original del 22-oct se perdió).
 *
 *   Al tutor: cita solicitada, confirmada, reprogramada, cancelada y el
 *   recordatorio de la víspera (cron 18:00 de México).
 *   A la clínica: cuando un tutor pide, mueve o cancela desde el portal, a los
 *   correos de Clínica → Agenda → «Correos de la clínica para avisos».
 *
 * El tutor recibe correo solo si su ficha tiene correo y acepta «Avisos de
 * citas» por «correo». Todo pasa por el adaptador de Resend
 * (lib/emailAdapter.ts): sin RESEND_API_KEY no se manda nada y nada falla.
 * Un aviso NUNCA hace fallar la operación de la cita: los errores se anotan
 * en el log y ya.
 */

export type EventoCita = 'solicitada' | 'confirmada' | 'reprogramada' | 'cancelada' | 'recordatorio'
export type ResultadoAviso = { tutor: boolean; clinica: boolean }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const idDe = (v: unknown): number | null => (v == null ? null : typeof v === 'object' ? Number((v as { id: unknown }).id) : Number(v))

async function configuracionAvisos(payload: Payload): Promise<{ correos: string[]; recordatorios: boolean }> {
  const g = (await payload.findGlobal({ slug: 'agenda-configuracion', depth: 0, overrideAccess: true }).catch(() => null)) as AgendaConfiguracion | null
  const correos = (g?.correoAvisos ?? '')
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))
  return { correos, recordatorios: g?.recordatoriosActivos !== false }
}

type Datos = { cita: Cita; mascota: Mascota | null; servicio: Servicio | null; cliente: Cliente | null }

async function cargar(payload: Payload, citaId: number): Promise<Datos | null> {
  const cita = await payload.findByID({ collection: 'citas', id: citaId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!cita) return null
  const mascota = typeof cita.mascota === 'object' ? (cita.mascota as Mascota) : null
  const servicio = typeof cita.servicio === 'object' ? (cita.servicio as Servicio) : null
  let cliente = typeof cita.cliente === 'object' ? (cita.cliente as Cliente) : null
  if (!cliente && idDe(cita.cliente)) cliente = await payload.findByID({ collection: 'clientes', id: idDe(cita.cliente)!, depth: 0, overrideAccess: true }).catch(() => null)
  return { cita, mascota, servicio, cliente }
}

/** ¿El tutor acepta avisos por correo y tiene correo? */
export function correoDelTutor(c: Cliente | null): string | null {
  if (!c?.email) return null
  if (c.comunicacion?.avisos === false || c.comunicacion?.correo === false) return null
  return c.email
}

const ASUNTO: Record<EventoCita, (m: string, cuando: string) => string> = {
  solicitada: (m, cuando) => `Recibimos tu solicitud de cita para ${m} · ${cuando}`,
  confirmada: (m, cuando) => `Cita confirmada para ${m} · ${cuando}`,
  reprogramada: (m, cuando) => `Cita reprogramada para ${m} · ${cuando}`,
  cancelada: (m, cuando) => `Cita cancelada para ${m} · ${cuando}`,
  recordatorio: (m, cuando) => `Recordatorio: mañana es la cita de ${m} · ${cuando}`,
}

const ENTRADA: Record<EventoCita, string> = {
  solicitada: 'Recibimos tu solicitud. Te avisaremos cuando la confirmemos.',
  confirmada: 'Tu cita está confirmada. ¡Te esperamos!',
  reprogramada: 'Tu cita cambió de fecha u hora. Estos son los datos nuevos:',
  cancelada: 'Tu cita quedó cancelada.',
  recordatorio: 'Te recordamos la cita de mañana:',
}

function htmlTutor(evento: EventoCita, d: Datos, extra: { motivo?: string | null; antes?: string | null }, contacto: ContactoClinica): string {
  const nombre = d.cliente?.nombre ?? ''
  const mascota = d.mascota?.nombre ?? 'tu mascota'
  const portal = `${site.url.replace(/\/$/, '')}/portal/citas`
  const wa = enlaceWhatsApp(contacto.whatsapp, `Hola, es sobre la cita de ${mascota} del ${fechaLarga(d.cita.dia)} (${folioParaId('CIT', d.cita.id)}).`)
  const filas = [
    ['Mascota', mascota],
    ['Servicio', d.servicio?.nombre ?? ''],
    ['Día', fechaLarga(d.cita.dia)],
    ['Hora', horaLegible(d.cita.horaInicio)],
    ['Folio', folioParaId('CIT', d.cita.id)],
  ]
  return `<div style="font:15px/1.55 system-ui,sans-serif;color:#0f172a;max-width:560px">
<p>Hola${nombre ? `, ${esc(nombre)}` : ''}:</p>
<p>${ENTRADA[evento]}</p>
${extra.antes ? `<p style="color:#475569">Antes: ${esc(extra.antes)}</p>` : ''}
<table style="border-collapse:collapse;margin:8px 0 14px">${filas.map(([k, v]) => `<tr><td style="padding:4px 14px 4px 0;color:#475569">${k}</td><td style="padding:4px 0"><b>${esc(v)}</b></td></tr>`).join('')}</table>
${evento === 'cancelada' && extra.motivo ? `<p>Motivo: ${esc(extra.motivo)}</p>` : ''}
${evento !== 'cancelada' && d.servicio?.indicaciones ? `<p><b>Indicaciones:</b> ${esc(d.servicio.indicaciones)}</p>` : ''}
<p><a href="${portal}" style="background:${site.brand.accent};color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">${evento === 'cancelada' ? 'Pedir otra cita' : 'Ver o cambiar mi cita'}</a></p>
${wa || contacto.telefono ? `<p>¿Dudas? ${wa ? `<a href="${wa}">Escríbenos por WhatsApp</a>` : ''}${wa && contacto.telefono ? ' o ' : ''}${contacto.telefono ? `llámanos al ${esc(contacto.telefono)}` : ''}.</p>` : ''}
<p style="color:#64748b;font-size:12px">${esc(site.brand.name)}. Recibes este correo porque aceptaste avisos de citas; para dejar de recibirlos, pídelo en la clínica.</p></div>`
}

function htmlClinica(evento: EventoCita, d: Datos, extra: { motivo?: string | null; antes?: string | null }): string {
  const panel = `${site.url.replace(/\/$/, '')}/admin/clinica/agenda?dia=${d.cita.dia}`
  const tutor = d.cliente ? [d.cliente.nombre, d.cliente.apellidos].filter(Boolean).join(' ') : 'Tutor'
  const que = evento === 'solicitada' ? 'pidió una cita' : evento === 'reprogramada' ? 'reprogramó su cita' : 'canceló su cita'
  return `<div style="font:14px/1.5 system-ui,sans-serif;color:#0f172a;max-width:560px">
<p><b>${esc(tutor)}</b> ${que} desde el portal.</p>
<p>${esc(d.mascota?.nombre ?? '')} · ${esc(d.servicio?.nombre ?? '')} · ${fechaLarga(d.cita.dia)} ${horaLegible(d.cita.horaInicio)} · ${folioParaId('CIT', d.cita.id)}${extra.antes ? `<br><span style="color:#475569">Antes: ${esc(extra.antes)}</span>` : ''}</p>
${d.cita.notasTutor ? `<p>Nota del tutor: ${esc(d.cita.notasTutor)}</p>` : ''}${extra.motivo ? `<p>Motivo: ${esc(extra.motivo)}</p>` : ''}
${evento !== 'cancelada' ? '<p>Queda <b>por confirmar</b> en la agenda.</p>' : ''}
<p><a href="${panel}">Abrir la agenda del día</a>${d.cliente?.telefono ? ` · Tel. ${esc(d.cliente.telefono)}` : ''}</p></div>`
}

/**
 * Manda los avisos de un evento de la cita. `porTutor` = la acción vino del
 * portal (entonces también se avisa a la clínica). Nunca lanza.
 */
export async function avisarCita(payload: Payload, citaId: number, evento: EventoCita, opciones: { porTutor?: boolean; motivo?: string | null; antes?: string | null } = {}): Promise<ResultadoAviso> {
  const r: ResultadoAviso = { tutor: false, clinica: false }
  try {
    const d = await cargar(payload, citaId)
    if (!d) return r
    const cuando = `${fechaLarga(d.cita.dia)}, ${horaLegible(d.cita.horaInicio)}`
    const mascota = d.mascota?.nombre ?? 'tu mascota'
    const para = correoDelTutor(d.cliente)
    if (para) {
      await payload.sendEmail({ to: para, subject: ASUNTO[evento](mascota, cuando), html: htmlTutor(evento, d, opciones, await contactoClinica(payload)) })
      r.tutor = true
    }
    if (opciones.porTutor && evento !== 'confirmada' && evento !== 'recordatorio') {
      const { correos } = await configuracionAvisos(payload)
      if (correos.length) {
        const titulo = evento === 'solicitada' ? 'Nueva cita por confirmar' : evento === 'reprogramada' ? 'Cita reprogramada desde el portal' : 'Cita cancelada desde el portal'
        await payload.sendEmail({ to: correos, subject: `${titulo}: ${mascota} · ${cuando}`, html: htmlClinica(evento, d, opciones) })
        r.clinica = true
      }
    }
  } catch (e) {
    payload.logger.error(`[avisos] cita ${citaId} (${evento}): ${String((e as Error)?.message ?? e)}`)
  }
  return r
}

/* ───────────────────────────── recordatorio de la víspera ───────────────────────────── */

export type ResultadoRecordatorios = { dia: string; omitido?: string; revisadas: number; enviados: number; sinCorreo: number }

/**
 * Citas de MAÑANA (solicitadas o confirmadas) que aún no tienen recordatorio.
 * Se marca la cita ANTES de mandar: si algo falla a medias, preferimos no
 * repetir el correo. Lo llama el cron de las 18:00 de México.
 */
export async function recordatorios(payload: Payload, ahora = new Date()): Promise<ResultadoRecordatorios> {
  const hoy = diaEnZona(ahora, site.location.timeZone)
  const [y, m, d] = hoy.split('-').map(Number)
  const manana = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10)
  const cfg = await configuracionAvisos(payload)
  if (!cfg.recordatorios) return { dia: manana, omitido: 'Los recordatorios están apagados en la configuración de la agenda.', revisadas: 0, enviados: 0, sinCorreo: 0 }
  const citas = await payload.find({
    collection: 'citas',
    depth: 0,
    pagination: false,
    overrideAccess: true,
    where: { and: [{ dia: { equals: manana } }, { estado: { in: ['solicitada', 'confirmada'] } }, { recordatorioEnviadoEn: { exists: false } }] },
  })
  let enviados = 0
  let sinCorreo = 0
  for (const c of citas.docs) {
    await payload.update({ collection: 'citas', id: c.id, overrideAccess: true, depth: 0, data: { recordatorioEnviadoEn: new Date().toISOString() } })
    const r = await avisarCita(payload, c.id, 'recordatorio')
    if (r.tutor) enviados++
    else sinCorreo++
  }
  return { dia: manana, revisadas: citas.totalDocs, enviados, sinCorreo }
}
