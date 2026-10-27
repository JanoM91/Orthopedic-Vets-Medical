import crypto from 'crypto'
import type { PayloadRequest, Where } from 'payload'
import { z } from 'zod'

import type { Cliente, FarLibroControl, FarLote, FarPresentacion, FarProducto, FarReceta, FarVenta, Mascota, Rol, User } from '../../payload-types'
import { folioParaId } from '../../collections/farmacia/acceso'
import { anular as anularEnFinanzas, type Ctx as CtxFinanzas, liquidar as liquidarEnFinanzas, registrar as registrarEnFinanzas } from '../finanzas/servicio'
import { aCentavos, aPesos, saldoDeCuenta } from '../finanzas/reglas'
import { calcularPermisos, type Permisos, type RolGuardado } from '../permisosBase'
import { rateLimit } from '../rateLimit'
import { site } from '../site'
import { escapar, pacienteDe, recetaVigente, renglonQueCubre, tutorDe } from './recetas'
import { almacenPorOmision, type Ctx, enTransaccion, ErrorFarmacia, idDe, leerConfiguracion, registrarMovimiento } from './servicio'
import type { AsientoLibroVista, CierreVista, ConfiguracionVista, MetodoPagoVista, PacienteVenta, ProblemaMascota, VentaBreve, VentaVista } from './tipos'
import { ErrorConCodigo, esFecha, invalido, n0, noEncontrado, nOpc, persona, prohibido, r3, revisarContraMascota, t } from './util'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Venta de mostrador, libro de control y cierre del día (fase 3)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * UNA VENTA, EN ORDEN (todo en el servidor; la pantalla solo propone):
 *   1. Idempotencia: la pantalla manda una `clave` por intento de cobro; si ya
 *      existe una venta con esa clave se devuelve la misma (un doble clic o un
 *      reintento por mala señal no cobra dos veces).
 *   2. Permisos por renglón: descuento → «Aplicar descuentos»; Grupo I y II →
 *      «Validar recetas y despachar». Si quien vende no los tiene, la venta
 *      puede llevar la contraseña de un encargado (`autorizacion`), que se
 *      verifica contra su usuario en ese momento. Nada se guarda de ella.
 *   3. Mascota (si la venta la trae): especie, rango de peso, edad mínima y
 *      alergias. Choque → 400 `mascota`, salvo que el encargado autorice con
 *      motivo. Peso de más de 90 días en productos por rango → 409
 *      `confirmar_peso`. El sistema nunca calcula dosis.
 *   4. Receta: Grupo II exige receta válida y vigente que cubra el producto
 *      con surtidos disponibles; Grupo I además folio cuantificado y el
 *      original físico recibido, y genera el asiento del libro de control.
 *   5. Pagos: deben sumar exactamente el total. El efectivo puede recibir más
 *      (da cambio); la transferencia queda «por confirmar».
 *   6. Inventario por FEFO dentro de una transacción con candado por lote:
 *      el lote no vencido ni bloqueado que caduca primero. Un lote vencido
 *      nunca se vende.
 *   7. Finanzas, después de la transacción: entrada pendiente por el total
 *      (clave `venta-<id>`) y un cobro por cada pago confirmado (clave
 *      `venta-<id>-pago-<n>`), en la cuenta del método de pago. Si Finanzas
 *      falla, la venta ya quedó y se reintenta sin duplicar.
 */

type CtxFin = CtxFinanzas
function ctxFinanzas(ctx: Ctx): CtxFin {
  /* El sistema registra la entrada aunque quien vende no tenga permisos de Finanzas (igual que el cargo de una cita y el gasto de una compra). */
  return { payload: ctx.payload, req: ctx.req, user: ctx.user, p: calcularPermisos({ esSuperadmin: true }, null), hoy: ctx.hoy }
}

function exigir(ctx: Ctx, permiso: keyof Permisos['farmacia'], mensaje?: string): void {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!ctx.p.farmacia[permiso]) throw prohibido(mensaje)
}

const c = (pesos: number) => aCentavos(pesos) || 0

/* ───────────────────────────── autorización del encargado ───────────────────────────── */

type Autorizador = { usuario: User; p: Permisos }

/**
 * Verifica correo y contraseña de quien autoriza con el mismo algoritmo que
 * Payload (pbkdf2-sha256, 25 000 iteraciones; node_modules/payload/dist/auth/
 * strategies/local/authenticate.js), sin abrir una sesión nueva. Límite de 8
 * intentos por vendedor cada 10 minutos.
 */
async function verificarAutorizador(ctx: Ctx, cred: { correo: string; contrasena: string }): Promise<Autorizador> {
  if (!rateLimit(`autoriza:${ctx.user.id}`, 8, 10 * 60 * 1000)) throw new ErrorFarmacia(429, 'Demasiados intentos de autorización. Espera unos minutos.')
  const fallo = () => new ErrorConCodigo(403, 'Correo o contraseña del encargado incorrectos.', 'autorizacion')
  const r = await ctx.payload.find({ collection: 'users', depth: 0, limit: 1, overrideAccess: true, showHiddenFields: true, where: { email: { equals: cred.correo.trim().toLowerCase() } } })
  const u = r.docs[0] as (User & { hash?: string; salt?: string; lockUntil?: string | null }) | undefined
  if (!u || typeof u.hash !== 'string' || typeof u.salt !== 'string') throw fallo()
  if (u.lockUntil && Date.parse(u.lockUntil) > Date.now()) throw new ErrorConCodigo(403, 'La cuenta de ese encargado está bloqueada temporalmente.', 'autorizacion')
  const calculado = await new Promise<Buffer>((ok, mal) => crypto.pbkdf2(cred.contrasena, u.salt!, 25000, 512, 'sha256', (e, b) => (e ? mal(e) : ok(b))))
  const guardado = Buffer.from(u.hash, 'hex')
  if (calculado.length !== guardado.length || !crypto.timingSafeEqual(calculado, guardado)) throw fallo()
  const rol = idDe(u.rolDeAcceso) ? ((await ctx.payload.findByID({ collection: 'roles', id: idDe(u.rolDeAcceso)!, depth: 0, overrideAccess: true }).catch(() => null)) as Rol | null) : null
  return { usuario: u, p: calcularPermisos(u, rol as unknown as RolGuardado | null) }
}

/* ───────────────────────────── vistas ───────────────────────────── */

const nombreCliente = (x: Cliente) => [x.nombre, x.apellidos].filter(Boolean).join(' ').trim() || x.nombre

