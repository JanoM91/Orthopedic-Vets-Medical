import type { CollectionConfig } from 'payload'
import { esPersonal, permisosDe } from '../../lib/permisos'
import { moduloActivo } from '../../lib/modulos'
import { folioParaId, nadie } from './acceso'

/**
 * Pedidos de la tienda en línea (Farmacia, fase 5a, nov-2026) y eventos de la
 * pasarela de pago. TODA escritura pasa por lib/farmacia/tienda.ts: la API
 * genérica solo deja leer pedidos al equipo que vende (crear, editar y borrar
 * responden 403, incluso al superadmin). El tutor y el invitado ven su pedido
 * por la API de la tienda (/api/tienda), nunca por aquí.
 *
 * Un pedido vigente APARTA inventario a nivel producto (unidades base) sin
 * mover el kardex: la existencia baja cuando se entrega y se convierte en
 * venta (canal «tienda»). Sin pago, el apartado vence a las `horasApartado`.
 */

export const ESTADOS_PEDIDO = [
  { label: 'Por pagar en línea', value: 'pago_pendiente' },
  { label: 'Nuevo (paga al recoger)', value: 'creado' },
  { label: 'Pagado', value: 'pagado' },
  { label: 'Receta por validar', value: 'receta_por_validar' },
  { label: 'Preparando', value: 'preparando' },
  { label: 'Listo para recoger', value: 'listo_para_recoger' },
  { label: 'En ruta', value: 'en_ruta' },
  { label: 'Entregado', value: 'entregado' },
  { label: 'Cancelado', value: 'cancelado' },
  { label: 'Expirado', value: 'expirado' },
] as const

const leePedidos = async ({ req }: { req: Parameters<typeof esPersonal>[0] }) => {
  if (!esPersonal(req)) return false
  if (!(await moduloActivo(req, 'farmacia'))) return false
  const p = await permisosDe(req)
  return p.farmacia.vender || p.farmacia.asignarRepartidor
}

/**
 * Evidencia de entrega a domicilio (fase 5b): una foto por pedido, JPEG
 * reducido en el navegador y guardado en base64 (como `mas-fotos`). Solo se
 * sirve por /api/farmacia/pedidos/:id/evidencia; la API genérica responde 403.
 */
export const FarEvidencias: CollectionConfig = {
  slug: 'far-evidencias',
  typescript: { interface: 'FarEvidencia' },
  labels: { singular: 'Evidencia de entrega', plural: 'Evidencias de entrega' },
  admin: { group: 'Farmacia', hidden: true },
  access: { read: nadie, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'pedido', type: 'relationship', relationTo: 'far-pedidos', required: true, unique: true, index: true },
    { name: 'tipo', type: 'text', required: true },
    { name: 'datos', type: 'textarea', required: true },
    { name: 'bytes', type: 'number' },
    { name: 'subidaPor', type: 'text' },
  ],
}

