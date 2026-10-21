import ExcelJS from 'exceljs'
import type { PayloadRequest, Where } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'
import { z } from 'zod'

import type { Importacion, Mascota, User } from '../../payload-types'
import { normalizarTelefono } from '../../collections/clinica/pacientes'
import { ErrorClinica, type Ctx, idDe } from './servicio'
import { CAMPOS_IMPORTACION, type ArchivoCargado, type ClaveImportacion, type MapeoImportacion, type PlanImportacion, type ResumenImportacion } from './tipos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Importación de clientes y mascotas desde archivo (CSV o Excel)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Flujo en tres pasos, todo revisable antes de tocar la base:
 *   1. cargarArchivo: lee el archivo (CSV con «,» o «;», o .xlsx), guarda las
 *      filas en «importaciones» y sugiere qué columna es qué.
 *   2. planear: con el mapeo elegido, interpreta cada fila y dice qué pasaría
 *      (tutores nuevos/existentes, mascotas nuevas/existentes, errores).
 *   3. aplicar: lo hace, en una sola transacción, y guarda el resumen.
 *
 * FORMA DEL ARCHIVO: una fila = una mascota con su tutor. Si una mascota tiene
 * varias vacunas, se repite la fila (mismo tutor y mascota) cambiando solo las
 * columnas de cartilla. Las filas se agrupan por tutor (teléfono, correo o
 * nombre) y por mascota (nombre dentro del tutor).
 *
 * DUPLICADOS: un tutor que ya existe (mismo teléfono o correo; o mismo nombre
 * completo, con aviso) se reutiliza. Una mascota que ya existe (mismo nombre
 * con ese tutor) se reutiliza y solo se le agregan registros de cartilla que no
 * tenga (mismo producto y fecha) y el peso si no hay uno de esa fecha.
 */

const MAX_FILAS = 5000
const MAX_BYTES = 8 * 1024 * 1024

const invalido = (m: string) => new ErrorClinica(400, m)
const prohibido = () => new ErrorClinica(403, 'La importación la hacen los roles con «Importar».')

/* ───────────────────────────── lectura ───────────────────────────── */

export type Tabla = { columnas: string[]; filas: Record<string, string>[] }

function limpiarEncabezado(h: unknown, i: number): string {
  const s = String(h ?? '').replace(/^﻿/, '').trim()
  return s || `Columna ${i + 1}`
}

function celdaATexto(v: unknown): string {
  if (v == null) return ''
  if (v instanceof Date) return isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'object') {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string }
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join('').trim()
    if (o.result !== undefined) return celdaATexto(o.result)
    if (o.text !== undefined) return String(o.text).trim()
    return ''
  }
  return String(v).trim()
}

/** CSV con separador «,» o «;» (se detecta), comillas dobles y saltos dentro de comillas. */
export function leerCsv(texto: string): Tabla {
  const limpio = texto.replace(/^﻿/, '')
  const primera = limpio.split(/\r?\n/)[0] ?? ''
  const sep = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ','
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]
    if (enComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') {
          campo += '"'
          i++
        } else enComillas = false
      } else campo += ch
    } else if (ch === '"') enComillas = true
    else if (ch === sep) {
      fila.push(campo)
      campo = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && limpio[i + 1] === '\n') i++
      fila.push(campo)
      campo = ''
      if (fila.some((c) => c.trim() !== '')) filas.push(fila)
      fila = []
    } else campo += ch
  }
  fila.push(campo)
  if (fila.some((c) => c.trim() !== '')) filas.push(fila)
  if (!filas.length) throw invalido('El archivo está vacío.')
  const columnas = filas[0].map(limpiarEncabezado)
  return { columnas, filas: filas.slice(1).map((f) => Object.fromEntries(columnas.map((c, i) => [c, (f[i] ?? '').trim()]))) }
}

export async function leerXlsx(buffer: ArrayBuffer): Promise<Tabla> {
  const libro = new ExcelJS.Workbook()
  await libro.xlsx.load(buffer)
  /* La primera hoja con datos (la plantilla trae una hoja de instrucciones al final). */
  const hoja = libro.worksheets.find((h) => h.rowCount > 1 && !/instruc/i.test(h.name)) ?? libro.worksheets[0]
  if (!hoja) throw invalido('El archivo no tiene hojas con datos.')
  const encabezado = hoja.getRow(1)
  const columnas: string[] = []
  const ultima = Math.max(encabezado.cellCount, hoja.columnCount)
  for (let c = 1; c <= ultima; c++) columnas.push(limpiarEncabezado(celdaATexto(encabezado.getCell(c).value), c - 1))
  while (columnas.length && /^Columna \d+$/.test(columnas[columnas.length - 1]) && !hoja.getColumn(columnas.length).values.some((v, i) => i > 1 && celdaATexto(v))) columnas.pop()
  const filas: Record<string, string>[] = []
  hoja.eachRow((row, n) => {
    if (n === 1) return
    const obj: Record<string, string> = {}
    let vacia = true
    columnas.forEach((col, i) => {
      const v = celdaATexto(row.getCell(i + 1).value)
      if (v) vacia = false
      obj[col] = v
    })
    if (!vacia) filas.push(obj)
  })
  return { columnas, filas }
}

