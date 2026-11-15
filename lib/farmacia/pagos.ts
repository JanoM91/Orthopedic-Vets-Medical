import crypto from 'crypto'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Pagos en línea de la tienda (Farmacia, fase 5a, nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Adaptador `ProveedorPago` (docs/FARMACIA-PROMPT.md → Integraciones): crear un
 * cobro y verificar el aviso (webhook) del proveedor. REGLA: el pedido pasa a
 * «pagado» SOLO por un aviso con firma válida (o una consulta al proveedor),
 * nunca porque el navegador regresó de la página de pago.
 *
 *   - «prueba»: pago simulado para probar el flujo completo sin cuenta de
 *     pasarela. Solo existe si la variable PAGOS_PRUEBA_SECRETO está definida;
 *     la página /tienda/pago-prueba firma el aviso con ese secreto (HMAC-SHA256)
 *     y lo pasa por el mismo camino que un aviso real. En producción con
 *     clientes reales NO se define esa variable.
 *   - «mercadopago»: llega en la fase 5b (Checkout Pro + webhook con firma).
 *     Hoy responde «no disponible» aunque haya llaves, para no cobrar a medias.
 */

export type EventoPago = {
  /** Identificador único del aviso en el proveedor (idempotencia). */
  idEvento: string
  pedidoId: number
  referencia: string
  resultado: 'aprobado' | 'rechazado'
  /** Monto confirmado por el proveedor, en pesos. */
  monto: number
}

export type CobroCreado = { url: string; referencia: string }

export interface ProveedorPago {
  nombre: 'prueba' | 'mercadopago'
  /** ¿Se puede usar ya en esta instalación? (llaves presentes, adaptador listo) */
  disponible(): boolean
  crearCobro(p: { pedidoId: number; folio: string; total: number; token: string; base: string; descripcion: string }): Promise<CobroCreado>
  /** null = firma inválida o aviso que no es de un pago. */
  verificarAviso(cabeceras: Headers, cuerpo: string): EventoPago | null
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
    const referencia = `prueba-${pedidoId}-${crypto.randomBytes(6).toString('hex')}`
    return { url: `${base}/tienda/pago-prueba/${folio}?t=${encodeURIComponent(token)}&ref=${encodeURIComponent(referencia)}`, referencia }
  },
  verificarAviso(cabeceras, cuerpo) {
    const s = secretoPrueba()
    const firma = cabeceras.get('x-firma-prueba') || ''
    if (s.length < 16 || !/^[0-9a-f]{64}$/.test(firma)) return null
    const esperada = Buffer.from(firmarPrueba(cuerpo, s), 'hex')
    const recibida = Buffer.from(firma, 'hex')
    if (esperada.length !== recibida.length || !crypto.timingSafeEqual(esperada, recibida)) return null
    try {
      const d = JSON.parse(cuerpo) as Partial<EventoPago>
      if (typeof d.idEvento !== 'string' || typeof d.referencia !== 'string' || !Number.isInteger(d.pedidoId) || (d.resultado !== 'aprobado' && d.resultado !== 'rechazado') || typeof d.monto !== 'number') return null
      return { idEvento: d.idEvento, pedidoId: d.pedidoId!, referencia: d.referencia, resultado: d.resultado, monto: d.monto }
    } catch {
      return null
    }
  },
}

/* ───────────────────────────── Mercado Pago (fase 5b) ───────────────────────────── */

const mercadopago: ProveedorPago = {
  nombre: 'mercadopago',
  disponible: () => false,
  async crearCobro() {
    throw new Error('Mercado Pago se conecta en la fase 5b.')
  },
  verificarAviso: () => null,
}

const PROVEEDORES: Record<string, ProveedorPago> = { prueba, mercadopago }

export function proveedorPago(nombre: string | null | undefined): ProveedorPago | null {
  return nombre ? (PROVEEDORES[nombre] ?? null) : null
}

/** El proveedor activo en la configuración, si se puede usar; si no, null (la tienda solo ofrece pagar al recoger). */
export function pasarelaDisponible(pasarelaActiva: string): ProveedorPago | null {
  const p = proveedorPago(pasarelaActiva)
  return p && p.disponible() ? p : null
}
