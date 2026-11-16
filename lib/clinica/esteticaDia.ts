import { MAX_FOTO_BYTES } from '../fotosBase64'
import type { Payload } from 'payload'
import { z } from 'zod'

import type { Cita, EstFicha, EstFoto, Mascota, Rol } from '../../payload-types'
import { COMPORTAMIENTO, HALLAZGOS, QUE_SE_HIZO } from '../../collections/clinica/estetica'
import { folioParaId } from '../../collections/clinica/acceso'
import { enlaceWhatsApp } from '../whatsapp'
import { aplicarEstado, vistaCita } from './agenda'
import { avisarHallazgosEstetica, avisarListaEstetica } from './avisos'
import { configEstetica } from './estetica'
import { type Ctx, contextoDesdeHeaders, contextoTutor, ErrorClinica, idDe } from './servicio'
import type { CitaVista } from './tipos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Estética · E2: tablero del día, ficha y fotos (nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Etapas de una cita de estética en el tablero:
 *   por llegar (solicitada/confirmada) → recibida (llegada) → baño → secado →
 *   corte → lista para recoger → entregada (finalizada: cobra lo pactado).
 * Baño, secado, corte y lista son `citas.estetica.fase` con la cita «en
 * atención»; se puede saltar una (sin corte) o regresar. Al pasar a «lista»
 * sale UNA vez el correo al tutor y el tablero ofrece el WhatsApp.
 *
 * Permiso «Estética» del rol (`clinica.estetica`) y módulo encendido. Solo
 * citas de estética (servicio marcado o cita cotizada por talla).
 *
 * Ficha (`est-fichas`, una por cita): qué se hizo, corte, productos,
 * comportamiento, hallazgos (no son diagnóstico: van al médico por correo y
 * al tutor en el portal, E3), nota para el tutor, nota interna y próximo baño
 * sugerido. «Necesitó bozal» o «agresiva» agrega una alerta de manejo a la
 * mascota, para que todo el equipo la vea.
 *
 * Fotos (`est-fotos`): antes y después, hasta 3 de cada una por cita, JPEG
 * reducido en el navegador (tope 600 KB). Solo por la API con permisos.
 */

export type EtapaEstetica = 'por_llegar' | 'recibida' | 'bano' | 'secado' | 'corte' | 'lista' | 'entregada'
export const ETAPAS: { clave: EtapaEstetica; nombre: string }[] = [
  { clave: 'por_llegar', nombre: 'Por llegar' },
  { clave: 'recibida', nombre: 'Recibida' },
  { clave: 'bano', nombre: 'Baño' },
  { clave: 'secado', nombre: 'Secado' },
  { clave: 'corte', nombre: 'Corte y detalles' },
  { clave: 'lista', nombre: 'Lista para recoger' },
  { clave: 'entregada', nombre: 'Entregada' },
]
type Fase = 'recibida' | 'bano' | 'secado' | 'corte' | 'lista'

export type FotoVista = { id: number; momento: 'antes' | 'despues'; url: string }
export type FichaVista = {
  citaId: number
  queSeHizo: string[]
  corte: string | null
  productos: string | null
  comportamiento: string | null
  hallazgos: string[]
  hallazgosNota: string | null
  notaTutor: string | null
  notaInterna: string | null
  proximaSemanas: number | null
  realizadoPor: string | null
  actualizadoEn: string | null
  fotos: FotoVista[]
}
export type TarjetaEstetica = { cita: CitaVista; etapa: EtapaEstetica; faseEn: string | null; avisoListaEn: string | null; whatsappLista: string | null; ficha: { hallazgos: string[]; fotos: number; comportamiento: string | null } | null }
export type TableroEstetica = { dia: string; marca: string; etapas: typeof ETAPAS; tarjetas: TarjetaEstetica[]; /** Solo para quien administra usuarios: faltan el rol Estilista o la casilla en Dueño, Administración o Recepción. */ faltaRoles: boolean }
export type OpcionesFicha = { queSeHizo: readonly { label: string; value: string }[]; comportamiento: readonly { label: string; value: string }[]; hallazgos: readonly { label: string; value: string }[] }
export const OPCIONES_FICHA: OpcionesFicha = { queSeHizo: QUE_SE_HIZO, comportamiento: COMPORTAMIENTO, hallazgos: HALLAZGOS }

const invalido = (m: string) => new ErrorClinica(400, m)
const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)
const etiqueta = (lista: readonly { label: string; value: string }[], v: string) => lista.find((x) => x.value === v)?.label ?? v

