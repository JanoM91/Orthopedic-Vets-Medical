import crypto from 'crypto'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Pagos en línea de la tienda (Farmacia, fases 5a y 5b, nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Adaptador `ProveedorPago`: crear un cobro, verificar el aviso (webhook) y
 * reembolsar. REGLA: el pedido pasa a «pagado» SOLO por un aviso con firma
 * válida cuyo pago se confirma con el proveedor, nunca porque el navegador
 * regresó de la página de pago.
 *
 *   - «prueba»: pago simulado sin cuenta de pasarela. Solo existe con
 *     PAGOS_PRUEBA_SECRETO; la página /tienda/pago-prueba firma el aviso con ese
 *     secreto (HMAC-SHA256) y lo pasa por el mismo camino que uno real. NUNCA
 *     con clientes reales.
 *   - «mercadopago» (5b): Checkout Pro. Disponible con MERCADOPAGO_ACCESS_TOKEN
 *     y MERCADOPAGO_WEBHOOK_SECRET (los dos Sensitive en Vercel).
 *       · Cobro: POST https://api.mercadopago.com/checkout/preferences/ con
 *         `external_reference` = nuestra referencia, `notification_url` al
 *         webhook, `back_urls` al seguimiento y vencimiento = el del apartado.
 *       · Aviso: header `x-signature` = «ts=…,v1=…»; v1 = HMAC-SHA256(secreto,
 *         «id:<data.id>;request-id:<x-request-id>;ts:<ts>;») — misma regla que
 *         el SDK oficial (mercadopago@3.6, utils/webhook: los pares sin valor se
 *         omiten). Después se CONSULTA el pago (GET /v1/payments/{id}) para leer
 *         estado, monto y external_reference: el cuerpo del aviso no se cree.
 *       · Reembolso total: POST /v1/payments/{id}/refunds con X-Idempotency-Key.
 */

export type EventoPago = {
  /** Identificador único del aviso en el proveedor (idempotencia). */
  idEvento: string
  /** Pedido de la tienda (0 si el aviso es de un plan). */
  pedidoId: number
  /** Fase 6b: plan de compra (pago anual, suscripción o cobro de la suscripción). */
  planId?: number | null
  /** «pago» (cobro único), «suscripcion» (cambió la suscripción) o «cobro_suscripcion» (cobro periódico). */
  tipo?: 'pago' | 'suscripcion' | 'cobro_suscripcion'
  /** Estado de la suscripción en el proveedor: authorized, paused, cancelled, pending. */
  estadoSuscripcion?: string | null
  idSuscripcion?: string | null
  referencia: string
  resultado: 'aprobado' | 'rechazado'
  /** Monto confirmado por el proveedor, en pesos. */
  monto: number
  /** Id del pago en el proveedor (para reembolsar). */
  idPago?: string | null
}

export type CobroCreado = { url: string; referencia: string }

/** ok:false = firma inválida (401). ok:true y evento null = aviso válido que no cambia nada (pendiente, otro tipo). */
export type AvisoVerificado = { ok: false } | { ok: true; evento: EventoPago | null; nota?: string }

export interface ProveedorPago {
  nombre: 'prueba' | 'mercadopago'
  /** ¿Se puede usar ya en esta instalación? (llaves presentes) */
  disponible(): boolean
  crearCobro(p: { pedidoId: number; folio: string; total: number; token: string; base: string; descripcion: string; expiraEn: string | null; correo: string | null }): Promise<CobroCreado>
  verificarAviso(cabeceras: Headers, cuerpo: string, url: URL): Promise<AvisoVerificado>
  /** Reembolso total. Devuelve el id del reembolso en el proveedor. */
  reembolsar(p: { idPago: string | null; pedidoId: number; monto: number }): Promise<string>
  /** Fase 6b: cobro único del plan anual (misma página de pago que un pedido). */
  crearCobroPlan(p: { planId: number; folio: string; total: number; token: string; base: string; descripcion: string; correo: string | null }): Promise<CobroCreado>
  /** Fase 6b: suscripción para el plan recurrente: el tutor la autoriza en la liga y la pasarela cobra cada `cadaDias`. */
  crearSuscripcion(p: { planId: number; folio: string; monto: number; cadaDias: number; /** ISO con hora, en el futuro (Mercado Pago no acepta un inicio pasado). */ inicio: string; token: string; base: string; descripcion: string; correo: string | null }): Promise<CobroCreado & { idSuscripcion: string }>
  /** Pausar, reanudar o cancelar la suscripción. */
  cambiarSuscripcion(p: { idSuscripcion: string; estado: 'paused' | 'authorized' | 'cancelled' }): Promise<void>
}

/** Referencia de cobro: `ped-<id>-<azar>` (de aquí se lee el pedido). */
const nuevaReferencia = (pedidoId: number, prefijo = 'ped') => `${prefijo}-${pedidoId}-${crypto.randomBytes(6).toString('hex')}`
export const pedidoDeReferencia = (ref: string | null | undefined): number | null => {
  const m = /^(?:ped|prueba)-(\d+)-[0-9a-f]+$/.exec(ref ?? '')
  return m ? Number(m[1]) : null
}
/** Referencia de un plan (6b): `pln-<id>-<azar>` o `prueba-pln-<id>-<azar>`. */
export const planDeReferencia = (ref: string | null | undefined): number | null => {
  const m = /^(?:prueba-)?pln-(\d+)-[0-9a-f]+$/.exec(ref ?? '')
  return m ? Number(m[1]) : null
}

function igualesHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]+$/i.test(a) || !/^[0-9a-f]+$/i.test(b) || a.length !== b.length) return false
  return crypto.timingSafeEqual(Buffer.from(a.toLowerCase(), 'hex'), Buffer.from(b.toLowerCase(), 'hex'))
}

