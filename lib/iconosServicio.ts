/**
 * Iconos de servicio (nov-2026). Puro: lo usan la colección `servicios`
 * (opciones del campo «Icono»), el portal, el sitio y el panel.
 *
 * Cada servicio puede fijar su icono; con «auto» se elige por el nombre
 * (palabras clave sin acentos). Si nada coincide, la patita.
 * Los trazos están en components/IconoServicio.tsx.
 */

export const ICONOS_SERVICIO = [
  { clave: 'auto', etiqueta: 'Automático (según el nombre)', palabras: [] },
  { clave: 'consulta', etiqueta: 'Consulta (estetoscopio)', palabras: ['consulta', 'revision', 'valoracion', 'chequeo', 'check', 'medicina general', 'seguimiento'] },
  { clave: 'vacuna', etiqueta: 'Vacuna (jeringa)', palabras: ['vacun', 'inmuniza', 'refuerzo', 'antirrabic', 'rabia', 'inyecc'] },
  { clave: 'desparasitacion', etiqueta: 'Desparasitación (pastilla)', palabras: ['desparasit', 'parasit', 'pulga', 'garrapata'] },
  { clave: 'cirugia', etiqueta: 'Cirugía (bisturí)', palabras: ['cirug', 'quirurg', 'operacion', 'esteriliza', 'castra', 'ovh'] },
  { clave: 'ortopedia', etiqueta: 'Ortopedia (hueso)', palabras: ['ortoped', 'trauma', 'fractura', 'cadera', 'rodilla', 'hueso', 'articula', 'columna'] },
  { clave: 'rehabilitacion', etiqueta: 'Rehabilitación (movimiento)', palabras: ['rehabilit', 'fisio', 'terapia', 'hidroterap', 'laser', 'acupunt'] },
  { clave: 'imagen', etiqueta: 'Rayos X (imagen)', palabras: ['rayos', 'radiograf', 'rx', 'placa', 'tomograf', 'imagen'] },
  { clave: 'ultrasonido', etiqueta: 'Ultrasonido', palabras: ['ultrason', 'ecograf', 'eco ', 'doppler'] },
  { clave: 'laboratorio', etiqueta: 'Laboratorio (tubo)', palabras: ['laborat', 'analisis', 'sangre', 'hemograma', 'quimica', 'urinalisis', 'prueba', 'examen'] },
  { clave: 'dental', etiqueta: 'Dental (diente)', palabras: ['dental', 'diente', 'profilax', 'sarro', 'odonto', 'limpieza dental'] },
  { clave: 'estetica', etiqueta: 'Estética (tijeras)', palabras: ['estetic', 'corte', 'grooming', 'peluquer', 'pelo', 'unas'] },
  { clave: 'bano', etiqueta: 'Baño (burbujas)', palabras: ['bano', 'banito', 'spa', 'shampoo', 'champu', 'lavado'] },
  { clave: 'hospital', etiqueta: 'Hospitalización (cama)', palabras: ['hospital', 'internamiento', 'observacion', 'pension', 'hospedaje', 'guarderia'] },
  { clave: 'urgencias', etiqueta: 'Urgencias (cruz)', palabras: ['urgenc', 'emergenc', '24 h', '24h'] },
  { clave: 'farmacia', etiqueta: 'Farmacia (frasco)', palabras: ['farmac', 'medicament', 'receta'] },
  { clave: 'nutricion', etiqueta: 'Nutrición (plato)', palabras: ['nutric', 'aliment', 'dieta', 'peso'] },
  { clave: 'cardio', etiqueta: 'Corazón', palabras: ['cardio', 'corazon', 'electrocard'] },
  { clave: 'documento', etiqueta: 'Certificado (documento)', palabras: ['certific', 'constancia', 'viaje', 'pasaporte', 'microchip', 'chip'] },
  { clave: 'patita', etiqueta: 'Patita (general)', palabras: [] },
] as const

export type ClaveIcono = Exclude<(typeof ICONOS_SERVICIO)[number]['clave'], 'auto'>

const CLAVES = new Set<string>(ICONOS_SERVICIO.map((i) => i.clave))

function sinAcentos(s: string): string {
  return ` ${s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()} `
}

/** El icono que se dibuja: el fijado o, con «auto» (o vacío), el que sugiere el nombre. */
export function iconoDeServicio(nombre: string, fijado?: string | null): ClaveIcono {
  if (fijado && fijado !== 'auto' && CLAVES.has(fijado)) return fijado as ClaveIcono
  const n = sinAcentos(nombre || '')
  for (const i of ICONOS_SERVICIO) {
    if (i.palabras.some((p) => n.includes(p))) return i.clave as ClaveIcono
  }
  return 'patita'
}
