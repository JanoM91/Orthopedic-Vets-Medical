import type { Where } from 'payload'
import { get as blobGet, put as blobPut } from '@vercel/blob'
import { z } from 'zod'

import type { Cliente, FarProducto, FarReceta, Mascota, User } from '../../payload-types'
import { folioParaId } from '../../collections/farmacia/acceso'
import { site } from '../site'
import { type Ctx, ErrorFarmacia, idDe } from './servicio'
import type { EstadoReceta, PacienteVenta, RecetaVista } from './tipos'
import { DIAS_PESO_VIGENTE, diasEntre, esFecha, invalido, mesesEntre, noEncontrado, normalizar, nOpc, persona, prohibido, sumarDias, t } from './util'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Recetas (fase 3, docs/FARMACIA-PROMPT.md → «Recetas»)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * INTERNA: la emite el médico veterinario desde el expediente (permiso
 * Clínica → «Escribir en el expediente»), con el peso vigente precargado y la
 * dosis escrita por él (el sistema NUNCA sugiere dosis). Al firmar queda
 * «válida» e inmutable (hook en far-recetas): solo cambian sus surtidos usados
 * y la marca del original. Firmar exige la cédula profesional en su usuario.
 *
 * EXTERNA: el mostrador captura los datos y la foto; el encargado («Validar
 * recetas») revisa MVZ, cédula, fecha, producto y dosis y la marca válida o
 * rechazada con motivo. Al rechazar se avisa al tutor por correo (si hay
 * correo y Resend configurado; sin llave no se manda nada y nada falla).
 *
 * Vigencia y surtidos los fija el MVZ. Cada venta consume un surtido del
 * renglón que cubre el producto (lib/farmacia/ventas.ts).
 */

const ESTADO_LABEL: Record<EstadoReceta, string> = { borrador: 'borrador', por_validar: 'por validar', valida: 'válida', rechazada: 'rechazada', cancelada: 'cancelada' }

function puedeLeer(ctx: Ctx): boolean {
  return (ctx.modulos.farmacia && (ctx.p.farmacia.vender || ctx.p.farmacia.recetas)) || (ctx.modulos.clinica && ctx.p.clinica.verExpediente)
}
function exigirLeer(ctx: Ctx): void {
  if (!puedeLeer(ctx)) throw prohibido('Tu rol no incluye ver recetas.')
}
function exigirEmitir(ctx: Ctx): void {
  if (!ctx.modulos.clinica) throw new ErrorFarmacia(404, 'Las recetas internas se emiten desde el expediente: el módulo de Clínica está apagado.')
  if (!ctx.p.clinica.escribirExpediente) throw prohibido('Las recetas internas las emite el médico veterinario desde el expediente.')
}
function exigirValidar(ctx: Ctx): void {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!ctx.p.farmacia.recetas) throw prohibido('Validar recetas y recibir originales es del encargado o un rol superior.')
}

/* ───────────────────────────── paciente ───────────────────────────── */

const nombreCliente = (c: Cliente) => [c.nombre, c.apellidos].filter(Boolean).join(' ').trim() || c.nombre

/** Tutor principal (o el primero) de la mascota. */
export function tutorDe(m: Mascota): Cliente | null {
  const lista = (m.tutores ?? []).map((x) => ({ c: x.cliente, principal: Boolean(x.principal) })).filter((x) => typeof x.c === 'object' && x.c) as { c: Cliente; principal: boolean }[]
  return (lista.find((x) => x.principal) ?? lista[0])?.c ?? null
}

