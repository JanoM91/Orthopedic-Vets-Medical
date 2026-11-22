import { portalEsteticas } from '@/lib/clinica/esteticaPortal'
import { abrirFotoEstetica, arranqueEstetica, esteticasDeMascota, fichaEstetica, guardarFicha, moverEstetica, quitarFotoEstetica, subirFotoEstetica, tableroEstetica } from '@/lib/clinica/esteticaDia'
import { NextRequest, NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'

import { htmlCartilla } from '@/lib/clinica/cartilla'
import { contactoClinica } from '@/lib/sitio/contacto'

import {
  abrirDocumento,
  abrirFoto,
  fijarFoto,
  portalFijarFoto,
  portalQuitarFoto,
  quitarFoto,
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
import { abrirHoja, agregarFarmaco, agregarSignos, cerrarHoja, guardarHoja, hojaQuirurgica, hojasDeMascota, htmlHoja, quitarRenglon } from '@/lib/clinica/hojaQuirurgica'
import { cancelarPresupuesto, enviarPresupuesto, firmarEnClinica, guardarPresupuesto, htmlPresupuestoEquipo, presupuesto, presupuestosDeMascota, regresarABorrador } from '@/lib/clinica/cirugia'
import { cancelarPaquete, entregarProducto, paquetesDeMascota, portalPaquetes, registrarUso, venderPaquete } from '@/lib/clinica/paquetes'
import { ErrorSolicitud, portalSolicitarPaquete } from '@/lib/sitio/solicitudes'
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
  cotizarEquipo,
  crearCita,
  disponibilidadEquipo,
  portalCalendario,
  portalCancelar,
  portalCitas,
  portalCotizar,
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
 *   GET  agenda/disponibilidad?servicio&dia&recurso&ignorar&mascota&adicionales
 *   GET  agenda/cotizar?servicio&mascota&adicionales=1,2   estética: talla, precio y duración
 *   POST agenda/citas                          crear (mascotaId, servicioId, dia, hora, recursoId?, confirmar?)
 *   GET  agenda/citas/:id
 *   POST agenda/citas/:id/estado               { estado, motivo? }
 *   POST agenda/citas/:id/reprogramar          { dia, hora, recursoId? }
 *   POST agenda/citas/:id/notas                { notasInternas?, profesionalId? }
 *   GET  mascotas/:id/citas
 *
 * ESTÉTICA (módulo «estetica», permiso «Estética», E2):
 *   GET  estetica?dia                          tablero del día (tarjetas por etapa)
 *   POST estetica/citas/:id/mover              { a: recibida | bano | secado | corte | lista | entregada }
 *   GET|POST estetica/citas/:id/ficha          ficha de la cita (qué se hizo, hallazgos, notas…)
 *   POST estetica/citas/:id/fotos              (multipart: archivo, momento=antes|despues)
 *   POST estetica/fotos/:id/quitar
 *   GET  estetica/fotos/:id                    la foto (equipo o el tutor de la mascota)
 *   POST estetica/arranque                     rol «Estilista» y casilla en Dueño, Administración y Recepción
 *   GET  mascotas/:id/estetica                 últimas estéticas (expediente)
 *
 * PORTAL (sesión de tutor, colección «tutores»):
 *   GET  portal/resumen                        tutor, ficha vinculada y mascotas
 *   GET  portal/mascotas/:id                   ficha, cartilla, pesos y documentos publicados
 *   GET  portal/mascotas/:id/cartilla          cartilla imprimible (HTML)
 *   GET  portal/mascotas/:id/estetica          estéticas entregadas (qué se hizo, nota, lo observado, fotos) y próximo baño
 *   GET  portal/documentos/:id/archivo
 *   POST portal/vincular                       { codigo }
 *   POST portal/mascotas/:id/documentos        aportar un archivo (queda pendiente de revisión)
 *   GET  portal/citas                          próximas y pasadas, servicios y mascotas para pedir
 *   GET  portal/citas/disponibilidad?servicio&dia&ignorar&mascota&adicionales
 *   GET  portal/citas/cotizar?servicio&mascota&adicionales   estética (solo sus mascotas y adicionales «en línea»)
 *   POST portal/citas                          { mascotaId, servicioId, dia, hora, notasTutor? }
 *   POST portal/citas/:id/reprogramar | cancelar
 *   GET  portal/citas/calendario?servicio&desde&hasta&ignorar   días libres, llenos y cerrados (calendario del mes)
 *   POST portal/mascotas/:id/foto (multipart: archivo) | portal/mascotas/:id/foto/quitar
 *
 * PAQUETES (nov-2026, permiso «Agenda»; entregar producto pide «Vender» de la farmacia):
 *   GET  mascotas/:id/paquetes                 vendidos con saldo, catálogo para vender y talla de la mascota
 *   POST mascotas/:id/paquetes                 { paqueteId, solicitudId?, notas? } vender (entrada por cobrar en Finanzas)
 *   POST paquetes/:id/uso                      { renglon, nota? } uso de un servicio sin cita
 *   POST paquetes/:id/entrega                  { renglon, cantidad? } entregar producto (venta en cero, inventario FEFO)
 *   POST paquetes/:id/cancelar                 { motivo } solo sin usos ni citas por venir; anula su entrada en Finanzas
 *   GET  portal/paquetes                       catálogo en línea, paquetes de sus mascotas con saldo
 *   POST portal/paquetes/solicitar             { paqueteId, mascotaId, nota? } solicitud que recepción confirma
 *
 * CIRUGÍA · PRESUPUESTO Y CONSENTIMIENTO (nov-2026; ver lib/clinica/cirugia.ts):
 *   GET  mascotas/:id/presupuestos             lista («Ver expediente» o «Agenda»)
 *   POST mascotas/:id/presupuestos             crear borrador («Escribir expediente»)
 *   GET  presupuestos/:id                      detalle con el texto del consentimiento
 *   GET  presupuestos/:id/imprimir             presupuesto y consentimiento imprimibles (HTML)
 *   POST presupuestos/:id                      cambiar el borrador
 *   POST presupuestos/:id/enviar | borrador | cancelar { motivo }
 *   POST presupuestos/:id/firmar               { nombre, firma, acepto } firma en la clínica («Agenda» o «Escribir expediente»)
 *   (El tutor firma por /api/presupuesto/:id/:token, sin cuenta.)
 *
 * CIRUGÍA · HOJA QUIRÚRGICA Y DE ANESTESIA (fase 2; ver lib/clinica/hojaQuirurgica.ts):
 *   POST hojas                                 { citaId } o { mascotaId, procedimiento } abrir (o la que ya existe)
 *   GET  hojas/:id | hojas/:id/imprimir        («Ver expediente»)
 *   GET  mascotas/:id/hojas
 *   POST hojas/:id                             guardar campos (solo abierta)
 *   POST hojas/:id/farmacos | signos           agregar un renglón (lo que escribe el médico; nunca se calcula dosis)
 *   POST hojas/:id/quitar                      { lista, indice } quitar un renglón capturado por error
 *   POST hojas/:id/cerrar                      queda inmutable
 *
 * FOTOS (equipo o tutor, nov-2026):
 *   GET  fotos/mascotas/:id                    la foto (equipo con «ver pacientes» o el tutor de esa mascota)
 *   POST mascotas/:id/foto (multipart: archivo) | mascotas/:id/foto/quitar   (equipo, «editar pacientes»)
 */

export const dynamic = 'force-dynamic'

/** Estética: `mascota` y `adicionales=1,2` para calcular duración y precio. */
function extraDe(q: URLSearchParams): { mascotaId: number | null; adicionales: number[] } | undefined {
  const m = Number(q.get('mascota'))
  const ads = (q.get('adicionales') ?? '').split(',').map(Number).filter((x) => Number.isInteger(x) && x > 0)
  if (!(m > 0) && !ads.length) return undefined
  return { mascotaId: m > 0 ? m : null, adicionales: ads }
}
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
    if (a === 'mascotas' && b && d === 'estetica') return json(await portalEsteticas(c, idDeRuta(b)))
    if (a === 'mascotas' && b && d === 'cartilla') {
      const x = await portalMascota(c, idDeRuta(b))
      return html(htmlCartilla(x.mascota, x.cartilla, x.pesos, c.hoy, (await contactoClinica(c.payload)).telefono))
    }
    if (a === 'documentos' && b && d === 'archivo') return portalAbrirDocumento(c, idDeRuta(b))
    if (a === 'citas' && !b) return json(await portalCitas(c))
    if (a === 'paquetes' && !b) return json(await portalPaquetes(c))
    if (a === 'citas' && b === 'disponibilidad') {
      const q = req.nextUrl.searchParams
      return json(await portalDisponibilidad(c, idDeRuta(q.get('servicio') ?? undefined), q.get('dia') ?? '', q.get('ignorar') ? idDeRuta(q.get('ignorar')!) : undefined, extraDe(q)))
    }
    if (a === 'citas' && b === 'calendario') {
      const q = req.nextUrl.searchParams
      return json(await portalCalendario(c, idDeRuta(q.get('servicio') ?? undefined), q.get('desde') ?? '', q.get('hasta') ?? '', q.get('ignorar') ? idDeRuta(q.get('ignorar')!) : undefined, extraDe(q)))
    }
    if (a === 'citas' && b === 'cotizar') {
      const q = req.nextUrl.searchParams
      return json(await portalCotizar(c, idDeRuta(q.get('servicio') ?? undefined), extraDe(q) ?? {}))
    }
  } else {
    if (a === 'vincular' && !b) return json(await vincular(c, await leerJson(req)))
    if (a === 'paquetes' && b === 'solicitar' && !d) {
      try {
        return json(await portalSolicitarPaquete(c.payload, c.tutor, await leerJson(req)), 201)
      } catch (e) {
        if (e instanceof ErrorSolicitud) return json({ error: e.message }, e.status)
        throw e
      }
    }
    if (a === 'citas' && !b) return json(await portalCrearCita(c, await leerJson(req)), 201)
    if (a === 'citas' && b && d === 'reprogramar') return json(await portalReprogramar(c, idDeRuta(b), await leerJson(req)))
    if (a === 'citas' && b && d === 'cancelar') return json(await portalCancelar(c, idDeRuta(b), await leerJson(req)))
    if (a === 'mascotas' && b && d === 'documentos') {
      const { archivo, campos } = await leerArchivo(req)
      return json(await portalSubirDocumento(c, idDeRuta(b), archivo, campos), 201)
    }
    if (a === 'mascotas' && b && d === 'foto') {
      if (ruta[3] === 'quitar') return json(await portalQuitarFoto(c, idDeRuta(b)))
      if (!ruta[3]) return json(await portalFijarFoto(c, idDeRuta(b), (await leerArchivo(req)).archivo))
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
  /* Fotos: las ve el equipo o el tutor de la mascota; la función revisa cuál sesión es. */
  if (metodo === 'GET' && ruta[0] === 'fotos' && ruta[1] === 'mascotas' && ruta[2] && !ruta[3]) return abrirFoto(payloadModulos, req.headers, idDeRuta(ruta[2]))
  /* Fotos de estética (E2): equipo con «Estética» o «Ver pacientes», o el tutor de la mascota. */
  if (metodo === 'GET' && ruta[0] === 'estetica' && ruta[1] === 'fotos' && ruta[2] && !ruta[3]) return abrirFotoEstetica(payloadModulos, req.headers, idDeRuta(ruta[2]))

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
      return json(await disponibilidadEquipo(ctx, idDeRuta(q.get('servicio') ?? undefined), q.get('dia') ?? ctx.hoy, q.get('recurso') ? idDeRuta(q.get('recurso')!) : null, q.get('ignorar') ? idDeRuta(q.get('ignorar')!) : undefined, extraDe(q)))
    }
    if (a === 'agenda' && b === 'cotizar') {
      return json(await cotizarEquipo(ctx, idDeRuta(q.get('servicio') ?? undefined), extraDe(q) ?? {}))
    }
    if (a === 'agenda' && b === 'citas' && c) return json(await cita(ctx, idDeRuta(c)))
    if (a === 'mascotas' && b && c === 'citas') return json(await citasDeMascota(ctx, idDeRuta(b)))
    if (a === 'mascotas' && b && c === 'estetica') return json(await esteticasDeMascota(ctx, idDeRuta(b)))
    if (a === 'mascotas' && b && c === 'paquetes') return json(await paquetesDeMascota(ctx, idDeRuta(b)))
    if (a === 'mascotas' && b && c === 'presupuestos') return json(await presupuestosDeMascota(ctx, idDeRuta(b)))
    if (a === 'presupuestos' && b && !c) return json(await presupuesto(ctx, idDeRuta(b)))
    if (a === 'presupuestos' && b && c === 'imprimir') return html(await htmlPresupuestoEquipo(ctx, idDeRuta(b)))
    if (a === 'mascotas' && b && c === 'hojas') return json(await hojasDeMascota(ctx, idDeRuta(b)))
    if (a === 'hojas' && b && !c) return json(await hojaQuirurgica(ctx, idDeRuta(b)))
    if (a === 'hojas' && b && c === 'imprimir') return html(await htmlHoja(ctx, idDeRuta(b)))
    if (a === 'estetica' && !b) return json(await tableroEstetica(ctx, q.get('dia') ?? ctx.hoy))
    if (a === 'estetica' && b === 'citas' && c && ruta[3] === 'ficha') return json(await fichaEstetica(ctx, idDeRuta(c)))
  } else {
    if (a === 'estetica' && b === 'arranque' && !c) return json(await arranqueEstetica(ctx))
    if (a === 'estetica' && b === 'citas' && c && ruta[3] === 'mover') return json(await moverEstetica(ctx, idDeRuta(c), await leerJson(req)))
    if (a === 'estetica' && b === 'citas' && c && ruta[3] === 'ficha') return json(await guardarFicha(ctx, idDeRuta(c), await leerJson(req)))
    if (a === 'estetica' && b === 'citas' && c && ruta[3] === 'fotos') {
      const { archivo, campos } = await leerArchivo(req)
      return json(await subirFotoEstetica(ctx, idDeRuta(c), String(campos.momento ?? ''), archivo), 201)
    }
    if (a === 'estetica' && b === 'fotos' && c && ruta[3] === 'quitar') return json(await quitarFotoEstetica(ctx, idDeRuta(c)))
    if (a === 'agenda' && b === 'arranque') return json(await arranqueAgenda(ctx))
    if (a === 'mascotas' && b && c === 'paquetes') return json(await venderPaquete(ctx, idDeRuta(b), await leerJson(req)), 201)
    if (a === 'mascotas' && b && c === 'presupuestos') return json(await guardarPresupuesto(ctx, idDeRuta(b), await leerJson(req)), 201)
    if (a === 'hojas' && !b) return json(await abrirHoja(ctx, await leerJson(req)), 201)
    if (a === 'hojas' && b) {
      const id = idDeRuta(b)
      if (!c) return json(await guardarHoja(ctx, id, await leerJson(req)))
      if (c === 'farmacos') return json(await agregarFarmaco(ctx, id, await leerJson(req)))
      if (c === 'signos') return json(await agregarSignos(ctx, id, await leerJson(req)))
      if (c === 'quitar') return json(await quitarRenglon(ctx, id, await leerJson(req)))
      if (c === 'cerrar') return json(await cerrarHoja(ctx, id))
    }
    if (a === 'presupuestos' && b) {
      const id = idDeRuta(b)
      if (!c) return json(await guardarPresupuesto(ctx, (await presupuesto(ctx, id)).mascota.id, await leerJson(req), id))
      if (c === 'enviar') return json(await enviarPresupuesto(ctx, id))
      if (c === 'borrador') return json(await regresarABorrador(ctx, id))
      if (c === 'cancelar') return json(await cancelarPresupuesto(ctx, id, await leerJson(req)))
      if (c === 'firmar') return json(await firmarEnClinica(ctx, id, await leerJson(req), req.headers))
    }
    if (a === 'paquetes' && b && c === 'uso') return json(await registrarUso(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'paquetes' && b && c === 'entrega') return json(await entregarProducto(ctx, idDeRuta(b), await leerJson(req)))
    if (a === 'paquetes' && b && c === 'cancelar') return json(await cancelarPaquete(ctx, idDeRuta(b), await leerJson(req)))
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
      if (c === 'foto' && ruta[3] === 'quitar') return json(await quitarFoto(ctx, id))
      if (c === 'foto' && !ruta[3]) return json(await fijarFoto(ctx, id, (await leerArchivo(req)).archivo))
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
