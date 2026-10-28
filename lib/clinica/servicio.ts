import type { Payload, PayloadRequest, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { get as blobGet, put as blobPut } from '@vercel/blob'
import { z } from 'zod'

import type { Cliente, Mascota, MasCartilla, MasDocumento, MasNota, MasPeso, Tutor, User } from '../../payload-types'
import { ESPECIES, normalizarTelefono } from '../../collections/clinica/pacientes'
import { TIPOS_CARTILLA, TIPOS_DOCUMENTO, TIPOS_NOTA } from '../../collections/clinica/expediente'
import { folioParaId } from '../../collections/clinica/acceso'
import { diaEnZona } from '../finanzas/reglas'
import { permisosDe, type Permisos } from '../permisos'
import { site } from '../site'
import { htmlDeInvitacion, VIGENCIA_INVITACION_MS } from '../authEmails'
import type {
  CartillaVista,
  CatalogoClinica,
  ClienteVista,
  CodigoVista,
  CuentaPortalVista,
  InvitacionVista,
  DocumentoVista,
  Expediente,
  FichaCliente,
  MascotaVista,
  NotaVista,
  PersonaBreve,
  PesoVista,
  PortalMascota,
  PortalResumen,
  ResultadoBusqueda,
} from './tipos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Servicio de la clínica: clientes-tutores, mascotas y expediente
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mismo patrón que lib/finanzas/servicio.ts: la API (/api/clinica) verifica la
 * sesión y delega aquí; aquí se revisan permisos (lib/permisosBase.ts →
 * clinica), se valida con zod y se escribe con la API local de Payload.
 *
 * Dos tipos de contexto:
 *   - Ctx (equipo): permisos por rol; escribe con overrideAccess.
 *   - CtxTutor (portal): SIEMPRE con overrideAccess: false y el usuario tutor,
 *     para que las reglas de collections/clinica/acceso.ts decidan qué ve
 *     (solo su ficha, sus mascotas, documentos publicados; notas nunca).
 */

export class ErrorClinica extends Error {
  constructor(
    public estado: number,
    mensaje: string,
  ) {
    super(mensaje)
  }
}
const prohibido = (m = 'Tu rol no permite hacer esto.') => new ErrorClinica(403, m)
const invalido = (m: string) => new ErrorClinica(400, m)
const noEncontrado = (m = 'No encontramos ese registro.') => new ErrorClinica(404, m)

export type Ctx = { payload: Payload; req: PayloadRequest; user: User; p: Permisos; hoy: string }
export type CtxTutor = { payload: Payload; tutor: Tutor; hoy: string }

export async function contextoDesdeHeaders(payload: Payload, headers: Headers): Promise<Ctx | null> {
  const { user } = await payload.auth({ headers })
  if (!user || (user as { collection?: string }).collection !== 'users') return null
  const req = await createLocalReq({ user: user as User & { collection: 'users' } }, payload)
  const p = await permisosDe(req)
  return { payload, req, user: user as User, p, hoy: diaEnZona(new Date(), site.location.timeZone) }
}

export async function contextoDesdeReq(req: PayloadRequest): Promise<Ctx | null> {
  if (!req.user || (req.user as { collection?: string }).collection !== 'users') return null
  const p = await permisosDe(req)
  return { payload: req.payload, req, user: req.user as User, p, hoy: diaEnZona(new Date(), site.location.timeZone) }
}

export async function contextoTutor(payload: Payload, headers: Headers): Promise<CtxTutor | null> {
  const { user } = await payload.auth({ headers })
  if (!user || (user as { collection?: string }).collection !== 'tutores') return null
  return { payload, tutor: user as Tutor, hoy: diaEnZona(new Date(), site.location.timeZone) }
}

function exigir(ctx: Ctx, permiso: keyof Permisos['clinica'], mensaje?: string): void {
  if (!ctx.p.clinica[permiso]) throw prohibido(mensaje)
}

async function enTransaccion<T>(ctx: Ctx, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({ user: ctx.user as User & { collection: 'users' } }, ctx.payload)
  const propia = await initTransaction(req)
  try {
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

/* ───────────────────────────── utilidades ───────────────────────────── */

export const idDe = (v: unknown): number | null => {
  if (v == null) return null
  if (typeof v === 'object' && 'id' in (v as object)) return Number((v as { id: unknown }).id)
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const persona = (u: unknown): PersonaBreve | null => {
  if (!u) return null
  if (typeof u === 'object') {
    const x = u as Partial<User>
    return { id: Number(x.id), nombre: x.name?.trim() || x.email?.split('@')[0] || 'Usuario' }
  }
  return { id: Number(u), nombre: 'Usuario' }
}
const nombreDe = (u: unknown): string | null => persona(u)?.nombre ?? null
const t = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v.trim() : ''
  return s ? s : null
}

/** «3 años», «7 meses», «2 semanas» a partir de AAAA-MM-DD. */
export function edadDesde(fechaNacimiento: string | null | undefined, hoy: string): string | null {
  if (!fechaNacimiento || !/^\d{4}-\d{2}-\d{2}$/.test(fechaNacimiento)) return null
  const [y1, m1, d1] = fechaNacimiento.split('-').map(Number)
  const [y2, m2, d2] = hoy.split('-').map(Number)
  let meses = (y2 - y1) * 12 + (m2 - m1) - (d2 < d1 ? 1 : 0)
  if (meses < 0) return null
  if (meses < 1) {
    const dias = Math.max(0, Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000))
    return dias < 14 ? `${dias} día${dias === 1 ? '' : 's'}` : `${Math.floor(dias / 7)} semanas`
  }
  if (meses < 24) return `${meses} mes${meses === 1 ? '' : 'es'}`
  const anios = Math.floor(meses / 12)
  meses = meses % 12
  return meses >= 1 && anios < 6 ? `${anios} años ${meses} m` : `${anios} año${anios === 1 ? '' : 's'}`
}

/** «CLI-00012» → 12, «mas 34» → 34, «12» → 12; si no parece folio, null. */
export function idDeFolio(texto: string): { prefijo: 'CLI' | 'MAS' | null; id: number } | null {
  const m = texto.trim().toUpperCase().match(/^(CLI|MAS)?[\s-]*0*(\d{1,9})$/)
  if (!m) return null
  return { prefijo: (m[1] as 'CLI' | 'MAS') || null, id: Number(m[2]) }
}

/* ───────────────────────────── vistas ───────────────────────────── */

export function vistaCliente(c: Cliente): ClienteVista {
  return {
    id: c.id,
    folio: folioParaId('CLI', c.id),
    nombre: c.nombre,
    apellidos: c.apellidos ?? '',
    nombreCompleto: c.nombreCompleto || [c.nombre, c.apellidos].filter(Boolean).join(' '),
    telefono: t(c.telefono),
    telefonoAlterno: t(c.telefonoAlterno),
    email: t(c.email),
    direccion: t(c.direccion),
    contactoEmergencia: { nombre: t(c.contactoEmergencia?.nombre), telefono: t(c.contactoEmergencia?.telefono) },
    comunicacion: {
      avisos: c.comunicacion?.avisos ?? true,
      promociones: Boolean(c.comunicacion?.promociones),
      whatsapp: c.comunicacion?.whatsapp ?? true,
      correo: c.comunicacion?.correo ?? true,
    },
    notasInternas: t(c.notasInternas),
    activo: c.activo ?? true,
    origen: (c.origen as ClienteVista['origen']) || 'manual',
    creadoEn: c.createdAt,
    actualizadoEn: c.updatedAt,
  }
}

const vistaPeso = (p: MasPeso): PesoVista => ({ id: p.id, fecha: p.fecha, kg: p.kg, nota: t(p.nota), registradoPor: nombreDe(p.registradoPor) })

export function vistaMascota(m: Mascota, hoy: string, ultimoPeso: MasPeso | null = null): MascotaVista {
  return {
    id: m.id,
    folio: folioParaId('MAS', m.id),
    nombre: m.nombre,
    especie: m.especie,
    especieOtra: t(m.especieOtra),
    raza: t(m.raza),
    sexo: (m.sexo as MascotaVista['sexo']) || 'desconocido',
    esterilizado: (m.esterilizado as MascotaVista['esterilizado']) || 'desconocido',
    color: t(m.color),
    fechaNacimiento: t(m.fechaNacimiento),
    nacimientoEstimado: Boolean(m.nacimientoEstimado),
    edad: edadDesde(m.fechaNacimiento, hoy),
    microchip: t(m.microchip),
    alergias: t(m.alergias),
    alertasManejo: (m.alertasManejo ?? []).map((a) => a.texto).filter(Boolean),
    medicoTratante: persona(m.medicoTratante),
    tutores: (m.tutores ?? []).map((x) => {
      const c = typeof x.cliente === 'object' && x.cliente ? x.cliente : null
      const cid = idDe(x.cliente) ?? 0
      return {
        clienteId: cid,
        folio: folioParaId('CLI', cid),
        nombre: c ? c.nombreCompleto || [c.nombre, c.apellidos].filter(Boolean).join(' ') : `Cliente ${cid}`,
        telefono: t(c?.telefono),
        principal: Boolean(x.principal),
        parentesco: t(x.parentesco),
      }
    }),
    estado: (m.estado as MascotaVista['estado']) || 'activo',
    notasInternas: t(m.notasInternas),
    origen: (m.origen as MascotaVista['origen']) || 'manual',
    ultimoPeso: ultimoPeso ? vistaPeso(ultimoPeso) : null,
    creadoEn: m.createdAt,
    actualizadoEn: m.updatedAt,
  }
}

const vistaCartilla = (c: MasCartilla): CartillaVista => ({
  id: c.id,
  tipo: c.tipo,
  producto: c.producto,
  fechaAplicacion: c.fechaAplicacion,
  proximaFecha: t(c.proximaFecha),
  lote: t(c.lote),
  caducidad: t(c.caducidad),
  aplicadoPor: nombreDe(c.aplicadoPor) ?? t(c.aplicadoPorTexto),
  notas: t(c.notas),
})

const vistaNota = (n: MasNota): NotaVista => ({
  id: n.id,
  fecha: n.fecha,
  tipo: n.tipo,
  titulo: n.titulo,
  subjetivo: t(n.subjetivo),
  objetivo: t(n.objetivo),
  analisis: t(n.analisis),
  plan: t(n.plan),
  autor: persona(n.autor),
  estado: n.estado,
  firmadaEn: n.firmadaEn ?? null,
  firmadaPor: nombreDe(n.firmadaPor),
  adendas: (n.adendas ?? []).map((a) => ({ motivo: a.motivo, texto: a.texto, fecha: a.fecha ?? null, autor: nombreDe(a.autor) })),
})

const vistaDocumento = (d: MasDocumento): DocumentoVista => ({
  id: d.id,
  titulo: d.titulo,
  tipo: d.tipo,
  fecha: t(d.fecha),
  publicadoAlTutor: Boolean(d.publicadoAlTutor),
  origen: d.origen,
  revision: (d.revision as DocumentoVista['revision']) || 'no_aplica',
  nombreArchivo: t(d.nombreArchivo),
  tipoContenido: t(d.tipoContenido),
  tamano: d.tamano ?? null,
  subidoPor: nombreDe(d.subidoPor) ?? (d.subidoPorTutor ? 'Tutor (portal)' : null),
  creadoEn: d.createdAt,
})

/* ───────────────────────────── catálogo ───────────────────────────── */

export async function catalogo(ctx: Ctx): Promise<CatalogoClinica> {
  exigir(ctx, 'verPacientes', 'Tu rol no incluye pacientes.')
  const [usuarios, clientes, mascotas] = await Promise.all([
    ctx.payload.find({ collection: 'users', depth: 0, pagination: false, overrideAccess: true, sort: 'name' }),
    ctx.payload.count({ collection: 'clientes', overrideAccess: true }),
    ctx.payload.count({ collection: 'mascotas', overrideAccess: true }),
  ])
  return {
    permisos: { ...ctx.p.clinica, superadmin: ctx.p.superadmin, panel: ctx.p.panel },
    usuario: persona(ctx.user)!,
    equipo: usuarios.docs.map((u) => persona(u)!),
    especies: [...ESPECIES],
    tiposCartilla: TIPOS_CARTILLA,
    tiposNota: TIPOS_NOTA,
    tiposDocumento: TIPOS_DOCUMENTO,
    documentosHabilitados: Boolean(tokenBlobOpcional()),
    totales: { clientes: clientes.totalDocs, mascotas: mascotas.totalDocs },
  }
}

/* ───────────────────────────── búsqueda ───────────────────────────── */

export async function buscar(ctx: Ctx, texto: string, limite = 20): Promise<ResultadoBusqueda> {
  exigir(ctx, 'verPacientes', 'Tu rol no incluye pacientes.')
  const q = texto.trim().slice(0, 80)
  const folio = idDeFolio(q)
  const digitos = q.replace(/\D+/g, '')

  const whereClientes: Where[] = []
  const whereMascotas: Where[] = []
  if (q) {
    whereClientes.push({ nombreCompleto: { like: q } }, { email: { like: q } })
    if (digitos.length >= 4) whereClientes.push({ telefono: { like: digitos } }, { telefonoAlterno: { like: digitos } })
    if (folio && folio.prefijo !== 'MAS') whereClientes.push({ id: { equals: folio.id } })
    whereMascotas.push({ nombre: { like: q } }, { microchip: { like: q } }, { 'tutores.cliente.nombreCompleto': { like: q } })
    if (folio && folio.prefijo !== 'CLI') whereMascotas.push({ id: { equals: folio.id } })
  }
  const [clientes, mascotas] = await Promise.all([
    ctx.payload.find({ collection: 'clientes', depth: 0, limit: limite, sort: 'nombreCompleto', overrideAccess: true, where: whereClientes.length ? { or: whereClientes } : undefined }),
    ctx.payload.find({ collection: 'mascotas', depth: 1, limit: limite, sort: 'nombre', overrideAccess: true, where: whereMascotas.length ? { or: whereMascotas } : undefined }),
  ])
  const idsClientes = clientes.docs.map((c) => c.id)
  const mascotasDeClientes = idsClientes.length
    ? (await ctx.payload.find({ collection: 'mascotas', depth: 0, pagination: false, overrideAccess: true, where: { 'tutores.cliente': { in: idsClientes } } })).docs
    : []
  return {
    clientes: clientes.docs.map((c) => ({
      ...vistaCliente(c),
      mascotas: mascotasDeClientes.filter((m) => (m.tutores ?? []).some((x) => idDe(x.cliente) === c.id)).map((m) => ({ id: m.id, nombre: m.nombre, especie: m.especie })),
    })),
    mascotas: mascotas.docs.map((m) => vistaMascota(m, ctx.hoy)),
  }
}

/* ───────────────────────────── clientes ───────────────────────────── */

const esquemaCliente = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre.').max(120),
  apellidos: z.string().trim().max(120).optional().default(''),
  telefono: z.string().trim().max(30).optional().default(''),
  telefonoAlterno: z.string().trim().max(30).optional().default(''),
  email: z.string().trim().max(160).optional().default(''),
  direccion: z.string().trim().max(600).optional().default(''),
  contactoEmergencia: z.object({ nombre: z.string().trim().max(120).optional().default(''), telefono: z.string().trim().max(30).optional().default('') }).optional(),
  comunicacion: z.object({ avisos: z.boolean().optional(), promociones: z.boolean().optional(), whatsapp: z.boolean().optional(), correo: z.boolean().optional() }).optional(),
  notasInternas: z.string().trim().max(2000).optional().default(''),
  activo: z.boolean().optional(),
  /** Crear aunque haya posibles duplicados (ya se le avisó a la persona). */
  forzar: z.boolean().optional(),
})

