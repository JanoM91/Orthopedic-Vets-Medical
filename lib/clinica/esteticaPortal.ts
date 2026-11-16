import type { Payload } from 'payload'

import type { Cita, EstFicha, Servicio, Tutor } from '../../payload-types'
import { HALLAZGOS, QUE_SE_HIZO } from '../../collections/clinica/estetica'
import { diaLocal } from '../localTime'
import { site } from '../site'
import { avisarBanoEstetica } from './avisos'
import { type ConfigEstetica, configEstetica } from './estetica'
import { type CtxTutor, ErrorClinica, idDe } from './servicio'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Estética · E3: lo que ve el tutor y el «¿ya le toca su baño?» (nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * El tutor ve, de sus mascotas, las estéticas ENTREGADAS (cita finalizada):
 * qué se hizo, la nota para el tutor, lo que se observó y las fotos de antes y
 * después. Nunca la nota interna ni el comportamiento.
 *
 * Próximo baño = día de la última estética entregada + «próximo baño sugerido»
 * de su ficha (o, si no trae, las semanas por omisión de la configuración; sin
 * ninguna de las dos, no hay recordatorio).
 *
 * Recordatorio (cron de la clínica, 18:00): un correo por estética, desde 3
 * días antes de la fecha y hasta 14 días después, si la mascota sigue activa y
 * no tiene ya otra cita de estética por venir. Sale una sola vez
 * (`est-fichas.recordatorioEnviadoEn`). En el inicio del portal aparece en
 * Pendientes con «Pedir cita» (servicio de la última estética, ya elegido).
 */

export type EsteticaTutor = { citaId: number; dia: string; servicio: string; queSeHizo: string[]; notaTutor: string | null; hallazgos: string[]; hallazgosNota: string | null; fotos: { id: number; momento: 'antes' | 'despues'; url: string }[] }
export type ProximoBano = { mascotaId: number; fecha: string; servicioId: number; servicio: string; ligaCita: string }

const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const etiqueta = (l: readonly { label: string; value: string }[], v: string) => l.find((x) => x.value === v)?.label ?? v
const sumarDias = (d: string, n: number) => {
  const x = new Date(d + 'T12:00:00Z')
  x.setUTCDate(x.getUTCDate() + n)
  return x.toISOString().slice(0, 10)
}
const ESTADOS_POR_VENIR = ['solicitada', 'confirmada', 'llegada', 'atencion']

/** Fichas de citas ENTREGADAS (finalizadas) de unas mascotas, más recientes primero. */
async function fichasEntregadas(payload: Payload, mascotas: number[], limite = 50): Promise<(EstFicha & { cita: Cita })[]> {
  if (!mascotas.length) return []
  const r = await payload.find({ collection: 'est-fichas', depth: 2, limit: limite, overrideAccess: true, sort: '-dia', where: { mascota: { in: mascotas } } })
  return r.docs.filter((f): f is EstFicha & { cita: Cita } => typeof f.cita === 'object' && f.cita?.estado === 'finalizada')
}

async function mascotaDelTutor(c: CtxTutor, mascotaId: number) {
  const r = await c.payload.find({ collection: 'mascotas', depth: 0, limit: 1, user: c.tutor as Tutor & { collection: 'tutores' }, overrideAccess: false, where: { id: { equals: mascotaId } } })
  if (!r.docs[0]) throw new ErrorClinica(404, 'Esa mascota no está entre las tuyas.')
  return r.docs[0]
}

function proximoDe(f: EstFicha & { cita: Cita }, cfg: ConfigEstetica): ProximoBano | null {
  const semanas = f.proximaSemanas ?? cfg.recordatorio.semanasPorOmision
  if (!semanas) return null
  const servicio = typeof f.cita.servicio === 'object' ? (f.cita.servicio as Servicio) : null
  const servicioId = idDe(f.cita.servicio)!
  const mascotaId = idDe(f.mascota)!
  return { mascotaId, fecha: sumarDias(f.dia, semanas * 7), servicioId, servicio: servicio?.nombre ?? 'Estética', ligaCita: `/portal/citas/nueva?mascota=${mascotaId}&servicio=${servicioId}` }
}

/** Historial de estética de una mascota del tutor (pestaña «Estética» del portal). */
export async function portalEsteticas(c: CtxTutor, mascotaId: number): Promise<{ activa: boolean; marca: string; lista: EsteticaTutor[]; proximo: ProximoBano | null }> {
  await mascotaDelTutor(c, mascotaId)
  const cfg = await configEstetica(c.payload)
  if (!cfg.activa) return { activa: false, marca: cfg.nombreMarca, lista: [], proximo: null }
  const fichas = await fichasEntregadas(c.payload, [mascotaId], 20)
  const fotos = fichas.length ? await c.payload.find({ collection: 'est-fotos', depth: 0, pagination: false, overrideAccess: true, sort: 'createdAt', where: { cita: { in: fichas.map((f) => f.cita.id) } }, select: { cita: true, momento: true } }) : { docs: [] }
  return {
    activa: true,
    marca: cfg.nombreMarca,
    lista: fichas.map((f) => ({
      citaId: f.cita.id,
      dia: f.dia,
      servicio: typeof f.cita.servicio === 'object' && f.cita.servicio ? f.cita.servicio.nombre : 'Estética',
      queSeHizo: (f.queSeHizo ?? []).map((x) => etiqueta(QUE_SE_HIZO, x)),
      notaTutor: t(f.notaTutor),
      hallazgos: (f.hallazgos ?? []).map((x) => etiqueta(HALLAZGOS, x)),
      hallazgosNota: t(f.hallazgosNota),
      fotos: fotos.docs.filter((p) => idDe(p.cita) === f.cita.id).map((p) => ({ id: p.id, momento: p.momento, url: `/api/clinica/estetica/fotos/${p.id}` })),
    })),
    proximo: fichas[0] ? proximoDe(fichas[0], cfg) : null,
  }
}

/** ¿Tiene ya otra cita de estética por venir? */
async function conCitaPorVenir(payload: Payload, mascotas: number[], hoy: string): Promise<Set<number>> {
  if (!mascotas.length) return new Set()
  const r = await payload.find({ collection: 'citas', depth: 1, pagination: false, overrideAccess: true, where: { and: [{ mascota: { in: mascotas } }, { dia: { greater_than_equal: hoy } }, { estado: { in: ESTADOS_POR_VENIR } }] } })
  return new Set(r.docs.filter((x) => x.estetica?.cotizada || (typeof x.servicio === 'object' && x.servicio?.estetica)).map((x) => idDe(x.mascota)!))
}

/** Para Pendientes del inicio del portal: baños que tocan en los próximos 7 días (o ya pasaron, hasta 30). */
export async function portalBanosPendientes(c: CtxTutor, mascotas: number[]): Promise<ProximoBano[]> {
  const cfg = await configEstetica(c.payload)
  if (!cfg.activa || !mascotas.length) return []
  const hoy = diaLocal(new Date())
  const ultimas = new Map<number, EstFicha & { cita: Cita }>()
  for (const f of await fichasEntregadas(c.payload, mascotas)) if (!ultimas.has(idDe(f.mascota)!)) ultimas.set(idDe(f.mascota)!, f)
  const ocupadas = await conCitaPorVenir(c.payload, [...ultimas.keys()], hoy)
  const r: ProximoBano[] = []
  for (const [mid, f] of ultimas) {
    const p = proximoDe(f, cfg)
    if (p && !ocupadas.has(mid) && p.fecha <= sumarDias(hoy, 7) && p.fecha >= sumarDias(hoy, -30)) r.push(p)
  }
  return r.sort((a, b) => a.fecha.localeCompare(b.fecha))
}

/** Cron diario de la clínica: manda los «¿ya le toca su baño?» que tocan. Nunca lanza. */
export async function recordatoriosEstetica(payload: Payload): Promise<{ revisadas: number; enviados: number; omitido?: string }> {
  try {
    const cfg = await configEstetica(payload)
    if (!cfg.activa) return { revisadas: 0, enviados: 0, omitido: 'Módulo de estética apagado.' }
    if (!cfg.recordatorio.activo) return { revisadas: 0, enviados: 0, omitido: 'Recordatorio apagado en la configuración.' }
    const hoy = diaLocal(new Date())
    /* La última estética entregada de cada mascota (en los últimos ~7 meses: el máximo son 26 semanas). */
    const r = await payload.find({ collection: 'est-fichas', depth: 2, pagination: false, overrideAccess: true, sort: '-dia', where: { dia: { greater_than_equal: sumarDias(hoy, -26 * 7 - 14) } } })
    const ultimas = new Map<number, EstFicha & { cita: Cita }>()
    for (const f of r.docs) {
      if (typeof f.cita !== 'object' || f.cita?.estado !== 'finalizada') continue
      if (!ultimas.has(idDe(f.mascota)!)) ultimas.set(idDe(f.mascota)!, f as EstFicha & { cita: Cita })
    }
    const ocupadas = await conCitaPorVenir(payload, [...ultimas.keys()], hoy)
    let enviados = 0
    for (const [mid, f] of ultimas) {
      if (f.recordatorioEnviadoEn || ocupadas.has(mid)) continue
      const p = proximoDe(f, cfg)
      if (!p || sumarDias(p.fecha, -3) > hoy || sumarDias(p.fecha, 14) < hoy) continue
      const m = typeof f.mascota === 'object' ? f.mascota : await payload.findByID({ collection: 'mascotas', id: mid, depth: 0, overrideAccess: true }).catch(() => null)
      if (!m || m.estado !== 'activo') continue
      const clienteId = idDe(f.cita.cliente)
      const cliente = clienteId ? await payload.findByID({ collection: 'clientes', id: clienteId, depth: 0, overrideAccess: true }).catch(() => null) : null
      const enviado = await avisarBanoEstetica(payload, { cliente, mascota: m.nombre, fecha: p.fecha, liga: `${site.url.replace(/\/$/, '')}${p.ligaCita}`, marca: cfg.nombreMarca, servicio: p.servicio })
      /* Se marca aunque no tenga correo: así no se revisa todos los días (sigue en Pendientes del portal). */
      await payload.update({ collection: 'est-fichas', id: f.id, overrideAccess: true, depth: 0, data: { recordatorioEnviadoEn: new Date().toISOString() } })
      if (enviado) enviados++
    }
    return { revisadas: ultimas.size, enviados }
  } catch (e) {
    payload.logger.error(`[estetica] recordatorios: ${String((e as Error)?.message ?? e)}`)
    return { revisadas: 0, enviados: 0, omitido: 'Falló; revisa los registros.' }
  }
}
