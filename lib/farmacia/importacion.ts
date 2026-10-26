import ExcelJS from 'exceljs'
import type { PayloadRequest } from 'payload'
import { commitTransaction, createLocalReq, initTransaction, killTransaction } from 'payload'

import type { FarPresentacion, FarProducto, User } from '../../payload-types'
import { leerArchivo } from '../clinica/importacion'
import { aCentavos } from '../finanzas/reglas'
import { type Ctx, ErrorFarmacia, idDe, validarProducto } from './servicio'
import { CAMPOS_IMPORTACION_PRODUCTOS, type ClaveImportacionProducto, type ResumenImportacionProductos } from './tipos'
import { PRODUCTOS_EJEMPLO } from './ejemplos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Importación del catálogo de productos desde la plantilla del sistema
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Decisión de Jano (25-oct-2026): el catálogo se arma en una plantilla propia
 * del sistema (no se adivinan columnas de archivos ajenos, como en pacientes).
 *
 * FORMA: una fila = una PRESENTACIÓN de un producto. Un producto con caja y
 * tableta suelta son dos filas con el mismo nombre comercial; los datos del
 * producto se toman de la primera fila y las demás solo aportan presentación.
 *
 * FLUJO en dos pasos con el mismo archivo: «revisar» (no toca la base: dice
 * qué se crearía y qué filas tienen error) y «aplicar» (importa en una sola
 * transacción las filas válidas; las filas con error se reportan y NO cortan
 * la importación — criterio de aceptación de la fase 1).
 *
 * DUPLICADOS: producto existente = mismo nombre comercial (sin mayúsculas ni
 * acentos); se reutiliza y no se le cambian datos. Presentación existente =
 * mismo nombre dentro del producto; se reutiliza. Un código de barras ya
 * usado por otra presentación es error de la fila.
 */

const MAX_FILAS = 5000
const invalido = (m: string) => new ErrorFarmacia(400, m)

/* ───────────────────────────── plantilla ───────────────────────────── */

type FilaPlantilla = Partial<Record<ClaveImportacionProducto, string | number | boolean>>

/** Ejemplos de la plantilla como filas (una por presentación). */
function filasDeEjemplo(cuantos: number): FilaPlantilla[] {
  const filas: FilaPlantilla[] = []
  for (const p of PRODUCTOS_EJEMPLO.slice(0, cuantos)) {
    p.presentaciones.forEach((pr, i) => {
      filas.push({
        nombre: p.nombre,
        ...(i === 0
          ? {
              principio_activo: p.principio ?? '',
              laboratorio: p.laboratorio ?? 'Laboratorio ejemplo',
              linea: p.linea,
              grupo: p.grupo,
              registro_senasica: p.registro ?? '',
              especies: p.especies ?? '',
              peso_min_kg: p.pesoMin ?? '',
              peso_max_kg: p.pesoMax ?? '',
              edad_min_meses: p.edadMin ?? '',
              alergenos: p.alergenos ?? '',
              unidad_base: p.unidad,
              refrigeracion: p.refrigeracion ? 'Sí' : 'No',
              duracion_dias: p.duracionDias ?? '',
              descripcion: p.descripcion ?? '',
              publicado_tienda: p.grupo === 'I' ? 'No' : 'Sí',
              minimo_inventario: p.minimo ?? '',
              proveedor: p.proveedor ?? '',
            }
          : { linea: p.linea }),
        presentacion: pr.nombre,
        factor: pr.factor,
        precio: pr.precio,
        codigo_barras: pr.codigo ?? '',
        fraccionada: pr.fraccionada ? 'Sí' : 'No',
      })
    })
  }
  return filas
}

/**
 * Plantilla .xlsx: hoja «Productos» con filas de ejemplo (3 productos por
 * omisión; `?ejemplo=50` trae los 50 del catálogo de muestra para probar) y
 * hoja «Instrucciones».
 */
