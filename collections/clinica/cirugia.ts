import type { CollectionConfig, GlobalConfig } from 'payload'
import { esPersonal, permisosDe } from '../../lib/permisos'
import { clienteDelTutor, equipoCon, folioDesdeId, leerEquipoOTutor, nadie, porMascotaDelCliente, soloEquipoLee } from './acceso'
import { MAX_FIRMA_BASE64 } from '../../lib/clinica/firma'

/**
 * RUTA ORTOPÉDICA · FASE 1: PRESUPUESTO Y CONSENTIMIENTO (nov-2026, decisión
 * de Jano: empezar por la entrada de la ruta; firma con el dedo en la app del
 * tutor o en una tableta de la clínica; la clínica opera y hospitaliza).
 *
 *   - `cir-presupuestos` (folio PRE-): lo arma el médico («Escribir
 *     expediente») en el expediente → Cirugía. Estados: borrador → enviado →
 *     aceptado o rechazado; cancelado. «Vencido» se calcula al leer
 *     (enviado y `vence` < hoy).
 *   - `cir-consentimientos` (folio CON-): la firma. Guarda el TEXTO EXACTO que
 *     se aceptó, el resumen del presupuesto, la imagen de la firma, quién firmó,
 *     dónde (app o clínica), cuándo, IP y navegador, y una huella SHA-256 de
 *     todo eso. Es inmutable.
 *   - `cirugia-configuracion` (global): texto base del consentimiento y
 *     vigencia por omisión.
 *
 * Solo `lib/clinica/cirugia.ts` crea y cambia presupuestos y consentimientos
 * (API genérica: crear, editar y borrar 403). El tutor lee los de sus mascotas
 * que ya se le enviaron.
 */

export const ESTADOS_PRESUPUESTO = [
  { label: 'Borrador', value: 'borrador' },
  { label: 'Enviado al tutor', value: 'enviado' },
  { label: 'Aceptado y firmado', value: 'aceptado' },
  { label: 'Rechazado', value: 'rechazado' },
  { label: 'Cancelado', value: 'cancelado' },
] as const

/** Texto base del consentimiento (borrador para que la clínica lo revise con su asesor). */
export const CONSENTIMIENTO_BASE = `Yo, {{tutor}}, como propietario(a) o responsable de {{mascota}} ({{especie}}), autorizo a {{clinica}} y a su equipo médico, a cargo de {{medico}}, a realizar el procedimiento: {{procedimiento}}, junto con la anestesia, los estudios y los medicamentos que el equipo considere necesarios para ese procedimiento.

Se me explicó en qué consiste, por qué se recomienda, qué alternativas hay y cuáles son sus riesgos. Entiendo que todo procedimiento con anestesia tiene riesgos, incluso de complicaciones graves o de muerte, aun cuando se tomen todas las precauciones. Riesgos particulares de este caso: {{riesgos}}

Si durante el procedimiento surge una situación que ponga en riesgo la vida de mi mascota, autorizo al equipo médico a actuar de inmediato; intentarán comunicarse conmigo en cuanto sea posible.

Conozco el presupuesto ({{total}}). Sé que puede cambiar si se presentan hallazgos o complicaciones; en ese caso me avisarán antes de continuar, salvo una urgencia.

Me comprometo a seguir las indicaciones de antes y después del procedimiento (ayuno, cuidados en casa, medicamentos y revisiones).

Declaro que pude hacer todas mis preguntas y que me fueron respondidas.`

