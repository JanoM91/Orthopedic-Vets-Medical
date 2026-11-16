import type { GlobalConfig } from 'payload'
import { esPersonal, permisosDe } from '../lib/permisos'

/**
 * Módulos activos de la instalación (octubre de 2026). Ver lib/modulos.ts.
 *
 * Lo edita SOLO el superadministrador (Sistema → «Instalación: módulos»).
 * Cualquier persona del equipo lo lee: el panel lo necesita para saber qué
 * menús pintar. Apagar un módulo no borra nada.
 */
export const InstalacionConfiguracion: GlobalConfig = {
  slug: 'instalacion-configuracion',
  typescript: { interface: 'InstalacionConfiguracion' },
  label: 'Instalación: módulos',
  admin: {
    group: 'Sistema',
    description: 'Enciende o apaga módulos. Apagar no borra datos.',
  },
  access: {
    read: ({ req }) => esPersonal(req),
    update: async ({ req }) => esPersonal(req) && (await permisosDe(req)).superadmin,
  },
  fields: [
    {
      name: 'modulos',
      label: 'Módulos',
      type: 'group',
      fields: [
        { name: 'clinica', label: 'Clínica: pacientes, expediente, agenda y portal del tutor', type: 'checkbox', defaultValue: true },
        { name: 'farmacia', label: 'Farmacia: catálogo, inventario, compras y ventas', type: 'checkbox', defaultValue: true },
        {
          name: 'tienda',
          label: 'Tienda en línea para tutores',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Necesita Farmacia.' },
        },
        {
          name: 'estetica',
          label: 'Estética: precios por talla, adicionales, tablero del día y ficha',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Necesita Clínica. Apagada, la estética se agenda como cualquier servicio.' },
        },
      ],
    },
  ],
}