export async function plantillaProductosXlsx(ejemplos = 3): Promise<Buffer> {
  const libro = new ExcelJS.Workbook()
  const hoja = libro.addWorksheet('Productos')
  hoja.columns = CAMPOS_IMPORTACION_PRODUCTOS.map((c) => ({ header: c.clave, key: c.clave, width: Math.max(12, Math.min(26, c.clave.length + 4)) }))
  hoja.getRow(1).font = { bold: true }
  for (const f of filasDeEjemplo(Math.max(0, Math.min(ejemplos, PRODUCTOS_EJEMPLO.length)))) hoja.addRow(f)
  const info = libro.addWorksheet('Instrucciones')
  info.columns = [{ header: 'Columna', key: 'c', width: 24 }, { header: 'Qué va', key: 'q', width: 90 }]
  info.getRow(1).font = { bold: true }
  for (const c of CAMPOS_IMPORTACION_PRODUCTOS) info.addRow({ c: c.clave, q: c.etiqueta + ('requerido' in c && c.requerido ? ' (obligatorio)' : '') })
  info.addRow({})
  info.addRow({ c: 'Regla 1', q: 'Una fila = una presentación de un producto. Para otra presentación del mismo producto, repite el nombre comercial y cambia solo presentacion, factor, precio, codigo_barras y fraccionada.' })
  info.addRow({ c: 'Regla 2', q: 'El inventario se lleva en la unidad base (tableta, ml, g, pieza). El factor dice cuántas unidades base trae la presentación: «Caja 30 tabletas» = 30; «Tableta suelta» = 1 y fraccionada = Sí.' })
  info.addRow({ c: 'Regla 3', q: 'Grupo NOM-064: I controlados (receta cuantificada), II con receta, III venta libre, desregulado = alimento, accesorio, higiene. Grupo I y II llevan registro SENASICA.' })
  info.addRow({ c: 'Regla 4', q: 'Las filas de ejemplo se borran antes de importar. Las filas con error se reportan y no se importan; las demás sí.' })
  info.addRow({ c: 'Regla 5', q: 'Lotes, caducidades y existencias NO van aquí: entran por compras (fase 2) o por un ajuste de inventario con motivo.' })
  return Buffer.from(await libro.xlsx.writeBuffer())
}

/* ───────────────────────────── interpretación ───────────────────────────── */

const normalizar = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

const siNo = (v: string): boolean | null => {
  const s = normalizar(v)
  if (!s) return null
  if (['si', 's', 'yes', 'y', 'true', '1', 'x'].includes(s)) return true
  if (['no', 'n', 'false', '0'].includes(s)) return false
  return null
}

const LINEAS_TEXTO: [RegExp, FarProducto['linea']][] = [
  [/dieta|prescrip/, 'dieta_prescripcion'],
  [/antiparas|pulga|garrapat|despara/, 'antiparasitario'],
  [/alimento|croquet|comida/, 'alimento'],
  [/accesor|correa|collar|juguete|cama|transport/, 'accesorio'],
  [/higien|shampoo|champu|jabon|limpi/, 'higiene'],
  [/suplem|vitamin|condroprot/, 'suplemento'],
  [/medic|farmac/, 'medicamento'],
]
function aLinea(v: string): FarProducto['linea'] | null {
  const s = normalizar(v)
  if (!s) return null
  for (const [re, l] of LINEAS_TEXTO) if (re.test(s)) return l
  return null
}
function aGrupo(v: string, linea: FarProducto['linea']): FarProducto['grupo'] | null {
  const s = normalizar(v).replace(/^grupo\s*/, '')
  if (!s) return linea === 'medicamento' || linea === 'antiparasitario' || linea === 'dieta_prescripcion' || linea === 'suplemento' ? 'III' : 'desregulado'
  if (s === 'i' || s === '1') return 'I'
  if (s === 'ii' || s === '2') return 'II'
  if (s === 'iii' || s === '3') return 'III'
  if (/desreg|libre sin|no regul|ninguno/.test(s)) return 'desregulado'
  return null
}
const ESPECIES_VALIDAS = ['perro', 'gato', 'ave', 'conejo', 'roedor', 'reptil', 'otra'] as const
function aEspecies(v: string): { especies: FarProducto['especies']; desconocidas: string[] } {
  const partes = v.split(/[,;/|]+/).map(normalizar).filter(Boolean)
  const especies: NonNullable<FarProducto['especies']> = []
  const desconocidas: string[] = []
  for (const p of partes) {
    if (/perr|can|dog/.test(p)) especies.push('perro')
    else if (/gat|felin|cat/.test(p)) especies.push('gato')
    else if (/ave|pajar|loro|bird/.test(p)) especies.push('ave')
    else if (/conej|rabbit/.test(p)) especies.push('conejo')
    else if (/roed|hamster|cuy|raton/.test(p)) especies.push('roedor')
    else if (/rept|tortug|iguan/.test(p)) especies.push('reptil')
    else if (/otra|otro/.test(p)) especies.push('otra')
    else if (/tod/.test(p)) return { especies: [], desconocidas: [] }
    else desconocidas.push(p)
  }
  return { especies: [...new Set(especies)].filter((e) => (ESPECIES_VALIDAS as readonly string[]).includes(e)), desconocidas }
}
const aNumero = (v: string): number | null => {
  const s = v.replace(/[$,\s]/g, '').replace(/kg|ml|g$/i, '')
  if (!s) return null
  const n = Number(s)
  return Number.isFinite(n) ? n : Number.NaN
}

