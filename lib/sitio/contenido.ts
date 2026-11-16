import { getPayload } from 'payload'
import { type ClaveIcono, iconoDeServicio } from '../iconosServicio'
import config from '@payload-config'

import type { SitioConfiguracion } from '../../payload-types'
import { DIAS_SEMANA } from '../../collections/clinica/agenda'
import { configuracion as configuracionAgenda } from '../clinica/agenda'
import { idDe } from '../clinica/servicio'
import { leerModulos } from '../modulos'
import { configEstetica, esServicioEstetica, precioDesde } from '../clinica/estetica'
import { site } from '../site'
import { diaLocal } from '../localTime'

/**
 * Lo que necesita el sitio público, en una sola lectura: el global
 * «Sitio público», los servicios activos agrupados por área (catálogo de la
 * agenda) y el horario de atención (configuración de la agenda). Todo se lee
 * con la API local sin sesión: es información pública.
 */

export type ServicioPublico = { id: number; nombre: string; descripcion: string | null; indicaciones: string | null; duracionMin: number; precio: number | null; enLinea: boolean; icono: ClaveIcono; /** Estética: el precio es «desde» (varía por talla). */ desde: boolean }
export type GrupoServicios = { area: string; servicios: ServicioPublico[] }
export type ContenidoSitio = {
  marca: { nombre: string; logo: string; logoClaro: string; primario: string; acento: string; ciudad: string }
  publicado: boolean
  lema: string | null
  descripcion: string | null
  contacto: { direccion: string | null; mapaUrl: string | null; telefono: string | null; whatsapp: string | null; correo: string | null; urgencias: string | null }
  redes: { facebook: string | null; instagram: string | null; tiktok: string | null }
  equipo: { nombre: string; cargo: string | null; descripcion: string | null }[]
  preguntas: { pregunta: string; respuesta: string }[]
  avisoPrivacidad: string | null
  grupos: GrupoServicios[]
  horario: { dia: string; abierto: boolean; de: string; a: string }[]
  /** Farmacia y Tienda encendidas: la cabecera muestra «Tienda» (fase 5a). */
  tienda: boolean
  /* Home versión B (nov-2026): todo sale del global «Sitio público»; lo que no se capture no aparece. */
  fotos: FotoSitio[]
  campana: { etiqueta: string | null; titulo: string; texto: string | null; boton: string } | null
  razones: { titulo: string; texto: string | null }[]
  doctor: { nombre: string; titulo: string; presentacion: string | null; foto: FotoSitio | null; credenciales: { etiqueta: string; valor: string }[] } | null
  testimonios: { texto: string; autor: string | null }[]
  /** Estética encendida: nombre de su marca (grupo de servicios) y logotipo. */
  estetica: { nombre: string; logo: string | null } | null
}
export type FotoSitio = { url: string; alt: string }

