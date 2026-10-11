import type { CollectionConfig, GlobalConfig } from 'payload'
import { configuraFinanzas, nadie, usaFinanzasOPanel } from '../../lib/permisos'
import { esFechaValida, tieneDosDecimalesOMenos } from '../../lib/finanzas/reglas'

/**
 * Catálogos de Finanzas: cuentas, categorías, actividades (áreas) y la fecha
 * de corte (heredados de MacAuto Finanzas, docs/60 de ese proyecto).
 *
 * Se editan con las pantallas de siempre del panel (grupo «Finanzas»), por
 * quien tenga la casilla «Configurar…» en su rol. No se borran: se
 * desactivan, para que los registros que ya los usan conserven su historia.
 *
 * Los nombres sugeridos de actividades y categorías (propios de la clínica)
 * se crean desde Finanzas → Configuración y se pueden cambiar aquí.
 */

const validarPesos = (v: unknown) => {
  if (v == null || v === '') return true
  return typeof v === 'number' && tieneDosDecimalesOMenos(v) ? true : 'Usa a lo más dos decimales.'
}
const validarFecha = (v: unknown) => (v == null || v === '' || esFechaValida(v) ? true : 'Escribe la fecha como AAAA-MM-DD, por ejemplo 2026-10-01.')

const accesoCatalogo: CollectionConfig['access'] = {
  read: usaFinanzasOPanel,
  create: configuraFinanzas,
  update: configuraFinanzas,
  delete: nadie,
}

export const FinCuentas: CollectionConfig = {
  slug: 'fin-cuentas',
  typescript: { interface: 'FinCuenta' },
  labels: { singular: 'Cuenta o caja', plural: 'Cuentas y cajas' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Finanzas',
    defaultColumns: ['nombre', 'tipo', 'saldoInicial', 'activa'],
    description:
      'Dónde vive el dinero: bancos, efectivo, caja chica y fondos a cargo de empleados. El medio de pago (transferencia, efectivo, tarjeta) se registra aparte en cada movimiento. Desactivar no borra la historia.',
  },
  access: accesoCatalogo,
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true, admin: { description: 'Ej. «Banco · Cuenta principal» o «Caja chica · Recepción»' } },
    {
      name: 'tipo',
      label: 'Tipo',
      type: 'select',
      required: true,
      defaultValue: 'banco',
      options: [
        { label: 'Cuenta bancaria', value: 'banco' },
        { label: 'Efectivo', value: 'efectivo' },
        { label: 'Caja chica', value: 'caja_chica' },
        { label: 'Fondo a cargo de un empleado', value: 'fondo' },
        { label: 'Otro', value: 'otro' },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'saldoInicial',
          label: 'Saldo inicial (MXN)',
          type: 'number',
          required: true,
          defaultValue: 0,
          validate: validarPesos,
          admin: { description: 'Lo que había en la fecha de inicio. No es una entrada del periodo.' },
        },
        { name: 'fechaInicio', label: 'Fecha de inicio (AAAA-MM-DD)', type: 'text', required: true, validate: validarFecha, admin: { description: 'Normalmente, la fecha de corte.' } },
      ],
    },
    { name: 'responsable', label: 'A cargo de', type: 'relationship', relationTo: 'users', admin: { description: 'Solo para cajas o fondos que maneja una persona.' } },
    { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
    { name: 'notas', label: 'Notas', type: 'textarea' },
  ],
}

export const FinActividades: CollectionConfig = {
  slug: 'fin-actividades',
  typescript: { interface: 'FinActividad' },
  labels: { singular: 'Actividad o área', plural: 'Actividades y áreas' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Finanzas',
    defaultColumns: ['nombre', 'activa'],
    description: 'A qué área de la clínica corresponde una entrada o un gasto (consulta, cirugía, rehabilitación, administración…).',
  },
  access: accesoCatalogo,
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true },
    { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
  ],
}

export const FinCategorias: CollectionConfig = {
  slug: 'fin-categorias',
  typescript: { interface: 'FinCategoria' },
  labels: { singular: 'Categoría', plural: 'Categorías' },
  admin: {
    useAsTitle: 'nombre',
    group: 'Finanzas',
    defaultColumns: ['nombre', 'tipo', 'restringida', 'activa'],
    description: 'En qué se ingresó o en qué se gastó. Las restringidas (como nómina) solo las ve quien tenga esa casilla en su rol.',
  },
  access: accesoCatalogo,
  fields: [
    { name: 'nombre', label: 'Nombre', type: 'text', required: true, unique: true },
    {
      name: 'tipo',
      label: 'Es para',
      type: 'select',
      required: true,
      options: [
        { label: 'Entradas', value: 'entrada' },
        { label: 'Gastos', value: 'gasto' },
      ],
    },
    {
      name: 'restringida',
      label: 'Restringida',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Solo la ven y la registran roles con «Ver categorías restringidas».' },
    },
    { name: 'actividadSugerida', label: 'Actividad o área sugerida', type: 'relationship', relationTo: 'fin-actividades' },
    { name: 'activa', label: 'Activa', type: 'checkbox', defaultValue: true },
  ],
}

export const FinConfiguracion: GlobalConfig = {
  slug: 'fin-configuracion',
  typescript: { interface: 'FinConfiguracion' },
  label: 'Configuración de Finanzas',
  admin: { group: 'Finanzas' },
  access: { read: usaFinanzasOPanel, update: configuraFinanzas },
  fields: [
    {
      name: 'fechaCorte',
      label: 'Fecha de corte (AAAA-MM-DD)',
      type: 'text',
      validate: validarFecha,
      admin: {
        description:
          'Desde aquí empieza a contar Finanzas. Lo anterior entra como saldos iniciales e inventario de apertura, nunca como entradas o gastos del periodo.',
      },
    },
  ],
}