/** Lo que la venta y la receta necesitan de la mascota: especie, peso vigente, edad y alergias. */
export async function pacienteDe(ctx: Ctx, mascotaId: number): Promise<{ mascota: Mascota; paciente: PacienteVenta }> {
  if (!ctx.modulos.clinica) throw invalido('La mascota sale del expediente y el módulo de Clínica está apagado (el perfil ligero llega con la tienda, fase 5).')
  const m = await ctx.payload.findByID({ collection: 'mascotas', id: mascotaId, depth: 1, overrideAccess: true }).catch(() => null)
  if (!m) throw noEncontrado('No encontramos esa mascota.')
  const pesos = await ctx.payload.find({ collection: 'mas-pesos', depth: 0, limit: 1, overrideAccess: true, sort: ['-fecha', '-createdAt'], where: { mascota: { equals: m.id } } })
  const peso = pesos.docs[0]
  const c = tutorDe(m)
  return {
    mascota: m,
    paciente: {
      mascotaId: m.id,
      folio: folioParaId('MAS', m.id),
      nombre: m.nombre,
      especie: m.especie,
      raza: t(m.raza),
      edadMeses: m.fechaNacimiento && esFecha(m.fechaNacimiento) ? mesesEntre(m.fechaNacimiento, ctx.hoy) : null,
      pesoKg: peso ? peso.kg : null,
      pesoFecha: peso ? peso.fecha : null,
      pesoDias: peso ? diasEntre(peso.fecha, ctx.hoy) : null,
      alergias: t(m.alergias),
      cliente: c ? { id: c.id, nombre: nombreCliente(c), email: t(c.email), telefono: t(c.telefono) } : null,
    },
  }
}

/** Búsqueda de mascotas para el mostrador: nombre o folio de la mascota, nombre o teléfono del tutor. */
export async function buscarPacientes(ctx: Ctx, q: string): Promise<PacienteVenta[]> {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!(ctx.p.farmacia.vender || ctx.p.farmacia.recetas)) throw prohibido('Tu rol no incluye la venta de mostrador.')
  if (!ctx.modulos.clinica) return []
  const texto = q.trim()
  if (texto.length < 2) return []
  const o: Where[] = [{ nombre: { like: texto } }]
  const folio = texto.toUpperCase().match(/^(MAS)?[\s-]*0*(\d{1,9})$/)
  if (folio) o.push({ id: { equals: Number(folio[2]) } })
  /* Teléfono solo si escribieron un número (si no, «Rocky 123» traería a todas las mascotas del tutor con ese teléfono). */
  const digitos = texto.replace(/\D/g, '')
  const porTutor: Where[] = [{ nombreCompleto: { like: texto } }]
  if (!/[a-záéíóúñ]/i.test(texto) && digitos.length >= 4) porTutor.push({ telefono: { like: digitos } })
  const clientes = await ctx.payload.find({ collection: 'clientes', depth: 0, limit: 20, overrideAccess: true, where: { or: porTutor }, select: { nombre: true } })
  if (clientes.docs.length) o.push({ 'tutores.cliente': { in: clientes.docs.map((c) => c.id) } })
  const ms = await ctx.payload.find({ collection: 'mascotas', depth: 0, limit: 12, overrideAccess: true, where: { or: o }, select: { nombre: true } })
  /* Primero las que coinciden por nombre de la mascota. */
  const n = normalizar(texto)
  const orden = [...ms.docs].sort((a, b) => Number(normalizar(b.nombre).includes(n)) - Number(normalizar(a.nombre).includes(n)))
  const res: PacienteVenta[] = []
  for (const m of orden) res.push((await pacienteDe(ctx, m.id)).paciente)
  return res
}

/* ───────────────────────────── vista ───────────────────────────── */

export function recetaVigente(r: Pick<FarReceta, 'estado' | 'vigenteHasta'>, hoy: string): boolean {
  return r.estado === 'valida' && r.vigenteHasta >= hoy
}

