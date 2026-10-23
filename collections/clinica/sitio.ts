import type { GlobalConfig } from 'payload'
import { equipoCon } from './acceso'

/**
 * Contenido del SITIO PÚBLICO (octubre de 2026). Se edita en el panel
 * (Clínica → Sitio público) por quien tiene «Configurar agenda»; cualquiera lo
 * lee (es lo que ve el visitante). Lo que no se capture no aparece, salvo el
 * nombre de la marca (variable de entorno) y los servicios activos del
 * catálogo de la agenda, que se muestran siempre.
 *
 * Marca blanca: nada de la clínica va en código; una instalación nueva llena
 * este formulario y tiene sitio.
 */
export const SitioConfiguracion: GlobalConfig = {
  slug: 'sitio-configuracion',
  typescript: { interface: 'SitioConfiguracion' },
  label: 'Sitio público',
  admin: { group: 'Clínica', description: 'Lo que ven los visitantes en la página principal. Los servicios y el horario salen de la agenda.' },
  access: { read: () => true, update: equipoCon('configurarAgenda') },
  fields: [
    {
      name: 'publicado',
      label: 'Sitio publicado',
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Apagado: la raíz del dominio muestra solo el nombre y el acceso al portal y al panel (sin servicios ni datos). Enciéndelo cuando el contenido esté listo.' },
    },
    { name: 'lema', label: 'Lema (una frase)', type: 'text', admin: { description: 'Ej. «Cuidamos a quien cuida de ti».' } },
    { name: 'descripcion', label: 'Quiénes somos (2–4 líneas)', type: 'textarea' },
    {
      name: 'contacto',
      label: 'Contacto',
      type: 'group',
      fields: [
        { name: 'direccion', label: 'Dirección', type: 'text' },
        { name: 'mapaUrl', label: 'Liga a Google Maps', type: 'text' },
        { type: 'row', fields: [{ name: 'telefono', label: 'Teléfono', type: 'text' }, { name: 'whatsapp', label: 'WhatsApp (10 dígitos)', type: 'text' }] },
        { name: 'correo', label: 'Correo', type: 'email' },
        { name: 'urgencias', label: 'Nota de urgencias', type: 'text', admin: { description: 'Ej. «Urgencias: llama antes de venir, te decimos si podemos recibirte».' } },
      ],
    },
    {
      name: 'redes',
      label: 'Redes',
      type: 'group',
      fields: [{ type: 'row', fields: [{ name: 'facebook', label: 'Facebook (URL)', type: 'text' }, { name: 'instagram', label: 'Instagram (URL)', type: 'text' }, { name: 'tiktok', label: 'TikTok (URL)', type: 'text' }] }],
    },
    {
      name: 'equipo',
      label: 'Equipo',
      type: 'array',
      labels: { singular: 'Persona', plural: 'Personas' },
      fields: [
        { type: 'row', fields: [{ name: 'nombre', label: 'Nombre', type: 'text', required: true }, { name: 'cargo', label: 'Cargo', type: 'text' }] },
        { name: 'descripcion', label: 'Una línea sobre la persona', type: 'text' },
      ],
    },
    {
      name: 'preguntas',
      label: 'Preguntas frecuentes',
      type: 'array',
      labels: { singular: 'Pregunta', plural: 'Preguntas' },
      fields: [
        { name: 'pregunta', type: 'text', required: true },
        { name: 'respuesta', type: 'textarea', required: true },
      ],
    },
    { name: 'avisoPrivacidad', label: 'Aviso de privacidad (texto)', type: 'textarea', admin: { description: 'Se muestra en /aviso-de-privacidad. Si está vacío, la página dice que está en preparación.' } },
  ],
}
