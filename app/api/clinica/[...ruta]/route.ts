import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { htmlCartilla } from '@/lib/clinica/cartilla'
import { contactoClinica } from '@/lib/sitio/contacto'

import {
  abrirDocumento,
  actualizarCartilla,
  actualizarCliente,
  actualizarDocumento,
  actualizarMascota,
  actualizarNota,
  agregarAdenda,
  agregarCartilla,
  agregarPeso,
  borrarNota,
  buscar,
  catalogo,
  contextoDesdeHeaders,
  contextoTutor,
  crearCliente,
  crearMascota,
  crearNota,
  type Ctx,
  desvincularCuenta,
  invitarAlPortal,
  ErrorClinica,
  expediente,
  fichaCliente,
  firmarNota,
  generarCodigo,
  portalAbrirDocumento,
  portalMascota,
  portalResumen,
  portalSubirDocumento,
  subirDocumento,
  vincular,
} from '@/lib/clinica/servicio'
import { aplicar, cargarArchivo, descartar, historial, planear, plantillaXlsx } from '@/lib/clinica/importacion'
import { leerModulos } from '@/lib/modulos'
import {
  agendaDelDia,
  anotarCita,
  arranqueAgenda,
  cambiarEstado,
  catalogoAgenda,
  cita,
  citasDeMascota,
  crearCita,
  disponibilidadEquipo,
  portalCancelar,
  portalCitas,
  portalCrearCita,
  portalDisponibilidad,
  portalReprogramar,
  reprogramarCita,
} from '@/lib/clinica/agenda'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * /api/clinica/* — pacientes, tutores, expediente, importación y portal
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Igual que /api/finanzas: esta ruta solo revisa la sesión y delega en
 * lib/clinica/servicio.ts (equipo) o en las funciones «portal…» (tutor).
 *
 * EQUIPO (sesión del panel):
 *   GET  catalogo                              permisos, equipo, catálogos, totales
 *   GET  buscar?q=                             clientes y mascotas que coinciden
 *   POST clientes                              crear (devuelve posibles duplicados si no se fuerza)
 *   GET  clientes/:id                          ficha: cliente, mascotas, cuentas del portal, códigos vigentes
 *   POST clientes/:id                          actualizar
 *   POST clientes/:id/codigo                   código de vinculación (72 h, un uso)
 *   POST clientes/:id/invitar                  { email? } crea o liga la cuenta del portal y manda la liga (7 días)
 *   POST mascotas                              crear (opcionalmente con peso de hoy)
 *   GET  mascotas/:id                          expediente completo (notas solo con «ver expediente»)
 *   GET  mascotas/:id/cartilla                 cartilla imprimible (HTML)
 *   POST mascotas/:id                          actualizar
 *   POST mascotas/:id/pesos | cartilla | notas | documentos (multipart: archivo + titulo, tipo, fecha, publicado)
 *   POST cartilla/:id                          corregir un registro de cartilla
 *   POST notas/:id | notas/:id/firma | notas/:id/adendas | notas/:id/borrar
 *   POST documentos/:id                        título, publicado al tutor, revisión
 *   GET  documentos/:id/archivo                el archivo (almacén privado; revisa permisos)
 *   POST cuentas/:id/desvincular               quitar la ficha a una cuenta del portal
 *   GET  importaciones/plantilla               plantilla .xlsx
 *   GET  importaciones                         historial
 *   POST importaciones                         cargar archivo (multipart: archivo) → columnas, muestra, mapeo sugerido
 *   POST importaciones/:id/plan                qué pasaría con este mapeo
 *   POST importaciones/:id/aplicar             importar
 *   POST importaciones/:id/descartar
 *   GET  agenda/catalogo                       recursos, servicios y configuración (horario, reglas)
 *   POST agenda/arranque                       recursos y servicios sugeridos (una sola vez)
 *   GET  agenda?dia=AAAA-MM-DD                 citas del día y solicitudes por confirmar
 *   GET  agenda/disponibilidad?servicio&dia&recurso&ignorar
 *   POST agenda/citas                          crear (mascotaId, servicioId, dia, hora, recursoId?, confirmar?)
 *   GET  agenda/citas/:id
 *   POST agenda/citas/:id/estado               { estado, motivo? }
 *   POST agenda/citas/:id/reprogramar          { dia, hora, recursoId? }
 *   POST agenda/citas/:id/notas                { notasInternas?, profesionalId? }
 *   GET  mascotas/:id/citas
 *
 * PORTAL (sesión de tutor, colección «tutores»):
 *   GET  portal/resumen                        tutor, ficha vinculada y mascotas
 *   GET  portal/mascotas/:id                   ficha, cartilla, pesos y documentos publicados
 *   GET  portal/mascotas/:id/cartilla          cartilla imprimible (HTML)
 *   GET  portal/documentos/:id/archivo
 *   POST portal/vincular                       { codigo }
 *   POST portal/mascotas/:id/documentos        aportar un archivo (queda pendiente de revisión)
 *   GET  portal/citas                          próximas y pasadas, servicios y mascotas para pedir
 *   GET  portal/citas/disponibilidad?servicio&dia&ignorar
 *   POST portal/citas                          { mascotaId, servicioId, dia, hora, notasTutor? }
 *   POST portal/citas/:id/reprogramar | cancelar
 */

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Contexto = { params: Promise<{ ruta?: string[] }> }