export async function vistaReceta(ctx: Ctx, r: FarReceta): Promise<RecetaVista> {
  const m = typeof r.mascota === 'object' && r.mascota ? (r.mascota as Mascota) : null
  const c = typeof r.cliente === 'object' && r.cliente ? (r.cliente as Cliente) : null
  const ids = (r.renglones ?? []).map((x) => idDe(x.producto)).filter((x): x is number => x != null)
  const prods = ids.length ? await ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: ids } }, select: { nombre: true } }) : { docs: [] as Pick<FarProducto, 'id' | 'nombre'>[] }
  const nombre = new Map(prods.docs.map((p) => [p.id, p.nombre]))
  return {
    id: r.id,
    folio: folioParaId('REC', r.id),
    origen: r.origen,
    estado: r.estado,
    vigente: recetaVigente(r, ctx.hoy),
    mascota: m ? { id: m.id, folio: folioParaId('MAS', m.id), nombre: m.nombre, especie: m.especie } : null,
    cliente: c ? { id: c.id, nombre: nombreCliente(c), email: t(c.email) } : null,
    pacienteTexto: t(r.pacienteTexto),
    notaId: idDe(r.nota),
    mvzNombre: r.mvzNombre,
    mvzCedula: t(r.mvzCedula),
    fechaEmision: r.fechaEmision,
    vigenteHasta: r.vigenteHasta,
    folioCuantificado: t(r.folioCuantificado),
    pesoKg: nOpc(r.pesoKg),
    indicaciones: t(r.indicaciones),
    renglones: (r.renglones ?? []).map((x) => ({
      id: x.id ?? null,
      productoId: idDe(x.producto),
      productoNombre: idDe(x.producto) ? (nombre.get(idDe(x.producto)!) ?? null) : null,
      principio: t(x.principio),
      dosis: t(x.dosis),
      frecuencia: t(x.frecuencia),
      duracion: t(x.duracion),
      surtidosPermitidos: nOpc(x.surtidosPermitidos) ?? 1,
      surtidosUsados: nOpc(x.surtidosUsados) ?? 0,
    })),
    tieneArchivo: Boolean(r.archivo),
    firmadaPor: persona(r.firmadaPor),
    firmadaEn: r.firmadaEn ?? null,
    validadaPor: persona(r.validadaPor),
    validadaEn: r.validadaEn ?? null,
    motivoRechazo: t(r.motivoRechazo),
    originalRecibido: Boolean(r.originalRecibido),
    originalRecibidoPor: persona(r.originalRecibidoPor),
    originalRecibidoEn: r.originalRecibidoEn ?? null,
    capturadaPor: persona(r.capturadaPor),
    creadoEn: r.createdAt,
  }
}