/* ───────────────────────────── prueba (simulado) ───────────────────────────── */

const secretoPrueba = () => process.env.PAGOS_PRUEBA_SECRETO?.trim() || ''

export function firmarPrueba(cuerpo: string, secreto = secretoPrueba()): string {
  return crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex')
}

const prueba: ProveedorPago = {
  nombre: 'prueba',
  disponible: () => secretoPrueba().length >= 16,
  async crearCobro({ pedidoId, folio, token, base }) {
    const referencia = nuevaReferencia(pedidoId, 'prueba')
    return { url: `${base}/tienda/pago-prueba/${folio}?t=${encodeURIComponent(token)}&ref=${encodeURIComponent(referencia)}`, referencia }
  },
  async verificarAviso(cabeceras, cuerpo) {
    const s = secretoPrueba()
    const firma = cabeceras.get('x-firma-prueba') || ''
    if (s.length < 16 || !/^[0-9a-f]{64}$/.test(firma) || !igualesHex(firmarPrueba(cuerpo, s), firma)) return { ok: false }
    try {
      const d = JSON.parse(cuerpo) as Partial<EventoPago>
      const esPlan = Number.isInteger(d.planId) && (d.planId as number) > 0
      if (typeof d.idEvento !== 'string' || typeof d.referencia !== 'string' || (!esPlan && !Number.isInteger(d.pedidoId)) || (d.resultado !== 'aprobado' && d.resultado !== 'rechazado') || typeof d.monto !== 'number') return { ok: false }
      const tipo = d.tipo === 'suscripcion' || d.tipo === 'cobro_suscripcion' ? d.tipo : 'pago'
      return { ok: true, evento: { idEvento: d.idEvento, pedidoId: esPlan ? 0 : d.pedidoId!, planId: esPlan ? d.planId : null, tipo, estadoSuscripcion: typeof d.estadoSuscripcion === 'string' ? d.estadoSuscripcion : null, idSuscripcion: typeof d.idSuscripcion === 'string' ? d.idSuscripcion : null, referencia: d.referencia, resultado: d.resultado, monto: d.monto, idPago: `prueba-${d.idEvento}` } }
    } catch {
      return { ok: false }
    }
  },
  async reembolsar({ pedidoId }) {
    return `prueba-reembolso-${pedidoId}`
  },
  async crearCobroPlan({ planId, token, base }) {
    const referencia = nuevaReferencia(planId, 'prueba-pln')
    return { url: `${base}/tienda/plan/${planId}?t=${encodeURIComponent(token)}&ref=${encodeURIComponent(referencia)}`, referencia }
  },
  async crearSuscripcion({ planId, token, base }) {
    const referencia = nuevaReferencia(planId, 'prueba-pln')
    const idSuscripcion = `prueba-sus-${planId}-${crypto.randomBytes(4).toString('hex')}`
    return { url: `${base}/tienda/plan/${planId}?t=${encodeURIComponent(token)}&ref=${encodeURIComponent(referencia)}&sus=${encodeURIComponent(idSuscripcion)}`, referencia, idSuscripcion }
  },
  async cambiarSuscripcion() {
    /* Simulado: no hay nada que avisar a una pasarela. */
  },
}