async function exigir(ctx: Ctx): Promise<{ marca: string }> {
  const cfg = await configEstetica(ctx.payload)
  if (!cfg.activa) throw new ErrorClinica(404, 'El módulo de Estética está apagado (Sistema → Instalación: módulos).')
  if (!ctx.p.clinica.estetica) throw new ErrorClinica(403, 'Tu rol no incluye la estética.')
  return { marca: cfg.nombreMarca }
}

/** ¿Es cita de estética? (cotizada por talla o servicio marcado). */
function esDeEstetica(c: Cita): boolean {
  if (c.estetica?.cotizada) return true
  return typeof c.servicio === 'object' && Boolean(c.servicio?.estetica)
}

function etapaDe(c: Cita): EtapaEstetica {
  if (c.estado === 'finalizada') return 'entregada'
  if (c.estado === 'solicitada' || c.estado === 'confirmada') return 'por_llegar'
  if (c.estado === 'llegada') return 'recibida'
  const f = c.estetica?.fase as Fase | null | undefined
  return f && f !== 'recibida' ? f : 'bano'
}

async function cargarCitaEstetica(ctx: Ctx, id: number): Promise<Cita> {
  const c = await ctx.payload.findByID({ collection: 'citas', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!c || !esDeEstetica(c)) throw new ErrorClinica(404, 'No encontramos esa cita de estética.')
  return c
}

const urlFotoEst = (f: Pick<EstFoto, 'id'>) => `/api/clinica/estetica/fotos/${f.id}`

function tarjeta(c: Cita, hoy: string, marca: string, fichas: Map<number, EstFicha>, nFotos: Map<number, number>): TarjetaEstetica {
  const v = vistaCita(c, hoy)
  const f = fichas.get(c.id)
  const etapa = etapaDe(c)
  return {
    cita: v,
    etapa,
    faseEn: c.estetica?.faseEn ?? null,
    avisoListaEn: c.estetica?.avisoListaEn ?? null,
    whatsappLista: etapa === 'lista' && v.cliente ? enlaceWhatsApp(v.cliente.telefono, `Hola ${v.cliente.nombre.split(' ')[0]}, ${v.mascota.nombre} ya está lista para recoger en ${marca}. ¡Te esperamos!`) : null,
    ficha: f ? { hallazgos: (f.hallazgos ?? []).map((h) => etiqueta(HALLAZGOS, h)), fotos: nFotos.get(c.id) ?? 0, comportamiento: f.comportamiento ? etiqueta(COMPORTAMIENTO, f.comportamiento) : null } : nFotos.get(c.id) ? { hallazgos: [], fotos: nFotos.get(c.id)!, comportamiento: null } : null,
  }
}

async function fichasYFotos(payload: Payload, citas: number[]): Promise<{ fichas: Map<number, EstFicha>; fotos: Map<number, number> }> {
  if (!citas.length) return { fichas: new Map(), fotos: new Map() }
  const [f, fo] = await Promise.all([
    payload.find({ collection: 'est-fichas', depth: 0, pagination: false, overrideAccess: true, where: { cita: { in: citas } } }),
    payload.find({ collection: 'est-fotos', depth: 0, pagination: false, overrideAccess: true, where: { cita: { in: citas } }, select: { cita: true } }),
  ])
  const fotos = new Map<number, number>()
  for (const x of fo.docs) fotos.set(idDe(x.cita)!, (fotos.get(idDe(x.cita)!) ?? 0) + 1)
  return { fichas: new Map(f.docs.map((x) => [idDe(x.cita)!, x])), fotos }
}

export async function tableroEstetica(ctx: Ctx, dia: string): Promise<TableroEstetica> {
  const { marca } = await exigir(ctx)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) throw invalido('Día no válido.')
  const r = await ctx.payload.find({ collection: 'citas', depth: 1, pagination: false, overrideAccess: true, sort: 'inicio', where: { and: [{ dia: { equals: dia } }, { estado: { in: ['solicitada', 'confirmada', 'llegada', 'atencion', 'finalizada'] } }] } })
  const citas = r.docs.filter(esDeEstetica)
  const { fichas, fotos } = await fichasYFotos(ctx.payload, citas.map((c) => c.id))
  const faltaRoles = ctx.p.gestionarUsuarios ? (await rolesPendientes(ctx.payload)).length > 0 : false
  return { dia, marca, etapas: ETAPAS, tarjetas: citas.map((c) => tarjeta(c, ctx.hoy, marca, fichas, fotos)), faltaRoles }
}