function datosCliente(d: z.infer<typeof esquemaCliente>) {
  if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) throw invalido('El correo no parece válido.')
  const tel = d.telefono ? normalizarTelefono(d.telefono) : ''
  if (tel && tel.length < 10) throw invalido('El teléfono debe tener 10 dígitos (con lada).')
  return {
    nombre: d.nombre,
    apellidos: d.apellidos || null,
    telefono: tel || null,
    telefonoAlterno: d.telefonoAlterno ? normalizarTelefono(d.telefonoAlterno) || null : null,
    email: d.email ? d.email.toLowerCase() : null,
    direccion: d.direccion || null,
    contactoEmergencia: { nombre: d.contactoEmergencia?.nombre || null, telefono: d.contactoEmergencia?.telefono ? normalizarTelefono(d.contactoEmergencia.telefono) : null },
    comunicacion: d.comunicacion
      ? { avisos: d.comunicacion.avisos ?? true, promociones: d.comunicacion.promociones ?? false, whatsapp: d.comunicacion.whatsapp ?? true, correo: d.comunicacion.correo ?? true }
      : undefined,
    notasInternas: d.notasInternas || null,
    activo: d.activo ?? true,
  }
}

/** Clientes que comparten teléfono o correo (para avisar antes de crear otro). */
export async function posiblesDuplicados(ctx: Ctx, telefono: string | null, email: string | null, exceptoId?: number): Promise<ClienteVista[]> {
  const or: Where[] = []
  if (telefono) or.push({ telefono: { equals: telefono } }, { telefonoAlterno: { equals: telefono } })
  if (email) or.push({ email: { equals: email } })
  if (!or.length) return []
  const where: Where = exceptoId ? { and: [{ or }, { id: { not_equals: exceptoId } }] } : { or }
  const r = await ctx.payload.find({ collection: 'clientes', depth: 0, limit: 5, overrideAccess: true, where })
  return r.docs.map(vistaCliente)
}