const t = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export async function contenidoSitio(): Promise<ContenidoSitio> {
  const payload = await getPayload({ config })
  const [g, servicios, areas, agenda, modulos, est] = await Promise.all([
    payload.findGlobal({ slug: 'sitio-configuracion', depth: 0, overrideAccess: true }) as Promise<SitioConfiguracion>,
    payload.find({ collection: 'servicios', depth: 0, pagination: false, sort: 'orden', overrideAccess: true, where: { activo: { equals: true } } }),
    payload.find({ collection: 'fin-actividades', depth: 0, pagination: false, overrideAccess: true }),
    configuracionAgenda(payload),
    leerModulos(payload),
    configEstetica(payload),
  ])
  /* Fotos del sitio: solo id, título y fecha (la imagen pesa y se sirve aparte por /api/sitio/fotos/:id). */
  const idsFotos = [...new Set([...(g.fotos ?? []), g.doctor?.foto].map((f) => idDe(f)).filter((x): x is number => x != null))]
  const fotos = idsFotos.length ? await payload.find({ collection: 'sitio-fotos', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: idsFotos } }, select: { titulo: true, updatedAt: true } }) : { docs: [] }
  const fotoPorId = new Map(fotos.docs.map((f) => [f.id, { url: `/api/sitio/fotos/${f.id}?v=${new Date(f.updatedAt).getTime()}`, alt: f.titulo } satisfies FotoSitio]))
  const foto = (v: unknown): FotoSitio | null => fotoPorId.get(idDe(v) ?? -1) ?? null
  const campanaVigente = Boolean(g.campana?.activa) && Boolean(t(g.campana?.titulo)) && (!t(g.campana?.hasta) || t(g.campana?.hasta)! >= diaLocal(new Date()))
  const nombreArea = new Map(areas.docs.map((a) => [a.id, a.nombre]))
  const grupos = new Map<string, ServicioPublico[]>()
  for (const s of servicios.docs) {
    const deEstetica = esServicioEstetica(s, est)
    /* La estética se agrupa con el nombre de su marca (p. ej. la submarca de la clínica). */
    const area = deEstetica ? est.nombreMarca : (s.area && nombreArea.get(idDe(s.area)!)) || 'Otros servicios'
    if (!grupos.has(area)) grupos.set(area, [])
    grupos.get(area)!.push({ id: s.id, nombre: s.nombre, descripcion: t(s.descripcion), indicaciones: t(s.indicaciones), duracionMin: s.duracionMin, precio: deEstetica ? precioDesde(s) : (s.precio ?? null), enLinea: s.reservaEnLinea !== 'no', icono: iconoDeServicio(s.nombre, s.icono), desde: deEstetica })
  }
  /* «Otros servicios» al final; el resto en el orden en que aparecen. */
  const lista = [...grupos.entries()].map(([area, s]) => ({ area, servicios: s }))
  lista.sort((a, b) => (a.area === 'Otros servicios' ? 1 : 0) - (b.area === 'Otros servicios' ? 1 : 0))
  /* Horario de lunes a domingo. */
  const horario = [1, 2, 3, 4, 5, 6, 0].map((d) => {
    const h = agenda.horario.find((x) => x.dia === d)
    return { dia: DIAS_SEMANA[d], abierto: Boolean(h?.abierto), de: h?.de ?? '', a: h?.a ?? '' }
  })
  return {
    marca: { nombre: site.brand.name, logo: '/logo-mark.png', logoClaro: site.brand.logo, primario: site.brand.primary, acento: site.brand.accent, ciudad: site.location.city },
    publicado: Boolean(g.publicado),
    lema: t(g.lema),
    descripcion: t(g.descripcion),
    contacto: { direccion: t(g.contacto?.direccion), mapaUrl: t(g.contacto?.mapaUrl), telefono: t(g.contacto?.telefono), whatsapp: t(g.contacto?.whatsapp)?.replace(/\D+/g, '') ?? null, correo: t(g.contacto?.correo), urgencias: t(g.contacto?.urgencias) },
    redes: { facebook: t(g.redes?.facebook), instagram: t(g.redes?.instagram), tiktok: t(g.redes?.tiktok) },
    equipo: (g.equipo ?? []).map((p) => ({ nombre: p.nombre, cargo: t(p.cargo), descripcion: t(p.descripcion) })),
    preguntas: (g.preguntas ?? []).map((p) => ({ pregunta: p.pregunta, respuesta: p.respuesta })),
    avisoPrivacidad: t(g.avisoPrivacidad),
    grupos: lista,
    horario,
    tienda: modulos.farmacia && modulos.tienda,
    fotos: (g.fotos ?? []).map(foto).filter((f): f is FotoSitio => f != null).slice(0, 4),
    campana: campanaVigente ? { etiqueta: t(g.campana?.etiqueta), titulo: t(g.campana?.titulo)!, texto: t(g.campana?.texto), boton: t(g.campana?.boton) ?? 'Apartar mi lugar' } : null,
    razones: (g.razones ?? []).map((r) => ({ titulo: r.titulo, texto: t(r.texto) })).slice(0, 3),
    doctor: t(g.doctor?.nombre) ? { nombre: t(g.doctor?.nombre)!, titulo: t(g.doctor?.titulo) ?? 'el médico veterinario', presentacion: t(g.doctor?.presentacion), foto: foto(g.doctor?.foto), credenciales: (g.doctor?.credenciales ?? []).map((x) => ({ etiqueta: x.etiqueta, valor: x.valor })) } : null,
    testimonios: (g.testimonios ?? []).map((x) => ({ texto: x.texto, autor: t(x.autor) })).slice(0, 6),
    estetica: est.activa ? { nombre: est.nombreMarca, logo: est.logo } : null,
  }
}

/** Liga de WhatsApp con mensaje inicial (10 dígitos de México → +52). */
export function ligaWhatsApp(numero: string | null, texto: string): string | null {
  if (!numero) return null
  const n = numero.length === 10 ? `52${numero}` : numero
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`
}