const json = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { 'Cache-Control': 'private, no-store' } })
const html = (cuerpo: string) => new Response(cuerpo, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } })

function mismoOrigen(req: NextRequest): boolean {
  const origen = req.headers.get('origin')
  if (!origen) return true
  try {
    return new URL(origen).host === req.headers.get('host')
  } catch {
    return false
  }
}

function idDeRuta(s: string | undefined): number {
  const n = Number(s)
  if (!Number.isInteger(n) || n <= 0) throw new ErrorClinica(404, 'Registro no encontrado.')
  return n
}

async function leerJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json()
  } catch {
    throw new ErrorClinica(400, 'La petición no trae datos válidos.')
  }
}

async function leerArchivo(req: NextRequest): Promise<{ archivo: File; campos: Record<string, unknown> }> {
  let form: FormData
  try {
    form = await req.formData()
  } catch {
    throw new ErrorClinica(400, 'No llegó el archivo.')
  }
  const archivo = form.get('archivo')
  if (!(archivo instanceof File)) throw new ErrorClinica(400, 'Elige un archivo.')
  const campos: Record<string, unknown> = {}
  for (const [k, v] of form.entries()) {
    if (k === 'archivo' || typeof v !== 'string') continue
    campos[k] = v === 'true' ? true : v === 'false' ? false : v
  }
  return { archivo, campos }
}

async function atenderPortal(metodo: 'GET' | 'POST', req: NextRequest, ruta: string[]): Promise<Response> {
  const payload = await getPayload({ config })
  const c = await contextoTutor(payload, req.headers)
  if (!c) return json({ error: 'Tu sesión terminó. Vuelve a entrar al portal.' }, 401)
  const [a, b, d] = ruta
  if (metodo === 'GET') {
    if (a === 'resumen' && !b) return json(await portalResumen(c))
    if (a === 'mascotas' && b && !d) return json(await portalMascota(c, idDeRuta(b)))
    if (a === 'mascotas' && b && d === 'cartilla') {
      const x = await portalMascota(c, idDeRuta(b))
      return html(htmlCartilla(x.mascota, x.cartilla, x.pesos, c.hoy, (await contactoClinica(c.payload)).telefono))
    }
    if (a === 'documentos' && b && d === 'archivo') return portalAbrirDocumento(c, idDeRuta(b))
    if (a === 'citas' && !b) return json(await portalCitas(c))
    if (a === 'citas' && b === 'disponibilidad') {
      const q = req.nextUrl.searchParams
      return json(await portalDisponibilidad(c, idDeRuta(q.get('servicio') ?? undefined), q.get('dia') ?? '', q.get('ignorar') ? idDeRuta(q.get('ignorar')!) : undefined))
    }
  } else {
    if (a === 'vincular' && !b) return json(await vincular(c, await leerJson(req)))
    if (a === 'citas' && !b) return json(await portalCrearCita(c, await leerJson(req)), 201)
    if (a === 'citas' && b && d === 'reprogramar') return json(await portalReprogramar(c, idDeRuta(b), await leerJson(req)))
    if (a === 'citas' && b && d === 'cancelar') return json(await portalCancelar(c, idDeRuta(b), await leerJson(req)))
    if (a === 'mascotas' && b && d === 'documentos') {
      const { archivo, campos } = await leerArchivo(req)
      return json(await portalSubirDocumento(c, idDeRuta(b), archivo, campos), 201)
    }
  }
  return json({ error: 'Ruta no encontrada.' }, 404)
}