async function cargar(ctx: Ctx, id: number): Promise<FarReceta> {
  const r = await ctx.payload.findByID({ collection: 'far-recetas', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!r) throw noEncontrado('No encontramos esa receta.')
  return r
}

export async function recetas(ctx: Ctx, f: { estado?: string | null; mascotaId?: number | null; q?: string | null; originalPendiente?: boolean; limite?: number }): Promise<{ recetas: RecetaVista[]; total: number }> {
  exigirLeer(ctx)
  const where: Where[] = []
  if (f.estado && ['borrador', 'por_validar', 'valida', 'rechazada', 'cancelada'].includes(f.estado)) where.push({ estado: { equals: f.estado } })
  if (f.mascotaId) where.push({ mascota: { equals: f.mascotaId } })
  if (f.originalPendiente) where.push({ and: [{ estado: { equals: 'valida' } }, { originalRecibido: { not_equals: true } }, { or: [{ origen: { equals: 'externa' } }, { folioCuantificado: { exists: true } }] }] })
  const q = (f.q ?? '').trim()
  if (q) {
    const o: Where[] = [{ mvzNombre: { like: q } }, { pacienteTexto: { like: q } }, { folioCuantificado: { like: q } }]
    const m = q.toUpperCase().match(/^(REC)?[\s-]*0*(\d{1,9})$/)
    if (m) o.push({ id: { equals: Number(m[2]) } })
    if (ctx.modulos.clinica) {
      const ms = await ctx.payload.find({ collection: 'mascotas', depth: 0, limit: 50, overrideAccess: true, where: { nombre: { like: q } }, select: { nombre: true } })
      if (ms.docs.length) o.push({ mascota: { in: ms.docs.map((x) => x.id) } })
    }
    where.push({ or: o })
  }
  /* Los borradores solo los ve quien los escribe (o quien ve el expediente). */
  if (!(ctx.modulos.clinica && ctx.p.clinica.verExpediente)) where.push({ estado: { not_equals: 'borrador' } })
  const r = await ctx.payload.find({ collection: 'far-recetas', depth: 1, limit: f.limite ?? 100, overrideAccess: true, sort: '-createdAt', where: where.length ? { and: where } : undefined })
  return { recetas: await Promise.all(r.docs.map((x) => vistaReceta(ctx, x))), total: r.totalDocs }
}

export async function receta(ctx: Ctx, id: number): Promise<RecetaVista> {
  exigirLeer(ctx)
  return vistaReceta(ctx, await cargar(ctx, id))
}

/* ───────────────────────────── escribir ───────────────────────────── */

const esquemaRenglon = z.object({
  productoId: z.coerce.number().int().positive().nullable().optional(),
  principio: z.string().trim().max(200).nullable().optional(),
  dosis: z.string().trim().max(200).nullable().optional(),
  frecuencia: z.string().trim().max(120).nullable().optional(),
  duracion: z.string().trim().max(120).nullable().optional(),
  surtidosPermitidos: z.coerce.number().int().min(1, 'Los surtidos permitidos son al menos 1.').max(24).default(1),
})

const esquemaReceta = z.object({
  mascotaId: z.coerce.number().int().positive().nullable().optional(),
  clienteId: z.coerce.number().int().positive().nullable().optional(),
  pacienteTexto: z.string().trim().max(160).nullable().optional(),
  notaId: z.coerce.number().int().positive().nullable().optional(),
  mvzNombre: z.string().trim().max(160).optional(),
  mvzCedula: z.string().trim().max(40).nullable().optional(),
  fechaEmision: z.string().optional(),
  vigenteHasta: z.string().optional(),
  vigenciaDias: z.coerce.number().int().min(1).max(365).optional(),
  folioCuantificado: z.string().trim().max(60).nullable().optional(),
  indicaciones: z.string().trim().max(2000).nullable().optional(),
  renglones: z.array(esquemaRenglon).min(1, 'Agrega al menos un medicamento.').max(20).optional(),
  firmar: z.boolean().optional(),
})

async function revisarRenglones(ctx: Ctx, renglones: z.infer<typeof esquemaRenglon>[]): Promise<{ data: Record<string, unknown>[]; grupos: Set<string> }> {
  const ids = renglones.map((r) => r.productoId).filter((x): x is number => x != null)
  const prods = ids.length ? await ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { id: { in: ids } } }) : { docs: [] as FarProducto[] }
  const porId = new Map(prods.docs.map((p) => [p.id, p]))
  const grupos = new Set<string>()
  const data = renglones.map((r, i) => {
    if (!r.productoId && !t(r.principio)) throw invalido(`Medicamento ${i + 1}: elige el producto o escribe el principio activo.`)
    const p = r.productoId ? porId.get(r.productoId) : undefined
    if (r.productoId && !p) throw invalido(`Medicamento ${i + 1}: ese producto no existe.`)
    if (p) grupos.add(p.grupo)
    return { producto: r.productoId ?? null, principio: t(r.principio) ?? t(p?.principioActivo) ?? null, dosis: t(r.dosis), frecuencia: t(r.frecuencia), duracion: t(r.duracion), surtidosPermitidos: r.surtidosPermitidos, surtidosUsados: 0 }
  })
  return { data, grupos }
}

function fechas(ctx: Ctx, v: { fechaEmision?: string; vigenteHasta?: string; vigenciaDias?: number }, actual?: { fechaEmision: string; vigenteHasta: string }): { fechaEmision: string; vigenteHasta: string } {
  const fechaEmision = v.fechaEmision ?? actual?.fechaEmision ?? ctx.hoy
  if (!esFecha(fechaEmision)) throw invalido('Escribe la fecha de emisión como AAAA-MM-DD.')
  if (fechaEmision > ctx.hoy) throw invalido('La fecha de emisión no puede ser futura.')
  const vigenteHasta = v.vigenteHasta ?? (v.vigenciaDias ? sumarDias(fechaEmision, v.vigenciaDias) : actual?.vigenteHasta)
  if (!vigenteHasta) throw invalido('Indica hasta cuándo es vigente la receta (la fija el MVZ).')
  if (!esFecha(vigenteHasta)) throw invalido('Escribe la vigencia como AAAA-MM-DD.')
  if (vigenteHasta < fechaEmision) throw invalido('La vigencia no puede terminar antes de la emisión.')
  return { fechaEmision, vigenteHasta }
}

