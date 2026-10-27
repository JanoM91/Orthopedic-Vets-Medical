import type { CollectionConfig } from 'payload'
import { equipoFarmacia, farmaciaCon, nadie, validarFecha } from './acceso'

/**
 * Alertas y promociones por caducidad (fase 4, docs/FARMACIA-PROMPT.md).
 *
 * TODA escritura pasa por lib/farmacia/alertas.ts: la API genérica solo lee.
 *
 * UNA SOLA ALERTA ABIERTA POR OBJETO Y TIPO: `claveAbierta` vale
 * «tipo:objeto» mientras la alerta está abierta y null al atenderla o
 * descartarla. Es única en la base (Postgres permite muchos null), así que dos
 * corridas simultáneas del cron no pueden duplicar una alerta.
 *
 * Una promoción por caducidad solo nace como «propuesta» para un lote de
 * Grupo III o desregulado; la aprueba un humano. Nunca en receta ni controlados.
 */

export const TIPOS_ALERTA = [
  { label: 'Caducidad', value: 'caducidad' },
  { label: 'Desabasto', value: 'desabasto' },
  { label: 'Punto de reorden sugerido', value: 'reorden_sugerido' },
  { label: 'Sin rotación', value: 'sin_rotacion' },
  { label: 'Receta por validar', value: 'receta_por_validar' },
  { label: 'Original de receta pendiente', value: 'original_pendiente' },
  { label: 'Plan por renovar', value: 'plan_por_renovar' },
] as const

export const FarAlertas: CollectionConfig = {
  slug: 'far-alertas',
  typescript: { interface: 'FarAlerta' },
  labels: { singular: 'Alerta', plural: 'Alertas' },
  admin: {
    useAsTitle: 'mensaje',
    group: 'Farmacia',
    defaultColumns: ['tipo', 'severidad', 'mensaje', 'estado', 'abiertaEn'],
    description: 'Caducidad, desabasto, reorden sugerido, sin rotación y recetas. Las genera el sistema (cron diario o «Recalcular»); una sola abierta por objeto y tipo.',
  },
  access: { read: equipoFarmacia, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [...TIPOS_ALERTA], index: true },
    {
      name: 'severidad',
      label: 'Severidad',
      type: 'select',
      required: true,
      defaultValue: 'aviso',
      index: true,
      options: [
        { label: 'Aviso', value: 'aviso' },
        { label: 'Urgente', value: 'urgente' },
        { label: 'Crítica', value: 'critica' },
      ],
    },
    { name: 'estado', label: 'Estado', type: 'select', required: true, defaultValue: 'abierta', index: true, options: [{ label: 'Abierta', value: 'abierta' }, { label: 'Atendida', value: 'atendida' }, { label: 'Descartada', value: 'descartada' }] },
    { name: 'objeto', label: 'Objeto', type: 'text', required: true, index: true, admin: { description: 'lote-12, producto-3, receta-8…' } },
    { name: 'claveAbierta', type: 'text', unique: true, admin: { hidden: true } },
    { name: 'mensaje', label: 'Mensaje', type: 'text', required: true },
    { type: 'row', fields: [{ name: 'producto', type: 'relationship', relationTo: 'far-productos', index: true }, { name: 'lote', type: 'relationship', relationTo: 'far-lotes' }, { name: 'receta', type: 'relationship', relationTo: 'far-recetas' }] },
    { name: 'valor', label: 'Valor (existencia, días, punto propuesto…)', type: 'number' },
    { type: 'row', fields: [{ name: 'abiertaEn', type: 'date', required: true }, { name: 'actualizadaEn', type: 'date' }] },
    { type: 'row', fields: [{ name: 'cerradaEn', type: 'date' }, { name: 'cerradaPor', type: 'relationship', relationTo: 'users' }, { name: 'cierreAutomatico', type: 'checkbox', defaultValue: false }] },
    { name: 'nota', type: 'text' },
  ],
}

export const FarPromociones: CollectionConfig = {
  slug: 'far-promociones',
  typescript: { interface: 'FarPromocion' },
  labels: { singular: 'Promoción', plural: 'Promociones' },
  admin: {
    useAsTitle: 'titulo',
    group: 'Farmacia',
    defaultColumns: ['titulo', 'descuentoPorciento', 'estado', 'vigenteHasta'],
    description: 'Propuestas por caducidad (solo Grupo III y desregulados) que un humano aprueba. Se aplican en la tienda (fase 5) y solo al lote afectado.',
  },
  access: { read: farmaciaCon('vender'), create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'titulo', type: 'text', required: true },
    { type: 'row', fields: [{ name: 'producto', type: 'relationship', relationTo: 'far-productos', required: true, index: true }, { name: 'lote', type: 'relationship', relationTo: 'far-lotes', index: true }] },
    { type: 'row', fields: [{ name: 'descuentoPorciento', label: 'Descuento %', type: 'number', required: true, min: 1, max: 90 }, { name: 'diasParaCaducar', type: 'number' }] },
    {
      type: 'row',
      fields: [
        { name: 'vigenteDesde', type: 'text', required: true, validate: (v: unknown) => validarFecha(v, false) },
        { name: 'vigenteHasta', label: 'Vigente hasta (antes de caducar)', type: 'text', required: true, index: true, validate: (v: unknown) => validarFecha(v, false) },
      ],
    },
    { name: 'origen', type: 'select', required: true, defaultValue: 'caducidad', options: [{ label: 'Caducidad', value: 'caducidad' }, { label: 'Manual', value: 'manual' }] },
    {
      name: 'estado',
      type: 'select',
      required: true,
      defaultValue: 'propuesta',
      index: true,
      options: [
        { label: 'Propuesta', value: 'propuesta' },
        { label: 'Aprobada', value: 'aprobada' },
        { label: 'Rechazada', value: 'rechazada' },
        { label: 'Vencida', value: 'vencida' },
      ],
    },
    { name: 'claveAbierta', type: 'text', unique: true, admin: { hidden: true, description: 'lote-<id> mientras está propuesta o aprobada.' } },
    { type: 'row', fields: [{ name: 'decididaPor', type: 'relationship', relationTo: 'users' }, { name: 'decididaEn', type: 'date' }, { name: 'motivo', type: 'text' }] },
  ],
}