function vistaVenta(ctx: Ctx, v: FarVenta, recetaFolio: (id: number) => string = (id) => folioParaId('REC', id)): VentaVista {
  const verCostos = ctx.p.farmacia.verCostos
  const cli = typeof v.cliente === 'object' && v.cliente ? (v.cliente as Cliente) : null
  const mas = typeof v.mascota === 'object' && v.mascota ? (v.mascota as Mascota) : null
  const ing = v.ingresoFinanzas
  const pagos = (v.pagos ?? []).map((p, i) => ({
    indice: i,
    metodo: p.metodo,
    etiqueta: p.etiqueta || p.metodo,
    tipo: p.tipo || 'otro',
    monto: p.monto,
    recibido: nOpc(p.recibido),
    cambio: nOpc(p.cambio),
    cuentaId: idDe(p.cuenta),
    referencia: t(p.referencia),
    estado: p.estado,
    confirmadoPor: persona(p.confirmadoPor),
    confirmadoEn: p.confirmadoEn ?? null,
  }))
  const vista: VentaVista = {
    id: v.id,
    folio: folioParaId('VTA', v.id),
    canal: v.canal,
    estado: v.estado,
    dia: v.dia,
    cliente: cli ? { id: cli.id, nombre: nombreCliente(cli), email: t(cli.email) } : null,
    mascota: mas ? { id: mas.id, nombre: mas.nombre, folio: folioParaId('MAS', mas.id) } : null,
    pesoUsadoKg: nOpc(v.pesoUsadoKg),
    renglones: (v.renglones ?? []).map((r) => {
      const x: VentaVista['renglones'][number] = {
        id: r.id ?? null,
        presentacionId: idDe(r.presentacion)!,
        productoId: idDe(r.producto)!,
        descripcion: r.descripcion,
        grupo: t(r.grupo),
        cantidad: r.cantidad,
        factor: r.factor,
        unidades: r.unidades,
        precioUnitario: r.precioUnitario,
        descuentoPorciento: n0(r.descuentoPorciento),
        importe: r.importe,
        lotes: (r.lotes ?? []).map((l) => ({ loteId: idDe(l.lote)!, numeroLote: t(l.numeroLote), caducidad: t(l.caducidad), unidades: l.unidades })),
        recetaId: idDe(r.receta),
        recetaFolio: idDe(r.receta) ? recetaFolio(idDe(r.receta)!) : null,
        folioCuantificado: t(r.folioCuantificado),
        autorizacionMascota: t(r.autorizacionMascota),
      }
      if (verCostos) x.costo = nOpc(r.costo)
      return x
    }),
    subtotal: v.subtotal,
    descuento: n0(v.descuento),
    total: v.total,
    pagos,
    cambio: aPesos(pagos.reduce((a, p) => a + c(p.cambio ?? 0), 0)),
    vendedor: persona(v.vendedor),
    autorizoDescuento: persona(v.autorizoDescuento),
    autorizo: persona(v.autorizo),
    ingresoFinanzasId: idDe(ing),
    ingresoFolio: typeof ing === 'object' && ing ? (ing.folio ?? null) : null,
    correoTicket: t(v.correoTicket),
    notas: t(v.notas),
    anuladaPor: persona(v.anuladaPor),
    anuladaEn: v.anuladaEn ?? null,
    motivoAnulacion: t(v.motivoAnulacion),
    creadoEn: v.createdAt,
  }
  if (verCostos) {
    vista.costoTotal = nOpc(v.costoTotal)
    vista.margen = vista.costoTotal != null ? aPesos(c(v.total) - c(vista.costoTotal)) : null
  }
  return vista
}

async function cargar(ctx: Ctx, id: number): Promise<FarVenta> {
  const v = await ctx.payload.findByID({ collection: 'far-ventas', id, depth: 1, overrideAccess: true }).catch(() => null)
  if (!v) throw noEncontrado('No encontramos esa venta.')
  return v
}

export async function venta(ctx: Ctx, id: number): Promise<VentaVista> {
  exigir(ctx, 'vender', 'Tu rol no incluye la venta de mostrador.')
  return vistaVenta(ctx, await cargar(ctx, id))
}

export async function ventas(ctx: Ctx, f: { dia?: string | null; estado?: string | null; q?: string | null }): Promise<{ ventas: VentaBreve[]; total: number; suma: number }> {
  exigir(ctx, 'vender', 'Tu rol no incluye la venta de mostrador.')
  const where: Where[] = []
  if (f.dia && esFecha(f.dia)) where.push({ dia: { equals: f.dia } })
  if (f.estado && ['pagada', 'por_confirmar', 'anulada'].includes(f.estado)) where.push({ estado: { equals: f.estado } })
  const q = (f.q ?? '').trim()
  if (q) {
    const m = q.toUpperCase().match(/^(VTA)?[\s-]*0*(\d{1,9})$/)
    const o: Where[] = [{ 'renglones.descripcion': { like: q } }]
    if (m) o.push({ id: { equals: Number(m[2]) } })
    where.push({ or: o })
  }
  const r = await ctx.payload.find({ collection: 'far-ventas', depth: 1, limit: 100, overrideAccess: true, sort: '-createdAt', where: where.length ? { and: where } : undefined })
  const lista = r.docs.map((v) => {
    const x = vistaVenta(ctx, v)
    return { id: x.id, folio: x.folio, estado: x.estado, dia: x.dia, total: x.total, cliente: x.cliente, mascota: x.mascota, vendedor: x.vendedor, ingresoFolio: x.ingresoFolio, creadoEn: x.creadoEn, renglones: x.renglones.length, metodos: [...new Set(x.pagos.map((p) => p.etiqueta))] }
  })
  return { ventas: lista, total: r.totalDocs, suma: aPesos(lista.filter((x) => x.estado !== 'anulada').reduce((a, x) => a + c(x.total), 0)) }
}

/* ───────────────────────────── registrar ───────────────────────────── */

const esquemaVenta = z.object({
  clave: z.string().trim().min(8, 'Falta la clave del intento de cobro.').max(80),
  clienteId: z.coerce.number().int().positive().nullable().optional(),
  mascotaId: z.coerce.number().int().positive().nullable().optional(),
  pesoConfirmadoKg: z.coerce.number().positive().max(500).nullable().optional(),
  renglones: z
    .array(
      z.object({
        presentacionId: z.coerce.number().int().positive(),
        cantidad: z.coerce.number().positive('La cantidad debe ser mayor que cero.').max(10000),
        descuentoPorciento: z.coerce.number().min(0).max(100).default(0),
        recetaId: z.coerce.number().int().positive().nullable().optional(),
        folioCuantificado: z.string().trim().max(60).nullable().optional(),
        originalRecibido: z.boolean().optional(),
        /** Motivo con el que el encargado autoriza un choque con la mascota. */
        autorizarMascota: z.string().trim().max(200).nullable().optional(),
      }),
    )
    .min(1, 'Agrega al menos un producto.')
    .max(60),
  pagos: z
    .array(
      z.object({
        metodo: z.string().trim().min(1),
        monto: z.coerce.number().positive('Cada pago debe ser mayor que cero.'),
        recibido: z.coerce.number().positive().nullable().optional(),
        referencia: z.string().trim().max(80).nullable().optional(),
      }),
    )
    .max(6)
    .default([]),
  autorizacion: z.object({ correo: z.string().trim().min(3), contrasena: z.string().min(1) }).nullable().optional(),
  correoTicket: z.string().trim().email('El correo para el ticket no es válido.').nullable().optional(),
  notas: z.string().trim().max(500).nullable().optional(),
})

type Plan = {
  pres: FarPresentacion
  prod: FarProducto
  cantidad: number
  unidades: number
  precioC: number
  descuento: number
  importeC: number
  receta: FarReceta | null
  renglonRecetaId: string | null
  folioCuantificado: string | null
  marcarOriginal: boolean
  autorizacionMascota: string | null
}

const MEDIO: Record<MetodoPagoVista['tipo'], 'efectivo' | 'tarjeta' | 'transferencia' | null> = { efectivo: 'efectivo', terminal: 'tarjeta', transferencia: 'transferencia', otro: null }