/** Receta interna (borrador o firmada) desde el expediente. */
export async function crearRecetaInterna(ctx: Ctx, entrada: unknown): Promise<RecetaVista> {
  exigirEmitir(ctx)
  const d = esquemaReceta.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  if (!v.mascotaId) throw invalido('La receta interna es para una mascota del expediente.')
  if (!v.renglones?.length) throw invalido('Agrega al menos un medicamento.')
  const { mascota, paciente } = await pacienteDe(ctx, v.mascotaId)
  if (v.notaId) {
    const nota = await ctx.payload.findByID({ collection: 'mas-notas', id: v.notaId, depth: 0, overrideAccess: true }).catch(() => null)
    if (!nota || idDe(nota.mascota) !== mascota.id) throw invalido('Esa nota clínica no es de esta mascota.')
  }
  const { data: renglones, grupos } = await revisarRenglones(ctx, v.renglones)
  const f = fechas(ctx, v)
  const r = await ctx.payload.create({
    collection: 'far-recetas',
    overrideAccess: true,
    depth: 0,
    data: {
      origen: 'interna',
      estado: 'borrador',
      mascota: mascota.id,
      cliente: paciente.cliente?.id ?? null,
      nota: v.notaId ?? null,
      mvzNombre: ctx.user.name?.trim() || ctx.user.email,
      mvzCedula: t((ctx.user as User & { cedulaProfesional?: string | null }).cedulaProfesional),
      emitidaPor: ctx.user.id,
      ...f,
      folioCuantificado: t(v.folioCuantificado),
      /* El peso vigente se precarga; la dosis la escribe el MVZ. */
      pesoKg: paciente.pesoKg != null && (paciente.pesoDias ?? 0) <= DIAS_PESO_VIGENTE ? paciente.pesoKg : null,
      indicaciones: t(v.indicaciones),
      renglones: renglones as FarReceta['renglones'],
      capturadaPor: ctx.user.id,
    },
  })
  if (!v.firmar) return receta(ctx, r.id)
  /* Si la firma no procede (sin cédula, sin folio de Grupo I), el borrador queda guardado y se dice. */
  const folio = folioParaId('REC', r.id)
  if (grupos.has('I') && !t(v.folioCuantificado)) throw invalido(`Un producto del Grupo I exige el folio de receta cuantificada autorizado por SENASICA. La receta quedó en borrador (${folio}).`)
  try {
    return await firmarReceta(ctx, r.id)
  } catch (e) {
    if (e instanceof ErrorFarmacia && e.estado === 400) throw invalido(`${e.message} La receta quedó en borrador (${folio}).`)
    throw e
  }
}

export async function actualizarRecetaInterna(ctx: Ctx, id: number, entrada: unknown): Promise<RecetaVista> {
  exigirEmitir(ctx)
  const r = await cargar(ctx, id)
  if (r.origen !== 'interna') throw invalido('Una receta externa no se edita: se valida o se rechaza.')
  if (r.estado !== 'borrador') throw invalido('La receta está firmada: ya no se puede cambiar.')
  if (idDe(r.emitidaPor) !== ctx.user.id && !ctx.p.superadmin) throw prohibido('Solo quien emitió la receta la puede editar antes de firmar.')
  const d = esquemaReceta.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  const data: Record<string, unknown> = {}
  if (v.renglones) data.renglones = (await revisarRenglones(ctx, v.renglones)).data
  if (v.fechaEmision || v.vigenteHasta || v.vigenciaDias) Object.assign(data, fechas(ctx, v, r))
  if (v.folioCuantificado !== undefined) data.folioCuantificado = t(v.folioCuantificado)
  if (v.indicaciones !== undefined) data.indicaciones = t(v.indicaciones)
  if (Object.keys(data).length) await ctx.payload.update({ collection: 'far-recetas', id, overrideAccess: true, depth: 0, data })
  return v.firmar ? firmarReceta(ctx, id) : receta(ctx, id)
}