export const CirPresupuestos: CollectionConfig = {
  slug: 'cir-presupuestos',
  typescript: { interface: 'CirPresupuesto' },
  labels: { singular: 'Presupuesto de cirugía', plural: 'Presupuestos de cirugía' },
  admin: { group: 'Clínica', useAsTitle: 'procedimiento', defaultColumns: ['folio', 'procedimiento', 'mascota', 'total', 'estado', 'updatedAt'], hidden: true },
  defaultSort: '-createdAt',
  access: {
    /* El tutor solo ve los que ya se le enviaron (nunca los borradores). */
    read: async ({ req }) => {
      if (esPersonal(req)) {
        const p = (await permisosDe(req)).clinica
        return p.verExpediente || p.agenda
      }
      const c = clienteDelTutor(req)
      return c != null ? { and: [porMascotaDelCliente(c), { estado: { not_equals: 'borrador' } }] } : false
    },
    create: nadie,
    update: nadie,
    delete: nadie,
  },
  fields: [
    { name: 'folio', type: 'text', virtual: true, admin: { readOnly: true }, hooks: { afterRead: [folioDesdeId('PRE')] } },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'cliente', type: 'relationship', relationTo: 'clientes', index: true },
    { name: 'medico', label: 'Médico a cargo', type: 'relationship', relationTo: 'users' },
    { name: 'procedimiento', label: 'Procedimiento', type: 'text', required: true, maxLength: 160 },
    { name: 'explicacion', label: 'Qué se va a hacer y por qué (lo lee el tutor)', type: 'textarea', maxLength: 3000 },
    { name: 'riesgos', label: 'Riesgos particulares de este caso', type: 'textarea', maxLength: 2000 },
    { name: 'indicaciones', label: 'Indicaciones antes de la cirugía (ayuno, etc.)', type: 'textarea', maxLength: 1500 },
    {
      name: 'renglones',
      type: 'array',
      required: true,
      minRows: 1,
      maxRows: 40,
      fields: [
        { name: 'concepto', type: 'text', required: true, maxLength: 160 },
        { name: 'servicio', type: 'relationship', relationTo: 'servicios' },
        { name: 'cantidad', type: 'number', required: true, min: 0.01 },
        { name: 'precioUnitario', type: 'number', required: true, min: 0 },
        { name: 'importe', type: 'number', required: true, min: 0 },
      ],
    },
    { name: 'total', type: 'number', required: true, min: 0 },
    { name: 'anticipo', label: 'Anticipo para apartar la fecha (pesos)', type: 'number', min: 0 },
    { name: 'vence', label: 'Vigente hasta (AAAA-MM-DD)', type: 'text', index: true },
    { name: 'estado', type: 'select', required: true, defaultValue: 'borrador', index: true, options: [...ESTADOS_PRESUPUESTO] },
    { name: 'enviadoEn', type: 'date' },
    { name: 'respondidoEn', type: 'date' },
    { name: 'motivoRechazo', type: 'text', maxLength: 300 },
    { name: 'motivoCancelacion', type: 'text', maxLength: 300, access: { read: soloEquipoLee } },
    { name: 'consentimiento', type: 'relationship', relationTo: 'cir-consentimientos' },
    { name: 'notasInternas', type: 'textarea', maxLength: 1000, access: { read: soloEquipoLee } },
    { name: 'creadoPor', type: 'relationship', relationTo: 'users', access: { read: soloEquipoLee } },
    /* Liga para revisar y firmar sin cuenta (/presupuesto/<id>/<token>). Nunca sale por la API genérica. */
    { name: 'token', type: 'text', index: true, access: { read: () => false } },
  ],
}

export const CirConsentimientos: CollectionConfig = {
  slug: 'cir-consentimientos',
  typescript: { interface: 'CirConsentimiento' },
  labels: { singular: 'Consentimiento firmado', plural: 'Consentimientos firmados' },
  admin: { group: 'Clínica', useAsTitle: 'nombreFirmante', hidden: true },
  defaultSort: '-createdAt',
  access: { read: leerEquipoOTutor('verExpediente', porMascotaDelCliente), create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'folio', type: 'text', virtual: true, admin: { readOnly: true }, hooks: { afterRead: [folioDesdeId('CON')] } },
    { name: 'presupuesto', type: 'relationship', relationTo: 'cir-presupuestos', required: true, unique: true },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'cliente', type: 'relationship', relationTo: 'clientes' },
    /* Lo que se aceptó, tal cual. */
    { name: 'texto', type: 'textarea', required: true },
    { name: 'resumen', type: 'json', required: true },
    { name: 'firma', type: 'text', required: true, maxLength: MAX_FIRMA_BASE64 },
    { name: 'nombreFirmante', type: 'text', required: true, maxLength: 120 },
    { name: 'via', type: 'select', required: true, options: [{ label: 'App del tutor', value: 'portal' }, { label: 'En la clínica', value: 'clinica' }] },
    { name: 'tutor', type: 'relationship', relationTo: 'tutores', access: { read: soloEquipoLee } },
    { name: 'testigo', label: 'Lo recibió en la clínica', type: 'relationship', relationTo: 'users', access: { read: soloEquipoLee } },
    { name: 'firmadoEn', type: 'date', required: true },
    { name: 'ip', type: 'text', access: { read: soloEquipoLee } },
    { name: 'navegador', type: 'text', access: { read: soloEquipoLee } },
    { name: 'huella', label: 'Huella SHA-256', type: 'text', required: true },
  ],
}

export const CirugiaConfiguracion: GlobalConfig = {
  slug: 'cirugia-configuracion',
  typescript: { interface: 'CirugiaConfiguracion' },
  label: 'Cirugía: presupuestos y consentimiento',
  admin: { group: 'Clínica', description: 'Texto base del consentimiento informado que firma el tutor y vigencia de los presupuestos. Revisa el texto con tu asesor antes de usarlo.' },
  access: { read: ({ req }) => Boolean(req.user), update: equipoCon('configurarAgenda') },
  fields: [
    {
      name: 'textoConsentimiento',
      label: 'Texto del consentimiento informado',
      type: 'textarea',
      required: true,
      defaultValue: CONSENTIMIENTO_BASE,
      admin: { description: 'Se llena solo con: {{tutor}}, {{mascota}}, {{especie}}, {{procedimiento}}, {{riesgos}}, {{clinica}}, {{medico}}, {{total}} y {{fecha}}. Lo que firma el tutor queda guardado tal cual; cambiar este texto no cambia lo ya firmado.' },
    },
    { name: 'vigenciaDias', label: 'Vigencia de un presupuesto (días)', type: 'number', required: true, defaultValue: 15, min: 1, max: 180 },
  ],
}