const esquemaMover = z.object({ a: z.enum(['recibida', 'bano', 'secado', 'corte', 'lista', 'entregada']) })

/** Mueve la cita en el tablero. «Recibida» registra la llegada; «Entregada» la finaliza (cobra lo pactado). */
export async function moverEstetica(ctx: Ctx, id: number, entrada: unknown): Promise<TarjetaEstetica> {
  const { marca } = await exigir(ctx)
  const d = esquemaMover.safeParse(entrada)
  if (!d.success) throw invalido('Etapa no válida.')
  const quien = ctx.user.name || ctx.user.email
  let c = await cargarCitaEstetica(ctx, id)
  const a = d.data.a
  if (a === 'recibida') {
    if (c.estado === 'solicitada') await aplicarEstado(ctx, id, { estado: 'confirmada' }, { detalle: 'Desde el tablero de estética' })
    c = await cargarCitaEstetica(ctx, id)
    if (c.estado !== 'confirmada' && c.estado !== 'llegada') throw invalido('Esta cita ya no se puede recibir.')
    if (c.estado === 'confirmada') await aplicarEstado(ctx, id, { estado: 'llegada' }, { detalle: 'Recibida en estética' })
    await fijarFase(ctx, id, 'recibida', quien)
  } else if (a === 'entregada') {
    if (c.estado !== 'atencion') throw invalido('Primero pásala por el baño (o a «Lista para recoger»).')
    await aplicarEstado(ctx, id, { estado: 'finalizada' }, { detalle: 'Entregada al tutor (estética)' })
  } else {
    if (c.estado === 'solicitada' || c.estado === 'confirmada') throw invalido('Primero recíbela.')
    if (c.estado === 'finalizada' || c.estado === 'cancelada' || c.estado === 'no_asistio') throw invalido('Esta cita ya está cerrada.')
    if (c.estado === 'llegada') await aplicarEstado(ctx, id, { estado: 'atencion' }, { detalle: 'Entra a estética' })
    await fijarFase(ctx, id, a, quien)
    c = await cargarCitaEstetica(ctx, id)
    if (a === 'lista' && !c.estetica?.avisoListaEn) {
      const enviado = await avisarListaEstetica(ctx.payload, id, marca)
      if (enviado) await ctx.payload.update({ collection: 'citas', id, overrideAccess: true, depth: 0, data: { estetica: { ...c.estetica, adicionales: limpiarAds(c), avisoListaEn: new Date().toISOString() } } })
    }
  }
  const final = await cargarCitaEstetica(ctx, id)
  const { fichas, fotos } = await fichasYFotos(ctx.payload, [id])
  return tarjeta(final, ctx.hoy, marca, fichas, fotos)
}

const limpiarAds = (c: Cita) => (c.estetica?.adicionales ?? []).map((x) => ({ adicional: idDe(x.adicional), nombre: x.nombre, precio: x.precio, duracionMin: x.duracionMin ?? null }))

async function fijarFase(ctx: Ctx, id: number, fase: Fase, quien: string): Promise<void> {
  const c = await ctx.payload.findByID({ collection: 'citas', id, depth: 0, overrideAccess: true })
  if (c.estetica?.fase === fase) return
  const nombre = { recibida: 'Recibida', bano: 'Baño', secado: 'Secado', corte: 'Corte y detalles', lista: 'Lista para recoger' }[fase]
  await ctx.payload.update({
    collection: 'citas',
    id,
    overrideAccess: true,
    depth: 0,
    data: {
      estetica: { ...c.estetica, adicionales: limpiarAds(c), fase, faseEn: new Date().toISOString() },
      historial: [...(c.historial ?? []).map((h) => ({ estado: h.estado, fecha: h.fecha, por: h.por ?? null, detalle: h.detalle ?? null })), { estado: c.estado, fecha: new Date().toISOString(), por: quien, detalle: `Estética: ${nombre}` }],
    },
  })
}

/* ───────────────────────────── ficha ───────────────────────────── */

