import type { CollectionConfig } from 'payload'
import { esPersonal, permisosDe } from '../../lib/permisos'
import { MAX_FOTO_BASE64 } from '../../lib/fotosBase64'
import { folioDesdeId, nadie, soloEquipoLee } from './acceso'

/**
 * RUTA ORTOPÉDICA · FASE 3: HOSPITALIZACIÓN (nov-2026, decisiones de Jano:
 * el cobro es «solo lo que capture el equipo» y el tutor ve un «parte del día»).
 *
 * Un internamiento (`hos-internamientos`, folio HOS-) por estancia. Guarda:
 *   - indicaciones del médico (tratamiento, dosis TAL CUAL la escribe, vía,
 *     frecuencia en texto y las horas que el médico fija) — la plataforma no
 *     calcula ni sugiere dosis ni horarios;
 *   - aplicaciones: cada aplicación u omisión (con motivo) de una indicación, y
 *     a qué hora programada corresponde;
 *   - observaciones (temperatura, FC, FR, dolor, apetito, orina, heces, notas);
 *   - cargos que captura el equipo (al dar de alta, su suma entra a Finanzas);
 *   - partes para el tutor (texto y foto opcional), que el tutor lee en su app
 *     o con una liga sin cuenta; nunca ve indicaciones ni medicamentos;
 *   - alta: resumen interno e indicaciones para casa (las ve el tutor).
 *
 * Solo lo escribe `lib/clinica/hospital.ts` (API genérica 403). El token de la
 * liga del tutor nunca sale por la API genérica.
 */
const leeEquipo = async ({ req }: { req: Parameters<typeof esPersonal>[0] }) => {
  if (!esPersonal(req)) return false
  const p = (await permisosDe(req)).clinica
  return p.verExpediente || p.agenda
}

export const APETITO = [
  { label: 'Comió todo', value: 'completo' },
  { label: 'Comió parte', value: 'parcial' },
  { label: 'No comió', value: 'nada' },
  { label: 'En ayuno', value: 'ayuno' },
] as const

export const HosInternamientos: CollectionConfig = {
  slug: 'hos-internamientos',
  typescript: { interface: 'HosInternamiento' },
  labels: { singular: 'Internamiento', plural: 'Internamientos' },
  admin: { group: 'Clínica', useAsTitle: 'motivo', hidden: true },
  defaultSort: '-createdAt',
  access: { read: leeEquipo, create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'folio', type: 'text', virtual: true, admin: { readOnly: true }, hooks: { afterRead: [folioDesdeId('HOS')] } },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'cliente', type: 'relationship', relationTo: 'clientes' },
    { name: 'hoja', label: 'Hoja quirúrgica', type: 'relationship', relationTo: 'cir-hojas' },
    { name: 'presupuesto', type: 'relationship', relationTo: 'cir-presupuestos' },
    { name: 'medico', type: 'relationship', relationTo: 'users' },
    { name: 'motivo', type: 'text', required: true, maxLength: 200 },
    { name: 'espacio', label: 'Jaula o espacio', type: 'text', maxLength: 40 },
    { name: 'estado', type: 'select', required: true, defaultValue: 'internado', index: true, options: [{ label: 'Internado', value: 'internado' }, { label: 'Dado de alta', value: 'alta' }] },
    { name: 'ingreso', type: 'date', required: true },
    { name: 'alta', type: 'date' },
    {
      name: 'indicaciones',
      type: 'array',
      maxRows: 60,
      fields: [
        { name: 'clave', type: 'text', required: true },
        { name: 'tratamiento', type: 'text', required: true, maxLength: 120 },
        { name: 'dosis', type: 'text', maxLength: 80 },
        { name: 'via', type: 'text', maxLength: 40 },
        { name: 'frecuencia', type: 'text', maxLength: 60 },
        { name: 'horas', type: 'text', maxLength: 120, admin: { description: 'Horas que fija el médico, HH:MM separadas por coma. Vacío = según necesidad.' } },
        { name: 'nota', type: 'text', maxLength: 300 },
        { name: 'activa', type: 'checkbox', defaultValue: true },
        { name: 'desde', type: 'date' },
        { name: 'por', type: 'text' },
        { name: 'suspendidaEn', type: 'date' },
        { name: 'suspendidaPor', type: 'text' },
      ],
    },
    {
      name: 'aplicaciones',
      type: 'array',
      maxRows: 2000,
      fields: [
        { name: 'indicacion', type: 'text', required: true },
        { name: 'programada', type: 'text', admin: { description: 'AAAA-MM-DD HH:MM o vacío (según necesidad).' } },
        { name: 'estado', type: 'select', required: true, options: [{ label: 'Aplicada', value: 'aplicada' }, { label: 'Omitida', value: 'omitida' }] },
        { name: 'en', type: 'date', required: true },
        { name: 'motivo', type: 'text', maxLength: 200 },
        { name: 'nota', type: 'text', maxLength: 200 },
        { name: 'por', type: 'text' },
      ],
    },
    {
      name: 'observaciones',
      type: 'array',
      maxRows: 1000,
      fields: [
        { name: 'en', type: 'date', required: true },
        ...['temp', 'fc', 'fr', 'dolor'].map((name) => ({ name, type: 'number' as const })),
        { name: 'apetito', type: 'select', options: [...APETITO] },
        { name: 'orina', type: 'checkbox' },
        { name: 'heces', type: 'checkbox' },
        { name: 'notas', type: 'text', maxLength: 500 },
        { name: 'por', type: 'text' },
      ],
    },
    {
      name: 'cargos',
      type: 'array',
      maxRows: 200,
      access: { read: soloEquipoLee },
      fields: [
        { name: 'concepto', type: 'text', required: true, maxLength: 160 },
        { name: 'cantidad', type: 'number', required: true },
        { name: 'precioUnitario', type: 'number', required: true },
        { name: 'importe', type: 'number', required: true },
        { name: 'fecha', type: 'text', required: true },
        { name: 'por', type: 'text' },
      ],
    },
    {
      name: 'partes',
      type: 'array',
      maxRows: 200,
      fields: [
        { name: 'en', type: 'date', required: true },
        { name: 'texto', type: 'textarea', required: true, maxLength: 1500 },
        { name: 'foto', type: 'text', maxLength: MAX_FOTO_BASE64 },
        { name: 'por', type: 'text' },
        { name: 'avisado', type: 'checkbox' },
      ],
    },
    { name: 'resumenAlta', type: 'textarea', maxLength: 3000, access: { read: soloEquipoLee } },
    { name: 'indicacionesAlta', label: 'Indicaciones para casa (las ve el tutor)', type: 'textarea', maxLength: 3000 },
    { name: 'cargoFinanzas', type: 'relationship', relationTo: 'fin-operaciones', access: { read: soloEquipoLee } },
    { name: 'token', type: 'text', index: true, access: { read: () => false } },
    { name: 'creadoPor', type: 'relationship', relationTo: 'users' },
    { name: 'altaPor', type: 'relationship', relationTo: 'users' },
  ],
}