export async function crearCliente(ctx: Ctx, entrada: unknown): Promise<{ cliente: ClienteVista | null; duplicados: ClienteVista[] }> {
  exigir(ctx, 'editarPacientes')
  const d = esquemaCliente.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  const datos = datosCliente(d.data)
  if (!d.data.forzar) {
    const dup = await posiblesDuplicados(ctx, datos.telefono, datos.email)
    if (dup.length) return { cliente: null, duplicados: dup }
  }
  const c = await ctx.payload.create({ collection: 'clientes', overrideAccess: true, data: { ...datos, origen: 'manual' } })
  return { cliente: vistaCliente(c), duplicados: [] }
}

export async function actualizarCliente(ctx: Ctx, id: number, entrada: unknown): Promise<ClienteVista> {
  exigir(ctx, 'editarPacientes')
  const d = esquemaCliente.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  await cargarCliente(ctx, id)
  const c = await ctx.payload.update({ collection: 'clientes', id, overrideAccess: true, data: datosCliente(d.data) })
  return vistaCliente(c)
}

async function cargarCliente(ctx: Ctx, id: number): Promise<Cliente> {
  try {
    return await ctx.payload.findByID({ collection: 'clientes', id, depth: 0, overrideAccess: true })
  } catch {
    throw noEncontrado('No encontramos ese cliente.')
  }
}

async function ultimosPesos(payload: Payload, mascotaIds: number[], acceso?: { user: Tutor }): Promise<Map<number, MasPeso>> {
  const mapa = new Map<number, MasPeso>()
  if (!mascotaIds.length) return mapa
  const r = await payload.find({
    collection: 'mas-pesos',
    depth: 0,
    pagination: false,
    sort: '-fecha',
    where: { mascota: { in: mascotaIds } },
    ...(acceso ? { user: acceso.user, overrideAccess: false } : { overrideAccess: true }),
  })
  for (const p of r.docs) {
    const mid = idDe(p.mascota)!
    if (!mapa.has(mid)) mapa.set(mid, p)
  }
  return mapa
}

