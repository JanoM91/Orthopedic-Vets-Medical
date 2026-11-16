import type { CollectionConfig } from 'payload'
import { esPersonal, permisosDe } from '../../lib/permisos'
import { moduloActivo } from '../../lib/modulos'
import { nadie } from './acceso'

/**
 * Recompra (Farmacia, fase 6a, nov-2026). Una fila por quién compra (cliente o
 * correo del invitado) + mascota + producto, con la última compra y la fecha
 * estimada en que se acaba (unidades base × «duración por omisión» del
 * producto). La escribe SOLO lib/farmacia/recompra.ts (cron diario); la API
 * genérica deja leer al equipo que vende y responde 403 a crear, editar y
 * borrar. El token de la liga «Volver a pedir» no se lee por la API genérica.
 */
const leeRecompras = async ({ req }: { req: Parameters<typeof esPersonal>[0] }) => {
  if (!esPersonal(req)) return false
  if (!(await moduloActivo(req, 'farmacia'))) return false
  return (await permisosDe(req)).farmacia.vender
}

export const FarRecompras: CollectionConfig = {
  slug: 'far-recompras',
  typescript: { interface: 'FarRecompra' },
  labels: { singular: 'Recompra', plural: 'Recompras' },
  admin: { group: 'Farmacia', hidden: true },
  access: { read: leeRecompras, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'clave', type: 'text', required: true, unique: true, index: true },
    { name: 'cliente', type: 'relationship', relationTo: 'clientes', index: true },
    { name: 'correo', label: 'Correo (invitado)', type: 'text', index: true },
    { name: 'nombre', label: 'Nombre de quien compró', type: 'text' },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas' },
    { name: 'producto', type: 'relationship', relationTo: 'far-productos', required: true, index: true },
    { name: 'presentacion', type: 'relationship', relationTo: 'far-presentaciones', required: true },
    { type: 'row', fields: [{ name: 'cantidad', label: 'Presentaciones compradas', type: 'number', required: true }, { name: 'unidades', label: 'Unidades base', type: 'number', required: true }] },
    { name: 'ultimaVenta', type: 'relationship', relationTo: 'far-ventas', required: true },
    { type: 'row', fields: [{ name: 'ultimaCompra', label: 'Última compra (AAAA-MM-DD)', type: 'text', required: true }, { name: 'fechaEstimada', label: 'Se acaba (AAAA-MM-DD)', type: 'text', required: true, index: true }] },
    { type: 'row', fields: [{ name: 'avisadoPara', label: 'Avisado para la fecha', type: 'text' }, { name: 'avisadoEn', label: 'Avisado el', type: 'date' }] },
    { name: 'activa', label: 'Avisar', type: 'checkbox', defaultValue: true, index: true },
    { name: 'token', type: 'text', required: true, unique: true, access: { read: () => false }, admin: { hidden: true } },
  ],
}
