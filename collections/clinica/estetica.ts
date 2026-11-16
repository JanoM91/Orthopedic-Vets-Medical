import type { CollectionConfig, GlobalConfig } from 'payload'
import { esPersonal } from '../../lib/permisos'
import { equipoCon, nadie } from './acceso'

/**
 * Estética (módulo activable «estetica», nov-2026). Submarca de la clínica
 * (en OVM: Peluqueadogs). Etapa E1: precio y duración por talla, adicionales
 * y cobro con lo pactado al agendar.
 *
 * La talla sale del último peso de la mascota según los límites de esta
 * configuración, salvo que la mascota tenga una talla fijada a mano.
 */

export const TALLAS = [
  { label: 'Chica', value: 'chico' },
  { label: 'Mediana', value: 'mediano' },
  { label: 'Grande', value: 'grande' },
  { label: 'Gigante', value: 'gigante' },
] as const
export type Talla = (typeof TALLAS)[number]['value']

export const EsteticaConfiguracion: GlobalConfig = {
  slug: 'estetica-configuracion',
  typescript: { interface: 'EsteticaConfiguracion' },
  label: 'Estética: marca y tallas',
  admin: { group: 'Clínica', description: 'Nombre de la estética y límites de peso de cada talla. Los precios van en cada servicio de estética.' },
  access: { read: ({ req }) => esPersonal(req), update: equipoCon('configurarAgenda') },
  fields: [
    { name: 'nombreMarca', label: 'Nombre de la estética (lo ve el tutor)', type: 'text', admin: { description: 'Ej. el nombre de tu estética. Vacío: «Estética».' } },
    { name: 'logo', label: 'Logotipo (ruta en public/ o URL)', type: 'text', admin: { description: 'Opcional. Ej. /marcas/mi-estetica.png' } },
    {
      name: 'tallas',
      label: 'Talla por peso (kg)',
      type: 'group',
      admin: { description: 'Hasta cuántos kilos es cada talla. Más que «Grande» es «Gigante».' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'chicoHasta', label: 'Chica hasta', type: 'number', defaultValue: 10, min: 1, max: 100 },
            { name: 'medianoHasta', label: 'Mediana hasta', type: 'number', defaultValue: 25, min: 1, max: 100 },
            { name: 'grandeHasta', label: 'Grande hasta', type: 'number', defaultValue: 40, min: 1, max: 150 },
          ],
        },
      ],
    },
  ],
}

/** Adicionales que se suman a un servicio de estética (corte de uñas, deslanado, perfume…). */
export const EstAdicionales: CollectionConfig = {
  slug: 'est-adicionales',
  typescript: { interface: 'EstAdicional' },
  labels: { singular: 'Adicional de estética', plural: 'Adicionales de estética' },
  admin: { group: 'Clínica', useAsTitle: 'nombre', defaultColumns: ['nombre', 'precio', 'duracionMin', 'enLinea', 'activo'], description: 'Se suman al precio y al tiempo de un servicio de estética.' },
  access: { read: ({ req }) => esPersonal(req), create: equipoCon('configurarAgenda'), update: equipoCon('configurarAgenda'), delete: nadie },
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true },
    { name: 'descripcion', label: 'Qué es (lo ve el tutor)', type: 'text' },
    {
      type: 'row',
      fields: [
        { name: 'precio', label: 'Precio (pesos)', type: 'number', required: true, min: 0 },
        { name: 'duracionMin', label: 'Minutos extra', type: 'number', defaultValue: 0, min: 0, max: 240 },
      ],
    },
    { name: 'enLinea', label: 'El tutor lo puede agregar al pedir cita', type: 'checkbox', defaultValue: true },
    { name: 'orden', label: 'Orden', type: 'number', defaultValue: 0 },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true, index: true },
  ],
}
