import type { CollectionConfig } from 'payload'
import { ESPECIES } from '../clinica/pacientes'
import { equipoFarmacia, farmaciaCon, nadie, soloSistema, folioParaId } from './acceso'

/**
 * Catálogo de la farmacia (octubre de 2026, docs/FARMACIA-PROMPT.md):
 * productos, presentaciones, almacenes y proveedores.
 *
 * MODELO:
 *   producto ──< presentaciones   («Caja 30 tabletas» = 30 unidades base)
 *   producto ──< lotes ──< movimientos (collections/farmacia/inventario.ts)
 *
 * UNIDAD BASE Y FACTOR: el inventario se lleva SIEMPRE en la unidad base del
 * producto (tableta, ml, g, pieza). Cada presentación dice cuántas unidades
 * base contiene (factor). Así la venta fraccionada (una tableta de una caja
 * de 30) descuenta 1 del mismo lote que la venta de la caja descuenta 30.
 *
 * GRUPO (NOM-064-ZOO-2000): I controlados con receta cuantificada, II con
 * receta simple, III venta libre, «desregulado» = no es medicamento (alimento,
 * accesorio). Decide qué se vende en línea y cómo se despacha (fases 3 y 5).
 *
 * FOLIO: `folio` es virtual y sale del id (PRD-00012): público e inmutable.
 * NADA SE BORRA: un producto se marca inactivo.
 */

export const GRUPOS = [
  { label: 'Grupo I · controlado (receta cuantificada, libro de control)', value: 'I' },
  { label: 'Grupo II · con receta médica', value: 'II' },
  { label: 'Grupo III · venta libre', value: 'III' },
  { label: 'Desregulado (alimento, accesorio, higiene)', value: 'desregulado' },
] as const

export const LINEAS = [
  { label: 'Medicamento', value: 'medicamento' },
  { label: 'Antiparasitario', value: 'antiparasitario' },
  { label: 'Alimento', value: 'alimento' },
  { label: 'Dieta de prescripción', value: 'dieta_prescripcion' },
  { label: 'Accesorio', value: 'accesorio' },
  { label: 'Higiene', value: 'higiene' },
  { label: 'Suplemento', value: 'suplemento' },
] as const

export const TIPOS_ALMACEN = [
  { label: 'Farmacia', value: 'farmacia' },
  { label: 'Clínica (uso interno)', value: 'clinica' },
  { label: 'Sucursal', value: 'sucursal' },
] as const