/* ───────────────────────────── Mercado Pago (5b) ───────────────────────────── */

const MP_API = process.env.MERCADOPAGO_API_URL?.trim() || 'https://api.mercadopago.com'
const tokenMP = () => process.env.MERCADOPAGO_ACCESS_TOKEN?.trim() || ''
const secretoMP = () => process.env.MERCADOPAGO_WEBHOOK_SECRET?.trim() || ''

async function mp<T>(ruta: string, init: RequestInit & { idempotencia?: string } = {}): Promise<T> {
  const { idempotencia, ...resto } = init
  const r = await fetch(`${MP_API}${ruta}`, {
    ...resto,
    headers: { Authorization: `Bearer ${tokenMP()}`, 'Content-Type': 'application/json', ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}), ...(resto.headers ?? {}) },
    signal: AbortSignal.timeout(15000),
  })
  const texto = await r.text()
  if (!r.ok) {
    console.error(`[pagos/mercadopago] ${resto.method ?? 'GET'} ${ruta} → ${r.status}: ${texto.slice(0, 300)}`)
    throw new Error(`Mercado Pago respondió ${r.status}.`)
  }
  return (texto ? JSON.parse(texto) : {}) as T
}

/** Manifiesto de la firma: igual que el SDK oficial (los pares sin valor se omiten). */
export function manifiestoMP(dataId: string | null, requestId: string | null, ts: string): string {
  const partes: string[] = []
  if (dataId) partes.push(`id:${dataId}`)
  if (requestId) partes.push(`request-id:${requestId}`)
  partes.push(`ts:${ts}`)
  return partes.join(';') + ';'
}

export function firmaValidaMP(xSignature: string, xRequestId: string | null, dataId: string | null, secreto: string): boolean {
  let ts: string | null = null
  let v1: string | null = null
  for (const parte of xSignature.split(',')) {
    const i = parte.indexOf('=')
    if (i < 0) continue
    const k = parte.slice(0, i).trim().toLowerCase()
    const v = parte.slice(i + 1).trim()
    if (k === 'ts') ts = v
    if (k === 'v1') v1 = v
  }
  if (!ts || !/^\d+$/.test(ts) || !v1 || !secreto) return false
  const esperada = crypto.createHmac('sha256', secreto).update(manifiestoMP(dataId, xRequestId, ts)).digest('hex')
  return igualesHex(esperada, v1)
}

type PagoMP = { id: number | string; status?: string; status_detail?: string; external_reference?: string | null; transaction_amount?: number; currency_id?: string }
/** Suscripción (GET /preapproval/{id}) y cobro de la suscripción (GET /authorized_payments/{id}); campos según el SDK oficial mercadopago@3.6 (clientes preApproval e invoice). */
type SuscripcionMP = { id: string; status?: string; external_reference?: string | null; init_point?: string; auto_recurring?: { transaction_amount?: number } }
type CobroSuscripcionMP = { id: string | number; preapproval_id?: string; external_reference?: string | null; status?: string; transaction_amount?: number; currency_id?: string; payment?: { id: string | number; status?: string } }