export async function fichaCliente(ctx: Ctx, id: number): Promise<FichaCliente> {
  exigir(ctx, 'verPacientes', 'Tu rol no incluye pacientes.')
  const c = await cargarCliente(ctx, id)
  const [mascotas, cuentas, codigos] = await Promise.all([
    ctx.payload.find({ collection: 'mascotas', depth: 1, pagination: false, overrideAccess: true, sort: 'nombre', where: { 'tutores.cliente': { equals: id } } }),
    ctx.payload.find({ collection: 'tutores', depth: 0, pagination: false, overrideAccess: true, where: { cliente: { equals: id } } }),
    ctx.payload.find({
      collection: 'codigos-vinculacion',
      depth: 0,
      pagination: false,
      overrideAccess: true,
      sort: '-expira',
      where: { and: [{ cliente: { equals: id } }, { usadoEn: { exists: false } }, { expira: { greater_than: new Date().toISOString() } }] },
    }),
  ])
  const pesos = await ultimosPesos(ctx.payload, mascotas.docs.map((m) => m.id))
  return {
    cliente: vistaCliente(c),
    mascotas: mascotas.docs.map((m) => vistaMascota(m, ctx.hoy, pesos.get(m.id) ?? null)),
    cuentasPortal: cuentas.docs.map((u): CuentaPortalVista => ({ id: u.id, email: u.email, nombre: u.nombre, vinculadoEn: u.vinculadoEn ?? null })),
    codigosVigentes: codigos.docs.map((k): CodigoVista => ({ codigo: k.codigo, expira: k.expira })),
  }
}

/* ───────────────────────────── mascotas ───────────────────────────── */

const fecha = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Escribe la fecha como AAAA-MM-DD.')
const esquemaMascota = z.object({
  nombre: z.string().trim().min(1, 'Escribe el nombre de la mascota.').max(80),
  especie: z.enum(ESPECIES.map((e) => e.value) as [string, ...string[]]).default('perro'),
  especieOtra: z.string().trim().max(60).optional().default(''),
  raza: z.string().trim().max(80).optional().default(''),
  sexo: z.enum(['macho', 'hembra', 'desconocido']).optional().default('desconocido'),
  esterilizado: z.enum(['si', 'no', 'desconocido']).optional().default('desconocido'),
  color: z.string().trim().max(120).optional().default(''),
  fechaNacimiento: z.union([fecha, z.literal('')]).optional().default(''),
  nacimientoEstimado: z.boolean().optional().default(false),
  microchip: z.string().trim().max(40).optional().default(''),
  alergias: z.string().trim().max(1000).optional().default(''),
  alertasManejo: z.array(z.string().trim().max(200)).optional().default([]),
  medicoTratante: z.number().int().positive().nullable().optional(),
  tutores: z.array(z.object({ clienteId: z.number().int().positive(), principal: z.boolean().optional(), parentesco: z.string().trim().max(60).optional() })).min(1, 'La mascota necesita al menos un tutor.'),
  estado: z.enum(['activo', 'inactivo', 'fallecido']).optional().default('activo'),
  notasInternas: z.string().trim().max(2000).optional().default(''),
  /** Peso de hoy al dar de alta (opcional). */
  pesoKg: z.number().positive().max(500).nullable().optional(),
})

async function datosMascota(ctx: Ctx, d: z.infer<typeof esquemaMascota>) {
  if (d.fechaNacimiento && d.fechaNacimiento > ctx.hoy) throw invalido('La fecha de nacimiento no puede ser futura.')
  for (const tut of d.tutores) await cargarCliente(ctx, tut.clienteId)
  return {
    nombre: d.nombre,
    especie: d.especie as Mascota['especie'],
    especieOtra: d.especie === 'otra' ? d.especieOtra || null : null,
    raza: d.raza || null,
    sexo: d.sexo,
    esterilizado: d.esterilizado,
    color: d.color || null,
    fechaNacimiento: d.fechaNacimiento || null,
    nacimientoEstimado: d.nacimientoEstimado,
    microchip: d.microchip || null,
    alergias: d.alergias || null,
    alertasManejo: d.alertasManejo.filter(Boolean).map((texto) => ({ texto })),
    medicoTratante: d.medicoTratante ?? null,
    tutores: d.tutores.map((x) => ({ cliente: x.clienteId, principal: Boolean(x.principal), parentesco: x.parentesco || null })),
    estado: d.estado,
    notasInternas: d.notasInternas || null,
  }
}

export async function crearMascota(ctx: Ctx, entrada: unknown): Promise<MascotaVista> {
  exigir(ctx, 'editarPacientes')
  const d = esquemaMascota.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  const datos = await datosMascota(ctx, d.data)
  const m = await enTransaccion(ctx, async (req) => {
    const creada = await ctx.payload.create({ collection: 'mascotas', req, overrideAccess: true, depth: 1, data: { ...datos, origen: 'manual' } })
    if (d.data.pesoKg) {
      await ctx.payload.create({ collection: 'mas-pesos', req, overrideAccess: true, data: { mascota: creada.id, fecha: ctx.hoy, kg: d.data.pesoKg, registradoPor: ctx.user.id } })
    }
    return creada
  })
  return vistaMascota(m, ctx.hoy)
}

export async function actualizarMascota(ctx: Ctx, id: number, entrada: unknown): Promise<MascotaVista> {
  exigir(ctx, 'editarPacientes')
  const d = esquemaMascota.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  await cargarMascota(ctx, id)
  const datos = await datosMascota(ctx, d.data)
  const m = await ctx.payload.update({ collection: 'mascotas', id, overrideAccess: true, depth: 1, data: datos })
  return vistaMascota(m, ctx.hoy)
}

async function cargarMascota(ctx: Ctx, id: number): Promise<Mascota> {
  try {
    return await ctx.payload.findByID({ collection: 'mascotas', id, depth: 1, overrideAccess: true })
  } catch {
    throw noEncontrado('No encontramos esa mascota.')
  }
}