async function vistaFicha(payload: Payload, citaId: number): Promise<FichaVista> {
  const [f, fotos] = await Promise.all([
    payload.find({ collection: 'est-fichas', depth: 1, limit: 1, overrideAccess: true, where: { cita: { equals: citaId } } }),
    payload.find({ collection: 'est-fotos', depth: 0, pagination: false, overrideAccess: true, sort: 'createdAt', where: { cita: { equals: citaId } }, select: { momento: true } }),
  ])
  const x = f.docs[0]
  const quien = x && typeof x.realizadoPor === 'object' && x.realizadoPor ? x.realizadoPor.name || x.realizadoPor.email : null
  return {
    citaId,
    queSeHizo: x?.queSeHizo ?? [],
    corte: t(x?.corte),
    productos: t(x?.productos),
    comportamiento: x?.comportamiento ?? null,
    hallazgos: x?.hallazgos ?? [],
    hallazgosNota: t(x?.hallazgosNota),
    notaTutor: t(x?.notaTutor),
    notaInterna: t(x?.notaInterna),
    proximaSemanas: x?.proximaSemanas ?? null,
    realizadoPor: quien,
    actualizadoEn: x?.updatedAt ?? null,
    fotos: fotos.docs.map((p) => ({ id: p.id, momento: p.momento, url: urlFotoEst(p) })),
  }
}

export async function fichaEstetica(ctx: Ctx, citaId: number): Promise<FichaVista & { opciones: OpcionesFicha }> {
  await exigir(ctx)
  await cargarCitaEstetica(ctx, citaId)
  return { ...(await vistaFicha(ctx.payload, citaId)), opciones: OPCIONES_FICHA }
}

const valores = <T extends readonly { value: string }[]>(l: T) => l.map((x) => x.value) as [string, ...string[]]
const esquemaFicha = z.object({
  queSeHizo: z.array(z.enum(valores(QUE_SE_HIZO))).max(12).default([]),
  corte: z.string().trim().max(160).nullable().optional(),
  productos: z.string().trim().max(200).nullable().optional(),
  comportamiento: z.enum(valores(COMPORTAMIENTO)).nullable().optional(),
  hallazgos: z.array(z.enum(valores(HALLAZGOS))).max(12).default([]),
  hallazgosNota: z.string().trim().max(300).nullable().optional(),
  notaTutor: z.string().trim().max(800).nullable().optional(),
  notaInterna: z.string().trim().max(800).nullable().optional(),
  proximaSemanas: z.coerce.number().int().min(1).max(26).nullable().optional(),
})

export async function guardarFicha(ctx: Ctx, citaId: number, entrada: unknown): Promise<FichaVista> {
  const { marca } = await exigir(ctx)
  const d = esquemaFicha.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  if (v.hallazgos.includes('otro') && !t(v.hallazgosNota)) throw invalido('Escribe qué observaste en «Detalle».')
  const c = await cargarCitaEstetica(ctx, citaId)
  const mascotaId = idDe(c.mascota)!
  const previa = (await ctx.payload.find({ collection: 'est-fichas', depth: 0, limit: 1, overrideAccess: true, where: { cita: { equals: citaId } } })).docs[0]
  const data = {
    cita: citaId,
    mascota: mascotaId,
    dia: c.dia,
    queSeHizo: v.queSeHizo as EstFicha['queSeHizo'],
    corte: t(v.corte),
    productos: t(v.productos),
    comportamiento: (v.comportamiento ?? null) as EstFicha['comportamiento'],
    hallazgos: v.hallazgos as EstFicha['hallazgos'],
    hallazgosNota: t(v.hallazgosNota),
    notaTutor: t(v.notaTutor),
    notaInterna: t(v.notaInterna),
    proximaSemanas: v.proximaSemanas ?? null,
    realizadoPor: ctx.user.id,
  }
  const guardada = previa ? await ctx.payload.update({ collection: 'est-fichas', id: previa.id, overrideAccess: true, depth: 0, data }) : await ctx.payload.create({ collection: 'est-fichas', overrideAccess: true, depth: 0, data })

  /* Hallazgos nuevos → correo al equipo médico (una vez por hallazgo nuevo). */
  const antes = new Set(previa?.hallazgosAvisadosEn ? (previa.hallazgos ?? []) : [])
  const nuevos = v.hallazgos.filter((h) => !antes.has(h as never))
  if (nuevos.length) {
    const enviado = await avisarHallazgosEstetica(ctx.payload, citaId, v.hallazgos.map((h) => etiqueta(HALLAZGOS, h)), t(v.hallazgosNota), marca)
    if (enviado) await ctx.payload.update({ collection: 'est-fichas', id: guardada.id, overrideAccess: true, depth: 0, data: { hallazgosAvisadosEn: new Date().toISOString() } })
  }
  /* Bozal o agresiva → alerta de manejo para todo el equipo (si no la tiene ya). */
  if (v.comportamiento === 'bozal' || v.comportamiento === 'agresiva') {
    const texto = v.comportamiento === 'bozal' ? `${marca}: necesitó bozal` : `${marca}: se puso agresiva, no se terminó`
    const m = (await ctx.payload.findByID({ collection: 'mascotas', id: mascotaId, depth: 0, overrideAccess: true })) as Mascota
    if (!(m.alertasManejo ?? []).some((x) => x.texto === texto)) await ctx.payload.update({ collection: 'mascotas', id: mascotaId, overrideAccess: true, depth: 0, data: { alertasManejo: [...(m.alertasManejo ?? []).map((x) => ({ texto: x.texto })), { texto }] } })
  }
  return vistaFicha(ctx.payload, citaId)
}

