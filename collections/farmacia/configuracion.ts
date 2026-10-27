import type { GlobalConfig } from 'payload'
import { equipoFarmacia, farmaciaCon } from './acceso'

/**
 * Parámetros de la farmacia (octubre de 2026, docs/FARMACIA-PROMPT.md).
 * Lo edita quien tiene «Configuración de la farmacia» (dueño, superadmin).
 * Todo tiene un valor por omisión seguro: la farmacia funciona sin tocarlo.
 */
export const FarmaciaConfiguracion: GlobalConfig = {
  slug: 'farmacia-configuracion',
  typescript: { interface: 'FarmaciaConfiguracion' },
  label: 'Farmacia: parámetros',
  admin: { group: 'Farmacia', description: 'Avisos de caducidad, apartados, cierre del día, aprendizaje de mínimos y ligas con Finanzas.' },
  access: { read: equipoFarmacia, update: farmaciaCon('configurar') },
  fields: [
    {
      name: 'caducidad',
      label: 'Aviso de caducidad (días antes) por línea',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'medicamentos', label: 'Medicamentos y antiparasitarios', type: 'number', min: 1, defaultValue: 90 },
            { name: 'alimento', label: 'Alimento y dietas', type: 'number', min: 1, defaultValue: 60 },
            { name: 'otros', label: 'Suplementos, higiene y accesorios', type: 'number', min: 1, defaultValue: 60 },
            { name: 'urgente', label: 'Urgente (días)', type: 'number', min: 1, defaultValue: 30 },
          ],
        },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'horasApartado', label: 'Horas de apartado sin pago (tienda)', type: 'number', min: 1, defaultValue: 24 },
        {
          name: 'cierreDiaActivo',
          label: 'Cierre del día activo',
          type: 'checkbox',
          defaultValue: true,
          admin: { description: 'Propuesta del asistente, pendiente de confirmar con Jano (docs/FARMACIA-PROMPT.md). Se puede apagar aquí.' },
        },
        { name: 'recetaGrupoIIDomicilio', label: 'Grupo II a domicilio', type: 'checkbox', defaultValue: false, admin: { description: 'Por confirmar con el Dr. Joni. Apagado por omisión.' } },
        {
          name: 'exigirOriginalGrupoII',
          label: 'Exigir el original físico en Grupo II (receta externa)',
          type: 'checkbox',
          defaultValue: false,
          admin: { description: 'Apagado: la receta externa validada surte y el original queda «pendiente». Encendido: no surte hasta marcar el original recibido. Por confirmar con el Dr. Joni.' },
        },
      ],
    },
    {
      name: 'metodosPago',
      label: 'Métodos de pago del mostrador',
      type: 'array',
      labels: { singular: 'Método de pago', plural: 'Métodos de pago' },
      admin: { description: 'Cada método deposita en una cuenta o caja de Finanzas. La transferencia queda «por confirmar» hasta verla en el banco.' },
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'clave', label: 'Clave', type: 'text', required: true, admin: { description: 'Sin espacios: efectivo, terminal, transferencia, clip…' } },
            { name: 'nombre', label: 'Nombre visible', type: 'text', required: true },
            {
              name: 'tipo',
              label: 'Tipo',
              type: 'select',
              required: true,
              defaultValue: 'otro',
              options: [
                { label: 'Efectivo (da cambio)', value: 'efectivo' },
                { label: 'Terminal bancaria o Clip', value: 'terminal' },
                { label: 'Transferencia', value: 'transferencia' },
                { label: 'Otro', value: 'otro' },
              ],
            },
          ],
        },
        {
          type: 'row',
          fields: [
            { name: 'cuenta', label: 'Cuenta o caja de Finanzas', type: 'relationship', relationTo: 'fin-cuentas' },
            { name: 'porConfirmar', label: 'Queda por confirmar', type: 'checkbox', defaultValue: false },
            { name: 'activo', label: 'Activo', type: 'checkbox', defaultValue: true },
          ],
        },
      ],
    },
    {
      name: 'aprendizaje',
      label: 'Punto de reorden que aprende',
      type: 'group',
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'semanasHistorial', label: 'Semanas de ventas para proponer', type: 'number', min: 1, defaultValue: 8 },
            { name: 'diasCobertura', label: 'Días de cobertura al reabastecer', type: 'number', min: 1, defaultValue: 30 },
            { name: 'diasEntregaPorOmision', label: 'Días de entrega si el proveedor no lo dice', type: 'number', min: 0, defaultValue: 3 },
          ],
        },
      ],
    },
    {
      name: 'promociones',
      label: 'Promoción sugerida por caducidad (solo Grupo III y desregulados)',
      type: 'array',
      labels: { singular: 'Escalón', plural: 'Escalones' },
      defaultValue: [
        { diasAntes: 90, descuentoPorciento: 15 },
        { diasAntes: 45, descuentoPorciento: 30 },
      ],
      fields: [
        {
          type: 'row',
          fields: [
            { name: 'diasAntes', label: 'Días antes de caducar', type: 'number', required: true, min: 1 },
            { name: 'descuentoPorciento', label: 'Descuento %', type: 'number', required: true, min: 1, max: 90 },
          ],
        },
      ],
    },
    { name: 'politicaDevoluciones', label: 'Política de devoluciones (texto)', type: 'textarea', admin: { description: 'Por confirmar con el Dr. Joni. Por omisión no se aceptan medicamentos salvo error de la farmacia.' } },
    { name: 'almacenPorOmision', label: 'Almacén por omisión', type: 'relationship', relationTo: 'far-almacenes' },
    {
      name: 'finanzas',
      label: 'Ligas con Finanzas',
      type: 'group',
      admin: { description: 'Cada venta crea una entrada y cada compra un gasto en Finanzas con esta área y categorías (fases 2 y 3).' },
      fields: [
        { name: 'area', label: 'Área (actividad) de Finanzas', type: 'relationship', relationTo: 'fin-actividades' },
        {
          type: 'row',
          fields: [
            { name: 'categoriaVentas', label: 'Categoría de las ventas (entrada)', type: 'relationship', relationTo: 'fin-categorias' },
            { name: 'categoriaCompras', label: 'Categoría de las compras (gasto)', type: 'relationship', relationTo: 'fin-categorias' },
          ],
        },
      ],
    },
    {
      name: 'pasarelaActiva',
      label: 'Pasarela de pago en línea',
      type: 'select',
      defaultValue: 'ninguna',
      options: [
        { label: 'Ninguna (sin tienda)', value: 'ninguna' },
        { label: 'Mercado Pago', value: 'mercadopago' },
      ],
    },
  ],
}