export async function firmarReceta(ctx: Ctx, id: number): Promise<RecetaVista> {
  exigirEmitir(ctx)
  const r = await cargar(ctx, id)
  if (r.origen !== 'interna') throw invalido('Solo se firman las recetas internas.')
  if (r.estado !== 'borrador') throw invalido('La receta ya está firmada.')
  if (idDe(r.emitidaPor) !== ctx.user.id && !ctx.p.superadmin) throw prohibido('La firma quien emitió la receta.')
  const cedula = t((ctx.user as User & { cedulaProfesional?: string | null }).cedulaProfesional)
  if (!cedula) throw invalido('Para firmar, agrega tu cédula profesional en tu usuario (Sistema → Usuarios).')
  const ids = (r.renglones ?? []).map((x) => idDe(x.producto)).filter((x): x is number => x != null)
  if (ids.length) {
    const g1 = await ctx.payload.count({ collection: 'far-productos', overrideAccess: true, where: { and: [{ id: { in: ids } }, { grupo: { equals: 'I' } }] } })
    if (g1.totalDocs && !t(r.folioCuantificado)) throw invalido('Un producto del Grupo I exige el folio de receta cuantificada autorizado por SENASICA.')
  }
  await ctx.payload.update({ collection: 'far-recetas', id, overrideAccess: true, depth: 0, data: { estado: 'valida', mvzCedula: cedula, mvzNombre: ctx.user.name?.trim() || r.mvzNombre, firmadaPor: ctx.user.id, firmadaEn: new Date().toISOString() } })
  return receta(ctx, id)
}

/* ───────── externa ───────── */

function tokenArchivos(): string | null {
  return process.env.CLINICA_BLOB_READ_WRITE_TOKEN?.trim() || process.env.FINANZAS_BLOB_READ_WRITE_TOKEN?.trim() || null
}

const TIPOS_ARCHIVO = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'])

export async function crearRecetaExterna(ctx: Ctx, entrada: unknown, archivo?: File | null): Promise<RecetaVista> {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!(ctx.p.farmacia.vender || ctx.p.farmacia.recetas)) throw prohibido('Tu rol no incluye capturar recetas.')
  const d = esquemaReceta.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data
  if (!t(v.mvzNombre)) throw invalido('Escribe el nombre del MVZ que firma la receta.')
  if (!v.renglones?.length) throw invalido('Agrega al menos un medicamento.')
  let mascota: Mascota | null = null
  let clienteId: number | null = v.clienteId ?? null
  if (v.mascotaId) {
    const x = await pacienteDe(ctx, v.mascotaId)
    mascota = x.mascota
    clienteId = clienteId ?? x.paciente.cliente?.id ?? null
  } else if (!t(v.pacienteTexto)) throw invalido('Elige la mascota o escribe el nombre del paciente.')
  const { data: renglones } = await revisarRenglones(ctx, v.renglones)
  const f = fechas(ctx, v)
  let ruta: string | null = null
  let nombreArchivo: string | null = null
  if (archivo && archivo.size) {
    if (archivo.size > 8 * 1024 * 1024) throw invalido('La foto pesa más de 8 MB.')
    const tipo = archivo.type || 'application/octet-stream'
    if (!TIPOS_ARCHIVO.has(tipo)) throw invalido('Sube una foto (JPG, PNG, WEBP, HEIC) o un PDF.')
    const token = tokenArchivos()
    if (!token) throw new ErrorFarmacia(503, 'Falta configurar el almacén privado de archivos (CLINICA_BLOB_READ_WRITE_TOKEN). Captura la receta sin foto y adjúntala después.')
    const limpio = (archivo.name || 'receta').replace(/[^\w.-]+/g, '_').slice(-80)
    const subido = await blobPut(`farmacia/recetas/${ctx.hoy}/${limpio}`, archivo, { access: 'private', token, addRandomSuffix: true, contentType: tipo })
    ruta = subido.pathname
    nombreArchivo = limpio
  }
  const r = await ctx.payload.create({
    collection: 'far-recetas',
    overrideAccess: true,
    depth: 0,
    data: {
      origen: 'externa',
      estado: 'por_validar',
      mascota: mascota?.id ?? null,
      cliente: clienteId,
      pacienteTexto: t(v.pacienteTexto),
      mvzNombre: t(v.mvzNombre)!,
      mvzCedula: t(v.mvzCedula),
      ...f,
      folioCuantificado: t(v.folioCuantificado),
      indicaciones: t(v.indicaciones),
      renglones: renglones as FarReceta['renglones'],
      archivo: ruta,
      archivoNombre: nombreArchivo,
      capturadaPor: ctx.user.id,
    },
  })
  return receta(ctx, r.id)
}