/**
 * RUTA ORTOPÉDICA · FASE 2: HOJA QUIRÚRGICA Y DE ANESTESIA (nov-2026).
 * Una por cirugía (normalmente ligada a su cita; en urgencias puede abrirse
 * sin cita). Equipo, valoración preanestésica (ASA), fármacos aplicados TAL
 * COMO LOS ESCRIBE EL MÉDICO (la plataforma nunca calcula ni sugiere dosis),
 * tiempos, monitoreo de signos y lo realizado. Al «cerrarla» queda inmutable.
 * Solo la escribe `lib/clinica/hojaQuirurgica.ts` (API genérica 403).
 */
export const MOMENTOS_FARMACO = [
  { label: 'Premedicación', value: 'premedicacion' },
  { label: 'Inducción', value: 'induccion' },
  { label: 'Mantenimiento', value: 'mantenimiento' },
  { label: 'Analgesia', value: 'analgesia' },
  { label: 'Antibiótico', value: 'antibiotico' },
  { label: 'Fluidos', value: 'fluidos' },
  { label: 'Otro', value: 'otro' },
] as const
export const CLASES_ASA = ['I', 'II', 'III', 'IV', 'V'] as const

export const CirHojas: CollectionConfig = {
  slug: 'cir-hojas',
  typescript: { interface: 'CirHoja' },
  labels: { singular: 'Hoja quirúrgica', plural: 'Hojas quirúrgicas' },
  admin: { group: 'Clínica', useAsTitle: 'procedimiento', hidden: true },
  defaultSort: '-createdAt',
  access: { read: equipoCon('verExpediente'), create: nadie, update: nadie, delete: nadie },
  fields: [
    { name: 'folio', type: 'text', virtual: true, admin: { readOnly: true }, hooks: { afterRead: [folioDesdeId('HQ')] } },
    { name: 'cita', type: 'relationship', relationTo: 'citas', unique: true },
    { name: 'mascota', type: 'relationship', relationTo: 'mascotas', required: true, index: true },
    { name: 'presupuesto', type: 'relationship', relationTo: 'cir-presupuestos' },
    { name: 'procedimiento', type: 'text', required: true, maxLength: 160 },
    { name: 'fecha', type: 'text', required: true, index: true },
    { name: 'estado', type: 'select', required: true, defaultValue: 'abierta', index: true, options: [{ label: 'Abierta', value: 'abierta' }, { label: 'Cerrada', value: 'cerrada' }] },
    { name: 'cirujano', type: 'relationship', relationTo: 'users' },
    { name: 'anestesista', type: 'relationship', relationTo: 'users' },
    { name: 'ayudantes', type: 'text', maxLength: 200 },
    { name: 'asa', type: 'select', options: CLASES_ASA.map((x) => ({ label: `ASA ${x}`, value: x })) },
    { name: 'urgencia', type: 'checkbox', defaultValue: false },
    { name: 'pesoKg', type: 'number', min: 0, max: 200 },
    { name: 'ayunoHoras', type: 'number', min: 0, max: 72 },
    { name: 'valoracion', type: 'textarea', maxLength: 3000 },
    {
      name: 'farmacos',
      type: 'array',
      maxRows: 80,
      fields: [
        { name: 'momento', type: 'select', required: true, options: [...MOMENTOS_FARMACO] },
        { name: 'medicamento', type: 'text', required: true, maxLength: 120 },
        { name: 'dosis', type: 'text', required: true, maxLength: 80 },
        { name: 'via', type: 'text', maxLength: 40 },
        { name: 'hora', type: 'text', required: true },
        { name: 'por', type: 'text' },
      ],
    },
    {
      name: 'tiempos',
      type: 'group',
      fields: ['entrada', 'inicioAnestesia', 'inicioCirugia', 'finCirugia', 'extubacion', 'salida'].map((name) => ({ name, type: 'text' as const })),
    },
    {
      name: 'signos',
      type: 'array',
      maxRows: 300,
      fields: [
        { name: 'hora', type: 'text', required: true },
        ...['fc', 'fr', 'spo2', 'etco2', 'temp', 'pas', 'pad', 'pam'].map((name) => ({ name, type: 'number' as const })),
        { name: 'notas', type: 'text', maxLength: 200 },
        { name: 'por', type: 'text' },
      ],
    },
    { name: 'realizado', type: 'textarea', maxLength: 4000 },
    { name: 'hallazgos', type: 'textarea', maxLength: 3000 },
    { name: 'implantes', type: 'textarea', maxLength: 1500 },
    { name: 'complicaciones', type: 'textarea', maxLength: 2000 },
    { name: 'recuperacion', type: 'textarea', maxLength: 2000 },
    { name: 'indicacionesPost', type: 'textarea', maxLength: 3000 },
    { name: 'creadoPor', type: 'relationship', relationTo: 'users' },
    { name: 'cerradaPor', type: 'relationship', relationTo: 'users' },
    { name: 'cerradaEn', type: 'date' },
  ],
}