export async function expediente(ctx: Ctx, id: number): Promise<Expediente> {
  exigir(ctx, 'verPacientes', 'Tu rol no incluye pacientes.')
  const m = await cargarMascota(ctx, id)
  const [pesos, cartilla, documentos, notas] = await Promise.all([
    ctx.payload.find({ collection: 'mas-pesos', depth: 1, pagination: false, overrideAccess: true, sort: '-fecha', where: { mascota: { equals: id } } }),
    ctx.payload.find({ collection: 'mas-cartilla', depth: 1, pagination: false, overrideAccess: true, sort: '-fechaAplicacion', where: { mascota: { equals: id } } }),
    ctx.payload.find({ collection: 'mas-documentos', depth: 1, pagination: false, overrideAccess: true, sort: '-createdAt', where: { mascota: { equals: id } } }),
    ctx.p.clinica.verExpediente
      ? ctx.payload.find({ collection: 'mas-notas', depth: 1, pagination: false, overrideAccess: true, sort: '-fecha', where: { mascota: { equals: id } } })
      : Promise.resolve(null),
  ])
  return {
    mascota: vistaMascota(m, ctx.hoy, pesos.docs[0] ?? null),
    pesos: pesos.docs.map(vistaPeso),
    cartilla: cartilla.docs.map(vistaCartilla),
    documentos: documentos.docs.map(vistaDocumento),
    notas: notas ? notas.docs.map(vistaNota) : null,
  }
}

/* ───────────────────────────── pesos y cartilla ───────────────────────────── */