export async function leerArchivo(archivo: File): Promise<Tabla> {
  if (!archivo || typeof archivo.arrayBuffer !== 'function') throw invalido('Elige un archivo CSV o Excel.')
  if (archivo.size > MAX_BYTES) throw invalido('El archivo pesa más de 8 MB. Divídelo en partes.')
  const nombre = (archivo.name || '').toLowerCase()
  const buffer = await archivo.arrayBuffer()
  let tabla: Tabla
  if (nombre.endsWith('.xlsx') || nombre.endsWith('.xlsm') || archivo.type.includes('spreadsheetml')) tabla = await leerXlsx(buffer)
  else if (nombre.endsWith('.xls')) throw invalido('El formato .xls (Excel 97-2003) no se puede leer. Guárdalo como .xlsx o CSV.')
  else tabla = leerCsv(new TextDecoder('utf-8').decode(buffer))
  if (!tabla.filas.length) throw invalido('El archivo tiene encabezados pero ninguna fila con datos.')
  if (tabla.filas.length > MAX_FILAS) throw invalido(`El archivo tiene ${tabla.filas.length} filas; el máximo por importación es ${MAX_FILAS}. Divídelo.`)
  return tabla
}

/* ───────────────────────────── mapeo sugerido ───────────────────────────── */

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')

const SINONIMOS: Record<ClaveImportacion, string[]> = {
  tutor_nombre: ['tutor_nombre', 'nombre_tutor', 'nombre_dueno', 'dueno', 'propietario', 'cliente', 'nombre_cliente', 'responsable', 'nombre_propietario', 'tutor'],
  tutor_apellidos: ['tutor_apellidos', 'apellidos', 'apellido', 'apellidos_tutor', 'apellidos_dueno', 'apellidos_cliente'],
  tutor_telefono: ['tutor_telefono', 'telefono', 'tel', 'celular', 'whatsapp', 'movil', 'telefono_tutor', 'telefono_dueno', 'contacto'],
  tutor_correo: ['tutor_correo', 'correo', 'email', 'e_mail', 'mail', 'correo_electronico'],
  tutor_direccion: ['tutor_direccion', 'direccion', 'domicilio', 'calle'],
  tutor_notas: ['tutor_notas', 'notas_tutor', 'notas_cliente', 'observaciones_cliente'],
  mascota_nombre: ['mascota_nombre', 'nombre_mascota', 'mascota', 'paciente', 'nombre_paciente', 'nombre'],
  especie: ['especie', 'tipo_animal', 'animal', 'tipo'],
  raza: ['raza', 'breed'],
  sexo: ['sexo', 'genero'],
  esterilizado: ['esterilizado', 'esterilizada', 'castrado', 'esterilizacion'],
  color: ['color', 'color_y_senas', 'senas', 'pelaje'],
  fecha_nacimiento: ['fecha_nacimiento', 'nacimiento', 'fecha_nac', 'fnac', 'cumpleanos', 'edad'],
  nacimiento_estimado: ['nacimiento_estimado', 'estimado', 'fecha_estimada'],
  microchip: ['microchip', 'chip', 'no_chip', 'numero_chip'],
  alergias: ['alergias', 'alergia'],
  alertas_manejo: ['alertas_manejo', 'alertas', 'alerta', 'manejo', 'precauciones'],
  peso_kg: ['peso_kg', 'peso', 'kg', 'peso_actual'],
  fecha_peso: ['fecha_peso', 'fecha_del_peso'],
  notas_mascota: ['notas_mascota', 'notas', 'observaciones', 'comentarios', 'historial'],
  cartilla_tipo: ['cartilla_tipo', 'tipo_vacuna', 'tipo_cartilla', 'tipo_aplicacion'],
  cartilla_producto: ['cartilla_producto', 'vacuna', 'producto', 'biologico', 'vacuna_producto', 'desparasitante'],
  cartilla_fecha: ['cartilla_fecha', 'fecha_vacuna', 'fecha_aplicacion', 'aplicada', 'fecha_de_aplicacion'],
  cartilla_lote: ['cartilla_lote', 'lote'],
  cartilla_caducidad: ['cartilla_caducidad', 'caducidad', 'vence', 'vencimiento'],
  cartilla_proxima: ['cartilla_proxima', 'proxima', 'proxima_fecha', 'refuerzo', 'proxima_vacuna', 'siguiente'],
  cartilla_aplico: ['cartilla_aplico', 'aplico', 'aplicada_por', 'medico', 'veterinario', 'mvz'],
}