const mercadopago: ProveedorPago = {
  nombre: 'mercadopago',
  disponible: () => tokenMP().length > 10 && secretoMP().length > 10,
  async crearCobro({ pedidoId, folio, total, token, base, descripcion, expiraEn, correo }) {
    const referencia = nuevaReferencia(pedidoId)
    const vuelta = `${base}/tienda/pedido/${folio}?t=${encodeURIComponent(token)}&pago=1`
    const cuerpo: Record<string, unknown> = {
      items: [{ id: folio, title: descripcion.slice(0, 250), quantity: 1, unit_price: Math.round(total * 100) / 100, currency_id: 'MXN' }],
      external_reference: referencia,
      notification_url: `${base}/api/tienda/webhook/mercadopago`,
      back_urls: { success: vuelta, failure: vuelta, pending: vuelta },
      auto_return: 'approved',
      statement_descriptor: (process.env.NEXT_PUBLIC_APP_SHORT_NAME || 'FARMACIA').slice(0, 22),
      ...(correo ? { payer: { email: correo } } : {}),
      ...(expiraEn ? { expires: true, expiration_date_to: expiraEn } : {}),
    }
    const pref = await mp<{ id: string; init_point?: string; sandbox_init_point?: string }>('/checkout/preferences/', { method: 'POST', body: JSON.stringify(cuerpo), idempotencia: referencia })
    /* Con credenciales de prueba (TEST-…) el cobro va al sandbox. */
    const url = tokenMP().startsWith('TEST-') ? (pref.sandbox_init_point ?? pref.init_point) : (pref.init_point ?? pref.sandbox_init_point)
    if (!url) throw new Error('Mercado Pago no devolvió la liga de pago.')
    return { url, referencia }
  },
  async verificarAviso(cabeceras, cuerpo, url) {
    let body: { type?: string; topic?: string; action?: string; data?: { id?: string | number } } = {}
    try {
      body = cuerpo ? JSON.parse(cuerpo) : {}
    } catch {
      body = {}
    }
    const dataId = url.searchParams.get('data.id') ?? (body.data?.id != null ? String(body.data.id) : null)
    const firma = cabeceras.get('x-signature') || ''
    if (!firma || !firmaValidaMP(firma, cabeceras.get('x-request-id'), dataId, secretoMP())) return { ok: false }
    const tipo = url.searchParams.get('type') ?? body.type ?? body.topic ?? null
    if (!dataId) return { ok: true, evento: null, nota: 'aviso sin data.id' }
    /* Fase 6b: suscripciones (preapproval) y sus cobros (authorized_payments). Siempre se consulta al proveedor. */
    if (tipo === 'subscription_preapproval') {
      const s = await mp<SuscripcionMP>(`/preapproval/${encodeURIComponent(dataId)}`)
      const planId = planDeReferencia(s.external_reference)
      if (!planId || !s.external_reference) return { ok: true, evento: null, nota: 'suscripción sin referencia de un plan' }
      return { ok: true, evento: { idEvento: `sus-${s.id}:${s.status ?? ''}`, pedidoId: 0, planId, tipo: 'suscripcion', estadoSuscripcion: s.status ?? null, idSuscripcion: s.id, referencia: s.external_reference, resultado: 'aprobado', monto: Number(s.auto_recurring?.transaction_amount ?? 0) } }
    }
    if (tipo === 'subscription_authorized_payment') {
      const c = await mp<CobroSuscripcionMP>(`/authorized_payments/${encodeURIComponent(dataId)}`)
      const planId = planDeReferencia(c.external_reference)
      if (!planId || !c.external_reference) return { ok: true, evento: null, nota: 'cobro sin referencia de un plan' }
      if (c.currency_id && c.currency_id !== 'MXN') return { ok: true, evento: null, nota: `moneda ${c.currency_id}` }
      const st = c.payment?.status ?? ''
      const resultado = st === 'approved' ? 'aprobado' : ['rejected', 'cancelled'].includes(st) ? 'rechazado' : null
      if (!resultado) return { ok: true, evento: null, nota: `cobro de suscripción ${st || c.status || 'sin estado'}` }
      return { ok: true, evento: { idEvento: `cob-${c.id}:${st}`, pedidoId: 0, planId, tipo: 'cobro_suscripcion', idSuscripcion: c.preapproval_id ?? null, referencia: c.external_reference, resultado, monto: Number(c.transaction_amount ?? 0), idPago: c.payment?.id != null ? String(c.payment.id) : String(c.id) } }
    }
    if (tipo !== 'payment') return { ok: true, evento: null, nota: `aviso «${tipo ?? 'sin tipo'}» ignorado` }
    /* El aviso solo dice «cambió el pago X»: estado, monto y referencia se leen del proveedor. */
    const pago = await mp<PagoMP>(`/v1/payments/${encodeURIComponent(dataId)}`)
    const ref = pago.external_reference ?? null
    const planPago = planDeReferencia(ref)
    if (planPago && ref) {
      const st = pago.status ?? ''
      if (pago.currency_id && pago.currency_id !== 'MXN') return { ok: true, evento: null, nota: `moneda ${pago.currency_id}` }
      const resultado = st === 'approved' ? 'aprobado' : ['rejected', 'cancelled'].includes(st) ? 'rechazado' : null
      if (!resultado) return { ok: true, evento: null, nota: `pago ${st || 'sin estado'}` }
      return { ok: true, evento: { idEvento: `${pago.id}:${st}`, pedidoId: 0, planId: planPago, tipo: 'pago', referencia: ref, resultado, monto: Number(pago.transaction_amount ?? 0), idPago: String(pago.id) } }
    }
    const pedidoId = pedidoDeReferencia(ref)
    if (!pedidoId || !ref) return { ok: true, evento: null, nota: 'pago sin referencia de un pedido' }
    const st = pago.status ?? ''
    if (pago.currency_id && pago.currency_id !== 'MXN') return { ok: true, evento: null, nota: `moneda ${pago.currency_id}` }
    const resultado = st === 'approved' ? 'aprobado' : ['rejected', 'cancelled'].includes(st) ? 'rechazado' : null
    if (!resultado) return { ok: true, evento: null, nota: `pago ${st || 'sin estado'}` }
    return { ok: true, evento: { idEvento: `${pago.id}:${st}`, pedidoId, referencia: ref, resultado, monto: Number(pago.transaction_amount ?? 0), idPago: String(pago.id) } }
  },
  async reembolsar({ idPago, pedidoId }) {
    if (!idPago) throw new Error('Falta el id del pago en Mercado Pago.')
    const r = await mp<{ id?: number | string }>(`/v1/payments/${encodeURIComponent(idPago)}/refunds`, { method: 'POST', body: '{}', idempotencia: `reembolso-ped-${pedidoId}` })
    return String(r.id ?? 'ok')
  },
  async crearCobroPlan({ planId, folio, total, token, base, descripcion, correo }) {
    const referencia = nuevaReferencia(planId, 'pln')
    const vuelta = `${base}/tienda/plan/${planId}?t=${encodeURIComponent(token)}&pago=1`
    const cuerpo: Record<string, unknown> = {
      items: [{ id: folio, title: descripcion.slice(0, 250), quantity: 1, unit_price: Math.round(total * 100) / 100, currency_id: 'MXN' }],
      external_reference: referencia,
      notification_url: `${base}/api/tienda/webhook/mercadopago`,
      back_urls: { success: vuelta, failure: vuelta, pending: vuelta },
      auto_return: 'approved',
      statement_descriptor: (process.env.NEXT_PUBLIC_APP_SHORT_NAME || 'FARMACIA').slice(0, 22),
      ...(correo ? { payer: { email: correo } } : {}),
    }
    const pref = await mp<{ id: string; init_point?: string; sandbox_init_point?: string }>('/checkout/preferences/', { method: 'POST', body: JSON.stringify(cuerpo), idempotencia: referencia })
    const url = tokenMP().startsWith('TEST-') ? (pref.sandbox_init_point ?? pref.init_point) : (pref.init_point ?? pref.sandbox_init_point)
    if (!url) throw new Error('Mercado Pago no devolvió la liga de pago.')
    return { url, referencia }
  },
  async crearSuscripcion({ planId, monto, cadaDias, inicio, token, base, descripcion, correo }) {
    const referencia = nuevaReferencia(planId, 'pln')
    /* Suscripción sin plan asociado, «pending»: el tutor elige su forma de pago en la liga (init_point). */
    const cuerpo: Record<string, unknown> = {
      reason: descripcion.slice(0, 250),
      external_reference: referencia,
      ...(correo ? { payer_email: correo } : {}),
      auto_recurring: { frequency: cadaDias, frequency_type: 'days', start_date: inicio, transaction_amount: Math.round(monto * 100) / 100, currency_id: 'MXN' },
      back_url: `${base}/tienda/plan/${planId}?t=${encodeURIComponent(token)}&pago=1`,
      status: 'pending',
    }
    const s = await mp<{ id: string; init_point?: string; sandbox_init_point?: string }>('/preapproval', { method: 'POST', body: JSON.stringify(cuerpo), idempotencia: referencia })
    const url = s.init_point ?? s.sandbox_init_point
    if (!s.id || !url) throw new Error('Mercado Pago no devolvió la liga de la suscripción.')
    return { url, referencia, idSuscripcion: s.id }
  },
  async cambiarSuscripcion({ idSuscripcion, estado }) {
    await mp(`/preapproval/${encodeURIComponent(idSuscripcion)}`, { method: 'PUT', body: JSON.stringify({ status: estado }) })
  },
}

const PROVEEDORES: Record<string, ProveedorPago> = { prueba, mercadopago }

export function proveedorPago(nombre: string | null | undefined): ProveedorPago | null {
  return nombre ? (PROVEEDORES[nombre] ?? null) : null
}

/** El proveedor activo en la configuración, si se puede usar; si no, null (la tienda solo ofrece pagar al recoger o al recibir). */
export function pasarelaDisponible(pasarelaActiva: string): ProveedorPago | null {
  const p = proveedorPago(pasarelaActiva)
  return p && p.disponible() ? p : null
}