export async function agregarPeso(ctx: Ctx, mascotaId: number, entrada: unknown): Promise<PesoVista> {
  exigir(ctx, 'editarPacientes')
  const d = z.object({ fecha: fecha.optional(), kg: z.number().positive('El peso debe ser mayor que cero.').max(500), nota: z.string().trim().max(200).optional().default('') }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  await cargarMascota(ctx, mascotaId)
  const f = d.data.fecha || ctx.hoy
  if (f > ctx.hoy) throw invalido('La fecha del peso no puede ser futura.')
  const p = await ctx.payload.create({ collection: 'mas-pesos', overrideAccess: true, depth: 1, data: { mascota: mascotaId, fecha: f, kg: Math.round(d.data.kg * 100) / 100, nota: d.data.nota || null, registradoPor: ctx.user.id } })
  return vistaPeso(p)
}

const esquemaCartilla = z.object({
  tipo: z.enum(TIPOS_CARTILLA.map((x) => x.value) as [string, ...string[]]).default('vacuna'),
  producto: z.string().trim().min(1, 'Escribe el producto o biológico.').max(120),
  fechaAplicacion: fecha,
  proximaFecha: z.union([fecha, z.literal('')]).optional().default(''),
  lote: z.string().trim().max(60).optional().default(''),
  caducidad: z.string().trim().max(20).optional().default(''),
  aplicadoPor: z.number().int().positive().nullable().optional(),
  aplicadoPorTexto: z.string().trim().max(120).optional().default(''),
  notas: z.string().trim().max(300).optional().default(''),
})

export async function agregarCartilla(ctx: Ctx, mascotaId: number, entrada: unknown): Promise<CartillaVista> {
  exigir(ctx, 'editarPacientes')
  const d = esquemaCartilla.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  await cargarMascota(ctx, mascotaId)
  if (d.data.fechaAplicacion > ctx.hoy) throw invalido('La fecha de aplicación no puede ser futura.')
  const c = await ctx.payload.create({
    collection: 'mas-cartilla',
    overrideAccess: true,
    depth: 1,
    data: {
      mascota: mascotaId,
      tipo: d.data.tipo as MasCartilla['tipo'],
      producto: d.data.producto,
      fechaAplicacion: d.data.fechaAplicacion,
      proximaFecha: d.data.proximaFecha || null,
      lote: d.data.lote || null,
      caducidad: d.data.caducidad || null,
      aplicadoPor: d.data.aplicadoPor ?? (d.data.aplicadoPorTexto ? null : ctx.user.id),
      aplicadoPorTexto: d.data.aplicadoPorTexto || null,
      notas: d.data.notas || null,
      registradoPor: ctx.user.id,
    },
  })
  return vistaCartilla(c)
}

export async function actualizarCartilla(ctx: Ctx, id: number, entrada: unknown): Promise<CartillaVista> {
  exigir(ctx, 'editarPacientes')
  const d = esquemaCartilla.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  const c = await ctx.payload.update({
    collection: 'mas-cartilla',
    id,
    overrideAccess: true,
    depth: 1,
    data: {
      tipo: d.data.tipo as MasCartilla['tipo'],
      producto: d.data.producto,
      fechaAplicacion: d.data.fechaAplicacion,
      proximaFecha: d.data.proximaFecha || null,
      lote: d.data.lote || null,
      caducidad: d.data.caducidad || null,
      aplicadoPor: d.data.aplicadoPor ?? null,
      aplicadoPorTexto: d.data.aplicadoPorTexto || null,
      notas: d.data.notas || null,
    },
  })
  return vistaCartilla(c)
}

/* ───────────────────────────── notas clínicas ───────────────────────────── */

const esquemaNota = z.object({
  fecha: fecha.optional(),
  tipo: z.enum(TIPOS_NOTA.map((x) => x.value) as [string, ...string[]]).default('consulta'),
  titulo: z.string().trim().min(1, 'Escribe el motivo o título.').max(160),
  subjetivo: z.string().trim().max(5000).optional().default(''),
  objetivo: z.string().trim().max(5000).optional().default(''),
  analisis: z.string().trim().max(5000).optional().default(''),
  plan: z.string().trim().max(5000).optional().default(''),
})

export async function crearNota(ctx: Ctx, mascotaId: number, entrada: unknown): Promise<NotaVista> {
  exigir(ctx, 'escribirExpediente', 'Las notas clínicas las escriben los roles con «Escribir expediente».')
  const d = esquemaNota.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  await cargarMascota(ctx, mascotaId)
  const n = await ctx.payload.create({
    collection: 'mas-notas',
    overrideAccess: true,
    depth: 1,
    data: {
      mascota: mascotaId,
      fecha: d.data.fecha || ctx.hoy,
      tipo: d.data.tipo as MasNota['tipo'],
      titulo: d.data.titulo,
      subjetivo: d.data.subjetivo || null,
      objetivo: d.data.objetivo || null,
      analisis: d.data.analisis || null,
      plan: d.data.plan || null,
      autor: ctx.user.id,
      estado: 'borrador',
    },
  })
  return vistaNota(n)
}

async function cargarNota(ctx: Ctx, id: number): Promise<MasNota> {
  try {
    return await ctx.payload.findByID({ collection: 'mas-notas', id, depth: 0, overrideAccess: true })
  } catch {
    throw noEncontrado('No encontramos esa nota.')
  }
}

export async function actualizarNota(ctx: Ctx, id: number, entrada: unknown): Promise<NotaVista> {
  exigir(ctx, 'escribirExpediente')
  const d = esquemaNota.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  const previa = await cargarNota(ctx, id)
  if (previa.estado === 'firmada') throw invalido('La nota está firmada: agrega una adenda en vez de editarla.')
  const n = await ctx.payload.update({
    collection: 'mas-notas',
    id,
    overrideAccess: true,
    depth: 1,
    data: {
      fecha: d.data.fecha || previa.fecha,
      tipo: d.data.tipo as MasNota['tipo'],
      titulo: d.data.titulo,
      subjetivo: d.data.subjetivo || null,
      objetivo: d.data.objetivo || null,
      analisis: d.data.analisis || null,
      plan: d.data.plan || null,
    },
  })
  return vistaNota(n)
}

export async function firmarNota(ctx: Ctx, id: number): Promise<NotaVista> {
  exigir(ctx, 'escribirExpediente')
  const previa = await cargarNota(ctx, id)
  if (previa.estado === 'firmada') return vistaNota(await ctx.payload.findByID({ collection: 'mas-notas', id, depth: 1, overrideAccess: true }))
  /* El hook beforeChange sella firmadaEn y firmadaPor con la sesión de la petición. */
  const n = await ctx.payload.update({ collection: 'mas-notas', id, overrideAccess: true, depth: 1, req: ctx.req, data: { estado: 'firmada' } })
  return vistaNota(n)
}

export async function agregarAdenda(ctx: Ctx, id: number, entrada: unknown): Promise<NotaVista> {
  exigir(ctx, 'escribirExpediente')
  const d = z.object({ motivo: z.string().trim().min(1, 'Escribe el motivo de la adenda.').max(160), texto: z.string().trim().min(1, 'Escribe el texto.').max(5000) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  const previa = await cargarNota(ctx, id)
  if (previa.estado !== 'firmada') throw invalido('Las adendas son para notas firmadas; esta sigue en borrador y se puede editar.')
  const adendas = [...(previa.adendas ?? []).map((a) => ({ motivo: a.motivo, texto: a.texto, fecha: a.fecha, autor: idDe(a.autor) })), { motivo: d.data.motivo, texto: d.data.texto }]
  const n = await ctx.payload.update({ collection: 'mas-notas', id, overrideAccess: true, depth: 1, req: ctx.req, data: { adendas } })
  return vistaNota(n)
}

export async function borrarNota(ctx: Ctx, id: number): Promise<void> {
  exigir(ctx, 'escribirExpediente')
  const previa = await cargarNota(ctx, id)
  if (previa.estado === 'firmada') throw invalido('Una nota firmada no se borra.')
  await ctx.payload.delete({ collection: 'mas-notas', id, overrideAccess: true, req: ctx.req })
}

/* ───────────────────────────── documentos (almacén privado) ───────────────────────────── */

const MAX_BYTES = 15 * 1024 * 1024
const TIPOS_OK = /^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/i

function tokenBlobOpcional(): string | null {
  return process.env.CLINICA_BLOB_READ_WRITE_TOKEN?.trim() || process.env.FINANZAS_BLOB_READ_WRITE_TOKEN?.trim() || null
}
function tokenBlob(): string {
  const tk = tokenBlobOpcional()
  if (!tk) throw new ErrorClinica(503, 'Falta configurar el almacén privado de documentos (CLINICA_BLOB_READ_WRITE_TOKEN). Lo demás funciona; los archivos se podrán subir después.')
  return tk
}

async function subirAlAlmacen(mascotaId: number, archivo: File): Promise<{ ruta: string; nombre: string; tipo: string; tamano: number }> {
  if (!archivo || typeof archivo.arrayBuffer !== 'function') throw invalido('Elige un archivo o toma una foto.')
  if (archivo.size > MAX_BYTES) throw invalido('El archivo pesa más de 15 MB.')
  const tipo = archivo.type || 'application/octet-stream'
  if (!TIPOS_OK.test(tipo)) throw invalido('Solo se aceptan fotos (JPG, PNG, WEBP, HEIC) o PDF.')
  const token = tokenBlob()
  const limpio = (archivo.name || 'documento').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-').slice(-80)
  const subido = await blobPut(`clinica/documentos/${mascotaId}/${limpio}`, archivo, { access: 'private', token, addRandomSuffix: true, contentType: tipo })
  return { ruta: subido.pathname, nombre: archivo.name || limpio, tipo, tamano: archivo.size }
}

const esquemaDocumento = z.object({
  titulo: z.string().trim().min(1, 'Escribe un título.').max(160),
  tipo: z.enum(TIPOS_DOCUMENTO.map((x) => x.value) as [string, ...string[]]).default('otro'),
  fecha: z.union([fecha, z.literal('')]).optional().default(''),
  publicadoAlTutor: z.boolean().optional().default(false),
})

export async function subirDocumento(ctx: Ctx, mascotaId: number, archivo: File, meta: unknown): Promise<DocumentoVista> {
  exigir(ctx, 'editarPacientes')
  const d = esquemaDocumento.safeParse(meta)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  await cargarMascota(ctx, mascotaId)
  const s = await subirAlAlmacen(mascotaId, archivo)
  const doc = await ctx.payload.create({
    collection: 'mas-documentos',
    overrideAccess: true,
    depth: 1,
    data: {
      mascota: mascotaId,
      titulo: d.data.titulo,
      tipo: d.data.tipo as MasDocumento['tipo'],
      fecha: d.data.fecha || ctx.hoy,
      publicadoAlTutor: d.data.publicadoAlTutor,
      origen: 'clinica',
      revision: 'no_aplica',
      ruta: s.ruta,
      nombreArchivo: s.nombre,
      tipoContenido: s.tipo,
      tamano: s.tamano,
      subidoPor: ctx.user.id,
    },
  })
  return vistaDocumento(doc)
}

export async function actualizarDocumento(ctx: Ctx, id: number, entrada: unknown): Promise<DocumentoVista> {
  exigir(ctx, 'editarPacientes')
  const d = z.object({ titulo: z.string().trim().min(1).max(160).optional(), publicadoAlTutor: z.boolean().optional(), revision: z.enum(['no_aplica', 'pendiente', 'revisado']).optional() }).safeParse(entrada)
  if (!d.success) throw invalido('Datos no válidos.')
  const doc = await ctx.payload.update({ collection: 'mas-documentos', id, overrideAccess: true, depth: 1, data: d.data })
  return vistaDocumento(doc)
}

function respuestaArchivo(stream: ReadableStream, tipo: string, nombre: string): Response {
  return new Response(stream, {
    headers: {
      'Content-Type': tipo,
      'Content-Disposition': `inline; filename="${encodeURIComponent(nombre)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  })
}

export async function abrirDocumento(ctx: Ctx, id: number): Promise<Response> {
  exigir(ctx, 'verPacientes', 'Tu rol no incluye pacientes.')
  let d: MasDocumento
  try {
    d = await ctx.payload.findByID({ collection: 'mas-documentos', id, depth: 0, overrideAccess: true })
  } catch {
    throw noEncontrado('No encontramos ese documento.')
  }
  const r = await blobGet(d.ruta, { access: 'private', token: tokenBlob() })
  if (!r || r.statusCode !== 200 || !r.stream) throw noEncontrado('El archivo ya no está en el almacén.')
  return respuestaArchivo(r.stream, r.blob.contentType || d.tipoContenido || 'application/octet-stream', d.nombreArchivo || 'documento')
}

/* ───────────────────────────── vinculación con el portal ───────────────────────────── */

const ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // sin 0/O ni 1/I para dictarlo por teléfono
function codigoAleatorio(): string {
  const bytes = new Uint8Array(6)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join('')
}

export async function generarCodigo(ctx: Ctx, clienteId: number): Promise<CodigoVista> {
  exigir(ctx, 'editarPacientes', 'Los códigos de vinculación los genera quien edita pacientes.')
  await cargarCliente(ctx, clienteId)
  const expira = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
  for (let intento = 0; intento < 5; intento++) {
    const codigo = codigoAleatorio()
    try {
      const k = await ctx.payload.create({ collection: 'codigos-vinculacion', overrideAccess: true, data: { codigo, cliente: clienteId, expira, creadoPor: ctx.user.id } })
      return { codigo: k.codigo, expira: k.expira }
    } catch (e) {
      if (!/unique|duplicate|23505/i.test(String((e as Error)?.message))) throw e
    }
  }
  throw new ErrorClinica(500, 'No se pudo generar un código. Intenta de nuevo.')
}

/**
 * Invitar al portal desde la ficha del cliente: la clínica crea (o liga) la
 * cuenta del tutor con el correo de la ficha y le manda una liga de 7 días
 * para elegir su contraseña. Nadie del equipo conoce ni escribe la
 * contraseña. Si la cuenta ya está en esta ficha, solo reenvía la liga.
 * La liga nunca sale en la respuesta: solo por correo.
 */
export async function invitarAlPortal(ctx: Ctx, clienteId: number, entrada: unknown): Promise<InvitacionVista> {
  exigir(ctx, 'editarPacientes', 'Las invitaciones al portal las manda quien edita pacientes.')
  const cliente = await cargarCliente(ctx, clienteId)
  const d = z.object({ email: z.string().trim().max(200).optional() }).safeParse(entrada ?? {})
  const email = (d.success && d.data.email ? d.data.email : cliente.email ?? '').trim().toLowerCase()
  if (!email) throw invalido('Captura el correo del tutor en la ficha para invitarlo.')
  if (!z.string().email().safeParse(email).success) throw invalido('Ese correo no parece válido.')

  const existentes = await ctx.payload.find({ collection: 'tutores', depth: 0, limit: 1, overrideAccess: true, where: { email: { equals: email } } })
  let tutor = existentes.docs[0] as Tutor | undefined
  let accion: InvitacionVista['accion']
  if (tutor) {
    const ligada = idDe(tutor.cliente)
    if (ligada && ligada !== clienteId) throw new ErrorClinica(409, 'Ese correo ya tiene una cuenta del portal ligada a otro cliente.')
    if (ligada === clienteId) accion = 'reenviada'
    else {
      tutor = (await ctx.payload.update({ collection: 'tutores', id: tutor.id, overrideAccess: true, data: { cliente: clienteId, vinculadoEn: new Date().toISOString() } })) as Tutor
      accion = 'vinculada'
    }
  } else {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    const password = Buffer.from(bytes).toString('base64url') // nadie la conoce: el tutor elige la suya con la liga
    tutor = (await ctx.payload.create({
      collection: 'tutores',
      overrideAccess: true,
      data: {
        email,
        password,
        nombre: [cliente.nombre, cliente.apellidos].filter(Boolean).join(' ').trim() || email,
        telefono: cliente.telefono ?? undefined,
        cliente: clienteId,
        vinculadoEn: new Date().toISOString(),
      },
    })) as Tutor
    accion = 'creada'
  }

  const token = await ctx.payload.forgotPassword({ collection: 'tutores', data: { email }, disableEmail: true })
  if (!token) throw new ErrorClinica(500, 'No se pudo preparar la liga. Intenta de nuevo.')
  await ctx.payload.db.updateOne({
    collection: 'tutores',
    where: { id: { equals: tutor.id } },
    data: { resetPasswordExpiration: new Date(Date.now() + VIGENCIA_INVITACION_MS).toISOString() },
  })
  const mascotas = await mascotasDelCliente(ctx, clienteId)
  const correoEnviado = Boolean(process.env.RESEND_API_KEY?.trim() && process.env.LEADS_FROM_EMAIL?.trim())
  try {
    await ctx.payload.sendEmail({
      to: email,
      subject: `Tu acceso al portal de ${site.brand.name}`,
      html: htmlDeInvitacion({ liga: `${site.url.replace(/\/$/, '')}/portal/restablecer/${token}?bienvenida=1`, nombre: cliente.nombre, mascotas }),
    })
  } catch (e) {
    ctx.payload.logger.error(`[portal] invitación a ${email}: ${String((e as Error)?.message ?? e)}`)
    return { accion, email, correoEnviado: false }
  }
  return { accion, email, correoEnviado }
}

async function mascotasDelCliente(ctx: Ctx, clienteId: number): Promise<string[]> {
  const r = await ctx.payload.find({ collection: 'mascotas', depth: 0, limit: 6, overrideAccess: true, where: { 'tutores.cliente': { equals: clienteId } } }).catch(() => null)
  return (r?.docs ?? []).map((m) => m.nombre).filter(Boolean)
}

export async function desvincularCuenta(ctx: Ctx, tutorId: number): Promise<void> {
  exigir(ctx, 'editarPacientes')
  await ctx.payload.update({ collection: 'tutores', id: tutorId, overrideAccess: true, data: { cliente: null, vinculadoEn: null } })
}

/* ───────────────────────────── PORTAL DEL TUTOR ───────────────────────────── */

const acceso = (c: CtxTutor) => ({ user: c.tutor as Tutor & { collection: 'tutores' }, overrideAccess: false as const })

export async function vincular(c: CtxTutor, entrada: unknown): Promise<{ cliente: ClienteVista }> {
  const d = z.object({ codigo: z.string().trim().min(4).max(12) }).safeParse(entrada)
  if (!d.success) throw invalido('Escribe el código que te dio la clínica.')
  const codigo = d.data.codigo.toUpperCase().replace(/[\s-]+/g, '')
  const r = await c.payload.find({ collection: 'codigos-vinculacion', depth: 0, limit: 1, overrideAccess: true, where: { codigo: { equals: codigo } } })
  const k = r.docs[0]
  if (!k || k.usadoEn || new Date(k.expira).getTime() < Date.now()) throw invalido('Ese código no es válido o ya venció. Pide otro en la clínica.')
  const clienteId = idDe(k.cliente)!
  await c.payload.update({ collection: 'codigos-vinculacion', id: k.id, overrideAccess: true, data: { usadoEn: new Date().toISOString(), usadoPor: c.tutor.id } })
  await c.payload.update({ collection: 'tutores', id: c.tutor.id, overrideAccess: true, data: { cliente: clienteId, vinculadoEn: new Date().toISOString() } })
  const cliente = await c.payload.findByID({ collection: 'clientes', id: clienteId, depth: 0, overrideAccess: true })
  return { cliente: vistaCliente(cliente) }
}

export async function portalResumen(c: CtxTutor): Promise<PortalResumen> {
  const tutor = { id: c.tutor.id, nombre: c.tutor.nombre, email: c.tutor.email, telefono: c.tutor.telefono ?? null }
  const clienteId = idDe(c.tutor.cliente)
  if (!clienteId) return { tutor, cliente: null, mascotas: [] }
  /* Con las reglas de acceso del tutor: solo su ficha y sus mascotas. */
  const [clientes, mascotas] = await Promise.all([
    c.payload.find({ collection: 'clientes', depth: 0, limit: 1, ...acceso(c), where: { id: { equals: clienteId } } }),
    c.payload.find({ collection: 'mascotas', depth: 1, pagination: false, sort: 'nombre', ...acceso(c), where: { estado: { not_equals: 'inactivo' } } }),
  ])
  const ids = mascotas.docs.map((m) => m.id)
  const [pesos, cartilla] = await Promise.all([
    ultimosPesos(c.payload, ids, { user: c.tutor }),
    ids.length
      ? c.payload.find({ collection: 'mas-cartilla', depth: 0, pagination: false, sort: 'proximaFecha', ...acceso(c), where: { and: [{ mascota: { in: ids } }, { proximaFecha: { greater_than_equal: c.hoy }}] } })
      : Promise.resolve({ docs: [] as MasCartilla[] }),
  ])
  return {
    tutor,
    cliente: clientes.docs[0] ? vistaCliente(clientes.docs[0]) : null,
    mascotas: mascotas.docs.map((m) => {
      const prox = cartilla.docs.find((x) => idDe(x.mascota) === m.id)
      return { ...vistaMascota(m, c.hoy, pesos.get(m.id) ?? null), proximaCartilla: prox ? { producto: prox.producto, fecha: prox.proximaFecha! } : null }
    }),
  }
}

export async function portalMascota(c: CtxTutor, id: number): Promise<PortalMascota> {
  const r = await c.payload.find({ collection: 'mascotas', depth: 1, limit: 1, ...acceso(c), where: { id: { equals: id } } })
  const m = r.docs[0]
  if (!m) throw noEncontrado('Esa mascota no está entre las tuyas.')
  const [pesos, cartilla, documentos] = await Promise.all([
    c.payload.find({ collection: 'mas-pesos', depth: 0, pagination: false, sort: '-fecha', ...acceso(c), where: { mascota: { equals: id } } }),
    c.payload.find({ collection: 'mas-cartilla', depth: 1, pagination: false, sort: '-fechaAplicacion', ...acceso(c), where: { mascota: { equals: id } } }),
    c.payload.find({ collection: 'mas-documentos', depth: 0, pagination: false, sort: '-createdAt', ...acceso(c), where: { mascota: { equals: id } } }),
  ])
  return {
    mascota: vistaMascota(m, c.hoy, pesos.docs[0] ?? null),
    pesos: pesos.docs.map(vistaPeso),
    cartilla: cartilla.docs.map(vistaCartilla),
    documentos: documentos.docs.map(vistaDocumento),
  }
}

export async function portalAbrirDocumento(c: CtxTutor, id: number): Promise<Response> {
  const r = await c.payload.find({ collection: 'mas-documentos', depth: 0, limit: 1, ...acceso(c), where: { id: { equals: id } } })
  const d = r.docs[0]
  if (!d) throw noEncontrado('No encontramos ese documento.')
  const b = await blobGet(d.ruta, { access: 'private', token: tokenBlob() })
  if (!b || b.statusCode !== 200 || !b.stream) throw noEncontrado('El archivo ya no está disponible.')
  return respuestaArchivo(b.stream, b.blob.contentType || d.tipoContenido || 'application/octet-stream', d.nombreArchivo || 'documento')
}

export async function portalSubirDocumento(c: CtxTutor, mascotaId: number, archivo: File, meta: unknown): Promise<DocumentoVista> {
  const d = z.object({ titulo: z.string().trim().min(1, 'Escribe de qué es el archivo.').max(160) }).safeParse(meta)
  if (!d.success) throw invalido(d.error.issues[0]?.message || 'Datos no válidos.')
  const r = await c.payload.find({ collection: 'mascotas', depth: 0, limit: 1, ...acceso(c), where: { id: { equals: mascotaId } } })
  if (!r.docs[0]) throw noEncontrado('Esa mascota no está entre las tuyas.')
  const s = await subirAlAlmacen(mascotaId, archivo)
  const doc = await c.payload.create({
    collection: 'mas-documentos',
    overrideAccess: true,
    depth: 0,
    data: {
      mascota: mascotaId,
      titulo: d.data.titulo,
      tipo: 'otro',
      fecha: c.hoy,
      publicadoAlTutor: false,
      origen: 'tutor',
      revision: 'pendiente',
      ruta: s.ruta,
      nombreArchivo: s.nombre,
      tipoContenido: s.tipo,
      tamano: s.tamano,
      subidoPorTutor: c.tutor.id,
    },
  })
  return vistaDocumento(doc)
}