export async function registrarVenta(ctx: Ctx, entrada: unknown): Promise<VentaVista & { duplicado: boolean; finanzas: 'registrado' | 'pendiente' | 'sin_importe'; avisos: string[] }> {
  exigir(ctx, 'vender', 'Tu rol no incluye la venta de mostrador.')
  const d = esquemaVenta.safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Datos no válidos.')
  const v = d.data

  const ya = await ctx.payload.find({ collection: 'far-ventas', depth: 1, limit: 1, overrideAccess: true, where: { claveIdempotencia: { equals: v.clave } } })
  if (ya.docs[0]) return { ...vistaVenta(ctx, ya.docs[0]), duplicado: true, finanzas: idDe(ya.docs[0].ingresoFinanzas) ? 'registrado' : 'pendiente', avisos: [] }

  const cfg = await leerConfiguracion(ctx.payload)
  const almacen = await almacenPorOmision(ctx.payload)
  const avisos: string[] = []

  /* Quien autoriza (si hace falta): se verifica una sola vez, y solo si se pidió. */
  let aut: Autorizador | null = null
  const puede = async (perm: keyof Permisos['farmacia'], que: string): Promise<User> => {
    if (ctx.p.farmacia[perm]) return ctx.user
    if (!v.autorizacion) throw new ErrorConCodigo(403, `${que} necesita la autorización de un encargado: pide su correo y contraseña.`, 'autorizacion', { permiso: perm })
    aut = aut ?? (await verificarAutorizador(ctx, v.autorizacion))
    if (!aut.p.farmacia[perm]) throw new ErrorConCodigo(403, `${aut.usuario.name || 'Esa persona'} no tiene permiso para autorizar: ${que.toLowerCase()}.`, 'autorizacion', { permiso: perm })
    return aut.usuario
  }

  /* Mascota y tutor */
  let paciente: PacienteVenta | null = null
  if (v.mascotaId) paciente = (await pacienteDe(ctx, v.mascotaId)).paciente
  let clienteId: number | null = v.clienteId ?? paciente?.cliente?.id ?? null
  if (v.clienteId && ctx.modulos.clinica) {
    const cli = await ctx.payload.findByID({ collection: 'clientes', id: v.clienteId, depth: 0, overrideAccess: true }).catch(() => null)
    if (!cli) throw invalido('Ese cliente no existe.')
  } else if (!ctx.modulos.clinica) clienteId = null

  /* Presentaciones */
  const presIds = [...new Set(v.renglones.map((r) => r.presentacionId))]
  const presDocs = await ctx.payload.find({ collection: 'far-presentaciones', depth: 1, pagination: false, overrideAccess: true, where: { id: { in: presIds } } })
  const presPorId = new Map(presDocs.docs.map((p) => [p.id, p]))

  let autorizoDescuento: User | null = null
  let autorizo: User | null = null
  const problemasBloqueantes: { producto: string; problemas: ProblemaMascota[] }[] = []
  let pideConfirmarPeso: string | null = null
  const planes: Plan[] = []

  for (const [i, r] of v.renglones.entries()) {
    const pres = presPorId.get(r.presentacionId)
    if (!pres || typeof pres.producto !== 'object') throw invalido(`Renglón ${i + 1}: esa presentación no existe.`)
    const prod = pres.producto as FarProducto
    if (!pres.activa || !prod.activo) throw invalido(`${prod.nombre} · ${pres.nombre} está desactivado y no se vende.`)
    if (!pres.fraccionada && !Number.isInteger(r.cantidad)) throw invalido(`${prod.nombre} · ${pres.nombre} no se vende fraccionado: la cantidad va en piezas enteras.`)
    const precioC = c(pres.precio)
    const brutoC = Math.round(precioC * r.cantidad)
    const descuento = Math.round(r.descuentoPorciento * 100) / 100
    if (descuento > 0) autorizoDescuento = await puede('descuentos', 'Un descuento')
    const importeC = brutoC - Math.round((brutoC * descuento) / 100)

    /* Validación contra la mascota */
    let autorizacionMascota: string | null = null
    if (paciente) {
      const problemas = revisarContraMascota(prod, paciente, v.pesoConfirmadoKg)
      const peso = problemas.find((p) => p.tipo === 'peso_viejo' || p.tipo === 'sin_peso')
      if (peso) pideConfirmarPeso = pideConfirmarPeso ?? peso.mensaje
      const duros = problemas.filter((p) => p.tipo !== 'peso_viejo' && p.tipo !== 'sin_peso')
      if (duros.length) {
        const motivo = t(r.autorizarMascota)
        if (!motivo || motivo.length < 5) {
          problemasBloqueantes.push({ producto: `${prod.nombre} · ${pres.nombre}`, problemas: duros })
          continue
        } else {
          const quien = await puede('recetas', 'Vender algo incompatible con la mascota')
          autorizo = quien
          autorizacionMascota = `${motivo} · autorizó ${quien.name || quien.email} · ${duros.map((x) => x.tipo).join(', ')}`
        }
      }
    }

    /* Receta (Grupo I y II) */
    let receta: FarReceta | null = null
    let renglonRecetaId: string | null = null
    let folioCuantificado: string | null = null
    let marcarOriginal = false
    if (prod.grupo === 'I' || prod.grupo === 'II') {
      autorizo = autorizo ?? (await puede('recetas', `Despachar ${prod.nombre} (Grupo ${prod.grupo})`))
      if (!r.recetaId) throw invalido(`${prod.nombre} es Grupo ${prod.grupo}: liga una receta válida.`)
      receta = await ctx.payload.findByID({ collection: 'far-recetas', id: r.recetaId, depth: 0, overrideAccess: true }).catch(() => null)
      if (!receta) throw invalido(`La receta ${folioParaId('REC', r.recetaId)} no existe.`)
      const fr = folioParaId('REC', receta.id)
      if (!recetaVigente(receta, ctx.hoy)) throw invalido(receta.estado !== 'valida' ? `La receta ${fr} no está válida (está ${receta.estado.replace('_', ' ')}).` : `La receta ${fr} venció el ${receta.vigenteHasta}.`)
      if (paciente && idDe(receta.mascota) && idDe(receta.mascota) !== paciente.mascotaId) throw invalido(`La receta ${fr} es de otra mascota.`)
      const reng = renglonQueCubre(receta, prod)
      if (!reng) throw invalido(`La receta ${fr} no incluye ${prod.nombre}.`)
      const usados = nOpc(reng.surtidosUsados) ?? 0
      const permitidos = nOpc(reng.surtidosPermitidos) ?? 1
      const yaEnEstaVenta = planes.filter((p) => p.receta?.id === receta!.id && p.renglonRecetaId === (reng.id ?? null)).length
      if (usados + (yaEnEstaVenta ? 0 : 1) > permitidos) throw invalido(`La receta ${fr} ya no tiene surtidos para ${prod.nombre} (${usados} de ${permitidos}).`)
      renglonRecetaId = reng.id ?? null
      if (prod.grupo === 'II' && receta.origen === 'externa' && cfg.exigirOriginalGrupoII && !receta.originalRecibido && !r.originalRecibido) throw invalido(`La receta ${fr} es externa: recibe el original físico antes de surtir (Configuración → exigir original en Grupo II).`)
      if (prod.grupo === 'II' && receta.origen === 'externa' && !receta.originalRecibido && !r.originalRecibido) avisos.push(`El original de la receta ${fr} sigue pendiente.`)
      if (prod.grupo === 'I') {
        folioCuantificado = t(receta.folioCuantificado) ?? t(r.folioCuantificado)
        if (!folioCuantificado) throw invalido(`${prod.nombre} es Grupo I: falta el folio de la receta cuantificada (SENASICA).`)
        if (!receta.originalRecibido && !r.originalRecibido) throw invalido(`${prod.nombre} es Grupo I: marca «original recibido» (la farmacia conserva el original cancelado).`)
        if (!idDe(receta.mascota) && !t(receta.pacienteTexto)) throw invalido(`La receta ${fr} no dice el animal de destino (lo pide el libro de control).`)
      }
      marcarOriginal = Boolean(r.originalRecibido) && !receta.originalRecibido
      if (!paciente && idDe(receta.mascota)) paciente = (await pacienteDe(ctx, idDe(receta.mascota)!)).paciente
    }

    planes.push({ pres, prod, cantidad: r.cantidad, unidades: r3(r.cantidad * n0(pres.factor)), precioC, descuento, importeC, receta, renglonRecetaId, folioCuantificado, marcarOriginal, autorizacionMascota })
  }

  if (problemasBloqueantes.length) {
    throw new ErrorConCodigo(400, `No se puede vender a ${paciente?.nombre ?? 'esta mascota'}: ${problemasBloqueantes.map((x) => x.problemas.map((p) => p.mensaje).join(' ')).join(' ')} El encargado puede autorizar con motivo.`, 'mascota', problemasBloqueantes)
  }
  if (pideConfirmarPeso && !v.pesoConfirmadoKg) throw new ErrorConCodigo(409, pideConfirmarPeso, 'confirmar_peso', { pesoKg: paciente?.pesoKg ?? null, pesoFecha: paciente?.pesoFecha ?? null })

  /* Pagos */
  const subtotalC = planes.reduce((a, p) => a + Math.round(p.precioC * p.cantidad), 0)
  const totalC = planes.reduce((a, p) => a + p.importeC, 0)
  const pagos: NonNullable<FarVenta['pagos']> = []
  let sumaC = 0
  for (const p of v.pagos) {
    const m = cfg.metodosPago.find((x) => x.clave === p.metodo && x.activo)
    if (!m) throw invalido(`El método de pago «${p.metodo}» no existe o está desactivado.`)
    if (!m.cuentaId) throw invalido(`El método «${m.nombre}» no tiene cuenta de Finanzas: elígela en Farmacia → Configuración → Métodos de pago.`)
    const montoC = c(p.monto)
    let recibidoC: number | null = null
    if (p.recibido != null) {
      if (m.tipo !== 'efectivo') throw invalido(`Solo el efectivo da cambio («${m.nombre}» no).`)
      recibidoC = c(p.recibido)
      if (recibidoC < montoC) throw invalido(`Recibiste ${fmt(recibidoC)} en efectivo y el pago es de ${fmt(montoC)}.`)
    }
    sumaC += montoC
    pagos.push({
      metodo: m.clave,
      etiqueta: m.nombre,
      tipo: m.tipo,
      monto: aPesos(montoC),
      recibido: recibidoC != null ? aPesos(recibidoC) : null,
      cambio: recibidoC != null ? aPesos(recibidoC - montoC) : null,
      cuenta: m.cuentaId,
      referencia: t(p.referencia),
      estado: m.porConfirmar ? 'por_confirmar' : 'confirmado',
      confirmadoPor: m.porConfirmar ? null : ctx.user.id,
      confirmadoEn: m.porConfirmar ? null : new Date().toISOString(),
    })
  }
  if (totalC > 0 && sumaC !== totalC) throw invalido(sumaC < totalC ? `Faltan ${fmt(totalC - sumaC)} por cobrar (total ${fmt(totalC)}).` : `Los pagos (${fmt(sumaC)}) suman más que el total (${fmt(totalC)}). Si es efectivo, escribe lo recibido aparte para dar cambio.`)
  if (totalC === 0 && pagos.length) throw invalido('La venta queda en cero: no lleva pagos.')

  /* Candidatos FEFO (para el candado, antes de abrir la transacción) */
  const prodIds = [...new Set(planes.map((p) => p.prod.id))]
  const candidatos = await ctx.payload.find({ collection: 'far-lotes', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ producto: { in: prodIds } }, { almacen: { equals: almacen.id } }, { existencia: { greater_than: 0 } }] }, select: { numeroLote: true } })
  const lotesACandar = candidatos.docs.map((l) => l.id)

  const creada = await enTransaccion(
    ctx,
    async (req) => {
      const doc = await ctx.payload.create({
        collection: 'far-ventas',
        overrideAccess: true,
        req,
        depth: 0,
        data: {
          canal: 'mostrador',
          estado: pagos.some((p) => p.estado === 'por_confirmar') ? 'por_confirmar' : 'pagada',
          claveIdempotencia: v.clave,
          dia: ctx.hoy,
          almacen: almacen.id,
          cliente: clienteId,
          mascota: paciente?.mascotaId ?? null,
          pesoUsadoKg: v.pesoConfirmadoKg ?? paciente?.pesoKg ?? null,
          renglones: [],
          subtotal: aPesos(subtotalC),
          descuento: aPesos(subtotalC - totalC),
          total: aPesos(totalC),
          pagos,
          vendedor: ctx.user.id,
          autorizoDescuento: autorizoDescuento && autorizoDescuento.id !== ctx.user.id ? autorizoDescuento.id : null,
          autorizo: autorizo && autorizo.id !== ctx.user.id ? autorizo.id : null,
          correoTicket: t(v.correoTicket),
          notas: t(v.notas),
        },
      })
      const folio = folioParaId('VTA', doc.id)
      const renglones: NonNullable<FarVenta['renglones']> = []
      let costoC = 0
      /* Existencia viva de los lotes candidatos (ya con candado). */
      const vivos = await ctx.payload.find({ collection: 'far-lotes', depth: 0, pagination: false, overrideAccess: true, req, sort: 'caducidad', where: { and: [{ producto: { in: prodIds } }, { almacen: { equals: almacen.id } }, { existencia: { greater_than: 0 } }] } })
      const disponible = new Map<number, number>(vivos.docs.map((l) => [l.id, n0(l.existencia)]))
      for (const p of planes) {
        const lotes = vivos.docs
          .filter((l) => idDe(l.producto) === p.prod.id && !l.bloqueado && l.caducidad >= ctx.hoy)
          .sort((a, b) => (a.caducidad === b.caducidad ? a.id - b.id : a.caducidad < b.caducidad ? -1 : 1))
        let falta = p.unidades
        const usados: { lote: FarLote; unidades: number }[] = []
        for (const l of lotes) {
          if (falta <= 1e-9) break
          const hay = disponible.get(l.id) ?? 0
          if (hay <= 1e-9) continue
          const toma = r3(Math.min(hay, falta))
          usados.push({ lote: l, unidades: toma })
          disponible.set(l.id, r3(hay - toma))
          falta = r3(falta - toma)
        }
        if (falta > 1e-9) {
          const vendible = r3(lotes.reduce((a, l) => a + (disponible.get(l.id) ?? 0), 0) + p.unidades - falta)
          throw invalido(`No alcanza ${p.prod.nombre}: se piden ${p.unidades} ${p.prod.unidadBase} y hay ${r3(vendible)} vendibles (los lotes vencidos o bloqueados no se venden).`)
        }
        let costoRenglonC = 0
        for (const u of usados) {
          await registrarMovimiento(ctx, req, { tipo: 'venta', loteId: u.lote.id, cantidad: -u.unidades, referencia: folio })
          costoRenglonC += Math.round(u.unidades * c(n0(u.lote.costoUnidad)))
        }
        costoC += costoRenglonC
        renglones.push({
          presentacion: p.pres.id,
          producto: p.prod.id,
          descripcion: `${p.prod.nombre} · ${p.pres.nombre}`,
          grupo: p.prod.grupo,
          cantidad: p.cantidad,
          factor: n0(p.pres.factor),
          unidades: p.unidades,
          precioUnitario: aPesos(p.precioC),
          descuentoPorciento: p.descuento,
          importe: aPesos(p.importeC),
          costo: aPesos(costoRenglonC),
          lotes: usados.map((u) => ({ lote: u.lote.id, numeroLote: u.lote.numeroLote, caducidad: u.lote.caducidad, unidades: u.unidades })),
          receta: p.receta?.id ?? null,
          folioCuantificado: p.folioCuantificado,
          autorizacionMascota: p.autorizacionMascota,
        })
        /* Libro de control: un asiento por lote de cada salida de Grupo I. */
        if (p.prod.grupo === 'I' && p.receta) {
          for (const u of usados) {
            await ctx.payload.create({
              collection: 'far-libro-control',
              overrideAccess: true,
              req,
              depth: 0,
              data: {
                tipo: 'salida',
                venta: doc.id,
                laboratorio: t(p.prod.laboratorio),
                producto: p.prod.nombre,
                productoRef: p.prod.id,
                registroSenasica: t(p.prod.registroSenasica),
                lote: u.lote.id,
                numeroLote: u.lote.numeroLote,
                fechaCompra: u.lote.createdAt.slice(0, 10),
                folioReceta: p.folioCuantificado!,
                receta: p.receta.id,
                mvz: [p.receta.mvzNombre, t(p.receta.mvzCedula) ? `céd. ${p.receta.mvzCedula}` : null].filter(Boolean).join(' · '),
                fechaUso: ctx.hoy,
                cantidad: u.unidades,
                unidad: p.prod.unidadBase,
                animal: paciente ? `${paciente.nombre} (${paciente.folio}, ${paciente.especie})` : t(p.receta.pacienteTexto),
                mascota: paciente?.mascotaId ?? idDe(p.receta.mascota),
                usuario: ctx.user.id,
              },
            })
          }
        }
      }
      /* Recetas: un surtido por renglón de receta usado en esta venta, y el original si se recibió. */
      const porReceta = new Map<number, { receta: FarReceta; renglones: Set<string>; original: boolean }>()
      for (const p of planes) {
        if (!p.receta) continue
        const x = porReceta.get(p.receta.id) ?? { receta: p.receta, renglones: new Set<string>(), original: false }
        if (p.renglonRecetaId) x.renglones.add(p.renglonRecetaId)
        x.original = x.original || p.marcarOriginal
        porReceta.set(p.receta.id, x)
      }
      for (const { receta, renglones: rs, original } of porReceta.values()) {
        const fresca = await ctx.payload.findByID({ collection: 'far-recetas', id: receta.id, depth: 0, overrideAccess: true, req })
        const data: Record<string, unknown> = {
          renglones: (fresca.renglones ?? []).map((x) => ({ ...x, producto: idDe(x.producto), surtidosUsados: (nOpc(x.surtidosUsados) ?? 0) + (x.id && rs.has(x.id) ? 1 : 0) })),
        }
        if (original) Object.assign(data, { originalRecibido: true, originalRecibidoPor: ctx.user.id, originalRecibidoEn: new Date().toISOString() })
        await ctx.payload.update({ collection: 'far-recetas', id: receta.id, overrideAccess: true, req, depth: 0, data })
      }
      await ctx.payload.update({ collection: 'far-ventas', id: doc.id, overrideAccess: true, req, depth: 0, data: { renglones, costoTotal: aPesos(costoC) } })
      return doc.id
    },
    lotesACandar,
  ).catch(async (e) => {
    /* Dos cobros simultáneos con la misma clave: la base rechaza el segundo. */
    if (/claveIdempotencia|clave_idempotencia|unique|duplicate/i.test(String((e as Error)?.message))) {
      const otra = await ctx.payload.find({ collection: 'far-ventas', depth: 0, limit: 1, overrideAccess: true, where: { claveIdempotencia: { equals: v.clave } } })
      if (otra.docs[0]) return otra.docs[0].id
    }
    throw e
  })

  const finanzas = await registrarIngreso(ctx, creada, cfg)
  const final = await cargar(ctx, creada)
  if (final.correoTicket) await mandarTicket(ctx, final).catch((e) => ctx.payload.logger.error(`[ventas] ticket por correo: ${String(e)}`))
  return { ...vistaVenta(ctx, final), duplicado: false, finanzas, avisos }
}