type PresentacionLeida = { nombre: string; factor: number; precio: number; codigoBarras: string | null; fraccionada: boolean; fila: number }
type ProductoLeido = {
  clave: string
  fila: number
  data: Record<string, unknown>
  proveedor: string | null
  presentaciones: PresentacionLeida[]
}
type Interpretado = { productos: Map<string, ProductoLeido>; errores: { fila: number; mensaje: string }[]; avisos: { fila: number; mensaje: string }[]; filas: number }

export function interpretar(filas: Record<string, string>[]): Interpretado {
  const productos = new Map<string, ProductoLeido>()
  const errores: Interpretado['errores'] = []
  const avisos: Interpretado['avisos'] = []
  const col = (f: Record<string, string>, k: ClaveImportacionProducto): string => {
    /* Encabezado exacto de la plantilla, o el mismo sin guiones bajos/acentos. */
    if (f[k] != null) return String(f[k]).trim()
    const objetivo = normalizar(k.replace(/_/g, ' '))
    for (const [h, v] of Object.entries(f)) if (normalizar(h.replace(/_/g, ' ')) === objetivo) return String(v ?? '').trim()
    return ''
  }
  filas.forEach((f, i) => {
    const fila = i + 2 // 1 = encabezados
    const vacia = Object.values(f).every((v) => !String(v ?? '').trim())
    if (vacia) return
    const nombre = col(f, 'nombre')
    if (!nombre) {
      errores.push({ fila, mensaje: 'Falta el nombre comercial.' })
      return
    }
    const clave = normalizar(nombre)
    const presentacion = col(f, 'presentacion') || 'Pieza'
    const factor = aNumero(col(f, 'factor')) ?? 1
    const precioTxt = col(f, 'precio')
    const precio = aNumero(precioTxt)
    if (precio == null || Number.isNaN(precio) || precio < 0 || Number.isNaN(aCentavos(precio))) {
      errores.push({ fila, mensaje: `«${nombre}»: el precio «${precioTxt || '(vacío)'}» no es válido.` })
      return
    }
    if (Number.isNaN(factor) || factor <= 0) {
      errores.push({ fila, mensaje: `«${nombre}»: el factor «${col(f, 'factor')}» debe ser un número mayor que cero.` })
      return
    }
    const fraccionada = siNo(col(f, 'fraccionada')) ?? false
    const codigoBarras = col(f, 'codigo_barras').replace(/\s+/g, '') || null
    const pres: PresentacionLeida = { nombre: presentacion, factor, precio, codigoBarras, fraccionada, fila }

    const existente = productos.get(clave)
    if (existente) {
      if (existente.presentaciones.some((p) => normalizar(p.nombre) === normalizar(presentacion))) {
        avisos.push({ fila, mensaje: `«${nombre}»: la presentación «${presentacion}» se repite; se usa la primera.` })
      } else existente.presentaciones.push(pres)
      return
    }

    const lineaTxt = col(f, 'linea')
    const linea = aLinea(lineaTxt)
    if (!linea) {
      errores.push({ fila, mensaje: `«${nombre}»: la línea «${lineaTxt || '(vacía)'}» no se reconoce (medicamento, antiparasitario, alimento, dieta de prescripción, accesorio, higiene, suplemento).` })
      return
    }
    const grupoTxt = col(f, 'grupo')
    const grupo = aGrupo(grupoTxt, linea)
    if (!grupo) {
      errores.push({ fila, mensaje: `«${nombre}»: el grupo «${grupoTxt}» no se reconoce (I, II, III o desregulado).` })
      return
    }
    const { especies, desconocidas } = aEspecies(col(f, 'especies'))
    if (desconocidas.length) avisos.push({ fila, mensaje: `«${nombre}»: especie(s) no reconocida(s): ${desconocidas.join(', ')}; se omiten.` })
    const numOpc = (k: ClaveImportacionProducto): number | null | undefined => {
      const n = aNumero(col(f, k))
      if (n == null) return null
      if (Number.isNaN(n) || n < 0) {
        avisos.push({ fila, mensaje: `«${nombre}»: ${k} «${col(f, k)}» no es un número; se deja vacío.` })
        return null
      }
      return n
    }
    const data: Record<string, unknown> = {
      nombre,
      principioActivo: col(f, 'principio_activo') || null,
      laboratorio: col(f, 'laboratorio') || null,
      linea,
      grupo,
      registroSenasica: col(f, 'registro_senasica').toUpperCase() || null,
      especies,
      pesoMinKg: numOpc('peso_min_kg'),
      pesoMaxKg: numOpc('peso_max_kg'),
      edadMinMeses: numOpc('edad_min_meses'),
      alergenos: col(f, 'alergenos') || null,
      unidadBase: (col(f, 'unidad_base') || 'pieza').toLowerCase(),
      refrigeracion: siNo(col(f, 'refrigeracion')) ?? false,
      duracionDias: numOpc('duracion_dias'),
      descripcion: col(f, 'descripcion') || null,
      publicadoTienda: siNo(col(f, 'publicado_tienda')) ?? false,
      minimoInventario: numOpc('minimo_inventario') ?? 0,
      activo: true,
    }
    const falla = validarProducto(data as Parameters<typeof validarProducto>[0])
    if (falla) {
      errores.push({ fila, mensaje: `«${nombre}»: ${falla}` })
      return
    }
    productos.set(clave, { clave, fila, data, proveedor: col(f, 'proveedor') || null, presentaciones: [pres] })
  })
  return { productos, errores, avisos, filas: filas.length }
}