export const FarProductos: CollectionConfig = {
  slug: 'far-productos',
  typescript: { interface: 'FarProducto' },
  labels: { singular: 'Producto', plural: 'Productos' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Farmacia',
    defaultColumns: ['folio', 'nombre', 'linea', 'grupo', 'publicadoTienda', 'activo', 'updatedAt'],
    listSearchableFields: ['nombre', 'principioActivo', 'laboratorio', 'registroSenasica'],
    description: 'Catálogo de la farmacia. Precios en «Presentaciones».',
  },
  access: {
    read: equipoFarmacia,
    create: farmaciaCon('catalogo'),
    update: farmaciaCon('catalogo'),
    delete: nadie,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.nombre === 'string') data.nombre = data.nombre.trim()
        if (typeof data.principioActivo === 'string') data.principioActivo = data.principioActivo.trim() || null
        if (typeof data.laboratorio === 'string') data.laboratorio = data.laboratorio.trim() || null
        if (typeof data.registroSenasica === 'string') data.registroSenasica = data.registroSenasica.replace(/\s+/g, ' ').trim().toUpperCase() || null
        if (typeof data.unidadBase === 'string') data.unidadBase = data.unidadBase.trim().toLowerCase() || 'pieza'
        /* Grupo I y II son medicamentos por definición; un alimento o accesorio no puede ser controlado. */
        if ((data.grupo === 'I' || data.grupo === 'II') && (data.linea === 'alimento' || data.linea === 'accesorio' || data.linea === 'higiene')) {
          data.grupo = 'desregulado'
        }
        if (data.pesoMinKg != null && data.pesoMaxKg != null && Number(data.pesoMaxKg) < Number(data.pesoMinKg)) {
          const a = data.pesoMinKg
          data.pesoMinKg = data.pesoMaxKg
          data.pesoMaxKg = a
        }
        return data
      },
    ],
  },
  fields: [
    { name: 'folio', label: 'Folio', type: 'text', virtual: true, admin: { readOnly: true, position: 'sidebar' }, hooks: { afterRead: [({ data, originalDoc }) => { const id = (originalDoc as { id?: unknown } | undefined)?.id ?? (data as { id?: unknown } | undefined)?.id; return id == null ? null : folioParaId('PRD', id as number) }] } },
    { name: 'nombre', label: 'Nombre comercial', type: 'text', required: true, index: true },
    {
      type: 'row',
      fields: [
        { name: 'principioActivo', label: 'Principio activo', type: 'text', index: true },
        { name: 'laboratorio', label: 'Laboratorio o marca', type: 'text' },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'linea', label: 'Línea', type: 'select', required: true, defaultValue: 'medicamento', options: [...LINEAS], index: true },
        { name: 'grupo', label: 'Grupo (NOM-064)', type: 'select', required: true, defaultValue: 'III', options: [...GRUPOS], index: true },
        {
          name: 'registroSenasica',
          label: 'Registro SENASICA',
          type: 'text',
          admin: { description: 'El de la etiqueta (letra Q farmacéuticos, B biológicos). Obligatorio para Grupo I y II.' },
        },
      ],
    },
    {
      name: 'especies',
      label: 'Especies a las que aplica',
      type: 'select',
      hasMany: true,
      options: [...ESPECIES],
      admin: { description: 'Vacío = todas. Se usa para validar contra el perfil de la mascota.' },
    },
    {
      type: 'row',
      fields: [
        { name: 'pesoMinKg', label: 'Peso mínimo (kg)', type: 'number', min: 0 },
        { name: 'pesoMaxKg', label: 'Peso máximo (kg)', type: 'number', min: 0 },
        { name: 'edadMinMeses', label: 'Edad mínima (meses)', type: 'number', min: 0 },
      ],
    },
    {
      name: 'alergenos',
      label: 'Alérgenos o principios a cruzar con alergias',
      type: 'text',
      admin: { description: 'Separados por coma. Si la mascota tiene una alergia que coincide, la venta se bloquea en la tienda y pide autorización en mostrador.' },
    },
    {
      type: 'row',
      fields: [
        { name: 'unidadBase', label: 'Unidad base', type: 'text', required: true, defaultValue: 'pieza', admin: { description: 'tableta, ml, g, kg, pieza, dosis…' } },
        { name: 'refrigeracion', label: 'Requiere refrigeración', type: 'checkbox', defaultValue: false },
        {
          name: 'duracionDias',
          label: 'Duración por omisión (días)',
          type: 'number',
          min: 0,
          admin: { description: 'Cuántos días cubre una unidad base si no hay receta (p. ej. pipeta = 30). Sirve para el aviso de recompra.' },
        },
      ],
    },
    { name: 'descripcion', label: 'Descripción para la tienda', type: 'textarea' },
    { name: 'imagenUrl', label: 'Imagen (URL)', type: 'text', admin: { description: 'Temporal: en la fase 5 las imágenes se suben al almacén de la instalación.' } },
    {
      name: 'publicadoTienda',
      label: 'Publicado en la tienda',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      admin: { position: 'sidebar', description: 'Grupo I nunca aparece en el catálogo público aunque esté marcado.' },
    },
    {
      type: 'row',
      fields: [
        { name: 'minimoInventario', label: 'Mínimo de inventario (unidades base)', type: 'number', min: 0, defaultValue: 0 },
        { name: 'puntoReordenPropuesto', label: 'Punto de reorden propuesto', type: 'number', min: 0, admin: { readOnly: true, description: 'Lo calcula el sistema con 8 semanas de ventas (fase 4).' }, access: { create: soloSistema, update: soloSistema } },
        { name: 'puntoReordenAceptado', label: 'Punto de reorden aceptado', type: 'number', min: 0 },
      ],
    },
    { name: 'proveedorPreferente', label: 'Proveedor preferente', type: 'relationship', relationTo: 'far-proveedores' },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true, index: true, admin: { position: 'sidebar' } },
    { name: 'notasInternas', label: 'Notas internas', type: 'textarea' },
  ],
}