/* ───────────────────────────── fotos ───────────────────────────── */

const TIPOS_FOTO = /^image\/(jpeg|png|webp)$/i
const MAX_FOTO = MAX_FOTO_BYTES
const MAX_POR_MOMENTO = 3

export async function subirFotoEstetica(ctx: Ctx, citaId: number, momento: string, archivo: File | null): Promise<FichaVista> {
  await exigir(ctx)
  if (momento !== 'antes' && momento !== 'despues') throw invalido('¿Antes o después?')
  if (!archivo || typeof archivo.arrayBuffer !== 'function') throw invalido('Elige una foto.')
  if (!TIPOS_FOTO.test(archivo.type || '')) throw invalido('La foto debe ser JPG, PNG o WEBP.')
  if (archivo.size > MAX_FOTO) throw invalido('La foto pesa demasiado (máximo 600 KB).')
  const c = await cargarCitaEstetica(ctx, citaId)
  const ya = await ctx.payload.count({ collection: 'est-fotos', overrideAccess: true, where: { and: [{ cita: { equals: citaId } }, { momento: { equals: momento } }] } })
  if (ya.totalDocs >= MAX_POR_MOMENTO) throw invalido(`Ya hay ${MAX_POR_MOMENTO} fotos de «${momento === 'antes' ? 'antes' : 'después'}». Quita una para subir otra.`)
  const datos = Buffer.from(await archivo.arrayBuffer()).toString('base64')
  await ctx.payload.create({ collection: 'est-fotos', overrideAccess: true, depth: 0, data: { cita: citaId, mascota: idDe(c.mascota)!, momento, tipo: archivo.type, datos, bytes: archivo.size, subidaPor: ctx.user.name || ctx.user.email } })
  return vistaFicha(ctx.payload, citaId)
}

export async function quitarFotoEstetica(ctx: Ctx, fotoId: number): Promise<FichaVista> {
  await exigir(ctx)
  const f = await ctx.payload.findByID({ collection: 'est-fotos', id: fotoId, depth: 0, overrideAccess: true, select: { cita: true } }).catch(() => null)
  if (!f) throw new ErrorClinica(404, 'Esa foto ya no existe.')
  await ctx.payload.delete({ collection: 'est-fotos', id: fotoId, overrideAccess: true })
  return vistaFicha(ctx.payload, idDe(f.cita)!)
}