const fmt = (centavos: number) => `$${(centavos / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/* ───────────────────────────── Finanzas ───────────────────────────── */

/**
 * Entrada pendiente por el total + un cobro por cada pago confirmado. Todo
 * idempotente por clave: se puede llamar las veces que haga falta (reintento,
 * confirmar una transferencia) sin duplicar.
 */
async function registrarIngreso(ctx: Ctx, ventaId: number, cfg?: ConfiguracionVista): Promise<'registrado' | 'pendiente' | 'sin_importe'> {
  const v = await cargar(ctx, ventaId)
  if (v.estado === 'anulada') return 'pendiente'
  if (!(c(v.total) > 0)) return 'sin_importe'
  const conf = cfg ?? (await leerConfiguracion(ctx.payload))
  const fin = ctxFinanzas(ctx)
  const folio = folioParaId('VTA', v.id)
  try {
    let opId = idDe(v.ingresoFinanzas)
    if (!opId) {
      const cli = typeof v.cliente === 'object' && v.cliente ? nombreCliente(v.cliente as Cliente) : null
      const r = await registrarEnFinanzas(
        fin,
        {
          tipo: 'entrada',
          importe: v.total,
          fechaReal: v.dia <= ctx.hoy ? v.dia : ctx.hoy,
          estado: 'pendiente',
          concepto: `Venta de farmacia ${folio}`,
          categoria: conf.finanzas.categoriaVentasId,
          asignacion: conf.finanzas.areaId ? 'actividad' : 'pendiente',
          actividad: conf.finanzas.areaId,
          contraparte: cli ?? 'Mostrador',
          notas: `${(v.renglones ?? []).length} renglones · ${(v.pagos ?? []).map((p) => `${p.etiqueta || p.metodo} ${fmt(c(p.monto))}${p.estado === 'por_confirmar' ? ' (por confirmar)' : ''}`).join(' + ')}`,
        },
        `venta-${v.id}`,
      )
      opId = r.operacion.id
      await ctx.payload.update({ collection: 'far-ventas', id: v.id, overrideAccess: true, depth: 0, data: { ingresoFinanzas: opId } })
    }
    for (const [i, p] of (v.pagos ?? []).entries()) {
      if (p.estado !== 'confirmado' || !idDe(p.cuenta)) continue
      await liquidarEnFinanzas(fin, opId, { importe: p.monto, cuenta: idDe(p.cuenta)!, medio: MEDIO[(p.tipo as MetodoPagoVista['tipo']) || 'otro'], fechaReal: ctx.hoy }, `venta-${v.id}-pago-${i}`)
    }
    return 'registrado'
  } catch (e) {
    ctx.payload.logger.error(`[ventas] ${folio}: no se registró en Finanzas: ${String((e as Error)?.message ?? e)}`)
    return 'pendiente'
  }
}

export async function reintentarFinanzas(ctx: Ctx, id: number): Promise<VentaVista & { finanzas: string }> {
  exigir(ctx, 'vender', 'Tu rol no incluye la venta de mostrador.')
  const r = await registrarIngreso(ctx, id)
  if (r === 'pendiente') throw invalido('Finanzas no aceptó la entrada todavía. Revisa que los métodos de pago tengan cuenta activa y la fecha de corte.')
  return { ...vistaVenta(ctx, await cargar(ctx, id)), finanzas: r }
}

/** Confirmar una transferencia (u otro pago «por confirmar») al verla en el banco: entra el cobro a Finanzas. */
export async function confirmarPago(ctx: Ctx, id: number, indice: number, entrada: unknown): Promise<VentaVista> {
  exigir(ctx, 'aprobar', 'Confirmar transferencias lo hace el encargado o el dueño.')
  const d = z.object({ referencia: z.string().trim().max(80).nullable().optional() }).safeParse(entrada ?? {})
  const v = await cargar(ctx, id)
  if (v.estado === 'anulada') throw invalido('La venta está anulada.')
  const pagos = [...(v.pagos ?? [])]
  const p = pagos[indice]
  if (!p) throw noEncontrado('Ese pago no existe.')
  if (p.estado === 'confirmado') return vistaVenta(ctx, v)
  pagos[indice] = { ...p, cuenta: idDe(p.cuenta), confirmadoPor: ctx.user.id, confirmadoEn: new Date().toISOString(), estado: 'confirmado', referencia: (d.success && t(d.data.referencia)) || p.referencia }
  const todos = pagos.every((x) => x.estado === 'confirmado')
  await ctx.payload.update({ collection: 'far-ventas', id, overrideAccess: true, depth: 0, data: { pagos: pagos.map((x) => ({ ...x, cuenta: idDe(x.cuenta), confirmadoPor: idDe(x.confirmadoPor) })), estado: todos ? 'pagada' : 'por_confirmar' } })
  await registrarIngreso(ctx, id)
  return vistaVenta(ctx, await cargar(ctx, id))
}

/* ───────────────────────────── anular ───────────────────────────── */

/**
 * Anular una venta del MISMO día (error de captura, cobro equivocado): el
 * inventario regresa a sus lotes (movimientos `devolucion`), los surtidos de
 * receta se devuelven, el libro de control recibe un asiento de cancelación y
 * la entrada de Finanzas se anula. Días anteriores: devolución según la
 * política (pendiente con el Dr. Joni).
 */
export async function anularVenta(ctx: Ctx, id: number, entrada: unknown): Promise<VentaVista> {
  exigir(ctx, 'ajustes', 'Anular una venta lo hace el encargado o un rol superior.')
  const d = z.object({ motivo: z.string().trim().min(5, 'Escribe el motivo de la anulación (mínimo 5 caracteres).').max(300) }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Escribe el motivo.')
  const v = await cargar(ctx, id)
  if (v.estado === 'anulada') return vistaVenta(ctx, v)
  if (v.dia !== ctx.hoy) throw invalido('Solo se anulan ventas del día. Una venta anterior se corrige con una devolución (política pendiente de definir).')
  const folio = folioParaId('VTA', v.id)
  const lotes = (v.renglones ?? []).flatMap((r) => (r.lotes ?? []).map((l) => idDe(l.lote)!))
  await enTransaccion(
    ctx,
    async (req) => {
      for (const r of v.renglones ?? []) {
        for (const l of r.lotes ?? []) await registrarMovimiento(ctx, req, { tipo: 'devolucion', loteId: idDe(l.lote)!, cantidad: l.unidades, referencia: folio, motivo: `Anulación: ${d.data.motivo}` })
      }
      const asientos = await ctx.payload.find({ collection: 'far-libro-control', depth: 0, pagination: false, overrideAccess: true, req, where: { and: [{ venta: { equals: v.id } }, { tipo: { equals: 'salida' } }] } })
      for (const a of asientos.docs) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...resto } = a as FarLibroControl & Record<string, unknown>
        void _id
        void _c
        void _u
        await ctx.payload.create({ collection: 'far-libro-control', overrideAccess: true, req, depth: 0, data: { ...(resto as Omit<FarLibroControl, 'id' | 'createdAt' | 'updatedAt'>), tipo: 'cancelacion', fechaUso: ctx.hoy, cantidad: -Math.abs(a.cantidad), usuario: ctx.user.id, motivo: `Anulación de ${folio}: ${d.data.motivo}`, venta: v.id, lote: idDe(a.lote), receta: idDe(a.receta), mascota: idDe(a.mascota), productoRef: idDe(a.productoRef) } })
      }
      const porReceta = new Map<number, Set<string>>()
      for (const r of v.renglones ?? []) {
        const rid = idDe(r.receta)
        if (!rid) continue
        const rec = await ctx.payload.findByID({ collection: 'far-recetas', id: rid, depth: 0, overrideAccess: true, req })
        const reng = renglonQueCubre(rec, { id: idDe(r.producto)!, principioActivo: (await ctx.payload.findByID({ collection: 'far-productos', id: idDe(r.producto)!, depth: 0, overrideAccess: true, req })).principioActivo })
        if (reng?.id) porReceta.set(rid, (porReceta.get(rid) ?? new Set()).add(reng.id))
      }
      for (const [rid, ids] of porReceta) {
        const rec = await ctx.payload.findByID({ collection: 'far-recetas', id: rid, depth: 0, overrideAccess: true, req })
        await ctx.payload.update({ collection: 'far-recetas', id: rid, overrideAccess: true, req, depth: 0, data: { renglones: (rec.renglones ?? []).map((x) => ({ ...x, producto: idDe(x.producto), surtidosUsados: Math.max(0, (nOpc(x.surtidosUsados) ?? 0) - (x.id && ids.has(x.id) ? 1 : 0)) })) } })
      }
      await ctx.payload.update({ collection: 'far-ventas', id: v.id, overrideAccess: true, req, depth: 0, data: { estado: 'anulada', anuladaPor: ctx.user.id, anuladaEn: new Date().toISOString(), motivoAnulacion: d.data.motivo } })
    },
    lotes,
  )
  const opId = idDe(v.ingresoFinanzas)
  if (opId) {
    await anularEnFinanzas(ctxFinanzas(ctx), opId, { motivo: `Venta ${folio} anulada: ${d.data.motivo}` }).catch((e) => ctx.payload.logger.error(`[ventas] ${folio}: no se anuló en Finanzas: ${String(e)}`))
  }
  return vistaVenta(ctx, await cargar(ctx, id))
}

/* ───────────────────────────── ticket ───────────────────────────── */

export async function ticketHtml(ctx: Ctx, id: number): Promise<string> {
  exigir(ctx, 'vender', 'Tu rol no incluye la venta de mostrador.')
  return armarTicket(vistaVenta({ ...ctx, p: { ...ctx.p, farmacia: { ...ctx.p.farmacia, verCostos: false } } }, await cargar(ctx, id)), true)
}

function armarTicket(v: VentaVista, conImprimir: boolean): string {
  const m = (x: number) => `$${x.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const filas = v.renglones
    .map((r) => `<tr><td>${r.cantidad} × ${escapar(r.descripcion)}${r.descuentoPorciento ? ` <small>(−${r.descuentoPorciento}%)</small>` : ''}${r.recetaFolio ? `<br><small>Receta ${r.recetaFolio}</small>` : ''}<br><small>Lote ${r.lotes.map((l) => escapar(l.numeroLote ?? '')).join(', ')}</small></td><td class="d">${m(r.importe)}</td></tr>`)
    .join('')
  const pagos = v.pagos.map((p) => `<tr><td>${escapar(p.etiqueta)}${p.estado === 'por_confirmar' ? ' (por confirmar)' : ''}</td><td class="d">${m(p.monto)}</td></tr>${p.recibido != null ? `<tr><td><small>Recibido</small></td><td class="d"><small>${m(p.recibido)}</small></td></tr>` : ''}`).join('')
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ticket ${v.folio}</title>
<style>body{font:14px/1.4 system-ui,sans-serif;margin:0;padding:16px;color:#0f172a;background:#fff}.t{max-width:340px;margin:0 auto}h1{font-size:16px;margin:0 0 2px}table{width:100%;border-collapse:collapse}td{padding:4px 0;vertical-align:top;border-bottom:1px dashed #cbd5e1}.d{text-align:right;white-space:nowrap;padding-left:8px}.tot td{font-weight:700;font-size:16px;border-bottom:0}small{color:#475569}.no-print{margin-top:16px;text-align:center}@media print{.no-print{display:none}body{padding:0}}</style></head>
<body><div class="t"><h1>${escapar(site.brand.name)}</h1><small>Farmacia · ${v.folio} · ${v.dia}${v.vendedor ? ` · atendió ${escapar(v.vendedor.nombre)}` : ''}</small>
${v.cliente ? `<p><small>Cliente: ${escapar(v.cliente.nombre)}${v.mascota ? ` · ${escapar(v.mascota.nombre)}` : ''}</small></p>` : ''}
<table>${filas}${v.descuento ? `<tr><td>Descuento</td><td class="d">−${m(v.descuento)}</td></tr>` : ''}<tr class="tot"><td>Total</td><td class="d">${m(v.total)}</td></tr></table>
<table style="margin-top:8px">${pagos}${v.cambio ? `<tr class="tot"><td>Cambio</td><td class="d">${m(v.cambio)}</td></tr>` : ''}</table>
<p><small>Precios con IVA incluido. Este ticket no es un comprobante fiscal.${v.estado === 'anulada' ? ' <b>VENTA ANULADA.</b>' : ''}</small></p>
${conImprimir ? `<div class="no-print"><button onclick="window.print()" style="font:inherit;padding:10px 18px;border-radius:8px;border:1px solid #cbd5e1;background:${site.brand.accent};color:#fff">Imprimir o guardar PDF</button></div>` : ''}</div></body></html>`
}

async function mandarTicket(ctx: Ctx, v: FarVenta): Promise<void> {
  if (!v.correoTicket) return
  const vista = vistaVenta({ ...ctx, p: { ...ctx.p, farmacia: { ...ctx.p.farmacia, verCostos: false } } }, v)
  await ctx.payload.sendEmail({ to: v.correoTicket, subject: `Tu compra en ${site.brand.name} · ${vista.folio}`, html: armarTicket(vista, false) })
}

export async function enviarTicket(ctx: Ctx, id: number, entrada: unknown): Promise<VentaVista> {
  exigir(ctx, 'vender', 'Tu rol no incluye la venta de mostrador.')
  const d = z.object({ correo: z.string().trim().email('Escribe un correo válido.') }).safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Escribe un correo válido.')
  await ctx.payload.update({ collection: 'far-ventas', id, overrideAccess: true, depth: 0, data: { correoTicket: d.data.correo } })
  const v = await cargar(ctx, id)
  await mandarTicket(ctx, v)
  return vistaVenta(ctx, v)
}

/* ───────────────────────────── libro de control ───────────────────────────── */

export async function libroControl(ctx: Ctx, f: { desde?: string | null; hasta?: string | null }): Promise<AsientoLibroVista[]> {
  exigir(ctx, 'reportes', 'El libro de control lo consultan el encargado y el dueño.')
  const where: Where[] = []
  if (f.desde && esFecha(f.desde)) where.push({ fechaUso: { greater_than_equal: f.desde } })
  if (f.hasta && esFecha(f.hasta)) where.push({ fechaUso: { less_than_equal: f.hasta } })
  const r = await ctx.payload.find({ collection: 'far-libro-control', depth: 1, limit: 2000, overrideAccess: true, sort: '-createdAt', where: where.length ? { and: where } : undefined })
  return r.docs.map((a) => ({
    id: a.id,
    tipo: a.tipo,
    ventaFolio: idDe(a.venta) ? folioParaId('VTA', idDe(a.venta)!) : null,
    laboratorio: t(a.laboratorio),
    producto: a.producto,
    registroSenasica: t(a.registroSenasica),
    numeroLote: t(a.numeroLote),
    fechaCompra: t(a.fechaCompra),
    folioReceta: a.folioReceta,
    mvz: t(a.mvz),
    fechaUso: a.fechaUso,
    cantidad: a.cantidad,
    unidad: t(a.unidad),
    animal: t(a.animal),
    usuario: persona(a.usuario),
    motivo: t(a.motivo),
  }))
}

export async function libroControlCsv(ctx: Ctx, f: { desde?: string | null; hasta?: string | null }): Promise<string> {
  const filas = await libroControl(ctx, f)
  const esc = (x: unknown) => {
    const s = x == null ? '' : String(x)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const cab = ['Tipo', 'Fecha de salida', 'Laboratorio', 'Producto', 'Número de registro', 'Lote', 'Fecha de compra', 'Folio de receta', 'MVZ', 'Cantidad', 'Unidad', 'Animal de destino', 'Venta', 'Usuario', 'Motivo']
  const lineas = filas.map((a) => [a.tipo === 'salida' ? 'Salida' : 'Cancelación', a.fechaUso, a.laboratorio, a.producto, a.registroSenasica, a.numeroLote, a.fechaCompra, a.folioReceta, a.mvz, a.cantidad, a.unidad, a.animal, a.ventaFolio, a.usuario?.nombre, a.motivo].map(esc).join(','))
  return '﻿' + [cab.join(','), ...lineas].join('\n')
}

/* ───────────────────────────── cierre del día ───────────────────────────── */

async function cajaPorOmision(ctx: Ctx, cfg: ConfiguracionVista, cuentaId?: number | null): Promise<{ id: number; nombre: string; saldoInicial: number; fechaInicio: string }> {
  const id = cuentaId ?? cfg.metodosPago.find((m) => m.tipo === 'efectivo' && m.activo && m.cuentaId)?.cuentaId
  if (!id) throw invalido('Elige la caja: el método «Efectivo» no tiene cuenta de Finanzas (Farmacia → Configuración → Métodos de pago).')
  const cta = await ctx.payload.findByID({ collection: 'fin-cuentas', id, depth: 0, overrideAccess: true }).catch(() => null)
  if (!cta) throw invalido('Esa caja no existe.')
  return { id: cta.id, nombre: cta.nombre, saldoInicial: n0(cta.saldoInicial), fechaInicio: cta.fechaInicio }
}

async function calcularCierre(ctx: Ctx, fecha: string, caja: { id: number; nombre: string; saldoInicial: number }): Promise<{ esperadoC: number; ventasEfectivoC: number; ventas: number }> {
  /* Esperado = saldo de la caja en Finanzas al terminar el día (saldo inicial + entradas − salidas realizadas, sin anuladas). */
  const movs = await ctx.payload.find({ collection: 'fin-movimientos', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ cuenta: { equals: caja.id } }, { fechaReal: { less_than_equal: fecha } }] } })
  const esperadoC = saldoDeCuenta(c(caja.saldoInicial), movs.docs.map((m) => ({ direccion: m.direccion, centavos: c(m.importe), anulado: m.anulado })))
  const vs = await ctx.payload.find({ collection: 'far-ventas', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ dia: { equals: fecha } }, { estado: { not_equals: 'anulada' } }] } })
  const ventasEfectivoC = vs.docs.reduce((a, v) => a + (v.pagos ?? []).filter((p) => p.tipo === 'efectivo' && p.estado === 'confirmado' && idDe(p.cuenta) === caja.id).reduce((s, p) => s + c(p.monto), 0), 0)
  return { esperadoC, ventasEfectivoC, ventas: vs.totalDocs }
}

export async function cierreDia(ctx: Ctx, f: { fecha?: string | null; cuentaId?: number | null }): Promise<CierreVista> {
  exigir(ctx, 'cierreDia', 'Tu rol no incluye el cierre del día.')
  const cfg = await leerConfiguracion(ctx.payload)
  const fecha = f.fecha && esFecha(f.fecha) ? f.fecha : ctx.hoy
  const caja = await cajaPorOmision(ctx, cfg, f.cuentaId)
  const ya = await ctx.payload.find({ collection: 'far-cierres-dia', depth: 1, limit: 1, overrideAccess: true, where: { clave: { equals: `${fecha}-${caja.id}` } } })
  const x = ya.docs[0]
  if (x) return { id: x.id, fecha, cuenta: { id: caja.id, nombre: caja.nombre }, esperado: x.esperado, contado: x.contado, diferencia: x.diferencia, ventasEfectivo: n0(x.ventasEfectivo), ventas: n0(x.ventas), nota: t(x.nota), usuario: persona(x.usuario), creadoEn: x.createdAt }
  const calc = await calcularCierre(ctx, fecha, caja)
  return { id: null, fecha, cuenta: { id: caja.id, nombre: caja.nombre }, esperado: aPesos(calc.esperadoC), contado: null, diferencia: null, ventasEfectivo: aPesos(calc.ventasEfectivoC), ventas: calc.ventas, nota: null, usuario: null, creadoEn: null }
}

export async function registrarCierre(ctx: Ctx, entrada: unknown): Promise<CierreVista> {
  exigir(ctx, 'cierreDia', 'Tu rol no incluye el cierre del día.')
  const cfg = await leerConfiguracion(ctx.payload)
  if (!cfg.cierreDiaActivo) throw invalido('El cierre del día está apagado en Farmacia → Configuración.')
  const d = z
    .object({
      fecha: z.string().optional(),
      cuentaId: z.coerce.number().int().positive().nullable().optional(),
      contado: z.coerce.number().min(0, 'El efectivo contado no puede ser negativo.'),
      nota: z.string().trim().max(300).nullable().optional(),
    })
    .safeParse(entrada)
  if (!d.success) throw invalido(d.error.issues[0]?.message ?? 'Escribe el efectivo contado.')
  const fecha = d.data.fecha ?? ctx.hoy
  if (!esFecha(fecha) || fecha > ctx.hoy) throw invalido('La fecha del cierre no es válida o es futura.')
  const caja = await cajaPorOmision(ctx, cfg, d.data.cuentaId)
  const clave = `${fecha}-${caja.id}`
  if ((await ctx.payload.count({ collection: 'far-cierres-dia', overrideAccess: true, where: { clave: { equals: clave } } })).totalDocs) throw invalido(`Ya se registró el cierre de ${caja.nombre} del ${fecha}.`)
  const calc = await calcularCierre(ctx, fecha, caja)
  const contadoC = c(d.data.contado)
  const difC = contadoC - calc.esperadoC
  if (difC !== 0 && (t(d.data.nota)?.length ?? 0) < 3) throw invalido(`Hay una diferencia de ${difC > 0 ? '+' : '−'}${fmt(Math.abs(difC))}: escribe una nota que la explique.`)
  await ctx.payload.create({
    collection: 'far-cierres-dia',
    overrideAccess: true,
    depth: 0,
    data: { clave, fecha, cuenta: caja.id, esperado: aPesos(calc.esperadoC), contado: aPesos(contadoC), diferencia: aPesos(difC), ventasEfectivo: aPesos(calc.ventasEfectivoC), ventas: calc.ventas, nota: t(d.data.nota), usuario: ctx.user.id },
  }).catch((e) => {
    if (/unique|duplicate/i.test(String((e as Error)?.message))) throw invalido(`Ya se registró el cierre de ${caja.nombre} del ${fecha}.`)
    throw e
  })
  return cierreDia(ctx, { fecha, cuentaId: caja.id })
}

export async function cierres(ctx: Ctx): Promise<CierreVista[]> {
  exigir(ctx, 'cierreDia', 'Tu rol no incluye el cierre del día.')
  const r = await ctx.payload.find({ collection: 'far-cierres-dia', depth: 1, limit: 60, overrideAccess: true, sort: '-fecha' })
  return r.docs.map((x) => {
    const cta = typeof x.cuenta === 'object' && x.cuenta ? x.cuenta : null
    return { id: x.id, fecha: x.fecha, cuenta: { id: idDe(x.cuenta)!, nombre: cta?.nombre ?? 'Caja' }, esperado: x.esperado, contado: x.contado, diferencia: x.diferencia, ventasEfectivo: n0(x.ventasEfectivo), ventas: n0(x.ventas), nota: t(x.nota), usuario: persona(x.usuario), creadoEn: x.createdAt }
  })
}

/* ───────────────────────────── utilidades para la pantalla ───────────────────────────── */

/** Presentación por código de barras exacto (lector USB o cámara). */
export async function porCodigo(ctx: Ctx, codigo: string): Promise<{ presentacionId: number } | null> {
  exigir(ctx, 'vender', 'Tu rol no incluye la venta de mostrador.')
  const limpio = codigo.trim()
  if (!limpio) return null
  const r = await ctx.payload.find({ collection: 'far-presentaciones', depth: 0, limit: 1, overrideAccess: true, where: { and: [{ codigoBarras: { equals: limpio } }, { activa: { equals: true } }] } })
  return r.docs[0] ? { presentacionId: r.docs[0].id } : null
}

export { tutorDe, type PayloadRequest }

export type PresentacionVenta = {
  id: number
  nombre: string
  precio: number
  factor: number
  fraccionada: boolean
  codigoBarras: string | null
  producto: { id: number; nombre: string; principioActivo: string | null; grupo: FarProducto['grupo']; linea: FarProducto['linea']; unidadBase: string; refrigeracion: boolean }
  /** Unidades base vendibles (lotes no vencidos ni bloqueados del almacén por omisión). */
  vendible: number
}

/**
 * Búsqueda del mostrador: por nombre, principio activo o código de barras.
 * Devuelve presentaciones con precio y existencia vendible, sin costos. La
 * usa también el expediente para elegir el producto de una receta interna.
 */
export async function buscarParaVenta(ctx: Ctx, texto: string): Promise<PresentacionVenta[]> {
  const puede = (ctx.modulos.farmacia && (ctx.p.farmacia.vender || ctx.p.farmacia.recetas)) || (ctx.modulos.clinica && ctx.p.clinica.escribirExpediente)
  if (!puede) throw prohibido('Tu rol no incluye la venta de mostrador.')
  const q = texto.trim().slice(0, 80)
  if (!q) return []
  const prods = await ctx.payload.find({ collection: 'far-productos', depth: 0, limit: 40, overrideAccess: true, where: { and: [{ activo: { equals: true } }, { or: [{ nombre: { like: q } }, { principioActivo: { like: q } }, { laboratorio: { like: q } }] }] } })
  const where: Where[] = [{ codigoBarras: { equals: q.replace(/\s+/g, '') } }]
  if (prods.docs.length) where.push({ producto: { in: prods.docs.map((p) => p.id) } })
  const pres = await ctx.payload.find({ collection: 'far-presentaciones', depth: 1, limit: 40, overrideAccess: true, sort: 'nombre', where: { and: [{ activa: { equals: true } }, { or: where }] } })
  const lista = pres.docs.filter((p) => typeof p.producto === 'object' && (p.producto as FarProducto).activo)
  const ids = [...new Set(lista.map((p) => (p.producto as FarProducto).id))]
  const almacen = ids.length ? await almacenPorOmision(ctx.payload).catch(() => null) : null
  const lotes = ids.length && almacen ? await ctx.payload.find({ collection: 'far-lotes', depth: 0, pagination: false, overrideAccess: true, where: { and: [{ producto: { in: ids } }, { almacen: { equals: almacen.id } }, { existencia: { greater_than: 0 } }, { bloqueado: { not_equals: true } }, { caducidad: { greater_than_equal: ctx.hoy } }] } }) : { docs: [] as FarLote[] }
  const vendible = new Map<number, number>()
  for (const l of lotes.docs) vendible.set(idDe(l.producto)!, r3((vendible.get(idDe(l.producto)!) ?? 0) + n0(l.existencia)))
  /* Coincidencia exacta de código primero; luego por nombre. */
  const limpio = q.replace(/\s+/g, '')
  return lista
    .map((p) => {
      const prod = p.producto as FarProducto
      return { id: p.id, nombre: p.nombre, precio: p.precio, factor: n0(p.factor) || 1, fraccionada: Boolean(p.fraccionada), codigoBarras: t(p.codigoBarras), producto: { id: prod.id, nombre: prod.nombre, principioActivo: t(prod.principioActivo), grupo: prod.grupo, linea: prod.linea, unidadBase: prod.unidadBase, refrigeracion: Boolean(prod.refrigeracion) }, vendible: vendible.get(prod.id) ?? 0 }
    })
    .sort((a, b) => Number(b.codigoBarras === limpio) - Number(a.codigoBarras === limpio) || a.producto.nombre.localeCompare(b.producto.nombre, 'es'))
}