export const FarPresentaciones: CollectionConfig = {
  slug: 'far-presentaciones',
  typescript: { interface: 'FarPresentacion' },
  labels: { singular: 'Presentación', plural: 'Presentaciones' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Farmacia',
    defaultColumns: ['producto', 'nombre', 'factor', 'precio', 'codigoBarras', 'activa'],
    listSearchableFields: ['nombre', 'codigoBarras'],
    description: 'Cómo se vende cada producto (caja, tableta, frasco) y su precio.',
  },
  access: {
    read: equipoFarmacia,
    create: farmaciaCon('catalogo'),
    update: farmaciaCon('catalogo'),
    delete: nadie,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.nombre === 'string') data.nombre = data.nombre.trim()
        if (typeof data.codigoBarras === 'string') data.codigoBarras = data.codigoBarras.replace(/\s+/g, '').trim() || null
        return data
      },
    ],
  },
  fields: [
    { name: 'producto', label: 'Producto', type: 'relationship', relationTo: 'far-productos', required: true, index: true },
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, admin: { description: 'Ej. «Caja 30 tabletas», «Tableta suelta», «Bolsa 2 kg».' } },
    {
      type: 'row',
      fields: [
        { name: 'factor', label: 'Unidades base que contiene', type: 'number', required: true, min: 0.001, defaultValue: 1 },
        { name: 'precio', label: 'Precio de venta (MXN, con IVA)', type: 'number', required: true, min: 0 },
        { name: 'codigoBarras', label: 'Código de barras', type: 'text', index: true },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'fraccionada', label: 'Es venta fraccionada (unidad suelta)', type: 'checkbox', defaultValue: false },
        { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
      ],
    },
  ],
}

export const FarAlmacenes: CollectionConfig = {
  slug: 'far-almacenes',
  typescript: { interface: 'FarAlmacen' },
  labels: { singular: 'Almacén', plural: 'Almacenes' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Farmacia',
    defaultColumns: ['nombre', 'tipo', 'activo'],
    description: 'Dónde está la existencia.',
  },
  access: {
    read: equipoFarmacia,
    create: farmaciaCon('configurar'),
    update: farmaciaCon('configurar'),
    delete: nadie,
  },
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true },
    { name: 'tipo', label: 'Tipo', type: 'select', required: true, defaultValue: 'farmacia', options: [...TIPOS_ALMACEN] },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true },
  ],
}

export const FarProveedores: CollectionConfig = {
  slug: 'far-proveedores',
  typescript: { interface: 'FarProveedor' },
  labels: { singular: 'Proveedor', plural: 'Proveedores' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Farmacia',
    defaultColumns: ['nombre', 'rfc', 'diasEntrega', 'activo'],
    listSearchableFields: ['nombre', 'rfc'],
    description: 'A quién se le compra. Los días de entrega alimentan el punto de reorden.',
  },
  access: {
    read: equipoFarmacia,
    create: farmaciaCon('configurar'),
    update: farmaciaCon('configurar'),
    delete: nadie,
  },
  hooks: {
    beforeValidate: [
      ({ data }) => {
        if (!data) return data
        if (typeof data.nombre === 'string') data.nombre = data.nombre.trim()
        if (typeof data.rfc === 'string') data.rfc = data.rfc.replace(/\s+/g, '').trim().toUpperCase() || null
        return data
      },
    ],
  },
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true },
    {
      type: 'row',
      fields: [
        { name: 'rfc', label: 'RFC', type: 'text', index: true, admin: { description: 'Con el RFC el XML de la factura reconoce al proveedor solo.' } },
        { name: 'diasEntrega', label: 'Días de entrega', type: 'number', min: 0, defaultValue: 3 },
      ],
    },
    {
      name: 'contacto',
      label: 'Contacto',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'nombre', label: 'Nombre', type: 'text' },
            { name: 'telefono', label: 'Teléfono (WhatsApp)', type: 'text' },
            { name: 'correo', label: 'Correo', type: 'email' },
          ],
        },
      ],
    },
    { name: 'notas', label: 'Notas', type: 'textarea' },
    { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true },
  ],
}