export async function archivoReceta(ctx: Ctx, id: number): Promise<Response> {
  exigirLeer(ctx)
  const r = await cargar(ctx, id)
  if (!r.archivo) throw noEncontrado('Esta receta no tiene foto.')
  const token = tokenArchivos()
  if (!token) throw new ErrorFarmacia(503, 'Falta configurar el almacén privado de archivos.')
  const b = await blobGet(r.archivo, { access: 'private', token })
  if (!b || b.statusCode !== 200) throw noEncontrado('No encontramos el archivo.')
  return new Response(b.stream, { headers: { 'Content-Type': b.blob.contentType || 'application/octet-stream', 'Content-Disposition': `inline; filename="${r.archivoNombre || 'receta'}"`, 'Cache-Control': 'private, no-store' } })
}

export async function validarReceta(ctx: Ctx, id: number, entrada: unknown): Promise<RecetaVista> {
  exigirValidar(ctx)
  const d = z.object({ decision: z.enum(['valida', 'rechazada']), motivo: z.string().trim().max(300).nullable().optional() }).safeParse(entrada)
  if (!d.success) throw invalido('Indica si la receta es válida o se rechaza.')
  const r = await cargar(ctx, id)
  if (r.estado !== 'por_validar') throw invalido(`La receta está ${ESTADO_LABEL[r.estado]}: solo se valida una receta por validar.`)
  if (d.data.decision === 'rechazada' && (t(d.data.motivo)?.length ?? 0) < 5) throw invalido('Escribe el motivo del rechazo (mínimo 5 caracteres): se le manda al tutor.')
  if (d.data.decision === 'valida' && r.vigenteHasta < ctx.hoy) throw invalido('La receta ya venció: recházala con ese motivo.')
  await ctx.payload.update({
    collection: 'far-recetas',
    id,
    overrideAccess: true,
    depth: 0,
    data: { estado: d.data.decision, validadaPor: ctx.user.id, validadaEn: new Date().toISOString(), motivoRechazo: d.data.decision === 'rechazada' ? t(d.data.motivo) : null },
  })
  const vista = await receta(ctx, id)
  if (d.data.decision === 'rechazada' && vista.cliente?.email) {
    /* Sin RESEND_API_KEY el adaptador solo deja aviso en el log (lib/emailAdapter.ts). */
    await ctx.payload
      .sendEmail({
        to: vista.cliente.email,
        subject: `Tu receta ${vista.folio} no se pudo surtir`,
        html: `<p>Hola, ${escapar(vista.cliente.nombre)}:</p><p>Revisamos la receta ${vista.folio}${vista.mascota ? ` de ${escapar(vista.mascota.nombre)}` : ''} y no la pudimos validar por este motivo:</p><blockquote>${escapar(vista.motivoRechazo ?? '')}</blockquote><p>Si tienes dudas, contáctanos${site.brand.phone ? ` al ${escapar(site.brand.phone)}` : ''}. Con gusto te ayudamos a agendar una consulta.</p><p>${escapar(site.brand.name)}</p>`,
      })
      .catch((e: unknown) => ctx.payload.logger.error(`[recetas] no se mandó el correo de rechazo: ${String(e)}`))
  }
  return vista
}

