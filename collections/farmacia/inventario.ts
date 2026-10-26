import type { CollectionConfig } from 'payload'
import { APIError } from 'payload'
import { equipoFarmacia, leeCostos, nadie, soloSistema, folioParaId, validarFecha } from './acceso'

/**
 * Inventario por lote (octubre de 2026, docs/FARMACIA-PROMPT.md).
 *
 * LOTE: toda entrada registra lote y caducidad. La existencia de un lote es
 * SIEMPRE la suma de sus movimientos; el campo `existencia` es una copia que
 * el servicio recalcula dentro de la misma transacción y que nadie edita.
 *
 * KARDEX (`far-movimientos`): inmutable. No se edita ni se borra por ninguna
 * vía (hooks `beforeChange` y `beforeDelete`, que corren aunque se escriba con
 * `overrideAccess`). Una corrección es un movimiento inverso con motivo.
 * Solo el servicio (lib/farmacia/servicio.ts) crea movimientos: la API
 * genérica responde 403 a crear, editar y borrar, incluso al superadmin.
 *
 * COSTOS: `costoUnidad` tiene acceso de campo «Ver costos». Sin esa casilla,
 * el campo no viaja en ninguna respuesta.
 */

export const TIPOS_MOVIMIENTO = [
  { label: 'Compra (recepción)', value: 'compra' },
  { label: 'Venta', value: 'venta' },
  { label: 'Ajuste', value: 'ajuste' },
  { label: 'Merma', value: 'merma' },
  { label: 'Traspaso', value: 'traspaso' },
  { label: 'Devolución', value: 'devolucion' },
] as const

export const FarLotes: CollectionConfig = {
  slug: 'far-lotes',
  typescript: { interface: 'FarLote' },
  labels: { singular: 'Lote', plural: 'Lotes' },
  admin: {
    useAsTitle: 'numeroLote',
    group: 'Farmacia',
    defaultColumns: ['folio', 'producto', 'numeroLote', 'caducidad', 'existencia', 'almacen'],
    listSearchableFields: ['numeroLote'],
    description: 'Un lote por entrada de producto con su caducidad. La existencia la calcula el sistema a partir del kardex; aquí solo se consulta.',
  },
  access: {
    read: equipoFarmacia,
    /* Los lotes nacen al recibir una compra o en un ajuste (servicio). No se crean ni se editan a mano. */
    create: nadie,
    update: nadie,
    delete: nadie,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.numeroLote === 'string') data.numeroLote = data.numeroLote.replace(/\s+/g, ' ').trim()
        return data
      },
    ],
  },
  fields: [
    { name: 'folio', label: 'Folio', type: 'text', virtual: true, admin: { readOnly: true, position: 'sidebar' }, hooks: { afterRead: [({ data, originalDoc }) => { const id = (originalDoc as { id?: unknown } | undefined)?.id ?? (data as { id?: unknown } | undefined)?.id; return id == null ? null : folioParaId('LOT', id as number) }] } },
    { name: 'producto', label: 'Producto', type: 'relationship', relationTo: 'far-productos', required: true, index: true },
    { name: 'almacen', label: 'Almacén', type: 'relationship', relationTo: 'far-almacenes', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'numeroLote', label: 'Número de lote', type: 'text', required: true, index: true },
        { name: 'caducidad', label: 'Caducidad (AAAA-MM-DD)', type: 'text', required: true, index: true, validate: (v: unknown) => validarFecha(v, false) },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'cantidadRecibida', label: 'Cantidad recibida (unidades base)', type: 'number', required: true, min: 0, access: { update: soloSistema } },
        {
          name: 'existencia',
          label: 'Existencia (unidades base)',
          type: 'number',
          required: true,
          defaultValue: 0,
          index: true,
          admin: { readOnly: true, description: 'Suma del kardex. La mantiene el sistema.' },
          access: { update: soloSistema },
        },
        { name: 'costoUnidad', label: 'Costo por unidad base (MXN)', type: 'number', min: 0, access: { read: leeCostos } },
      ],
    },
    { name: 'referencia', label: 'Origen', type: 'text', admin: { description: 'Compra COM-… o motivo del ajuste.' } },
    { name: 'bloqueado', label: 'Bloqueado para venta', type: 'checkbox', defaultValue: false, admin: { description: 'Un lote vencido queda bloqueado solo; también se puede bloquear a mano (retiro, cuarentena).' } },
  ],
}

export const FarMovimientos: CollectionConfig = {
  slug: 'far-movimientos',
  typescript: { interface: 'FarMovimiento' },
  labels: { singular: 'Movimiento de inventario', plural: 'Kardex (movimientos)' },
  admin: {
    useAsTitle: 'id',
    group: 'Farmacia',
    defaultColumns: ['createdAt', 'tipo', 'producto', 'lote', 'cantidad', 'usuario'],
    description: 'Kardex inmutable: cada entrada y salida por lote. No se edita ni se borra; una corrección es un movimiento inverso con motivo.',
  },
  access: {
    read: equipoFarmacia,
    create: nadie,
    update: nadie,
    delete: nadie,
  },
  hooks: {
    beforeChange: [
      ({ operation }) => {
        if (operation === 'update') throw new APIError('El kardex es inmutable: registra un movimiento inverso con motivo en vez de editar.', 403, undefined, true)
      },
    ],
    beforeDelete: [
      () => {
        throw new APIError('El kardex es inmutable: un movimiento no se borra.', 403, undefined, true)
      },
    ],
  },
  fields: [
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [...TIPOS_MOVIMIENTO], index: true },
    { name: 'producto', label: 'Producto', type: 'relationship', relationTo: 'far-productos', required: true, index: true },
    { name: 'lote', label: 'Lote', type: 'relationship', relationTo: 'far-lotes', required: true, index: true },
    { name: 'almacen', label: 'Almacén', type: 'relationship', relationTo: 'far-almacenes', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'cantidad', label: 'Cantidad (unidades base, con signo)', type: 'number', required: true, admin: { description: 'Positiva entra, negativa sale.' } },
        { name: 'costoUnidad', label: 'Costo por unidad base (MXN)', type: 'number', min: 0, access: { read: leeCostos } },
        { name: 'dia', label: 'Día (AAAA-MM-DD)', type: 'text', required: true, index: true, validate: (v: unknown) => validarFecha(v, false) },
      ],
    },
    { name: 'referencia', label: 'Referencia', type: 'text', index: true, admin: { description: 'Folio de la compra, venta o pedido que lo originó.' } },
    { name: 'motivo', label: 'Motivo', type: 'text' },
    { name: 'usuario', label: 'Registró', type: 'relationship', relationTo: 'users', index: true },
    { name: 'existenciaDespues', label: 'Existencia del lote después', type: 'number', admin: { readOnly: true } },
  ],
}
