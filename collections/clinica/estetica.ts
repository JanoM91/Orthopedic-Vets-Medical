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
      type: 'row',
      fields: [
        { name: 'recordatorioActivo', label: 'Mandar «¿ya le toca su baño?» al tutor', type: 'checkbox', defaultValue: true },
        { name: 'semanasPorOmision', label: 'Si la ficha no dice cuándo, cada (semanas)', type: 'number', min: 1, max: 26, admin: { description: 'Vacío: solo se recuerda cuando la ficha trae «próximo baño sugerido».' } },
      ],
    },
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

export const QUE_SE_HIZO = [
  { label: 'Baño', value: 'bano' },
  { label: 'Secado', value: 'secado' },
  { label: 'Cepillado', value: 'cepillado' },
  { label: 'Corte de pelo', value: 'corte' },
  { label: 'Deslanado', value: 'deslanado' },
  { label: 'Corte de uñas', value: 'unas' },
  { label: 'Limpieza de oídos', value: 'oidos' },
  { label: 'Glándulas', value: 'glandulas' },
  { label: 'Cepillado dental', value: 'dientes' },
] as const

export const COMPORTAMIENTO = [
  { label: 'Tranquila', value: 'tranquila' },
  { label: 'Nerviosa', value: 'nerviosa' },
  { label: 'Necesitó bozal', value: 'bozal' },
  { label: 'Agresiva: no se terminó', value: 'agresiva' },
] as const

/** Lo que se observó: no es diagnóstico, es aviso para el médico y el tutor. */
export const HALLAZGOS = [
  { label: 'Pulgas', value: 'pulgas' },
  { label: 'Garrapatas', value: 'garrapatas' },
  { label: 'Heridas o costras', value: 'heridas' },
  { label: 'Nudos o mantos', value: 'nudos' },
  { label: 'Piel irritada o enrojecida', value: 'piel' },
  { label: 'Oídos sucios o con olor', value: 'oidos' },
  { label: 'Uñas largas o encarnadas', value: 'unas' },
  { label: 'Bultos', value: 'bultos' },
  { label: 'Otro', value: 'otro' },
] as const

/**
 * Ficha de estética (E2): una por cita. La escribe solo lib/clinica/esteticaDia.ts
 * (API genérica 403). La nota «para el tutor» y los hallazgos los verá el tutor
 * en el portal (E3); la nota interna no.
 */
export const EstFichas: CollectionConfig = {
  slug: 'est-fichas',
  typescript: { interface: 'EstFicha' },
  labels: { singular: 'Ficha de estética', plural: 'Fichas de estética' },
  admin: { group: 'Clínica', hidden: true },
  access: { read: nadie, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'cita', type: 'relationship', relationTo: 'citas', required: true, unique: true, index: true },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'dia', label: 'Día (AAAA-MM-DD)', type: 'text', required: true, index: true },
    { name: 'queSeHizo', type: 'select', hasMany: true, options: [...QUE_SE_HIZO] },
    { name: 'corte', label: 'Corte o estilo', type: 'text' },
    { name: 'productos', label: 'Productos usados', type: 'text' },
    { name: 'comportamiento', type: 'select', options: [...COMPORTAMIENTO] },
    { name: 'hallazgos', type: 'select', hasMany: true, options: [...HALLAZGOS] },
    { name: 'hallazgosNota', label: 'Detalle de lo observado', type: 'text' },
    { name: 'notaTutor', label: 'Nota para el tutor', type: 'textarea' },
    { name: 'notaInterna', label: 'Nota interna', type: 'textarea' },
    { name: 'proximaSemanas', label: 'Próximo baño sugerido (semanas)', type: 'number', min: 1, max: 26 },
    { name: 'hallazgosAvisadosEn', type: 'date' },
    { name: 'recordatorioEnviadoEn', label: '«¿Ya le toca?» enviado', type: 'date' },
    { name: 'realizadoPor', type: 'relationship', relationTo: 'users' },
  ],
}

/** Fotos antes y después (JPEG reducido en el navegador, base64; máximo 3 por momento y cita). API genérica 403. */
export const EstFotos: CollectionConfig = {
  slug: 'est-fotos',
  typescript: { interface: 'EstFoto' },
  labels: { singular: 'Foto de estética', plural: 'Fotos de estética' },
  admin: { group: 'Clínica', hidden: true },
  access: { read: nadie, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'cita', type: 'relationship', relationTo: 'citas', required: true, index: true },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'momento', type: 'select', required: true, options: [{ label: 'Antes', value: 'antes' }, { label: 'Después', value: 'despues' }] },
    { name: 'tipo', type: 'text', required: true },
    { name: 'datos', type: 'textarea', required: true },
    { name: 'bytes', type: 'number' },
    { name: 'subidaPor', type: 'text' },
  ],
}