export function sugerirMapeo(columnas: string[]): MapeoImportacion {
  const mapeo: MapeoImportacion = {}
  const usados = new Set<string>()
  for (const col of columnas) {
    const n = norm(col)
    let elegido: ClaveImportacion | '' = ''
    for (const [clave, lista] of Object.entries(SINONIMOS) as [ClaveImportacion, string[]][]) {
      if (usados.has(clave)) continue
      if (lista.includes(n)) {
        elegido = clave
        break
      }
    }
    if (elegido) usados.add(elegido)
    mapeo[col] = elegido
  }
  return mapeo
}

/* ───────────────────────────── plantilla ───────────────────────────── */

export async function plantillaXlsx(): Promise<Buffer> {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Pacientes')
  hoja.columns = CAMPOS_IMPORTACION.map((c) => ({ header: c.clave, key: c.clave, width: Math.max(14, Math.min(28, c.etiqueta.length)) }))
  hoja.getRow(1).font = { bold: true }
  hoja.addRow({
    tutor_nombre: 'Mariana', tutor_apellidos: 'Ruiz', tutor_telefono: '2281234567', tutor_correo: 'mariana@ejemplo.mx', tutor_direccion: 'Xalapa',
    mascota_nombre: 'Toby', especie: 'Perro', raza: 'Labrador', sexo: 'Macho', esterilizado: 'Sí', color: 'Dorado', fecha_nacimiento: '2020-03-15', nacimiento_estimado: 'Sí',
    microchip: '', alergias: '', alertas_manejo: 'Postoperatorio de rodilla: evitar saltos', peso_kg: '31.4', fecha_peso: '2026-10-03',
    cartilla_tipo: 'Vacuna', cartilla_producto: 'Múltiple canina', cartilla_fecha: '2026-03-14', cartilla_lote: 'L2231', cartilla_caducidad: '2027-05', cartilla_proxima: '2027-03-14', cartilla_aplico: 'Dra. Herrera',
  })
  hoja.addRow({ tutor_nombre: 'Mariana', tutor_apellidos: 'Ruiz', tutor_telefono: '2281234567', mascota_nombre: 'Toby', especie: 'Perro', cartilla_tipo: 'Desparasitación interna', cartilla_producto: 'Desparasitante interno', cartilla_fecha: '2026-09-05', cartilla_proxima: '2026-12-05' })
  hoja.addRow({ tutor_nombre: 'Mariana', tutor_apellidos: 'Ruiz', tutor_telefono: '2281234567', mascota_nombre: 'Luna', especie: 'Gato', raza: 'Doméstico pelo corto', sexo: 'Hembra', esterilizado: 'Sí', fecha_nacimiento: '2023-05-14', alergias: 'Penicilinas', peso_kg: '4.2' })
  const info = libro.addWorksheet('Instrucciones')
  info.columns = [{ header: 'Columna', key: 'c', width: 26 }, { header: 'Qué va', key: 'q', width: 60 }]
  info.getRow(1).font = { bold: true }
  for (const c of CAMPOS_IMPORTACION) info.addRow({ c: c.clave, q: c.etiqueta + ('requerido' in c && c.requerido ? ' (obligatorio)' : '') })
  info.addRow({})
  info.addRow({ c: 'Regla 1', q: 'Una fila = una mascota con su tutor. Las tres filas de ejemplo se borran.' })
  info.addRow({ c: 'Regla 2', q: 'Si una mascota tiene varias vacunas, repite la fila (mismo tutor y mascota) y cambia solo las columnas cartilla_*.' })
  info.addRow({ c: 'Regla 3', q: 'Fechas: AAAA-MM-DD (2024-05-14) o DD/MM/AAAA (14/05/2024). Teléfono a 10 dígitos con lada.' })
  info.addRow({ c: 'Regla 4', q: 'Especie: Perro, Gato, Ave, Conejo, Roedor, Reptil u Otra. Sexo: Macho/Hembra. Esterilizado: Sí/No.' })
  info.addRow({ c: 'Regla 5', q: 'Puedes usar tus propios encabezados: al cargar el archivo, el sistema pregunta qué columna es qué.' })
  return Buffer.from(await libro.xlsx.writeBuffer())
}

/* ───────────────────────────── interpretación ───────────────────────────── */

type Tutor = { clave: string; nombre: string; apellidos: string; telefono: string | null; email: string | null; direccion: string | null; notas: string | null; filas: number[] }
type Cartilla = { tipo: 'vacuna' | 'desparasitacion_interna' | 'desparasitacion_externa' | 'otro'; producto: string; fecha: string; lote: string | null; caducidad: string | null; proxima: string | null; aplico: string | null; fila: number }
type Peso = { fecha: string; kg: number }
type MascotaLeida = {
  clave: string
  tutorClave: string
  nombre: string
  especie: Mascota['especie']
  especieOtra: string | null
  raza: string | null
  sexo: 'macho' | 'hembra' | 'desconocido'
  esterilizado: 'si' | 'no' | 'desconocido'
  color: string | null
  fechaNacimiento: string | null
  nacimientoEstimado: boolean
  microchip: string | null
  alergias: string | null
  alertas: string[]
  notas: string | null
  pesos: Peso[]
  cartilla: Cartilla[]
  filas: number[]
}
type Interpretado = { tutores: Map<string, Tutor>; mascotas: Map<string, MascotaLeida>; errores: { fila: number; mensaje: string }[]; avisos: { fila: number; mensaje: string }[] }

