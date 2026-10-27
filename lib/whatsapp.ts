/**
 * Enlaces de WhatsApp con mensaje prellenado (wa.me). No envía nada: abre
 * WhatsApp en el teléfono o en WhatsApp Web con el texto listo para que una
 * persona lo revise y lo mande. El envío automático (API de Meta) es otro
 * proyecto.
 *
 * Teléfonos de México: 10 dígitos → se antepone 52. Si ya traen lada de país
 * (12 o 13 dígitos que empiezan con 52), se respetan. Sin teléfono válido
 * devuelve null y la pantalla no muestra el botón.
 */
export function telefonoWhatsApp(telefono: string | null | undefined): string | null {
  const d = (telefono ?? '').replace(/\D/g, '')
  if (d.length === 10) return `52${d}`
  if (d.length === 12 && d.startsWith('52')) return d
  if (d.length === 13 && d.startsWith('521')) return `52${d.slice(3)}`
  return null
}

export function enlaceWhatsApp(telefono: string | null | undefined, mensaje = ''): string | null {
  const t = telefonoWhatsApp(telefono)
  if (!t) return null
  return `https://wa.me/${t}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']

/** «martes 4 de noviembre» a partir de AAAA-MM-DD (sin depender de la zona del navegador). */
export function fechaLarga(dia: string): string {
  const [y, m, d] = dia.split('-').map(Number)
  if (!y || !m || !d) return dia
  const semana = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()
  return `${DIAS[semana]} ${d} de ${MESES[m - 1]}`
}

/** «4:30 p. m.» a partir de HH:MM. */
export function horaLegible(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h)) return hhmm
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`
}

/** Mensajes prellenados (el equipo los puede editar en WhatsApp antes de enviar). */
export const mensajes = {
  saludo: (tutor: string, clinica: string) => `Hola ${tutor}, te escribimos de ${clinica}.`,
  cita: (tutor: string, mascota: string, dia: string, hora: string, servicio: string, clinica: string) =>
    `Hola ${tutor}, te escribimos de ${clinica} para recordarte la cita de ${mascota} (${servicio}) el ${fechaLarga(dia)} a las ${horaLegible(hora)}. ¿Nos confirmas tu asistencia?`,
  mascota: (tutor: string, mascota: string, clinica: string) => `Hola ${tutor}, te escribimos de ${clinica} sobre ${mascota}.`,
  aLaClinica: (mascota?: string | null) => `Hola, tengo una duda${mascota ? ` sobre ${mascota}` : ''}.`,
}