async function atender(metodo: 'GET' | 'POST', req: NextRequest, ruta: string[]): Promise<Response> {
  if (metodo === 'POST' && !mismoOrigen(req)) return json({ error: 'Origen no permitido.' }, 403)
  /* Módulo Clínica apagado (lib/modulos.ts): toda la API, portal incluido, responde 404. */
  const payloadModulos = await getPayload({ config })
  if (!(await leerModulos(payloadModulos)).clinica) return json({ error: 'El módulo de Clínica está apagado en esta instalación (Sistema → Instalación: módulos).' }, 404)
  if (ruta[0] === 'portal') return atenderPortal(metodo, req, ruta.slice(1))

  const payload = payloadModulos
  const ctx: Ctx | null = await contextoDesdeHeaders(payload, req.headers)
  if (!ctx) return json({ error: 'Tu sesión terminó. Vuelve a entrar al panel.' }, 401)
  const q = req.nextUrl.searchParams
  const [a, b, c] = ruta

  if (metodo === 'GET') {
    if (a === 'catalogo' && !b) return json(await catalogo(ctx))
    if (a === 'buscar' && !b) return json(await buscar(ctx, q.get('q') ?? ''))
    if (a === 'clientes' && b && !c) return json(await fichaCliente(ctx, idDeRuta(b)))
    if (a === 'mascotas' && b && !c) return json(await expediente(ctx, idDeRuta(b)))
    if (a === 'mascotas' && b && c === 'cartilla') {
      const x = await expediente(ctx, idDeRuta(b))
      return html(htmlCartilla(x.mascota, x.cartilla, x.pesos, ctx.hoy, (await contactoClinica(ctx.payload)).telefono))
    }
    if (a === 'documentos' && b && c === 'archivo') return abrirDocumento(ctx, idDeRuta(b))
    if (a === 'importaciones' && b === 'plantilla') {
      if (!ctx.p.clinica.importar) return json({ error: 'Tu rol no incluye importar.' }, 403)
      return new Response(new Uint8Array(await plantillaXlsx()), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': 'attachment; filename="plantilla-pacientes.xlsx"',
          'Cache-Control': 'private, no-store',
        },
      })
    }
    if (a === 'importaciones' && !b) return json(await historial(ctx))
    if (a === 'agenda' && !b) return json(await agendaDelDia(ctx, q.get('dia') ?? ctx.hoy))
    if (a === 'agenda' && b === 'catalogo') return json(await catalogoAgenda(payload))
    if (a === 'agenda' && b === 'disponibilidad') {
      return json(await disponibilidadEquipo(ctx, idDeRuta(q.get('servicio') ?? undefined), q.get('dia') ?? ctx.hoy, q.get('recurso') ? idDeRuta(q.get('recurso')!) : null, q.get('ignorar') ? idDeRuta(q.get('ignorar')!) : undefined))
    }
    if (a === 'agenda' && b === 'citas' && c) return json(await cita(ctx, idDeRuta(c)))
    if (a === 'mascotas' && b && c === 'citas') return json(await citasDeMascota(ctx, idDeRuta(b)))
  } else {
    if (a === 'agenda' && b === 'arranque') return json(await arranqueAgenda(ctx))
    if (a === 'agenda' && b === 'citas' && !c) return json(await crearCita(ctx, await leerJson(req)), 201)
    if (a === 'agenda' && b === 'citas' && c) {
      const id = idDeRuta(c)
      const accion = ruta[3]
      if (accion === 'estado') return json(await cambiarEstado(ctx, id, await leerJson(req)))
      if (accion === 'reprogramar') return json(await reprogramarCita(ctx, id, await leerJson(req)))
      if (accion === 'notas') return json(await anotarCita(ctx, id, await leerJson(req)))
    }
    if (a === 'clientes' && !b) {
      const r = await crearCliente(ctx, await leerJson(req))
      return json(r, r.cliente ? 201 : 200)
    }
    if (a === 'clientes' && b && !c) return json(await actualizarCliente(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'clientes' && b && c === 'codigo') return json(await generarCodigo(ctx, idDeRuta(b)), 201)
    if (a === 'clientes' && b && c === 'invitar') return json(await invitarAlPortal(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'mascotas' && !b) return json(await crearMascota(ctx, await leerJson(req)), 201)
    if (a === 'mascotas' && b) {
      const id = idDeRuta(b)
      if (!c) return json(await actualizarMascota(ctx, id, await leerJson(req)))
      if (c === 'pesos') return json(await agregarPeso(ctx, id, await leerJson(req)), 201)
      if (c === 'cartilla') return json(await agregarCartilla(ctx, id, await leerJson(req)), 201)
      if (c === 'notas') return json(await crearNota(ctx, id, await leerJson(req)), 201)
      if (c === 'documentos') {
        const { archivo, campos } = await leerArchivo(req)
        return json(await subirDocumento(ctx, id, archivo, campos), 201)
      }
    }
    if (a === 'cartilla' && b && !c) return json(await actualizarCartilla(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'notas' && b) {
      const id = idDeRuta(b)
      if (!c) return json(await actualizarNota(ctx, id, await leerJson(req)))
      if (c === 'firma') return json(await firmarNota(ctx, id))
      if (c === 'adendas') return json(await agregarAdenda(ctx, id, await leerJson(req)))
      if (c === 'borrar') return json((await borrarNota(ctx, id), { ok: true }))
    }
    if (a === 'documentos' && b && !c) return json(await actualizarDocumento(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'cuentas' && b && c === 'desvincular') return json((await desvincularCuenta(ctx, idDeRuta(b)), { ok: true }))
    if (a === 'importaciones' && !b) {
      const { archivo } = await leerArchivo(req)
      return json(await cargarArchivo(ctx, archivo), 201)
    }
    if (a === 'importaciones' && b) {
      const id = idDeRuta(b)
      if (c === 'plan') return json(await planear(ctx, id, ((await leerJson(req)) as { mapeo?: unknown })?.mapeo))
      if (c === 'aplicar') return json(await aplicar(ctx, id, ((await leerJson(req)) as { mapeo?: unknown })?.mapeo))
      if (c === 'descartar') return json((await descartar(ctx, id), { ok: true }))
    }
  }
  return json({ error: 'Ruta no encontrada.' }, 404)
}

async function manejar(metodo: 'GET' | 'POST', req: NextRequest, contexto: Contexto): Promise<Response> {
  const { ruta = [] } = await contexto.params
  try {
    return await atender(metodo, req, ruta)
  } catch (e) {
    if (e instanceof ErrorClinica) return json({ error: e.message }, e.estado)
    /* Errores de validación de Payload (hooks): se devuelven legibles. */
    const msg = (e as { message?: string })?.message
    const st = (e as { status?: number })?.status
    if (st && st >= 400 && st < 500 && msg) return json({ error: msg }, st)
    console.error('[api/clinica] error inesperado:', e)
    return json({ error: 'Algo falló al guardar. No se registró nada a medias: intenta de nuevo.' }, 500)
  }
}

export async function GET(req: NextRequest, contexto: Contexto) {
  return manejar('GET', req, contexto)
}

export async function POST(req: NextRequest, contexto: Contexto) {
  return manejar('POST', req, contexto)
}