/* ───────────────────────────── revisar y aplicar ───────────────────────────── */

async function enTransaccion<T>(ctx: Ctx, fn: (req: PayloadRequest) => Promise<T>): Promise<T> {
  const req = await createLocalReq({ user: ctx.user as User & { collection: 'users' } }, ctx.payload)
  const propia = await initTransaction(req)
  try {
    const r = await fn(req)
    if (propia) await commitTransaction(req)
    return r
  } catch (e) {
    if (propia) await killTransaction(req)
    throw e
  }
}

export async function importarProductos(ctx: Ctx, archivo: File, aplicar: boolean): Promise<ResumenImportacionProductos> {
  if (!ctx.modulos.farmacia) throw new ErrorFarmacia(404, 'El módulo de Farmacia está apagado.')
  if (!ctx.p.farmacia.catalogo) throw new ErrorFarmacia(403, 'La importación del catálogo la hacen los roles con «Catálogo».')
  const tabla = await leerArchivo(archivo).catch((e: unknown) => {
    throw invalido(e instanceof Error ? e.message : 'No se pudo leer el archivo.')
  })
  if (tabla.filas.length > MAX_FILAS) throw invalido(`El archivo trae ${tabla.filas.length} filas; el máximo es ${MAX_FILAS}.`)
  if (!tabla.filas.length) throw invalido('El archivo no trae filas (solo encabezados).')
  const inter = interpretar(tabla.filas)

  /* Lo que ya existe. */
  const nombres = [...inter.productos.values()].map((p) => p.data.nombre as string)
  const existentes = nombres.length
    ? await ctx.payload.find({ collection: 'far-productos', depth: 0, pagination: false, overrideAccess: true, where: { nombre: { in: nombres } } })
    : { docs: [] as FarProducto[] }
  const porClave = new Map(existentes.docs.map((p) => [normalizar(p.nombre), p]))
  const idsExistentes = existentes.docs.map((p) => p.id)
  const presExistentes = idsExistentes.length
    ? (await ctx.payload.find({ collection: 'far-presentaciones', depth: 0, pagination: false, overrideAccess: true, where: { producto: { in: idsExistentes } } })).docs
    : ([] as FarPresentacion[])
  const codigos = [...inter.productos.values()].flatMap((p) => p.presentaciones.map((x) => x.codigoBarras).filter(Boolean)) as string[]
  const codigosUsados = codigos.length
    ? (await ctx.payload.find({ collection: 'far-presentaciones', depth: 1, pagination: false, overrideAccess: true, where: { codigoBarras: { in: codigos } } })).docs
    : ([] as FarPresentacion[])
  const codigoDe = new Map(codigosUsados.map((p) => [p.codigoBarras as string, p]))
  const proveedores = await ctx.payload.find({ collection: 'far-proveedores', depth: 0, pagination: false, overrideAccess: true })
  const provPorClave = new Map(proveedores.docs.map((p) => [normalizar(p.nombre), p.id]))

  const resumen: ResumenImportacionProductos = {
    aplicado: aplicar,
    filasLeidas: inter.filas,
    productosNuevos: 0,
    productosExistentes: 0,
    presentacionesNuevas: 0,
    presentacionesExistentes: 0,
    proveedoresNuevos: 0,
    errores: [...inter.errores],
    avisos: [...inter.avisos],
    productos: [],
  }

  /* Plan: qué se crea, qué se reutiliza, qué fila se cae. */
  const vistosEnArchivo = new Set<string>()
  const provNuevos = new Set<string>()
  type Plan = { leido: ProductoLeido; existente: FarProducto | null; presentaciones: PresentacionLeida[]; proveedorId: number | null; proveedorNuevo: string | null }
  const plan: Plan[] = []
  for (const leido of inter.productos.values()) {
    const existente = porClave.get(leido.clave) ?? null
    const presDelProducto = existente ? presExistentes.filter((x) => idDe(x.producto) === existente.id) : []
    const nuevas: PresentacionLeida[] = []
    let conError = false
    for (const pr of leido.presentaciones) {
      if (presDelProducto.some((x) => normalizar(x.nombre) === normalizar(pr.nombre))) {
        resumen.presentacionesExistentes++
        continue
      }
      if (pr.codigoBarras) {
        const usado = codigoDe.get(pr.codigoBarras)
        if (usado && !(existente && idDe(usado.producto) === existente.id && normalizar(usado.nombre) === normalizar(pr.nombre))) {
          const dueño = typeof usado.producto === 'object' ? usado.producto.nombre : `producto ${idDe(usado.producto)}`
          resumen.errores.push({ fila: pr.fila, mensaje: `«${leido.data.nombre}»: el código de barras ${pr.codigoBarras} ya está en «${dueño} · ${usado.nombre}».` })
          conError = true
          continue
        }
        if (vistosEnArchivo.has(pr.codigoBarras)) {
          resumen.errores.push({ fila: pr.fila, mensaje: `«${leido.data.nombre}»: el código de barras ${pr.codigoBarras} se repite en el archivo.` })
          conError = true
          continue
        }
        vistosEnArchivo.add(pr.codigoBarras)
      }
      nuevas.push(pr)
    }
    if (!existente && !nuevas.length) {
      /* Todas sus presentaciones se cayeron: el producto no se crea sin ninguna (si ya se reportó el porqué, no se repite). */
      if (!conError) resumen.errores.push({ fila: leido.fila, mensaje: `«${leido.data.nombre}»: ninguna presentación válida; no se crea.` })
      continue
    }
    let proveedorId: number | null = null
    let proveedorNuevo: string | null = null
    if (leido.proveedor) {
      const k = normalizar(leido.proveedor)
      if (provPorClave.has(k)) proveedorId = provPorClave.get(k)!
      else {
        proveedorNuevo = leido.proveedor
        if (!provNuevos.has(k)) {
          provNuevos.add(k)
          resumen.proveedoresNuevos++
        }
      }
    }
    if (existente) resumen.productosExistentes++
    else resumen.productosNuevos++
    resumen.presentacionesNuevas += nuevas.length
    plan.push({ leido, existente, presentaciones: nuevas, proveedorId, proveedorNuevo })
    if (resumen.productos.length < 100) resumen.productos.push({ folio: existente ? `PRD-${String(existente.id).padStart(5, '0')}` : null, nombre: leido.data.nombre as string, presentaciones: nuevas.length, nuevo: !existente })
  }
  resumen.errores.sort((a, b) => a.fila - b.fila)
  resumen.avisos.sort((a, b) => a.fila - b.fila)

  if (!aplicar) return resumen

  await enTransaccion(ctx, async (req) => {
    const provCreados = new Map<string, number>()
    for (const p of plan) {
      let proveedorId = p.proveedorId
      if (p.proveedorNuevo) {
        const k = normalizar(p.proveedorNuevo)
        if (!provCreados.has(k)) {
          const creado = await ctx.payload.create({ collection: 'far-proveedores', overrideAccess: true, req, depth: 0, data: { nombre: p.proveedorNuevo, diasEntrega: 3, activo: true } })
          provCreados.set(k, creado.id)
        }
        proveedorId = provCreados.get(k)!
      }
      let productoId: number
      if (p.existente) productoId = p.existente.id
      else {
        const creado = await ctx.payload.create({
          collection: 'far-productos',
          overrideAccess: true,
          req,
          depth: 0,
          data: { ...p.leido.data, proveedorPreferente: proveedorId } as never,
        })
        productoId = creado.id
        const r = resumen.productos.find((x) => x.nombre === p.leido.data.nombre && !x.folio)
        if (r) r.folio = `PRD-${String(productoId).padStart(5, '0')}`
      }
      for (const pr of p.presentaciones) {
        await ctx.payload.create({
          collection: 'far-presentaciones',
          overrideAccess: true,
          req,
          depth: 0,
          data: { producto: productoId, nombre: pr.nombre, factor: pr.factor, precio: pr.precio, codigoBarras: pr.codigoBarras, fraccionada: pr.fraccionada, activa: true },
        })
      }
    }
  })
  return resumen
}