export function aFecha(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  let y: number, mo: number, d: number
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/))) [d, mo, y] = [Number(m[1]), Number(m[2]), Number(m[3])]
  else if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2})$/))) [d, mo, y] = [Number(m[1]), Number(m[2]), 2000 + Number(m[3])]
  else if (/^\d{5}$/.test(s)) {
    /* número de serie de Excel */
    const f = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000)
    return f.toISOString().slice(0, 10)
  } else return null
  const f = new Date(Date.UTC(y, mo - 1, d))
  if (f.getUTCFullYear() !== y || f.getUTCMonth() !== mo - 1 || f.getUTCDate() !== d) return null
  return f.toISOString().slice(0, 10)
}
/** «2027-05», «05/2027» o fecha completa → texto normalizado para caducidad. */
function aMesOFecha(v: string): string | null {
  const s = v.trim()
  if (!s) return null
  const f = aFecha(s)
  if (f) return f
  let m = s.match(/^(\d{4})-(\d{1,2})$/)
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}`
  m = s.match(/^(\d{1,2})[/.-](\d{4})$/)
  if (m) return `${m[2]}-${m[1].padStart(2, '0')}`
  return s.slice(0, 20)
}
const aBool = (v: string): boolean | null => {
  const n = norm(v)
  if (!n) return null
  if (['si', 's', 'yes', 'y', 'true', '1', 'x', 'verdadero', 'estimada', 'estimado'].includes(n)) return true
  if (['no', 'n', 'false', '0', 'falso'].includes(n)) return false
  return null
}
function aEspecie(v: string): { especie: Mascota['especie']; otra: string | null } {
  const n = norm(v)
  if (!n) return { especie: 'perro', otra: null }
  if (/perr|canin|can\b|dog|cachorr/.test(n)) return { especie: 'perro', otra: null }
  if (/gat|felin|cat|miche/.test(n)) return { especie: 'gato', otra: null }
  if (/ave|pajar|loro|perico|canario|bird|gallin/.test(n)) return { especie: 'ave', otra: null }
  if (/conej|rabbit/.test(n)) return { especie: 'conejo', otra: null }
  if (/hamster|cuyo|coballo|rat|raton|jerbo|chinchilla|roedor|huron/.test(n)) return { especie: 'roedor', otra: null }
  if (/tortug|iguan|reptil|serpient|gecko|lagart/.test(n)) return { especie: 'reptil', otra: null }
  return { especie: 'otra', otra: v.trim().slice(0, 60) }
}
const aSexo = (v: string): 'macho' | 'hembra' | 'desconocido' => {
  const n = norm(v)
  if (/^(m|macho|male|masc)/.test(n)) return 'macho'
  if (/^(h|hembra|f|fem|female)/.test(n)) return 'hembra'
  return 'desconocido'
}
const aEsterilizado = (v: string): 'si' | 'no' | 'desconocido' => {
  const n = norm(v)
  if (!n) return 'desconocido'
  if (/^(no|n|enter|intact|falso|0)/.test(n)) return 'no'
  if (/^(si|s|yes|y|esteril|castrad|true|1|x|verdadero)/.test(n)) return 'si'
  return 'desconocido'
}
const aTipoCartilla = (v: string, producto: string): Cartilla['tipo'] => {
  const n = norm(v + ' ' + (v ? '' : producto))
  if (/despar.*(ext|pulga|garrap|pipeta)|(ext|pulga|garrap|pipeta).*despar|antipulg/.test(n)) return 'desparasitacion_externa'
  if (/despar|antiparas|vermif/.test(n)) return 'desparasitacion_interna'
  if (!v || /vacun|refuerz|dosis|rabia|rabic|multipl|triple|quintupl|sextupl|parvo|moquillo|bordet|leucem/.test(n)) return 'vacuna'
  return 'otro'
}
const aNumero = (v: string): number | null => {
  const n = Number(v.replace(/[^\d.,-]/g, '').replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

export function interpretar(filas: Record<string, string>[], mapeo: MapeoImportacion, hoy: string): Interpretado {
  const col: Partial<Record<ClaveImportacion, string>> = {}
  for (const [columna, clave] of Object.entries(mapeo)) if (clave) col[clave] = columna
  const v = (fila: Record<string, string>, clave: ClaveImportacion): string => (col[clave] ? (fila[col[clave]!] ?? '').trim() : '')
  const r: Interpretado = { tutores: new Map(), mascotas: new Map(), errores: [], avisos: [] }
  if (!col.tutor_nombre) r.errores.push({ fila: 0, mensaje: 'Falta indicar qué columna es «Tutor: nombre».' })
  if (!col.mascota_nombre) r.errores.push({ fila: 0, mensaje: 'Falta indicar qué columna es «Mascota: nombre».' })
  if (r.errores.length) return r

  filas.forEach((fila, i) => {
    const n = i + 2 // número de fila en el archivo (1 = encabezado)
    let nombreT = v(fila, 'tutor_nombre')
    let apellidosT = v(fila, 'tutor_apellidos')
    const nombreM = v(fila, 'mascota_nombre')
    if (!nombreT && !nombreM) return
    if (!nombreT) {
      r.errores.push({ fila: n, mensaje: 'Sin nombre del tutor.' })
      return
    }
    if (!nombreM) {
      r.errores.push({ fila: n, mensaje: `Sin nombre de mascota (tutor ${nombreT}).` })
      return
    }
    if (!apellidosT && nombreT.includes(' ') && !col.tutor_apellidos) {
      /* «Mariana Ruiz Pérez» en una sola columna: primer palabra nombre, resto apellidos. */
      const partes = nombreT.split(/\s+/)
      if (partes.length >= 2) {
        nombreT = partes.length >= 4 ? partes.slice(0, 2).join(' ') : partes[0]
        apellidosT = partes.slice(partes.length >= 4 ? 2 : 1).join(' ')
      }
    }
    const telRaw = v(fila, 'tutor_telefono')
    const tel = telRaw ? normalizarTelefono(telRaw) : ''
    if (telRaw && tel.length < 10) r.avisos.push({ fila: n, mensaje: `Teléfono «${telRaw}» no tiene 10 dígitos; se guarda como está.` })
    const emailRaw = v(fila, 'tutor_correo').toLowerCase()
    const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : ''
    if (emailRaw && !email) r.avisos.push({ fila: n, mensaje: `Correo «${emailRaw}» no parece válido; se omite.` })
    const claveT = tel && tel.length >= 10 ? `tel:${tel}` : email ? `mail:${email}` : `nom:${norm(nombreT + ' ' + apellidosT)}`
    let tutor = r.tutores.get(claveT)
    if (!tutor) {
      tutor = { clave: claveT, nombre: nombreT, apellidos: apellidosT, telefono: tel || null, email: email || null, direccion: v(fila, 'tutor_direccion') || null, notas: v(fila, 'tutor_notas') || null, filas: [] }
      r.tutores.set(claveT, tutor)
    } else {
      if (!tutor.email && email) tutor.email = email
      if (!tutor.direccion && v(fila, 'tutor_direccion')) tutor.direccion = v(fila, 'tutor_direccion')
    }
    tutor.filas.push(n)

    const claveM = `${claveT}|${norm(nombreM)}`
    let mascota = r.mascotas.get(claveM)
    if (!mascota) {
      const esp = aEspecie(v(fila, 'especie'))
      const fn = v(fila, 'fecha_nacimiento')
      let fechaNac = aFecha(fn)
      let estimado = aBool(v(fila, 'nacimiento_estimado')) ?? false
      if (fn && !fechaNac) {
        /* «3 años», «8 meses»: se convierte a fecha estimada. */
        const m = fn.toLowerCase().match(/(\d+)\s*(a|mes|sem)/)
        if (m) {
          const d = new Date(hoy + 'T00:00:00Z')
          const q = Number(m[1])
          if (m[2] === 'a') d.setUTCFullYear(d.getUTCFullYear() - q)
          else if (m[2] === 'mes') d.setUTCMonth(d.getUTCMonth() - q)
          else d.setUTCDate(d.getUTCDate() - q * 7)
          fechaNac = d.toISOString().slice(0, 10)
          estimado = true
        } else r.avisos.push({ fila: n, mensaje: `Fecha de nacimiento «${fn}» no se entendió; se deja vacía.` })
      }
      if (fechaNac && fechaNac > hoy) {
        r.avisos.push({ fila: n, mensaje: `Fecha de nacimiento futura (${fechaNac}); se deja vacía.` })
        fechaNac = null
      }
      mascota = {
        clave: claveM, tutorClave: claveT, nombre: nombreM, especie: esp.especie, especieOtra: esp.otra, raza: v(fila, 'raza') || null,
        sexo: aSexo(v(fila, 'sexo')), esterilizado: aEsterilizado(v(fila, 'esterilizado')), color: v(fila, 'color') || null,
        fechaNacimiento: fechaNac, nacimientoEstimado: estimado, microchip: v(fila, 'microchip').replace(/\s+/g, '') || null,
        alergias: v(fila, 'alergias') || null, alertas: v(fila, 'alertas_manejo') ? v(fila, 'alertas_manejo').split(/[;|]/).map((s) => s.trim()).filter(Boolean) : [],
        notas: v(fila, 'notas_mascota') || null, pesos: [], cartilla: [], filas: [],
      }
      r.mascotas.set(claveM, mascota)
    }
    mascota.filas.push(n)
    const kg = aNumero(v(fila, 'peso_kg'))
    if (v(fila, 'peso_kg') && kg == null) r.avisos.push({ fila: n, mensaje: `Peso «${v(fila, 'peso_kg')}» no es un número; se omite.` })
    if (kg != null) {
      const fp = aFecha(v(fila, 'fecha_peso')) ?? hoy
      if (!mascota.pesos.some((p) => p.fecha === fp)) mascota.pesos.push({ fecha: fp, kg })
    }
    const producto = v(fila, 'cartilla_producto')
    const fechaC = v(fila, 'cartilla_fecha')
    if (producto || fechaC) {
      const f = aFecha(fechaC)
      if (!producto) r.avisos.push({ fila: n, mensaje: 'Hay fecha de cartilla sin producto; se omite ese registro.' })
      else if (!f) r.avisos.push({ fila: n, mensaje: `Cartilla «${producto}» sin fecha válida («${fechaC}»); se omite ese registro.` })
      else if (f > hoy) r.avisos.push({ fila: n, mensaje: `Cartilla «${producto}» con fecha futura (${f}); se omite.` })
      else if (!mascota.cartilla.some((c) => c.producto.toLowerCase() === producto.toLowerCase() && c.fecha === f)) {
        mascota.cartilla.push({
          tipo: aTipoCartilla(v(fila, 'cartilla_tipo'), producto), producto, fecha: f, lote: v(fila, 'cartilla_lote') || null,
          caducidad: aMesOFecha(v(fila, 'cartilla_caducidad')), proxima: aFecha(v(fila, 'cartilla_proxima')), aplico: v(fila, 'cartilla_aplico') || null, fila: n,
        })
      }
    }
  })
  return r
}

/* ───────────────────────────── carga, plan y aplicación ───────────────────────────── */

export async function cargarArchivo(ctx: Ctx, archivo: File): Promise<ArchivoCargado> {
  if (!ctx.p.clinica.importar) throw prohibido()
  const tabla = await leerArchivo(archivo)
  const mapeoSugerido = sugerirMapeo(tabla.columnas)
  const imp = await ctx.payload.create({
    collection: 'importaciones',
    overrideAccess: true,
    data: { archivo: (archivo.name || 'archivo').slice(0, 160), estado: 'previa', columnas: tabla.columnas, filas: tabla.filas, mapeo: mapeoSugerido, creadoPor: ctx.user.id },
  })
  return { id: imp.id, archivo: imp.archivo, columnas: tabla.columnas, totalFilas: tabla.filas.length, muestra: tabla.filas.slice(0, 5), mapeoSugerido }
}

const esquemaMapeo = z.record(z.string(), z.union([z.enum(CAMPOS_IMPORTACION.map((c) => c.clave) as [ClaveImportacion, ...ClaveImportacion[]]), z.literal('')]))

async function cargarImportacion(ctx: Ctx, id: number): Promise<Importacion & { filas: Record<string, string>[] }> {
  if (!ctx.p.clinica.importar) throw prohibido()
  let imp: Importacion
  try {
    imp = await ctx.payload.findByID({ collection: 'importaciones', id, depth: 0, overrideAccess: true })
  } catch {
    throw new ErrorClinica(404, 'No encontramos ese archivo cargado. Vuelve a subirlo.')
  }
  if (!Array.isArray(imp.filas)) throw invalido('El archivo cargado no tiene filas.')
  return imp as Importacion & { filas: Record<string, string>[] }
}

type Existentes = { clientesPorClave: Map<string, { id: number; porNombre: boolean }>; mascotasPorCliente: Map<number, Mascota[]> }

async function buscarExistentes(ctx: Ctx, inter: Interpretado): Promise<Existentes> {
  const tels = new Set<string>(), mails = new Set<string>(), nombres = new Set<string>()
  for (const t of inter.tutores.values()) {
    if (t.telefono && t.telefono.length >= 10) tels.add(t.telefono)
    if (t.email) mails.add(t.email)
    nombres.add([t.nombre, t.apellidos].filter(Boolean).join(' '))
  }
  const or: Where[] = []
  if (tels.size) or.push({ telefono: { in: [...tels] } }, { telefonoAlterno: { in: [...tels] } })
  if (mails.size) or.push({ email: { in: [...mails] } })
  if (nombres.size) or.push({ nombreCompleto: { in: [...nombres] } })
  const clientesPorClave = new Map<string, { id: number; porNombre: boolean }>()
  const mascotasPorCliente = new Map<number, Mascota[]>()
  if (!or.length) return { clientesPorClave, mascotasPorCliente }
  const existentes = (await ctx.payload.find({ collection: 'clientes', depth: 0, pagination: false, overrideAccess: true, where: { or } })).docs
  for (const t of inter.tutores.values()) {
    const porTel = t.telefono ? existentes.find((c) => c.telefono === t.telefono || c.telefonoAlterno === t.telefono) : undefined
    const porMail = !porTel && t.email ? existentes.find((c) => c.email === t.email) : undefined
    const nombre = [t.nombre, t.apellidos].filter(Boolean).join(' ').toLowerCase()
    const porNombre = !porTel && !porMail ? existentes.find((c) => (c.nombreCompleto ?? '').toLowerCase() === nombre) : undefined
    const hit = porTel ?? porMail ?? porNombre
    if (hit) clientesPorClave.set(t.clave, { id: hit.id, porNombre: Boolean(porNombre) })
  }
  const ids = [...new Set([...clientesPorClave.values()].map((x) => x.id))]
  if (ids.length) {
    const ms = (await ctx.payload.find({ collection: 'mascotas', depth: 0, pagination: false, overrideAccess: true, where: { 'tutores.cliente': { in: ids } } })).docs
    for (const m of ms) for (const tut of m.tutores ?? []) {
      const cid = idDe(tut.cliente)!
      if (!mascotasPorCliente.has(cid)) mascotasPorCliente.set(cid, [])
      mascotasPorCliente.get(cid)!.push(m)
    }
  }
  return { clientesPorClave, mascotasPorCliente }
}

function armarPlan(inter: Interpretado, ex: Existentes): PlanImportacion {
  const plan: PlanImportacion = { tutores: { nuevos: 0, existentes: 0 }, mascotas: { nuevas: 0, existentes: 0 }, cartilla: 0, pesos: 0, errores: [...inter.errores], avisos: [...inter.avisos], ejemplos: [] }
  for (const t of inter.tutores.values()) {
    const hit = ex.clientesPorClave.get(t.clave)
    if (hit) {
      plan.tutores.existentes++
      if (hit.porNombre) plan.avisos.push({ fila: t.filas[0], mensaje: `«${t.nombre} ${t.apellidos}» coincide solo por nombre con un cliente ya registrado; se usará ese (revisa si es la misma persona).` })
    } else plan.tutores.nuevos++
  }
  for (const m of inter.mascotas.values()) {
    const hit = ex.clientesPorClave.get(m.tutorClave)
    const existente = hit ? (ex.mascotasPorCliente.get(hit.id) ?? []).find((x) => x.nombre.toLowerCase() === m.nombre.toLowerCase()) : undefined
    if (existente) plan.mascotas.existentes++
    else plan.mascotas.nuevas++
    plan.cartilla += m.cartilla.length
    plan.pesos += m.pesos.length
    if (plan.ejemplos.length < 8) {
      const t = inter.tutores.get(m.tutorClave)!
      plan.ejemplos.push({
        fila: m.filas[0], tutor: [t.nombre, t.apellidos].filter(Boolean).join(' '), tutorEstado: hit ? 'existente' : 'nuevo',
        mascota: `${m.nombre} (${m.especie}${m.raza ? ', ' + m.raza : ''})`, mascotaEstado: existente ? 'existente' : 'nueva',
        cartilla: m.cartilla.length ? m.cartilla.map((c) => `${c.producto} ${c.fecha}`).join(' · ') : null,
      })
    }
  }
  return plan
}

export async function planear(ctx: Ctx, id: number, mapeoEntrada: unknown): Promise<PlanImportacion> {
  const imp = await cargarImportacion(ctx, id)
  const mapeo = esquemaMapeo.safeParse(mapeoEntrada)
  if (!mapeo.success) throw invalido('El mapeo de columnas no es válido.')
  const inter = interpretar(imp.filas, mapeo.data, ctx.hoy)
  await ctx.payload.update({ collection: 'importaciones', id, overrideAccess: true, data: { mapeo: mapeo.data } })
  return armarPlan(inter, await buscarExistentes(ctx, inter))
}

export async function aplicar(ctx: Ctx, id: number, mapeoEntrada: unknown): Promise<ResumenImportacion> {
  const imp = await cargarImportacion(ctx, id)
  if (imp.estado !== 'previa') throw invalido('Esa importación ya se aplicó o se descartó. Sube el archivo de nuevo si quieres repetirla.')
  const mapeo = esquemaMapeo.safeParse(mapeoEntrada)
  if (!mapeo.success) throw invalido('El mapeo de columnas no es válido.')
  const inter = interpretar(imp.filas, mapeo.data, ctx.hoy)
  if (inter.errores.length) throw invalido(`Hay ${inter.errores.length} fila(s) con error. Corrige el archivo o el mapeo antes de importar.`)
  const ex = await buscarExistentes(ctx, inter)
  const plan = armarPlan(inter, ex)

  const req = await createLocalReq({ user: ctx.user as User & { collection: 'users' } }, ctx.payload)
  const propia = await initTransaction(req)
  let clientesCreados = 0, mascotasCreadas = 0
  try {
    const idPorTutor = new Map<string, number>()
    for (const t of inter.tutores.values()) {
      const hit = ex.clientesPorClave.get(t.clave)
      if (hit) {
        idPorTutor.set(t.clave, hit.id)
        continue
      }
      const c = await ctx.payload.create({
        collection: 'clientes', req, overrideAccess: true,
        data: { nombre: t.nombre, apellidos: t.apellidos || null, telefono: t.telefono, email: t.email, direccion: t.direccion, notasInternas: t.notas, activo: true, origen: 'importacion' },
      })
      idPorTutor.set(t.clave, c.id)
      clientesCreados++
    }
    for (const m of inter.mascotas.values()) {
      const clienteId = idPorTutor.get(m.tutorClave)!
      const existente = (ex.mascotasPorCliente.get(clienteId) ?? []).find((x) => x.nombre.toLowerCase() === m.nombre.toLowerCase())
      let mascotaId: number
      if (existente) mascotaId = existente.id
      else {
        const creada = await ctx.payload.create({
          collection: 'mascotas', req, overrideAccess: true,
          data: {
            nombre: m.nombre, especie: m.especie, especieOtra: m.especieOtra, raza: m.raza, sexo: m.sexo, esterilizado: m.esterilizado, color: m.color,
            fechaNacimiento: m.fechaNacimiento, nacimientoEstimado: m.nacimientoEstimado, microchip: m.microchip, alergias: m.alergias,
            alertasManejo: m.alertas.map((texto) => ({ texto })), tutores: [{ cliente: clienteId, principal: true }], estado: 'activo', notasInternas: m.notas, origen: 'importacion',
          },
        })
        mascotaId = creada.id
        mascotasCreadas++
      }
      for (const p of m.pesos) {
        if (existente) {
          const ya = await ctx.payload.count({ collection: 'mas-pesos', req, overrideAccess: true, where: { and: [{ mascota: { equals: mascotaId } }, { fecha: { equals: p.fecha } }] } })
          if (ya.totalDocs) continue
        }
        await ctx.payload.create({ collection: 'mas-pesos', req, overrideAccess: true, data: { mascota: mascotaId, fecha: p.fecha, kg: p.kg, nota: 'Importado de archivo', registradoPor: ctx.user.id } })
      }
      for (const c of m.cartilla) {
        if (existente) {
          const ya = await ctx.payload.count({ collection: 'mas-cartilla', req, overrideAccess: true, where: { and: [{ mascota: { equals: mascotaId } }, { fechaAplicacion: { equals: c.fecha } }, { producto: { like: c.producto } }] } })
          if (ya.totalDocs) continue
        }
        await ctx.payload.create({
          collection: 'mas-cartilla', req, overrideAccess: true,
          data: { mascota: mascotaId, tipo: c.tipo, producto: c.producto, fechaAplicacion: c.fecha, proximaFecha: c.proxima, lote: c.lote, caducidad: c.caducidad, aplicadoPorTexto: c.aplico, registradoPor: ctx.user.id, notas: 'Importado de archivo' },
        })
      }
    }
    const resumen: ResumenImportacion = { ...plan, aplicadaEn: new Date().toISOString(), clientesCreados, mascotasCreadas }
    await ctx.payload.update({ collection: 'importaciones', id, req, overrideAccess: true, data: { estado: 'aplicada', mapeo: mapeo.data, resumen, aplicadaEn: resumen.aplicadaEn, filas: null } })
    if (propia) await commitTransaction(req)
    return resumen
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

export async function descartar(ctx: Ctx, id: number): Promise<void> {
  const imp = await cargarImportacion(ctx, id)
  if (imp.estado === 'previa') await ctx.payload.update({ collection: 'importaciones', id, overrideAccess: true, data: { estado: 'descartada', filas: null } })
}

export async function historial(ctx: Ctx): Promise<{ id: number; archivo: string; estado: string; fecha: string; resumen: ResumenImportacion | null; por: string | null }[]> {
  if (!ctx.p.clinica.importar) throw prohibido()
  const r = await ctx.payload.find({ collection: 'importaciones', depth: 1, limit: 20, sort: '-createdAt', overrideAccess: true, where: { estado: { not_equals: 'previa' } } })
  return r.docs.map((i) => ({
    id: i.id, archivo: i.archivo, estado: i.estado, fecha: i.createdAt, resumen: (i.resumen as ResumenImportacion | null) ?? null,
    por: typeof i.creadoPor === 'object' && i.creadoPor ? i.creadoPor.name || i.creadoPor.email : null,
  }))
}

export type { PayloadRequest }
