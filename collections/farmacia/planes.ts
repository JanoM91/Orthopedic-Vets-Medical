import type { CollectionConfig } from 'payload'
import { esPersonal, permisosDe } from '../../lib/permisos'
import { moduloActivo } from '../../lib/modulos'
import { folioParaId, nadie } from './acceso'

/**
 * Planes de compra (Farmacia, fase 6b, nov-2026): `PLN-`.
 *
 *   - recurrente: cada `cadaDias` se genera un pedido para recoger; lo cobra la
 *     suscripción de la pasarela (Mercado Pago: preapproval; «prueba»: cobro
 *     simulado por el cron).
 *   - anual: un solo pago adelantado por `entregasTotales` entregas (anticipo);
 *     cada entrega es un pedido «cubierto por el plan» (la venta va en cero y el
 *     anticipo se reconoce entrega por entrega).
 *
 * TODA escritura pasa por lib/farmacia/planes.ts; la API genérica deja leer al
 * equipo que vende y responde 403 a crear, editar y borrar. El token de la liga
 * del tutor no se lee por la API genérica.
 */
export const ESTADOS_PLAN = [
  { label: 'Por pagar o autorizar', value: 'por_pagar' },
  { label: 'Activo', value: 'activo' },
  { label: 'Detenido (receta, peso o pago)', value: 'detenido' },
  { label: 'Cancelado', value: 'cancelado' },
  { label: 'Terminado', value: 'terminado' },
] as const

const leePlanes = async ({ req }: { req: Parameters<typeof esPersonal>[0] }) => {
  if (!esPersonal(req)) return false
  if (!(await moduloActivo(req, 'farmacia'))) return false
  return (await permisosDe(req)).farmacia.vender
}

export const FarPlanes: CollectionConfig = {
  slug: 'far-planes',
  typescript: { interface: 'FarPlan' },
  labels: { singular: 'Plan de compra', plural: 'Planes de compra' },
  admin: { group: 'Farmacia', hidden: true },
  access: { read: leePlanes, create: nadie, update: nadie, delete: nadie },
  fields: [
    {
      name: 'folio',
      label: 'Folio',
      type: 'text',
      virtual: true,
      admin: { readOnly: true },
      hooks: { afterRead: [({ originalDoc }) => ((originalDoc as { id?: number } | undefined)?.id == null ? null : folioParaId('PLN', (originalDoc as { id: number }).id))] },
    },
    { name: 'modalidad', type: 'select', required: true, options: [{ label: 'Cada entrega (suscripción)', value: 'recurrente' }, { label: 'Anual prepagado', value: 'anual' }], index: true },
    { name: 'estado', type: 'select', required: true, defaultValue: 'por_pagar', options: [...ESTADOS_PLAN], index: true },
    { name: 'tutor', type: 'relationship', relationTo: 'tutores', required: true, index: true },
    { name: 'cliente', type: 'relationship', relationTo: 'clientes', required: true },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true },
    { type: 'row', fields: [{ name: 'producto', type: 'relationship', relationTo: 'far-productos', required: true }, { name: 'presentacion', type: 'relationship', relationTo: 'far-presentaciones', required: true }] },
    { type: 'row', fields: [{ name: 'cantidad', label: 'Presentaciones por entrega', type: 'number', required: true }, { name: 'cadaDias', label: 'Cada (días)', type: 'number', required: true }] },
    { type: 'row', fields: [{ name: 'entregasTotales', label: 'Entregas del plan (anual)', type: 'number' }, { name: 'entregasHechas', label: 'Entregas generadas', type: 'number', defaultValue: 0 }] },
    { name: 'proximaEntrega', label: 'Próxima entrega (AAAA-MM-DD)', type: 'text', index: true },
    { type: 'row', fields: [{ name: 'precioEntrega', label: 'Precio por entrega (MXN)', type: 'number', required: true }, { name: 'descuentoPorciento', type: 'number', defaultValue: 0 }, { name: 'total', label: 'Total prepagado (anual)', type: 'number' }] },
    {
      name: 'pago',
      type: 'group',
      fields: [
        { name: 'proveedor', type: 'text' },
        { name: 'referencia', type: 'text', index: true },
        { name: 'idSuscripcion', label: 'Id de la suscripción en la pasarela', type: 'text', index: true },
        { name: 'idPago', label: 'Id del pago anual', type: 'text' },
        { name: 'pagadoEn', type: 'date' },
      ],
    },
    {
      name: 'anticipo',
      label: 'Anticipo (anual)',
      type: 'group',
      fields: [
        { name: 'operacionFinanzas', type: 'relationship', relationTo: 'fin-operaciones' },
        { name: 'reconocido', label: 'Reconocido (MXN)', type: 'number', defaultValue: 0 },
      ],
    },
    { name: 'motivo', label: 'Motivo (detenido o cancelado)', type: 'text' },
    { name: 'token', type: 'text', required: true, unique: true, access: { read: () => false }, admin: { hidden: true } },
    {
      name: 'historial',
      type: 'array',
      fields: [
        { name: 'fecha', type: 'date', required: true },
        { name: 'evento', type: 'text', required: true },
        { name: 'por', type: 'text' },
      ],
    },
  ],
}