export async function marcarOriginal(ctx: Ctx, id: number): Promise<RecetaVista> {
  exigirValidar(ctx)
  const r = await cargar(ctx, id)
  if (r.estado !== 'valida') throw invalido('Solo se marca el original de una receta válida.')
  if (r.originalRecibido) return receta(ctx, id)
  await ctx.payload.update({ collection: 'far-recetas', id, overrideAccess: true, depth: 0, data: { originalRecibido: true, originalRecibidoPor: ctx.user.id, originalRecibidoEn: new Date().toISOString() } })
  return receta(ctx, id)
}

export async function cancelarReceta(ctx: Ctx, id: number, entrada: unknown): Promise<RecetaVista> {
  const r = await cargar(ctx, id)
  const esEmisor = idDe(r.emitidaPor) === ctx.user.id
  if (!(ctx.p.farmacia.recetas || ctx.p.superadmin || (esEmisor && ctx.p.clinica.escribirExpediente))) throw prohibido('Cancela la receta quien la emitió o el encargado.')
  const d = z.object({ motivo: z.string().trim().min(5, 'Escribe el motivo de la cancelación (mínimo 5 caracteres).').max(300) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Escribe el motivo.')
  if (r.estado === 'cancelada' || r.estado === 'rechazada') throw invalido('La receta ya no está activa.')
  await ctx.payload.update({ collection: 'far-recetas', id, overrideAccess: true, depth: 0, data: { estado: 'cancelada', motivoRechazo: d.data.motivo } })
  return receta(ctx, id)
}

/* ───────────────────────────── para la venta ───────────────────────────── */

/** ¿Qué renglón de la receta cubre este producto? Por producto, o por principio activo si la receta lo escribió sin producto. */
export function renglonQueCubre(r: FarReceta, producto: Pick<FarProducto, 'id' | 'principioActivo'>): NonNullable<FarReceta['renglones']>[number] | null {
  const renglones = r.renglones ?? []
  const porProducto = renglones.find((x) => idDe(x.producto) === producto.id)
  if (porProducto) return porProducto
  const pa = producto.principioActivo ? normalizar(producto.principioActivo) : ''
  if (!pa) return null
  return renglones.find((x) => !idDe(x.producto) && x.principio && (normalizar(x.principio).includes(pa) || pa.includes(normalizar(x.principio)))) ?? null
}

/** Recetas vigentes de la mascota que cubren el producto y aún tienen surtidos (para elegir en el mostrador). */
export async function recetasParaProducto(ctx: Ctx, f: { mascotaId?: number | null; productoId: number }): Promise<RecetaVista[]> {
  exigirLeer(ctx)
  const producto = await ctx.payload.findByID({ collection: 'far-productos', id: f.productoId, depth: 0, overrideAccess: true }).catch(() => null)
  if (!producto) throw noEncontrado('No encontramos ese producto.')
  const where: Where[] = [{ estado: { equals: 'valida' } }, { vigenteHasta: { greater_than_equal: ctx.hoy } }]
  if (f.mascotaId) where.push({ mascota: { equals: f.mascotaId } })
  const rs = await ctx.payload.find({ collection: 'far-recetas', depth: 1, limit: 30, overrideAccess: true, sort: '-createdAt', where: { and: where } })
  const utiles = rs.docs.filter((r) => {
    const reng = renglonQueCubre(r, producto)
    return reng && (nOpc(reng.surtidosUsados) ?? 0) < (nOpc(reng.surtidosPermitidos) ?? 1)
  })
  return Promise.all(utiles.map((r) => vistaReceta(ctx, r)))
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
}
export { escapar }

/** Ficha de la mascota para el mostrador o el expediente (especie, peso vigente, edad, alergias). */
export async function paciente(ctx: Ctx, mascotaId: number): Promise<PacienteVenta> {
  if (!((ctx.modulos.farmacia && (ctx.p.farmacia.vender || ctx.p.farmacia.recetas)) || ctx.p.clinica.verExpediente)) throw prohibido('Tu rol no incluye ver mascotas.')
  return (await pacienteDe(ctx, mascotaId)).paciente
}
