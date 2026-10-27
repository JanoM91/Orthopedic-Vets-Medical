import type { CollectionConfig } from 'payload'
import { equipoFarmacia, farmaciaCon, leeCostos, nadie, folioParaId, validarFecha } from './acceso'

/**
 * Compras a proveedores (fase 2, docs/FARMACIA-PROMPT.md).
 *
 * FLUJO: una compra nace en «borrador» desde el XML CFDI de la factura o por
 * captura manual, con un renglón por concepto. Cada renglón se liga a una
 * presentación del catálogo (la clave del proveedor se aprende en
 * `far-proveedor-claves`) y lleva lote y caducidad, que se capturan A MANO
 * siempre (el XML no los trae). «Recibir» crea los lotes, los movimientos del
 * kardex (tipo compra) y el gasto en Finanzas (contado o por pagar). Anular
 * solo si sus lotes no han tenido salidas: genera movimientos inversos.
 *
 * Toda escritura pasa por lib/farmacia/compras.ts (la API genérica solo lee):
 * así el UUID no se repite, nada se recibe sin lote y caducidad, y el kardex
 * y Finanzas quedan consistentes.
 *
 * El XML original se guarda como texto en la propia compra (pesa unos KB):
 * no depende del almacén de archivos y se puede descargar desde el panel.
 */

export const ESTADOS_COMPRA = [
  { label: 'Borrador', value: 'borrador' },
  { label: 'Recibida', value: 'recibida' },
  { label: 'Anulada', value: 'anulada' },
] as const

export const FarProveedorClaves: CollectionConfig = {
  slug: 'far-proveedor-claves',
  typescript: { interface: 'FarProveedorClave' },
  labels: { singular: 'Clave de proveedor', plural: 'Claves de proveedor' },
  admin: {
    useAsTitle: 'clave',
    group: 'Farmacia',
    defaultColumns: ['proveedor', 'clave', 'presentacion', 'updatedAt'],
    listSearchableFields: ['clave', 'descripcionProveedor'],
    description: 'Claves del proveedor ligadas al catálogo. Se aprenden solas.',
  },
  access: {
    read: equipoFarmacia,
    create: farmaciaCon('recibirCompras'),
    update: farmaciaCon('recibirCompras'),
    delete: farmaciaCon('recibirCompras'),
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.clave === 'string') data.clave = data.clave.trim()
        return data
      },
    ],
  },
  fields: [
    { name: 'proveedor', label: 'Proveedor', type: 'relationship', relationTo: 'far-proveedores', required: true, index: true },
    { name: 'clave', label: 'Clave en la factura (NoIdentificacion)', type: 'text', required: true, index: true },
    { name: 'presentacion', label: 'Presentación del catálogo', type: 'relationship', relationTo: 'far-presentaciones', required: true, index: true },
    { name: 'descripcionProveedor', label: 'Descripción en la factura', type: 'text' },
  ],
}