export const FarPedidos: CollectionConfig = {
  slug: 'far-pedidos',
  typescript: { interface: 'FarPedido' },
  labels: { singular: 'Pedido de la tienda', plural: 'Pedidos de la tienda' },
  admin: { group: 'Farmacia', defaultColumns: ['folio', 'estado', 'total', 'createdAt'], hidden: true },
  access: { read: leePedidos, create: nadie, update: nadie, delete: nadie },
  fields: [
    {
      name: 'folio',
      label: 'Folio',
      type: 'text',
      virtual: true,
      admin: { readOnly: true },
      hooks: { afterRead: [({ originalDoc }) => ((originalDoc as { id?: number } | undefined)?.id == null ? null : folioParaId('PED', (originalDoc as { id: number }).id))] },
    },
    { name: 'estado', label: 'Estado', type: 'select', required: true, defaultValue: 'creado', options: [...ESTADOS_PEDIDO], index: true },
    { name: 'claveIdempotencia', label: 'Clave de reintento', type: 'text', required: true, unique: true, admin: { hidden: true } },
    { name: 'token', label: 'Token de seguimiento', type: 'text', required: true, unique: true, admin: { hidden: true } },
    { name: 'tutor', label: 'Cuenta del portal', type: 'relationship', relationTo: 'tutores', index: true },
    { name: 'cliente', label: 'Cliente', type: 'relationship', relationTo: 'clientes' },
    { name: 'mascota', label: 'Mascota', type: 'relationship', relationTo: 'mascotas' },
    {
      name: 'contacto',
      type: 'group',
      fields: [
        { name: 'nombre', type: 'text', required: true },
        { name: 'correo', type: 'email', required: true },
        { name: 'telefono', type: 'text' },
      ],
    },
    {
      name: 'perfil',
      label: 'Perfil de la mascota (invitado)',
      type: 'group',
      fields: [
        { name: 'especie', type: 'text' },
        { name: 'pesoKg', type: 'number' },
      ],
    },
    {
      name: 'renglones',
      type: 'array',
      required: true,
      minRows: 1,
      fields: [
        { name: 'presentacion', type: 'relationship', relationTo: 'far-presentaciones', required: true },
        { name: 'producto', type: 'relationship', relationTo: 'far-productos', required: true },
        { name: 'descripcion', type: 'text', required: true },
        { name: 'grupo', type: 'text' },
        { name: 'cantidad', type: 'number', required: true },
        { name: 'unidades', label: 'Unidades base apartadas', type: 'number', required: true },
        { name: 'precioUnitario', type: 'number', required: true },
        { name: 'importe', type: 'number', required: true },
        { name: 'receta', type: 'relationship', relationTo: 'far-recetas' },
      ],
    },
    /* Fase 6b: pedido generado por un plan (una entrega del ciclo). */
    { type: 'row', fields: [{ name: 'plan', type: 'relationship', relationTo: 'far-planes', index: true }, { name: 'ciclo', label: 'Entrega número', type: 'number' }] },
    { name: 'subtotal', label: 'Productos (MXN)', type: 'number' },
    { name: 'costoEnvio', label: 'Envío (MXN)', type: 'number', defaultValue: 0 },
    { name: 'total', label: 'Total (MXN)', type: 'number', required: true },
    { name: 'entrega', label: 'Entrega', type: 'select', required: true, defaultValue: 'recoger', options: [{ label: 'Recoger en farmacia', value: 'recoger' }, { label: 'A domicilio', value: 'domicilio' }] },
    {
      name: 'pago',
      type: 'group',
      fields: [
        { name: 'forma', label: 'Forma de pago', type: 'select', required: true, defaultValue: 'al_recoger', options: [{ label: 'Al recoger', value: 'al_recoger' }, { label: 'En línea', value: 'en_linea' }, { label: 'Al recibir (a domicilio)', value: 'al_recibir' }, { label: 'Cubierto por un plan anual (anticipo)', value: 'plan' }] },
        { name: 'estado', type: 'select', required: true, defaultValue: 'pendiente', options: [{ label: 'Pendiente', value: 'pendiente' }, { label: 'Pagado', value: 'pagado' }, { label: 'Reembolso pendiente', value: 'reembolso_pendiente' }, { label: 'Reembolsado', value: 'reembolsado' }] },
        { name: 'proveedor', type: 'text' },
        { name: 'idPago', label: 'Id del pago en la pasarela', type: 'text' },
        { name: 'referencia', label: 'Referencia de la pasarela', type: 'text', index: true },
        { name: 'pagadoEn', type: 'date' },
      ],
    },
    {
      name: 'direccion',
      label: 'Dirección de entrega',
      type: 'group',
      fields: [
        { name: 'calle', type: 'text' },
        { name: 'colonia', type: 'text' },
        { name: 'codigoPostal', type: 'text' },
        { name: 'referencias', type: 'text' },
        { name: 'zona', label: 'Zona', type: 'text' },
      ],
    },
    { name: 'repartidor', type: 'relationship', relationTo: 'users', index: true },
    {
      name: 'entregaDomicilio',
      label: 'Entrega a domicilio',
      type: 'group',
      fields: [
        { name: 'salioEn', type: 'date' },
        { name: 'entregadoEn', type: 'date' },
        { name: 'recibio', label: 'Recibió', type: 'text' },
        { name: 'nota', type: 'text' },
        { name: 'intentos', label: 'Intentos fallidos', type: 'number', defaultValue: 0 },
      ],
    },
    { name: 'expiraEn', label: 'El apartado vence', type: 'date', index: true },
    { name: 'venta', label: 'Venta generada', type: 'relationship', relationTo: 'far-ventas' },
    { name: 'notasCliente', label: 'Notas del cliente', type: 'textarea' },
    { name: 'motivoCancelacion', type: 'text' },
    {
      name: 'historial',
      type: 'array',
      fields: [
        { name: 'estado', type: 'text', required: true },
        { name: 'fecha', type: 'date', required: true },
        { name: 'por', type: 'text' },
        { name: 'detalle', type: 'text' },
      ],
    },
  ],
}

/**
 * Eventos de la pasarela ya procesados: el webhook es idempotente por
 * (proveedor, idEvento). Un evento repetido no vuelve a cambiar el pedido.
 */
export const FarPagosEventos: CollectionConfig = {
  slug: 'far-pagos-eventos',
  typescript: { interface: 'FarPagoEvento' },
  labels: { singular: 'Evento de pago', plural: 'Eventos de pago' },
  admin: { group: 'Farmacia', hidden: true },
  access: { read: nadie, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'clave', label: 'Proveedor:evento', type: 'text', required: true, unique: true },
    { name: 'pedido', type: 'relationship', relationTo: 'far-pedidos' },
    { name: 'plan', type: 'relationship', relationTo: 'far-planes' },
    { name: 'tipo', type: 'text' },
    { name: 'resultado', type: 'text' },
  ],
}