/** La foto: equipo con «Estética» o «Ver pacientes», o el tutor de esa mascota (portal, E3). */
export async function abrirFotoEstetica(payload: Payload, headers: Headers, fotoId: number): Promise<Response> {
  const f = await payload.findByID({ collection: 'est-fotos', id: fotoId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!f) throw new ErrorClinica(404, 'Esa foto ya no existe.')
  const ctx = await contextoDesdeHeaders(payload, headers)
  if (ctx) {
    if (!ctx.p.clinica.estetica && !ctx.p.clinica.verPacientes) throw new ErrorClinica(403, 'Tu rol no incluye la estética.')
  } else {
    const c = await contextoTutor(payload, headers)
    if (!c) throw new ErrorClinica(401, 'Tu sesión terminó.')
    const m = await payload.find({ collection: 'mascotas', depth: 0, limit: 1, user: c.tutor as never, overrideAccess: false, where: { id: { equals: idDe(f.mascota)! } } })
    if (!m.docs[0]) throw new ErrorClinica(404, 'Esa foto ya no existe.')
  }
  return new Response(new Uint8Array(Buffer.from(f.datos, 'base64')), { headers: { 'Content-Type': f.tipo, 'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' } })
}

/* ───────────────────────────── expediente y arranque ───────────────────────────── */

export type EsteticaDeMascota = { citaId: number; folio: string; dia: string; servicio: string; queSeHizo: string[]; comportamiento: string | null; hallazgos: string[]; hallazgosNota: string | null; notaTutor: string | null; notaInterna: string | null; fotos: FotoVista[] }

/** Últimas estéticas de una mascota (expediente del panel). */
export async function esteticasDeMascota(ctx: Ctx, mascotaId: number): Promise<{ marca: string; activa: boolean; lista: EsteticaDeMascota[] }> {
  if (!ctx.p.clinica.verPacientes && !ctx.p.clinica.estetica) throw new ErrorClinica(403, 'Tu rol no incluye pacientes.')
  const cfg = await configEstetica(ctx.payload)
  const f = await ctx.payload.find({ collection: 'est-fichas', depth: 1, limit: 10, overrideAccess: true, sort: '-dia', where: { mascota: { equals: mascotaId } } })
  const citas = f.docs.map((x) => idDe(x.cita)!)
  const fotos = citas.length ? await ctx.payload.find({ collection: 'est-fotos', depth: 0, pagination: false, overrideAccess: true, sort: 'createdAt', where: { cita: { in: citas } }, select: { cita: true, momento: true } }) : { docs: [] as EstFoto[] }
  return {
    marca: cfg.nombreMarca,
    activa: cfg.activa,
    lista: f.docs.map((x) => {
      const cita = typeof x.cita === 'object' ? (x.cita as Cita) : null
      return {
        citaId: idDe(x.cita)!,
        folio: folioParaId('CIT', idDe(x.cita)!),
        dia: x.dia,
        servicio: cita && typeof cita.servicio === 'object' && cita.servicio ? cita.servicio.nombre : 'Estética',
        queSeHizo: (x.queSeHizo ?? []).map((q) => etiqueta(QUE_SE_HIZO, q)),
        comportamiento: x.comportamiento ? etiqueta(COMPORTAMIENTO, x.comportamiento) : null,
        hallazgos: (x.hallazgos ?? []).map((h) => etiqueta(HALLAZGOS, h)),
        hallazgosNota: t(x.hallazgosNota),
        notaTutor: t(x.notaTutor),
        notaInterna: t(x.notaInterna),
        fotos: fotos.docs.filter((p) => idDe(p.cita) === idDe(x.cita)).map((p) => ({ id: p.id, momento: p.momento, url: urlFotoEst(p) })),
      }
    }),
  }
}

/**
 * Arranque (quien administra usuarios): crea el rol «Estilista» si no existe y
 * da la casilla «Estética» a Dueño, Administración y Recepción. Se puede
 * correr varias veces.
 */
export async function arranqueEstetica(ctx: Ctx): Promise<{ hecho: string[] }> {
  await exigir(ctx)
  if (!ctx.p.gestionarUsuarios) throw new ErrorClinica(403, 'Los roles los preparan los dueños o el superadministrador.')
  const { ESTILISTA } = await import('../finanzas/servicio')
  const hecho: string[] = []
  for (const x of await rolesPendientes(ctx.payload)) {
    if (x.crear) {
      await ctx.payload.create({ collection: 'roles', overrideAccess: true, data: ESTILISTA as never })
      hecho.push('Rol «Estilista» creado')
    } else {
      await ctx.payload.update({ collection: 'roles', id: x.rol.id, overrideAccess: true, data: { clinica: { ...(x.rol.clinica ?? {}), estetica: true } } })
      hecho.push(`«Estética» en ${x.rol.nombre}`)
    }
  }
  return { hecho: hecho.length ? hecho : ['Ya estaba listo'] }
}

type RolPendiente = { crear: true } | { crear: false; rol: Rol }

/** Qué le falta a los roles para la estética: el rol Estilista o la casilla en Dueño, Administración o Recepción. */
export async function rolesPendientes(payload: Payload): Promise<RolPendiente[]> {
  const { ESTILISTA } = await import('../finanzas/servicio')
  const roles = await payload.find({ collection: 'roles', depth: 0, pagination: false, overrideAccess: true })
  const r: RolPendiente[] = []
  if (!roles.docs.some((x) => x.nombre === ESTILISTA.nombre)) r.push({ crear: true })
  for (const x of roles.docs.filter((y) => ['Dueño', 'Administración', 'Recepción'].includes(y.nombre) && !y.clinica?.estetica)) r.push({ crear: false, rol: x })
  return r
}

