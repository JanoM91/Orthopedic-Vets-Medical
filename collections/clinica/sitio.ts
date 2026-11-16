import type { CollectionConfig, GlobalConfig } from 'payload'
import { equipoCon, validarFechaOpcional } from './acceso'

/** Tope de una foto del sitio ya reducida en el navegador (JPEG de ~600 KB en base64, con su encabezado `data:`). */
export const MAX_FOTO_SITIO = 900_000

/**
 * FOTOS DEL SITIO (home versión B, nov-2026): portada, retrato del médico.
 * Son públicas por naturaleza (salen en la página principal), pero la API
 * genérica solo las da al equipo: el visitante las recibe por
 * `GET /api/sitio/fotos/:id`, con caché larga. La imagen se guarda como
 * `data:image/jpeg;base64,…`, reducida en el navegador por el campo
 * `components/admin/CampoFoto.tsx` (igual que las fotos de mascotas: sin
 * almacén público de archivos).
 */
export const SitioFotos: CollectionConfig = {
  slug: 'sitio-fotos',
  typescript: { interface: 'SitioFoto' },
  labels: { singular: 'Foto del sitio', plural: 'Fotos del sitio' },
  admin: { group: 'Clínica', useAsTitle: 'titulo', defaultColumns: ['titulo', 'updatedAt'], description: 'Fotos para la página principal: portada y retrato del médico. Súbelas aquí y elígelas en «Sitio público».' },
  access: { read: equipoCon('configurarAgenda'), create: equipoCon('configurarAgenda'), update: equipoCon('configurarAgenda'), delete: equipoCon('configurarAgenda') },
  fields: [
    { name: 'titulo', label: 'Qué muestra la foto', type: 'text', required: true, admin: { description: 'Ej. «Fachada de la clínica». Es también el texto que oyen las personas que usan lector de pantalla.' } },
    {
      name: 'imagen',
      label: 'Foto',
      type: 'textarea',
      required: true,
      maxLength: MAX_FOTO_SITIO,
      validate: (v: unknown) => (typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) && v.length <= MAX_FOTO_SITIO ? true : 'Elige una foto (JPG, PNG o WebP).'),
      admin: { components: { Field: '/components/admin/CampoFoto#default' } },
    },
  ],
}

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
  admin: { group: 'Clínica', description: 'Lo que ven los visitantes en la página principal.' },
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
      name: 'fotos',
      label: 'Fotos de la portada (hasta 4)',
      type: 'relationship',
      relationTo: 'sitio-fotos',
      hasMany: true,
      maxRows: 4,
      admin: { description: 'Salen junto al lema. Sin fotos, ahí va la tarjeta «Hoy» con el horario y la dirección.' },
    },
    {
      name: 'campana',
      label: 'Campaña vigente',
      type: 'group',
      admin: { description: 'Una banda destacada bajo la portada: la promoción o jornada a la que llegan tus anuncios. Apagada o vencida, no aparece.' },
      fields: [
        { name: 'activa', label: 'Mostrar la campaña', type: 'checkbox', defaultValue: false },
        { type: 'row', fields: [{ name: 'etiqueta', label: 'Etiqueta', type: 'text', admin: { description: 'Ej. «Solo en noviembre».' } }, { name: 'hasta', label: 'Último día (AAAA-MM-DD)', type: 'text', validate: validarFechaOpcional, admin: { description: 'Opcional. Al día siguiente la banda se quita sola.' } }] },
        { name: 'titulo', label: 'Título', type: 'text', admin: { description: 'Ej. «Jornada de esterilización». Sin título no se muestra.' } },
        { name: 'texto', label: 'Qué incluye, precio y condiciones (una o dos líneas)', type: 'textarea' },
        { name: 'boton', label: 'Texto del botón', type: 'text', admin: { description: 'Vacío: «Apartar mi lugar». Abre WhatsApp con el nombre de la campaña.' } },
      ],
    },
    {
      name: 'razones',
      label: 'Por qué elegirnos (hasta 3)',
      type: 'array',
      maxRows: 3,
      labels: { singular: 'Razón', plural: 'Razones' },
      fields: [
        { name: 'titulo', label: 'Título', type: 'text', required: true },
        { name: 'texto', label: 'Una o dos líneas', type: 'textarea' },
      ],
    },
    {
      name: 'doctor',
      label: 'Médico responsable',
      type: 'group',
      admin: { description: 'Sección «Lo atiende…» con foto y credenciales. Sin nombre no aparece.' },
      fields: [
        { type: 'row', fields: [{ name: 'nombre', label: 'Nombre', type: 'text', admin: { description: 'Como debe leerse. Ej. «Jonathan Velasco».' } }, { name: 'titulo', label: 'Título, con su artículo', type: 'text', admin: { description: 'Ej. «la médica veterinaria». Vacío: «el médico veterinario».' } }] },
        { name: 'presentacion', label: 'Presentación (2–3 líneas)', type: 'textarea' },
        { name: 'foto', label: 'Retrato', type: 'relationship', relationTo: 'sitio-fotos' },
        {
          name: 'credenciales',
          label: 'Credenciales',
          type: 'array',
          maxRows: 8,
          labels: { singular: 'Credencial', plural: 'Credenciales' },
          admin: { description: 'Una por renglón. Ej. Formación · Cédula profesional · Especialidad · Experiencia · Asociaciones.' },
          fields: [{ type: 'row', fields: [{ name: 'etiqueta', label: 'Qué es', type: 'text', required: true }, { name: 'valor', label: 'Dato', type: 'text', required: true }] }],
        },
      ],
    },
    {
      name: 'testimonios',
      label: 'Testimonios (hasta 6)',
      type: 'array',
      maxRows: 6,
      labels: { singular: 'Testimonio', plural: 'Testimonios' },
      admin: { description: 'Solo testimonios reales y con permiso de quien los dio.' },
      fields: [
        { name: 'texto', label: 'Lo que dijo', type: 'textarea', required: true },
        { name: 'autor', label: 'Quién (nombre y mascota)', type: 'text' },
      ],
    },
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