export const FarCompras: CollectionConfig = {
  slug: 'far-compras',
  typescript: { interface: 'FarCompra' },
  labels: { singular: 'Compra', plural: 'Compras' },
  admin: {
    useAsTitle: 'folioFactura',
    group: 'Farmacia',
    defaultColumns: ['folio', 'proveedor', 'fecha', 'folioFactura', 'total', 'estado'],
    listSearchableFields: ['folioFactura', 'uuid'],
    description: 'Compras a proveedores (XML o a mano).',
  },
  access: {
    read: farmaciaCon('recibirCompras'),
    create: nadie,
    update: nadie,
    delete: nadie,
  },
  fields: [
    { name: 'folio', label: 'Folio', type: 'text', virtual: true, admin: { readOnly: true, position: 'sidebar' }, hooks: { afterRead: [({ data, originalDoc }) => { const id = (originalDoc as { id?: unknown } | undefined)?.id ?? (data as { id?: unknown } | undefined)?.id; return id == null ? null : folioParaId('COM', id as number) }] } },
    { name: 'estado', label: 'Estado', type: 'select', required: true, defaultValue: 'borrador', options: [...ESTADOS_COMPRA], index: true, admin: { position: 'sidebar' } },
    { name: 'proveedor', label: 'Proveedor', type: 'relationship', relationTo: 'far-proveedores', required: true, index: true },
    { name: 'almacen', label: 'Almacén que recibe', type: 'relationship', relationTo: 'far-almacenes', index: true },
    {
      type: 'row',
      fields: [
        { name: 'fecha', label: 'Fecha de la factura (AAAA-MM-DD)', type: 'text', required: true, index: true, validate: (v: unknown) => validarFecha(v, false) },
        { name: 'serieFactura', label: 'Serie', type: 'text' },
        { name: 'folioFactura', label: 'Folio de la factura', type: 'text', index: true },
      ],
    },
    { name: 'uuid', label: 'UUID del timbre (CFDI)', type: 'text', index: true, unique: true, admin: { description: 'Único: el mismo XML no se registra dos veces.' } },
    { name: 'origen', label: 'Origen', type: 'select', required: true, defaultValue: 'manual', options: [{ label: 'XML CFDI', value: 'xml' }, { label: 'Captura manual', value: 'manual' }] },
    { name: 'xmlTexto', label: 'XML original', type: 'textarea', admin: { hidden: true } },
    {
      name: 'renglones',
      label: 'Renglones',
      type: 'array',
      labels: { singular: 'Renglón', plural: 'Renglones' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'claveProveedor', label: 'Clave del proveedor', type: 'text' },
            { name: 'descripcion', label: 'Descripción (factura)', type: 'text' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'presentacion', label: 'Presentación', type: 'relationship', relationTo: 'far-presentaciones' },
            { name: 'producto', label: 'Producto', type: 'relationship', relationTo: 'far-productos' },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'cantidad', label: 'Cantidad (presentaciones)', type: 'number', required: true, min: 0 },
            { name: 'valorUnitario', label: 'Valor unitario sin IVA', type: 'number', min: 0, access: { read: leeCostos } },
            { name: 'importe', label: 'Importe sin IVA', type: 'number', min: 0, access: { read: leeCostos } },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'numeroLote', label: 'Lote', type: 'text' },
            { name: 'caducidad', label: 'Caducidad (AAAA-MM-DD)', type: 'text', validate: (v: unknown) => validarFecha(v, true) },
            { name: 'lote', label: 'Lote creado', type: 'relationship', relationTo: 'far-lotes', admin: { readOnly: true } },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'subtotal', label: 'Subtotal', type: 'number', min: 0, access: { read: leeCostos } },
        { name: 'iva', label: 'IVA', type: 'number', min: 0, access: { read: leeCostos } },
        { name: 'total', label: 'Total', type: 'number', min: 0, access: { read: leeCostos } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'condicion', label: 'Condición', type: 'select', required: true, defaultValue: 'contado', options: [{ label: 'Contado (pagada)', value: 'contado' }, { label: 'Crédito (por pagar)', value: 'credito' }] },
        { name: 'cuenta', label: 'Cuenta o caja con la que se pagó', type: 'relationship', relationTo: 'fin-cuentas' },
        { name: 'venceEl', label: 'Vence el (crédito)', type: 'text', validate: (v: unknown) => validarFecha(v, true) },
      ],
    },
    { name: 'gastoFinanzas', label: 'Gasto en Finanzas', type: 'relationship', relationTo: 'fin-operaciones', admin: { readOnly: true, description: 'Se crea al recibir. Si falló, «Reintentar gasto».' } },
    { name: 'notas', label: 'Notas', type: 'textarea' },
    { name: 'capturadaPor', label: 'Capturó', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'recibidaPor', label: 'Recibió', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'recibidaEn', label: 'Recibida el', type: 'date', admin: { readOnly: true } },
    { name: 'anuladaPor', label: 'Anuló', type: 'relationship', relationTo: 'users', admin: { readOnly: true } },
    { name: 'anuladaEn', label: 'Anulada el', type: 'date', admin: { readOnly: true } },
    { name: 'motivoAnulacion', label: 'Motivo de anulación', type: 'text' },
  ],
}
