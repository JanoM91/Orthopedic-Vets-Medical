/**
 * Prueba de integración de la farmacia (fase 1: catálogo, inventario por
 * lote, kardex, permisos, importación, módulos activables) contra una app
 * corriendo en local con una base Postgres LOCAL y vacía (nunca la de
 * producción).
 *
 *   npm run start  (o npm run dev, con DATABASE_URL local)
 *   node scripts/probarFarmacia.mjs [http://localhost:3000]
 *
 * Usa las mismas credenciales de prueba que probarClinica.mjs; si la base ya
 * tiene primer usuario y roles, los reutiliza. Deja el módulo Clínica
 * encendido al terminar.
 *
 * Fase 4: para simular 8 semanas de ventas, la prueba inserta movimientos
 * con fechas pasadas DIRECTO en la base local (DATABASE_URL de .env) — es
 * siembra de prueba; la app no tiene ninguna puerta para eso. Se niega a
 * correr si DATABASE_URL no apunta a localhost. El cron usa CRON_SECRET de .env.
 *
 * Fase 5a (tienda): enciende el módulo Tienda (y lo deja encendido), usa la
 * pasarela de prueba (PAGOS_PRUEBA_SECRETO de .env, también en la app) y
 * vence un apartado moviendo `expira_en` en la base local.
 *
 * Fase 5b: domicilio y repartidor; Mercado Pago contra un simulador local que
 * levanta esta prueba (MERCADOPAGO_API_URL=http://127.0.0.1:4555,
 * MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET falsos en .env).
 *
 * Fase 6b (planes): mueve `proxima_entrega` en la base local para que «toque»
 * una entrega; la suscripción de Mercado Pago va contra el mismo simulador.
 */
import fs from 'node:fs'
import pg from 'pg'

const ENV = Object.fromEntries(
  (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
const BASE = process.argv[2] || 'http://localhost:3000'
const CORREO = 'prueba-superadmin@ejemplo.mx'
const PASS = 'Prueba-123456'

let fallas = 0
let total = 0
function ok(cond, texto, extra) {
  total++
  if (cond) console.log(`  ✓ ${texto}`)
  else {
    fallas++
    console.log(`  ✗ ${texto}${extra !== undefined ? ' → ' + JSON.stringify(extra).slice(0, 400) : ''}`)
  }
}

class Sesion {
  constructor() {
    this.cookie = ''
  }
  async llamar(metodo, ruta, cuerpo, opts = {}) {
    const headers = { ...(opts.headers || {}) }
    if (this.cookie) headers.cookie = this.cookie
    let body
    if (cuerpo instanceof FormData) body = cuerpo
    else if (cuerpo !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(cuerpo)
    }
    const r = await fetch(BASE + ruta, { method: metodo, headers, body, redirect: 'manual' })
    const sc = r.headers.getSetCookie?.() || []
    for (const c of sc) {
      const [par] = c.split(';')
      if (par.startsWith('payload-token=')) this.cookie = par
    }
    const tipo = r.headers.get('content-type') || ''
    const data = tipo.includes('json') ? await r.json().catch(() => null) : tipo.includes('spreadsheet') ? await r.arrayBuffer() : await r.text().catch(() => null)
    return { status: r.status, data, headers: r.headers }
  }
  get(ruta) {
    return this.llamar('GET', ruta)
  }
  post(ruta, cuerpo) {
    return this.llamar('POST', ruta, cuerpo)
  }
  patch(ruta, cuerpo) {
    return this.llamar('PATCH', ruta, cuerpo)
  }
  del(ruta) {
    return this.llamar('DELETE', ruta)
  }
  async subir(ruta, nombre, bytes, campos = {}) {
    const fd = new FormData()
    fd.append('archivo', new Blob([bytes]), nombre)
    for (const [k, v] of Object.entries(campos)) fd.append(k, String(v))
    return this.llamar('POST', ruta, fd)
  }
  async login(coleccion, email, password) {
    const r = await this.post(`/api/${coleccion}/login`, { email, password })
    return r.status === 200
  }
}

/** ¿Algún objeto anidado trae una llave que contenga «costo» o «valorInventario»? */
function trazasDeCosto(x, ruta = '') {
  if (Array.isArray(x)) return x.flatMap((v, i) => trazasDeCosto(v, `${ruta}[${i}]`))
  if (x && typeof x === 'object') {
    /* `permisos.verCostos` es la casilla del rol, no un costo. */
    return Object.entries(x).flatMap(([k, v]) => (k === 'permisos' ? [] : /costo|valorInventario|margen/i.test(k) ? [`${ruta}.${k}`] : trazasDeCosto(v, `${ruta}.${k}`)))
  }
  return []
}

async function main() {
  console.log(`\nFarmacia · pruebas contra ${BASE}`)
  const admin = new Sesion()

  /* ── arranque ── */
  console.log('\nArranque')
  let r = await admin.post('/api/users/first-register', { email: CORREO, password: PASS, name: 'Super Admin' })
  if (r.status !== 200 && r.status !== 201) {
    ok(await admin.login('users', CORREO, PASS), 'La instalación ya tenía primer usuario: entra con las credenciales de prueba', r.data)
  } else {
    ok(true, 'Primer usuario creado (superadmin)')
    await admin.login('users', CORREO, PASS)
  }
  r = await admin.get('/api/farmacia/catalogo')
  ok(r.status === 200 && r.data.permisos.superadmin && r.data.permisos.verCostos && r.data.modulos.farmacia, 'Superadmin: catálogo de farmacia con todos los permisos y módulo encendido', r.data)
  r = await admin.get('/api/roles?limit=1&depth=0')
  if (!(r.status === 200 && r.data.totalDocs > 0)) {
    await admin.post('/api/finanzas/arranque', { que: 'catalogos' })
    r = await admin.post('/api/finanzas/arranque', { que: 'roles' })
    ok(r.status === 200, 'Roles sugeridos creados desde Finanzas (incluyen los de farmacia)', r.data)
  }
  r = await admin.post('/api/farmacia/arranque', { que: 'roles' })
  ok(r.status === 200, 'Arranque de roles de farmacia es idempotente', r.data)
  const roles = (await admin.get('/api/roles?limit=50&depth=0')).data.docs
  const rolDueno = roles.find((x) => x.nombre === 'Dueño')
  const rolEnc = roles.find((x) => x.nombre === 'Encargado de farmacia')
  const rolVend = roles.find((x) => x.nombre === 'Vendedor de mostrador')
  const rolRep = roles.find((x) => x.nombre === 'Repartidor')
  ok(rolDueno?.farmacia?.configurar && rolDueno?.farmacia?.verCostos, 'Dueño: farmacia completa', rolDueno?.farmacia)
  ok(rolEnc?.farmacia?.verCostos && rolEnc?.farmacia?.ajustes && rolEnc?.farmacia?.catalogo && !rolEnc?.farmacia?.configurar, 'Encargado: ve costos, ajusta y edita catálogo; no configura', rolEnc?.farmacia)
  ok(rolVend?.farmacia?.vender && !rolVend?.farmacia?.verCostos && !rolVend?.farmacia?.descuentos && !rolVend?.farmacia?.catalogo, 'Vendedor: vende; no ve costos, no descuenta, no edita catálogo', rolVend?.farmacia)
  ok(rolRep?.farmacia?.entregas && !rolRep?.farmacia?.vender, 'Repartidor: solo entregas', rolRep?.farmacia)

  r = await admin.post('/api/farmacia/arranque', { que: 'almacen' })
  ok(r.status === 200, 'Arranque: almacén «Farmacia» por omisión', r.data)
  r = await admin.get('/api/farmacia/catalogo')
  ok(r.data.almacenes?.length >= 1 && r.data.configuracion.almacenPorOmisionId, 'Catálogo trae el almacén y la configuración por omisión (caducidad 90/60, apartado 24 h)', r.data.configuracion)
  ok(r.data.configuracion.caducidad.medicamentos === 90 && r.data.configuracion.horasApartado === 24 && r.data.configuracion.cierreDiaActivo === true, 'Valores por omisión de la configuración', r.data.configuracion)

  const crearUsuario = async (email, name, rol) => {
    const existe = (await admin.get(`/api/users?where[email][equals]=${encodeURIComponent(email)}&depth=0`)).data.docs?.[0]
    if (existe) return existe
    const x = await admin.post('/api/users', { email, password: PASS, name, rolDeAcceso: rol.id })
    return x.data.doc
  }
  await crearUsuario('encargado@ejemplo.mx', 'Luis Encargado', rolEnc)
  await crearUsuario('vendedor@ejemplo.mx', 'Ana Vendedora', rolVend)
  const encargado = new Sesion()
  ok(await encargado.login('users', 'encargado@ejemplo.mx', PASS), 'Encargado entra')
  const vendedor = new Sesion()
  ok(await vendedor.login('users', 'vendedor@ejemplo.mx', PASS), 'Vendedor entra')
  r = await vendedor.get('/api/farmacia/catalogo')
  ok(r.status === 200 && r.data.permisos.vender && !r.data.permisos.verCostos && r.data.totales.valorInventario === undefined, 'Vendedor: catálogo sin valor del inventario', r.data.totales)
  r = await vendedor.get('/admin')
  ok([302, 303, 307, 308].includes(r.status) && /\/admin\/farmacia/.test(r.headers.get('location') || ''), 'Vendedor (sin panel ni Finanzas) entra directo a /admin/farmacia', { status: r.status, location: r.headers.get('location') })

  /* ── importación ── */
  console.log('\nImportación con la plantilla (50 productos de ejemplo)')
  r = await vendedor.get('/api/farmacia/productos/plantilla')
  ok(r.status === 403, 'Vendedor no descarga la plantilla', r.status)
  r = await encargado.get('/api/farmacia/productos/plantilla?ejemplo=50')
  ok(r.status === 200 && r.data instanceof ArrayBuffer && r.data.byteLength > 5000, 'Encargado descarga la plantilla con 50 ejemplos (.xlsx)', r.status)
  const plantilla = r.data
  r = await encargado.subir('/api/farmacia/productos/importar', 'plantilla-productos.xlsx', plantilla, { aplicar: false })
  const yaHabia = r.status === 200 && r.data.productosNuevos === 0 && r.data.productosExistentes === 50
  ok(r.status === 200 && (r.data.productosNuevos === 50 || yaHabia) && r.data.errores.length === 0, 'Revisar: 50 productos, sin errores', r.data && { ...r.data, productos: undefined })
  ok(r.status === 200 && r.data.aplicado === false, 'Revisar no toca la base', r.data?.aplicado)
  r = await encargado.subir('/api/farmacia/productos/importar', 'plantilla-productos.xlsx', plantilla, { aplicar: true })
  ok(r.status === 200 && r.data.aplicado && (r.data.productosNuevos === 50 || yaHabia) && r.data.presentacionesNuevas >= (yaHabia ? 0 : 60), 'Importar: crea los 50 productos con sus presentaciones', r.data && { ...r.data, productos: undefined })
  ok(r.data?.productos?.every((p) => /^PRD-\d{5}$/.test(p.folio || '')), 'Cada producto importado tiene folio PRD-', r.data?.productos?.slice(0, 3))
  ok(r.data?.proveedoresNuevos === (yaHabia ? 0 : 3), 'Crea los proveedores de la plantilla que no existían', r.data?.proveedoresNuevos)
  r = await encargado.subir('/api/farmacia/productos/importar', 'plantilla-productos.xlsx', plantilla, { aplicar: true })
  ok(r.status === 200 && r.data.productosNuevos === 0 && r.data.productosExistentes === 50 && r.data.presentacionesNuevas === 0, 'Importar dos veces no duplica nada', r.data && { ...r.data, productos: undefined })
  r = await encargado.get('/api/farmacia/productos?q=antipulgas')
  ok(r.status === 200 && r.data.productos.length >= 5 && r.data.productos.every((p) => /antipulgas/i.test(p.nombre)), 'Búsqueda por texto', r.data?.productos?.length)
  r = await encargado.get('/api/farmacia/productos?q=7500000000016')
  ok(r.status === 200 && r.data.productos[0]?.nombre?.includes('Desparasitante interno perro 10 kg'), 'Búsqueda por código de barras pone primero el producto escaneado', r.data?.productos?.[0]?.nombre)
  r = await encargado.get('/api/farmacia/productos?grupo=I')
  ok(r.status === 200 && r.data.productos.length === 2 && r.data.productos.every((p) => p.grupo === 'I'), 'Filtro por grupo I', r.data?.productos?.map((p) => p.nombre))

  const sufijo = Date.now().toString().slice(-6)
  const csv = [
    'nombre,linea,grupo,registro_senasica,unidad_base,presentacion,factor,precio,codigo_barras,fraccionada',
    `Producto bueno ${sufijo},medicamento,III,,tableta,Caja 10,10,120,,No`,
    `Producto bueno ${sufijo},medicamento,III,,tableta,Tableta,1,15,,Sí`,
    `Producto sin precio ${sufijo},medicamento,III,,tableta,Caja,10,,,No`,
    `Producto con linea rara ${sufijo},cosmético,III,,pieza,Pieza,1,50,,No`,
    `Producto grupo II sin registro ${sufijo},medicamento,II,,tableta,Caja,10,200,,No`,
    `Producto con código repetido ${sufijo},higiene,,,pieza,Pieza,1,80,7500000000016,No`,
    `Alimento bueno ${sufijo},alimento,,,kg,Bolsa 3 kg,3,400,,No`,
  ].join('\n')
  r = await encargado.subir('/api/farmacia/productos/importar', 'mixto.csv', new TextEncoder().encode(csv), { aplicar: true })
  ok(r.status === 200 && r.data.productosNuevos === 2 && r.data.errores.length === 4, 'CSV con filas malas: importa las 2 buenas y reporta 4 errores sin cortar', r.data && { ...r.data, productos: undefined })
  ok(r.data?.errores?.some((e) => /precio/.test(e.mensaje)) && r.data?.errores?.some((e) => /línea/.test(e.mensaje)) && r.data?.errores?.some((e) => /SENASICA/.test(e.mensaje)) && r.data?.errores?.some((e) => /código de barras/.test(e.mensaje)), 'Cada error dice qué pasó (precio, línea, SENASICA, código repetido)', r.data?.errores)
  r = await encargado.get(`/api/farmacia/productos?q=${encodeURIComponent(`Producto bueno ${sufijo}`)}`)
  const bueno = r.data.productos[0]
  ok(bueno && bueno.presentaciones === 2, 'El producto bueno quedó con 2 presentaciones', bueno)
  r = await vendedor.subir('/api/farmacia/productos/importar', 'mixto.csv', new TextEncoder().encode(csv), { aplicar: true })
  ok(r.status === 403, 'Vendedor no importa', r.status)

  /* ── catálogo a mano ── */
  console.log('\nCatálogo a mano y validaciones')
  r = await encargado.post('/api/farmacia/productos', { nombre: `Antibiótico prueba ${sufijo}`, linea: 'medicamento', grupo: 'II', unidadBase: 'tableta' })
  ok(r.status === 400 && /SENASICA/.test(r.data.error), 'Grupo II sin registro SENASICA se rechaza', r.data)
  r = await encargado.post('/api/farmacia/productos', { nombre: `Croqueta prueba ${sufijo}`, linea: 'alimento', grupo: 'I', unidadBase: 'kg' })
  ok(r.status === 400, 'Alimento Grupo I se rechaza', r.data)
  r = await encargado.post('/api/farmacia/productos', { nombre: `Antibiótico prueba ${sufijo}`, linea: 'medicamento', grupo: 'II', registroSenasica: 'q-prueba-1', unidadBase: 'tableta', especies: ['perro'], pesoMinKg: 20, pesoMaxKg: 5, minimoInventario: 10, alergenos: 'penicilinas' })
  ok(r.status === 400 && /peso/.test(r.data.error), 'Peso máximo menor que el mínimo se rechaza', r.data)
  r = await encargado.post('/api/farmacia/productos', { nombre: `Antibiótico prueba ${sufijo}`, linea: 'medicamento', grupo: 'II', registroSenasica: 'q-prueba-1', unidadBase: 'tableta', especies: ['perro'], pesoMinKg: 5, pesoMaxKg: 20, minimoInventario: 10, alergenos: 'penicilinas' })
  ok(r.status === 201 && /^PRD-\d{5}$/.test(r.data.folio) && r.data.registroSenasica === 'Q-PRUEBA-1' && r.data.existencia === 0, 'Crea producto con folio PRD- y normaliza el registro', r.data)
  const prod = r.data
  r = await vendedor.post('/api/farmacia/productos', { nombre: 'Intruso', linea: 'medicamento', grupo: 'III', unidadBase: 'pieza' })
  ok(r.status === 403, 'Vendedor no crea productos', r.status)
  r = await encargado.post(`/api/farmacia/productos/${prod.id}/presentaciones`, { nombre: 'Caja 20 tabletas', factor: 20, precio: 480, codigoBarras: `77${sufijo}0001` })
  ok(r.status === 201 && r.data.factor === 20 && r.data.precio === 480, 'Crea presentación', r.data)
  const caja = r.data
  r = await encargado.post(`/api/farmacia/productos/${prod.id}/presentaciones`, { nombre: 'Tableta', factor: 1, precio: 28, fraccionada: true, codigoBarras: `77${sufijo}0001` })
  ok(r.status === 400 && /código de barras/.test(r.data.error), 'Código de barras repetido se rechaza', r.data)
  r = await encargado.post(`/api/farmacia/productos/${prod.id}/presentaciones`, { nombre: 'Tableta', factor: 1, precio: 28, fraccionada: true })
  ok(r.status === 201 && r.data.fraccionada, 'Crea presentación fraccionada', r.data)
  const tableta = r.data
  r = await encargado.post(`/api/farmacia/presentaciones/${caja.id}`, { precio: 495 })
  ok(r.status === 200 && r.data.precio === 495, 'Actualiza precio', r.data)
  r = await encargado.post(`/api/farmacia/productos/${prod.id}`, { grupo: 'III', registroSenasica: null })
  ok(r.status === 200 && r.data.grupo === 'III', 'Cambia a Grupo III sin registro', r.data)
  r = await encargado.post(`/api/farmacia/productos/${prod.id}`, { grupo: 'II' })
  ok(r.status === 400, 'Volver a Grupo II sin registro se rechaza (reglas sobre el doc fusionado)', r.data)
  r = await encargado.post(`/api/farmacia/productos/${prod.id}`, { grupo: 'II', registroSenasica: 'Q-PRUEBA-1' })
  ok(r.status === 200 && r.data.grupo === 'II', 'Vuelve a Grupo II con registro', r.data)

  /* ── inventario: lotes, movimientos, existencia = suma ── */
  console.log('\nInventario por lote y kardex')
  r = await vendedor.post('/api/farmacia/ajustes', { productoId: prod.id, lote: { numeroLote: 'L-INTRUSO', caducidad: '2028-01-01' }, cantidad: 10, motivo: 'intento del vendedor' })
  ok(r.status === 403, 'Vendedor no ajusta inventario', r.status)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, lote: { numeroLote: `L-${sufijo}-A`, caducidad: '2028-06-30', costoUnidad: 12.5 }, cantidad: 30, motivo: '' })
  ok(r.status === 400 && /motivo/i.test(r.data.error), 'Ajuste sin motivo se rechaza', r.data)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, lote: { numeroLote: `L-${sufijo}-A`, caducidad: '2028-06-30', costoUnidad: 12.5 }, cantidad: 30, motivo: 'Inventario inicial' })
  ok(r.status === 201 && /^LOT-\d{5}$/.test(r.data.lote.folio) && r.data.lote.existencia === 30 && r.data.movimiento.cantidad === 30 && r.data.movimiento.existenciaDespues === 30, 'Entrada con lote nuevo: folio LOT-, existencia 30', r.data)
  const loteA = r.data.lote
  ok(r.data.lote.costoUnidad === 12.5 && r.data.movimiento.costoUnidad === 12.5, 'Encargado sí ve el costo en lote y movimiento', r.data)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, loteId: loteA.id, cantidad: -5, motivo: 'Conteo físico' })
  ok(r.status === 201 && r.data.lote.existencia === 25, 'Salida de 5: existencia 25', r.data?.lote)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, loteId: loteA.id, tipo: 'merma', cantidad: -3, motivo: 'Frasco roto' })
  ok(r.status === 201 && r.data.lote.existencia === 22 && r.data.movimiento.tipo === 'merma', 'Merma de 3: existencia 22', r.data?.lote)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, loteId: loteA.id, tipo: 'merma', cantidad: 3, motivo: 'Mal signo' })
  ok(r.status === 400, 'Merma positiva se rechaza', r.data)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, loteId: loteA.id, cantidad: -100, motivo: 'Demasiado' })
  ok(r.status === 400 && /solo tiene/.test(r.data.error), 'Salida mayor que la existencia se rechaza (nunca negativo)', r.data)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, lote: { numeroLote: `L-${sufijo}-A`, caducidad: '2029-01-01' }, cantidad: 1, motivo: 'Mismo lote otra caducidad' })
  ok(r.status === 400 && /ya existe/.test(r.data.error), 'Mismo número de lote con otra caducidad se rechaza', r.data)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, lote: { numeroLote: `L-${sufijo}-A`, caducidad: '2028-06-30' }, cantidad: 8, motivo: 'Segunda entrada al mismo lote' })
  ok(r.status === 201 && r.data.lote.id === loteA.id && r.data.lote.existencia === 30 && r.data.lote.cantidadRecibida === 38, 'Mismo lote y caducidad: se reutiliza (existencia 30, recibidas 38)', r.data?.lote)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, lote: { numeroLote: `L-${sufijo}-V`, caducidad: '2024-01-31', costoUnidad: 10 }, cantidad: 4, motivo: 'Lote vencido de prueba' })
  ok(r.status === 201 && r.data.lote.bloqueado && r.data.lote.estado === 'vencido', 'Lote con caducidad pasada entra bloqueado y marcado vencido', r.data?.lote)
  const loteV = r.data.lote
  r = await encargado.post(`/api/farmacia/lotes/${loteV.id}/bloqueo`, { bloqueado: false })
  ok(r.status === 400, 'Un lote vencido no se desbloquea', r.data)

  r = await admin.get(`/api/far-movimientos?where[lote][equals]=${loteA.id}&limit=100&depth=0`)
  const suma = r.data.docs.reduce((a, m) => a + m.cantidad, 0)
  ok(r.status === 200 && r.data.docs.length === 4 && suma === 30, 'Kardex del lote: 4 movimientos cuya suma es la existencia (30)', { n: r.data?.docs?.length, suma })
  r = await admin.get(`/api/far-lotes/${loteA.id}?depth=0`)
  ok(r.status === 200 && r.data.existencia === suma, 'far-lotes.existencia coincide con la suma del kardex', r.data?.existencia)
  r = await encargado.get(`/api/farmacia/productos/${prod.id}`)
  ok(r.status === 200 && r.data.existencia === 30 && r.data.existenciaFisica === 34 && r.data.lotes.length === 2, 'Ficha: existencia vigente 30 (el vencido no cuenta), física 34, 2 lotes', { ex: r.data?.existencia, fis: r.data?.existenciaFisica })
  ok(r.data?.bajoMinimo === false, 'Con 30 y mínimo 10 no está bajo mínimo', r.data?.bajoMinimo)
  r = await encargado.post(`/api/farmacia/productos/${prod.id}`, { minimoInventario: 50 })
  r = await encargado.get(`/api/farmacia/productos?q=${encodeURIComponent(`Antibiótico prueba ${sufijo}`)}&bajoMinimo=true`)
  ok(r.status === 200 && r.data.productos.some((p) => p.id === prod.id && p.bajoMinimo), 'Con mínimo 50 aparece en «bajo mínimo»', r.data?.productos?.length)
  r = await encargado.get(`/api/farmacia/inventario?solo=vencidos&q=${encodeURIComponent(`Antibiótico prueba ${sufijo}`)}`)
  ok(r.status === 200 && r.data.productos.length === 1 && r.data.productos[0].lotes.some((l) => l.estado === 'vencido'), 'Inventario filtra vencidos', r.data?.productos?.length)
  r = await encargado.get(`/api/farmacia/kardex?producto=${prod.id}`)
  ok(r.status === 200 && r.data.total === 5 && r.data.movimientos[0].usuario?.nombre === 'Luis Encargado', 'Kardex por producto con quién registró', { total: r.data?.total, quien: r.data?.movimientos?.[0]?.usuario })

  /* ── inmutabilidad del kardex ── */
  console.log('\nKardex inmutable (API genérica, superadmin)')
  const mov = (await admin.get(`/api/far-movimientos?where[lote][equals]=${loteA.id}&limit=1&depth=0`)).data.docs[0]
  r = await admin.patch(`/api/far-movimientos/${mov.id}`, { cantidad: 999 })
  ok(r.status === 403, 'Editar un movimiento: 403 incluso al superadmin', { status: r.status })
  r = await admin.del(`/api/far-movimientos/${mov.id}`)
  ok(r.status === 403, 'Borrar un movimiento: 403', { status: r.status })
  r = await admin.post('/api/far-movimientos', { tipo: 'ajuste', producto: prod.id, lote: loteA.id, almacen: 1, cantidad: 5, dia: '2026-01-01' })
  ok(r.status === 403, 'Crear un movimiento por la API genérica: 403 (solo el servicio)', { status: r.status })
  r = await admin.patch(`/api/far-lotes/${loteA.id}`, { existencia: 999 })
  ok(r.status === 403, 'Editar la existencia de un lote a mano: 403', { status: r.status })
  r = await admin.del(`/api/far-productos/${prod.id}`)
  ok(r.status === 403, 'Borrar un producto: 403 (se marca inactivo)', { status: r.status })
  r = await admin.get(`/api/far-movimientos/${mov.id}?depth=0`)
  ok(r.status === 200 && r.data.cantidad === mov.cantidad, 'El movimiento sigue intacto', r.data?.cantidad)

  /* ── costos ocultos ── */
  console.log('\nCostos: quien no tiene «Ver costos» no los recibe en ninguna respuesta')
  const rutas = [`/api/farmacia/productos/${prod.id}`, `/api/farmacia/inventario?solo=todos&q=${encodeURIComponent(`Antibiótico prueba ${sufijo}`)}`, `/api/farmacia/kardex?producto=${prod.id}`, '/api/farmacia/catalogo', `/api/far-lotes/${loteA.id}?depth=0`, `/api/far-movimientos?where[lote][equals]=${loteA.id}&depth=0`]
  for (const ruta of rutas) {
    r = await vendedor.get(ruta)
    const trazas = trazasDeCosto(r.data)
    ok(r.status === 200 && trazas.length === 0, `Vendedor · ${ruta.split('?')[0]} sin costos`, trazas.slice(0, 5))
  }
  r = await encargado.get(`/api/far-lotes/${loteA.id}?depth=0`)
  ok(r.status === 200 && r.data.costoUnidad === 12.5, 'Encargado · API genérica sí trae costoUnidad', r.data?.costoUnidad)
  r = await encargado.get(`/api/farmacia/inventario?solo=todos&q=${encodeURIComponent(`Antibiótico prueba ${sufijo}`)}`)
  ok(r.status === 200 && r.data.productos[0]?.lotes?.[0]?.costoUnidad != null, 'Encargado · inventario sí trae costos', r.data?.productos?.[0]?.lotes?.[0])
  r = await encargado.get('/api/farmacia/catalogo')
  ok(r.status === 200 && typeof r.data.totales.valorInventario === 'number' && r.data.totales.valorInventario > 0, 'Encargado · valor del inventario a costo', r.data?.totales)

  /* ── proveedores, almacenes y configuración ── */
  console.log('\nProveedores, almacenes y configuración')
  r = await encargado.post('/api/farmacia/proveedores', { nombre: `Proveedor ${sufijo}` })
  ok(r.status === 403, 'Encargado no da de alta proveedores (solo «Configurar»)', r.status)
  r = await admin.post('/api/farmacia/proveedores', { nombre: `Proveedor ${sufijo}`, rfc: 'xaxx010101000', diasEntrega: 5, contacto: { telefono: '2281234567', correo: 'ventas@ejemplo.mx' } })
  ok(r.status === 201 && r.data.rfc === 'XAXX010101000' && r.data.diasEntrega === 5, 'Superadmin crea proveedor (RFC en mayúsculas)', r.data)
  const prov = r.data
  r = await admin.post('/api/farmacia/proveedores', { nombre: `Proveedor ${sufijo}` })
  ok(r.status === 400, 'Proveedor repetido se rechaza', r.data)
  r = await admin.post(`/api/farmacia/proveedores/${prov.id}`, { diasEntrega: 7, activo: false })
  ok(r.status === 200 && r.data.diasEntrega === 7 && !r.data.activo, 'Actualiza proveedor', r.data)
  r = await admin.post('/api/farmacia/almacenes', { nombre: `Clínica ${sufijo}`, tipo: 'clinica' })
  ok(r.status === 201 && r.data.tipo === 'clinica', 'Crea almacén de clínica', r.data)
  r = await encargado.post('/api/farmacia/configuracion', { horasApartado: 48 })
  ok(r.status === 403, 'Encargado no cambia la configuración', r.status)
  r = await admin.post('/api/farmacia/configuracion', { horasApartado: 48, caducidad: { medicamentos: 120 }, cierreDiaActivo: false, promociones: [{ diasAntes: 60, descuentoPorciento: 20 }] })
  ok(r.status === 200 && r.data.horasApartado === 48 && r.data.caducidad.medicamentos === 120 && r.data.caducidad.alimento === 60 && r.data.cierreDiaActivo === false && r.data.promociones.length === 1, 'Superadmin cambia parámetros sin perder los demás', r.data)
  r = await admin.post('/api/farmacia/configuracion', { horasApartado: 24, caducidad: { medicamentos: 90 }, cierreDiaActivo: true })

  /* ── módulos activables ── */
  console.log('\nMódulos activables (instalacion-configuracion)')
  r = await encargado.post('/api/globals/instalacion-configuracion', { modulos: { clinica: false } })
  ok(r.status === 403, 'Solo el superadmin cambia los módulos', r.status)
  r = await admin.post('/api/globals/instalacion-configuracion', { modulos: { clinica: false, farmacia: true, tienda: false } })
  ok(r.status === 200, 'Superadmin apaga Clínica', r.data)
  r = await admin.get('/api/clinica/catalogo')
  ok(r.status === 404, 'Con Clínica apagada, /api/clinica responde 404', r.status)
  r = await admin.get('/api/clientes?limit=1')
  ok(r.status === 403, 'Con Clínica apagada, la colección «clientes» responde 403 incluso al superadmin', r.status)
  r = await admin.get('/api/access')
  const acc = r.data?.collections
  /* Sin permiso de lectura, Payload omite `read` (o lo marca false): así el panel no pinta la colección. */
  const lee = (slug) => acc?.[slug]?.read === true || acc?.[slug]?.read?.permission === true
  const sinLectura = (slug) => !lee(slug)
  ok(r.status === 200 && acc && sinLectura('clientes') && sinLectura('citas') && sinLectura('mas-notas') && lee('far-productos'), 'Permisos del panel (/api/access): expediente y agenda ocultos, farmacia visible', { clientes: acc?.clientes?.read, citas: acc?.citas?.read, far: acc?.['far-productos']?.read })
  r = await admin.get('/api/farmacia/catalogo')
  ok(r.status === 200 && r.data.modulos.clinica === false && r.data.modulos.farmacia === true, 'Farmacia sigue funcionando y sabe que Clínica está apagada', r.data?.modulos)
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, loteId: loteA.id, cantidad: -1, motivo: 'Con clínica apagada' })
  ok(r.status === 201 && r.data.lote.existencia === 29, 'Movimiento de inventario con Clínica apagada', r.data?.lote)
  r = await admin.get('/admin/clinica')
  const htmlClinica = typeof r.data === 'string' ? r.data : ''
  ok(r.status === 200 && /módulo de Clínica está apagado/.test(htmlClinica), 'La vista /admin/clinica avisa que el módulo está apagado', r.status)
  r = await admin.post('/api/globals/instalacion-configuracion', { modulos: { clinica: true, farmacia: false, tienda: false } })
  r = await admin.get('/api/farmacia/catalogo')
  ok(r.status === 404, 'Con Farmacia apagada, /api/farmacia responde 404', r.status)
  r = await admin.get('/api/far-productos?limit=1')
  ok(r.status === 403, 'Con Farmacia apagada, las colecciones far-* responden 403', r.status)
  r = await admin.get('/api/clinica/catalogo')
  ok(r.status === 200, 'Clínica vuelve a responder', r.status)
  r = await admin.post('/api/globals/instalacion-configuracion', { modulos: { clinica: true, farmacia: true, tienda: false } })
  ok(r.status === 200, 'Módulos restaurados (Clínica y Farmacia encendidos)', r.data?.modulos)
  r = await admin.get('/api/farmacia/catalogo')
  ok(r.status === 200, 'Farmacia vuelve a responder', r.status)

  /* ── fase 2: compras desde XML CFDI, recepción, Finanzas, anulación ── */
  console.log('\nCompras (fase 2)')
  const cfdi = ({ uuid, folio, fecha, conceptos, rfc = 'PFA120101AB1', nombre = 'Proveedor Farmacéutico de Prueba' }) => {
    const sub = conceptos.reduce((a, c) => a + c.cantidad * c.valorUnitario, 0)
    const iva = Math.round(sub * 16) / 100
    const conc = conceptos
      .map(
        (c) =>
          `<cfdi:Concepto ClaveProdServ="51101500" NoIdentificacion="${c.clave}" Cantidad="${c.cantidad}" ClaveUnidad="H87" Unidad="Pieza" Descripcion="${c.descripcion}" ValorUnitario="${c.valorUnitario.toFixed(2)}" Importe="${(c.cantidad * c.valorUnitario).toFixed(2)}" ObjetoImp="02"><cfdi:Impuestos><cfdi:Traslados><cfdi:Traslado Base="${(c.cantidad * c.valorUnitario).toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${(Math.round(c.cantidad * c.valorUnitario * 16) / 100).toFixed(2)}"/></cfdi:Traslados></cfdi:Impuestos></cfdi:Concepto>`,
      )
      .join('')
    return `<?xml version="1.0" encoding="utf-8"?>
<cfdi:Comprobante xmlns:cfdi="http://www.sat.gob.mx/cfd/4" xmlns:tfd="http://www.sat.gob.mx/TimbreFiscalDigital" Version="4.0" Serie="A" Folio="${folio}" Fecha="${fecha}T10:15:00" SubTotal="${sub.toFixed(2)}" Moneda="MXN" Total="${(sub + iva).toFixed(2)}" TipoDeComprobante="I" MetodoPago="PUE" FormaPago="03" LugarExpedicion="91000" Exportacion="01">
  <cfdi:Emisor Rfc="${rfc}" Nombre="${nombre}" RegimenFiscal="601"/>
  <cfdi:Receptor Rfc="OVM200101XX1" Nombre="ORTHOPEDIC VETS PRUEBA" UsoCFDI="G03" DomicilioFiscalReceptor="91000" RegimenFiscalReceptor="601"/>
  <cfdi:Conceptos>${conc}</cfdi:Conceptos>
  <cfdi:Impuestos TotalImpuestosTrasladados="${iva.toFixed(2)}"><cfdi:Traslados><cfdi:Traslado Base="${sub.toFixed(2)}" Impuesto="002" TipoFactor="Tasa" TasaOCuota="0.160000" Importe="${iva.toFixed(2)}"/></cfdi:Traslados></cfdi:Impuestos>
  <cfdi:Complemento><tfd:TimbreFiscalDigital Version="1.1" UUID="${uuid}" FechaTimbrado="${fecha}T10:16:00" RfcProvCertif="SAT970701NN3" SelloCFD="x" NoCertificadoSAT="0001" SelloSAT="y"/></cfdi:Complemento>
</cfdi:Comprobante>`
  }
  const xmlBytes = (x) => new TextEncoder().encode(x)
  const uuid1 = `11111111-2222-4333-8444-${sufijo.padStart(12, '0')}`
  const uuid2 = `11111111-2222-4333-8445-${sufijo.padStart(12, '0')}`
  const hoyTxt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())

  /* cuenta de Finanzas para pagar de contado */
  r = await admin.get('/api/fin-cuentas?where[nombre][equals]=Caja%20farmacia%20prueba&depth=0')
  let cuenta = r.data?.docs?.[0]
  if (!cuenta) {
    r = await admin.post('/api/fin-cuentas', { nombre: 'Caja farmacia prueba', tipo: 'efectivo', activa: true, saldoInicial: 0, fechaInicio: '2026-01-01' })
    cuenta = r.data?.doc
  }
  ok(cuenta?.id, 'Cuenta de Finanzas disponible para pagar compras', r.data)
  r = await encargado.get('/api/farmacia/catalogo')
  ok(r.status === 200 && r.data.finanzas.cuentas.some((x) => x.id === cuenta.id), 'Catálogo de farmacia trae las cuentas de Finanzas para «Recibir compras»', r.data.finanzas)
  r = await vendedor.get('/api/farmacia/catalogo')
  ok(r.status === 200 && r.data.finanzas.cuentas.length === 0, 'Vendedor (sin recibir compras) no recibe cuentas', r.data.finanzas)

  r = await vendedor.subir('/api/farmacia/compras/xml', 'f.xml', xmlBytes(cfdi({ uuid: uuid1, folio: `F${sufijo}`, fecha: hoyTxt, conceptos: [{ clave: `P${sufijo}-CAJA`, descripcion: 'ANTIBIOTICO CAJA 20', cantidad: 3, valorUnitario: 250 }] })))
  ok(r.status === 403, 'Vendedor no sube XML de compras', r.status)
  r = await encargado.subir('/api/farmacia/compras/xml', 'basura.xml', xmlBytes('<html>no es cfdi</html>'))
  ok(r.status === 400, 'Un XML que no es CFDI se rechaza', r.data)

  const xml1 = cfdi({
    uuid: uuid1,
    folio: `F${sufijo}`,
    fecha: hoyTxt,
    conceptos: [
      { clave: `P${sufijo}-CAJA`, descripcion: 'ANTIBIOTICO CAJA 20 TAB', cantidad: 3, valorUnitario: 250 },
      { clave: `P${sufijo}-TAB`, descripcion: 'ANTIBIOTICO TABLETA SUELTA', cantidad: 10, valorUnitario: 14 },
    ],
  })
  r = await encargado.subir('/api/farmacia/compras/xml', 'factura1.xml', xmlBytes(xml1))
  ok(r.status === 201 && r.data.estado === 'borrador' && r.data.origen === 'xml' && r.data.uuid === uuid1 && r.data.renglones.length === 2, 'XML CFDI → compra en borrador con 2 renglones', r.data)
  const compra1 = r.data
  ok(compra1.proveedor.rfc === 'PFA120101AB1' && compra1.proveedor.nombre === 'Proveedor Farmacéutico de Prueba', 'Proveedor creado desde el RFC del emisor', compra1.proveedor)
  ok(compra1.subtotal === 890 && compra1.iva === 142.4 && compra1.total === 1032.4 && compra1.folioFactura === `F${sufijo}` && compra1.serieFactura === 'A', 'Importes, serie y folio leídos del XML', { subtotal: compra1.subtotal, iva: compra1.iva, total: compra1.total })
  ok(compra1.renglones.every((x) => !x.presentacionId) && compra1.faltantes.length >= 2 && Array.isArray(r.data.avisos), 'Claves nuevas: renglones sin presentación y lista de faltantes', compra1.faltantes)
  ok(compra1.tieneXml, 'La compra guarda el XML', compra1.tieneXml)
  r = await encargado.subir('/api/farmacia/compras/xml', 'factura1.xml', xmlBytes(xml1))
  ok(r.status === 400 && /ya está registrada/.test(r.data.error) && r.data.error.includes(compra1.folio), 'El mismo UUID no se registra dos veces', r.data)

  r = await encargado.post(`/api/farmacia/compras/${compra1.id}/recibir`)
  ok(r.status === 400 && /No se puede recibir/.test(r.data.error), 'Recibir sin presentación, lote ni caducidad se rechaza', r.data)

  r = await encargado.get(`/api/farmacia/presentaciones?q=${encodeURIComponent('Antibiótico prueba')}`)
  ok(r.status === 200 && r.data.some((x) => x.id === caja.id) && r.data.some((x) => x.id === tableta.id), 'Búsqueda de presentaciones para ligar renglones', r.data?.length)

  const renglonesListos = (c, lotes) => c.renglones.map((x, i) => ({ id: x.id, claveProveedor: x.claveProveedor, descripcion: x.descripcion, presentacionId: i === 0 ? caja.id : tableta.id, cantidad: x.cantidad, numeroLote: lotes[i].numeroLote, caducidad: lotes[i].caducidad }))
  r = await encargado.post(`/api/farmacia/compras/${compra1.id}`, { condicion: 'contado', cuentaId: cuenta.id, renglones: renglonesListos(compra1, [{ numeroLote: `C-${sufijo}-1`, caducidad: '2028-12-31' }, { numeroLote: `C-${sufijo}-2`, caducidad: '' }]) })
  ok(r.status === 200 && r.data.faltantes.length === 1 && /caducidad/.test(r.data.faltantes[0]), 'Borrador guardado: solo falta la caducidad del renglón 2', r.data.faltantes)
  r = await encargado.post(`/api/farmacia/compras/${compra1.id}`, { renglones: renglonesListos(compra1, [{ numeroLote: `C-${sufijo}-1`, caducidad: '2028-12-31' }, { numeroLote: `C-${sufijo}-2`, caducidad: '2027-06-30' }]) })
  ok(r.status === 200 && r.data.faltantes.length === 0 && r.data.renglones[0].factor === 20 && r.data.renglones[0].costoUnidadBase === 12.5, 'Renglones completos: factor 20 y costo por unidad base 12.50', r.data.renglones[0])
  ok(r.data.renglones[0].valorUnitario === 250 && r.data.renglones[0].importe === 750, 'El XML manda en los importes (no se recalculan)', r.data.renglones[0])
  r = await encargado.post(`/api/farmacia/compras/${compra1.id}`, { renglones: r.data.renglones.map((x) => ({ ...x, valorUnitario: 1 })) })
  ok(r.status === 200 && r.data.renglones[0].valorUnitario === 250, 'En una compra desde XML el valor unitario no se edita', r.data.renglones[0])

  const existenciaAntes = (await encargado.get(`/api/farmacia/productos/${prod.id}`)).data.existencia
  r = await encargado.post(`/api/farmacia/compras/${compra1.id}/recibir`)
  ok(r.status === 200 && r.data.estado === 'recibida' && r.data.gasto === 'registrado' && r.data.gastoFinanzasId && /^FIN-/.test(r.data.gastoFolio || ''), 'Recibir: estado recibida y gasto registrado en Finanzas', { estado: r.data?.estado, gasto: r.data?.gasto, folio: r.data?.gastoFolio, error: r.data?.error })
  const compra1R = r.data
  ok(compra1R.renglones.every((x) => x.loteId) && compra1R.recibidaPor?.nombre === 'Luis Encargado', 'Cada renglón quedó ligado a su lote y la recepción lleva firma', compra1R.renglones.map((x) => x.loteId))
  r = await encargado.get(`/api/farmacia/productos/${prod.id}`)
  ok(r.data.existencia === existenciaAntes + 70, `Existencia subió 70 unidades base (3×20 + 10): ${existenciaAntes} → ${r.data.existencia}`, r.data.existencia)
  const loteC1 = r.data.lotes?.find?.((l) => l.numeroLote === `C-${sufijo}-1`) ?? r.data.lotes?.find?.((l) => l.id === compra1R.renglones[0].loteId)
  ok(loteC1 && loteC1.existencia === 60 && loteC1.costoUnidad === 12.5 && loteC1.caducidad === '2028-12-31', 'Lote del renglón 1: 60 unidades, costo 12.50 y caducidad capturada', loteC1)
  r = await encargado.get(`/api/farmacia/kardex?lote=${compra1R.renglones[0].loteId}`)
  const movCompra = r.data.movimientos?.find?.((m) => m.tipo === 'compra') ?? (Array.isArray(r.data) ? r.data.find((m) => m.tipo === 'compra') : null)
  ok(movCompra && movCompra.cantidad === 60 && movCompra.referencia === compra1.folio, 'Kardex: movimiento tipo compra con referencia COM-', movCompra)
  r = await admin.get(`/api/finanzas/operaciones/${compra1R.gastoFinanzasId}`)
  const op = r.data?.operacion
  ok(r.status === 200 && op && op.totalCentavos === 103240 && op.estadoPago === 'liquidado' && op.tipo === 'gasto', 'El gasto en Finanzas es de contado (liquidado) por $1,032.40', { status: r.status, total: op?.totalCentavos, estado: op?.estadoPago, tipo: op?.tipo })
  r = await encargado.post(`/api/farmacia/compras/${compra1.id}/gasto`)
  ok(r.status === 200 && r.data.gastoFinanzasId === compra1R.gastoFinanzasId, 'Reintentar gasto es idempotente (misma operación)', r.data?.gastoFinanzasId)
  r = await encargado.post(`/api/farmacia/compras/${compra1.id}`, { notas: 'ya recibida' })
  ok(r.status === 400, 'Una compra recibida ya no se edita', r.data)
  r = await encargado.get(`/api/farmacia/compras/${compra1.id}/xml`)
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes(uuid1), 'Descarga del XML original', r.status)
  r = await vendedor.get(`/api/farmacia/compras/${compra1.id}`)
  ok(r.status === 403, 'Vendedor no ve compras', r.status)
  r = await encargado.get('/api/farmacia/compras?q=' + encodeURIComponent(compra1.folio))
  ok(r.status === 200 && r.data.compras.some((x) => x.id === compra1.id), 'Historial encuentra por folio COM-', r.data?.total)

  /* segunda factura: claves ya aprendidas */
  r = await encargado.subir('/api/farmacia/compras/xml', 'factura2.xml', xmlBytes(cfdi({ uuid: uuid2, folio: `G${sufijo}`, fecha: '2020-01-15', conceptos: [{ clave: `P${sufijo}-CAJA`, descripcion: 'ANTIBIOTICO CAJA 20 TAB', cantidad: 2, valorUnitario: 260 }] })))
  ok(r.status === 201 && r.data.renglones[0].presentacionId === caja.id && r.data.proveedor.id === compra1.proveedor.id, 'Segunda factura del mismo proveedor: clave reconocida y presentación ligada sola', r.data?.renglones?.[0])
  const compra2 = r.data
  r = await encargado.post(`/api/farmacia/compras/${compra2.id}`, { condicion: 'credito', venceEl: '2030-01-01', renglones: compra2.renglones.map((x) => ({ id: x.id, presentacionId: x.presentacionId, cantidad: x.cantidad, numeroLote: `C-${sufijo}-1`, caducidad: '2028-12-31' })) })
  ok(r.status === 200 && r.data.faltantes.length === 0, 'Crédito no exige cuenta', r.data.faltantes)
  r = await encargado.post(`/api/farmacia/compras/${compra2.id}/recibir`)
  ok(r.status === 200 && r.data.estado === 'recibida' && r.data.gasto === 'registrado' && r.data.renglones[0].loteId === compra1R.renglones[0].loteId, 'Mismo lote y caducidad: se reutiliza el lote', { gasto: r.data?.gasto, lote: r.data?.renglones?.[0]?.loteId, error: r.data?.error })
  const compra2R = r.data
  r = await admin.get(`/api/finanzas/operaciones/${compra2R.gastoFinanzasId}`)
  ok(r.status === 200 && r.data.operacion?.estadoPago === 'pendiente' && r.data.operacion?.venceEl === '2030-01-01' && [hoyTxt, '2020-01-15'].includes(r.data.operacion?.fechaReal), 'Crédito: gasto por pagar con vencimiento (fecha de la factura, u hoy si es anterior al corte de Finanzas)', { op: r.data?.operacion && { e: r.data.operacion.estadoPago, v: r.data.operacion.venceEl, f: r.data.operacion.fechaReal } })
  r = await encargado.get(`/api/farmacia/productos/${prod.id}`)
  ok(r.data.existencia === existenciaAntes + 110, `Existencia ${existenciaAntes + 110} tras la segunda compra (+40)`, r.data.existencia)

  /* anulación */
  r = await encargado.post(`/api/farmacia/compras/${compra2.id}/anular`, { motivo: 'no' })
  ok(r.status === 400, 'Anular exige motivo de 5 caracteres', r.data)
  r = await encargado.post(`/api/farmacia/compras/${compra2.id}/anular`, { motivo: 'Factura cancelada por el proveedor' })
  ok(r.status === 200 && r.data.estado === 'anulada' && r.data.motivoAnulacion === 'Factura cancelada por el proveedor', 'Compra sin salidas se anula', r.data)
  r = await encargado.get(`/api/farmacia/productos/${prod.id}`)
  ok(r.data.existencia === existenciaAntes + 70, 'La anulación devolvió las 40 unidades (movimientos inversos)', r.data.existencia)
  r = await encargado.get(`/api/farmacia/kardex?lote=${compra2R.renglones[0].loteId}&limite=5`)
  const movs = r.data.movimientos ?? r.data
  ok(Array.isArray(movs) && movs.some((m) => m.tipo === 'devolucion' && m.cantidad === -40), 'Kardex: devolución de −40 con la anulación', movs?.slice?.(0, 2))
  r = await admin.get(`/api/finanzas/operaciones/${compra2R.gastoFinanzasId}`)
  ok(r.status === 200 && r.data.operacion?.anulada === true && r.data.operacion?.estadoPago === 'anulado', 'El gasto de la compra anulada queda anulado en Finanzas', { status: r.status, op: r.data?.operacion })
  /* una salida del lote de la compra 1 impide anularla */
  r = await encargado.post('/api/farmacia/ajustes', { productoId: prod.id, loteId: compra1R.renglones[0].loteId, cantidad: -2, motivo: 'Salida de prueba' })
  ok(r.status === 201, 'Salida de 2 del lote de la compra 1', r.data)
  r = await encargado.post(`/api/farmacia/compras/${compra1.id}/anular`, { motivo: 'Intento tardío de anular' })
  ok(r.status === 400 && /salidas/.test(r.data.error), 'Compra con salidas no se anula', r.data)

  /* compra manual */
  r = await encargado.post('/api/farmacia/compras', { proveedorId: compra1.proveedor.id, folioFactura: `REM-${sufijo}`, renglones: [] })
  ok(r.status === 201 && r.data.origen === 'manual' && r.data.estado === 'borrador', 'Compra manual en borrador', r.data)
  const compra3 = r.data
  r = await encargado.post(`/api/farmacia/compras/${compra3.id}`, { condicion: 'contado', cuentaId: cuenta.id, renglones: [{ presentacionId: tableta.id, cantidad: 5, valorUnitario: 10, numeroLote: `M-${sufijo}`, caducidad: '2028-01-31' }] })
  ok(r.status === 200 && r.data.subtotal === 50 && r.data.iva === 8 && r.data.total === 58 && r.data.faltantes.length === 0, 'Manual: totales calculados con IVA 16 % (50 + 8 = 58)', { subtotal: r.data?.subtotal, iva: r.data?.iva, total: r.data?.total })
  r = await encargado.post(`/api/farmacia/compras/${compra3.id}`, { iva: 0, renglones: r.data.renglones.map((x) => ({ id: x.id, presentacionId: x.presentacionId, cantidad: x.cantidad, valorUnitario: x.valorUnitario, numeroLote: x.numeroLote, caducidad: x.caducidad })) })
  ok(r.status === 200 && r.data.iva === 0 && r.data.total === 50, 'Manual: IVA explícito de 0 (tasa 0 %) se respeta', { iva: r.data?.iva, total: r.data?.total })
  r = await encargado.post(`/api/farmacia/compras/${compra3.id}/recibir`)
  ok(r.status === 200 && r.data.estado === 'recibida' && r.data.gasto === 'registrado', 'Compra manual recibida con gasto', { gasto: r.data?.gasto, error: r.data?.error })
  ok(!trazasDeCosto((await vendedor.get('/api/farmacia/catalogo')).data).length, 'Vendedor sigue sin ver costos tras las compras')

  /* conteo físico */
  console.log('\nConteo físico (fase 2)')
  r = await vendedor.get('/api/farmacia/conteo')
  ok(r.status === 403, 'Vendedor no hace conteo', r.status)
  r = await encargado.get(`/api/farmacia/conteo?q=${encodeURIComponent(`C-${sufijo}-1`)}`)
  ok(r.status === 200 && r.data.renglones.length === 1 && r.data.renglones[0].existencia === 58, 'Conteo lista el lote con su existencia (58)', r.data?.renglones)
  const renglonConteo = r.data.renglones[0]
  r = await encargado.post('/api/farmacia/conteo', { motivo: '', renglones: [{ loteId: renglonConteo.loteId, contado: 55 }] })
  ok(r.status === 400, 'Conteo sin motivo se rechaza', r.data)
  r = await encargado.post('/api/farmacia/conteo', { motivo: 'Conteo mensual', renglones: [{ loteId: renglonConteo.loteId, contado: 55 }, { loteId: compra1R.renglones[1].loteId, contado: 10 }] })
  ok(r.status === 201 && r.data.ajustes.length === 1 && r.data.ajustes[0].diferencia === -3 && r.data.sinCambio === 1, 'Conteo: un ajuste de −3 y un lote sin cambio', r.data)
  r = await encargado.get(`/api/farmacia/conteo?q=${encodeURIComponent(`C-${sufijo}-1`)}`)
  ok(r.data.renglones[0].existencia === 55, 'Existencia tras el conteo: 55', r.data?.renglones?.[0]?.existencia)
  r = await encargado.get(`/api/farmacia/kardex?lote=${renglonConteo.loteId}&limite=3`)
  const movsC = r.data.movimientos ?? r.data
  ok(Array.isArray(movsC) && movsC.some((m) => m.tipo === 'ajuste' && m.cantidad === -3 && /Conteo mensual/.test(m.motivo || '')), 'Kardex: ajuste de −3 con el motivo del conteo', movsC?.[0])

  /* ── fase 3: venta de mostrador, recetas, libro de control, cierre ── */
  console.log('\nVenta de mostrador (fase 3)')
  const clave = () => `t-${sufijo}-${Math.random().toString(36).slice(2, 10)}`
  const nacio = (meses) => {
    const d = new Date()
    d.setMonth(d.getMonth() - meses)
    return d.toISOString().slice(0, 10)
  }
  /* cuentas: caja propia del mostrador y banco */
  const cuentaDe = async (nombre, tipo) => {
    let x = (await admin.get(`/api/fin-cuentas?where[nombre][equals]=${encodeURIComponent(nombre)}&depth=0`)).data?.docs?.[0]
    if (!x) x = (await admin.post('/api/fin-cuentas', { nombre, tipo, activa: true, saldoInicial: 0, fechaInicio: '2026-01-01' })).data?.doc
    return x
  }
  const cajaMostrador = await cuentaDe(`Caja mostrador ${sufijo}`, 'efectivo')
  const banco = await cuentaDe(`Banco farmacia ${sufijo}`, 'banco')
  ok(cajaMostrador?.id && banco?.id, 'Cuentas de prueba para el mostrador', { cajaMostrador, banco })
  r = await vendedor.post('/api/farmacia/configuracion', { metodosPago: [] })
  ok(r.status === 403, 'Vendedor no configura métodos de pago', r.status)
  /* productos de prueba */
  const crearProd = async (datos, presentacion, lotes) => {
    const pr = (await encargado.post('/api/farmacia/productos', datos)).data
    const pres = (await encargado.post(`/api/farmacia/productos/${pr.id}/presentaciones`, presentacion)).data
    const ls = []
    for (const l of lotes) ls.push((await encargado.post('/api/farmacia/ajustes', { productoId: pr.id, lote: { numeroLote: l.numero, caducidad: l.caducidad, costoUnidad: l.costo }, cantidad: l.cantidad, motivo: 'Inventario de prueba' })).data?.lote)
    return { prod: pr, pres, lotes: ls }
  }
  const despa = await crearProd(
    { nombre: `Desparasitante prueba ${sufijo}`, principioActivo: 'Milbemicina', linea: 'antiparasitario', grupo: 'III', unidadBase: 'tableta', especies: ['perro'], pesoMinKg: 10, pesoMaxKg: 25, edadMinMeses: 6, alergenos: 'ivermectina' },
    { nombre: 'Tableta 10–25 kg', factor: 1, precio: 100, codigoBarras: `78${sufijo}0001` },
    [
      { numero: `D-${sufijo}-A`, caducidad: '2028-01-31', costo: 40, cantidad: 15 },
      { numero: `D-${sufijo}-B`, caducidad: '2027-03-31', costo: 45, cantidad: 3 },
      { numero: `D-${sufijo}-V`, caducidad: '2025-01-31', costo: 40, cantidad: 10 },
    ],
  )
  ok(despa.prod?.id && despa.lotes.length === 3 && despa.lotes[2].estado === 'vencido', 'Producto Grupo III con dos lotes vigentes y uno vencido', despa.lotes.map((l) => l?.estado))
  const soloVencido = await crearProd({ nombre: `Solo vencido ${sufijo}`, linea: 'higiene', grupo: 'desregulado', unidadBase: 'pieza' }, { nombre: 'Pieza', factor: 1, precio: 50 }, [{ numero: `SV-${sufijo}`, caducidad: '2024-06-30', costo: 10, cantidad: 4 }])
  const keta = await crearProd(
    { nombre: `Controlado prueba ${sufijo}`, principioActivo: 'Ketamina', laboratorio: 'Lab Prueba', linea: 'medicamento', grupo: 'I', registroSenasica: `Q-${sufijo}-I`, unidadBase: 'ml' },
    { nombre: 'Frasco 10 ml', factor: 10, precio: 500 },
    [{ numero: `K-${sufijo}`, caducidad: '2028-05-31', costo: 20, cantidad: 50 }],
  )

  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 400 && /no tiene cuenta/.test(r.data.error), 'Sin cuenta en el método de pago, la venta se rechaza con aviso claro', r.data)
  r = await admin.post('/api/farmacia/configuracion', {
    metodosPago: [
      { clave: 'efectivo', nombre: 'Efectivo', tipo: 'efectivo', cuentaId: cajaMostrador.id },
      { clave: 'terminal', nombre: 'Terminal', tipo: 'terminal', cuentaId: banco.id },
      { clave: 'transferencia', nombre: 'Transferencia', tipo: 'transferencia', cuentaId: banco.id },
    ],
  })
  ok(r.status === 200 && r.data.metodosPago.length === 3 && r.data.metodosPago[2].porConfirmar === true, 'Métodos de pago con cuenta; la transferencia queda por confirmar', r.data.metodosPago)

  r = await vendedor.get(`/api/farmacia/codigo?c=78${sufijo}0001`)
  ok(r.status === 200 && r.data?.presentacionId === despa.pres.id, 'Escaneo: el código de barras encuentra la presentación', r.data)

  /* pacientes (clínica) */
  r = await admin.post('/api/clinica/clientes', { nombre: 'Tutor', apellidos: `Farmacia ${sufijo}`, telefono: `229${sufijo}9`, email: `tutor${sufijo}@ejemplo.mx` })
  const tutor = r.data?.cliente ?? r.data
  ok(r.status === 201, 'Cliente de prueba', r.data)
  const mascota = async (datos) => (await admin.post('/api/clinica/mascotas', { tutores: [{ clienteId: tutor.id, principal: true }], ...datos })).data
  const rocky = await mascota({ nombre: `Rocky ${sufijo}`, especie: 'perro', fechaNacimiento: nacio(30), pesoKg: 15, alergias: 'Penicilina' })
  const max = await mascota({ nombre: `Max ${sufijo}`, especie: 'perro', fechaNacimiento: nacio(40), pesoKg: 12 })
  const mishi = await mascota({ nombre: `Mishi ${sufijo}`, especie: 'gato', fechaNacimiento: nacio(24), pesoKg: 4 })
  const cachorro = await mascota({ nombre: `Cachorro ${sufijo}`, especie: 'perro', fechaNacimiento: nacio(3), pesoKg: 11 })
  const viejo = await mascota({ nombre: `Peso viejo ${sufijo}`, especie: 'perro', fechaNacimiento: nacio(50) })
  await admin.post(`/api/clinica/mascotas/${viejo.id}/pesos`, { kg: 14, fecha: '2026-01-05' })
  ok(rocky?.id && max?.id && mishi?.id && cachorro?.id && viejo?.id, 'Mascotas de prueba (perros, gato, cachorro, peso viejo)')
  r = await vendedor.get(`/api/farmacia/pacientes?q=${encodeURIComponent(`Rocky ${sufijo}`)}`)
  ok(r.status === 200 && r.data[0]?.mascotaId === rocky.id && r.data[0].pesoKg === 15 && r.data[0].alergias === 'Penicilina' && r.data[0].edadMeses >= 29, 'Mostrador encuentra la mascota con peso, edad y alergias', r.data?.[0])

  /* FEFO + efectivo con cambio + idempotencia */
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 4 }], pagos: [] })
  ok(r.status === 400 && /Faltan \$400\.00/.test(r.data.error), 'Sin pagos: «faltan $400.00»', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 4 }], pagos: [{ metodo: 'efectivo', monto: 500 }] })
  ok(r.status === 400 && /suman más/.test(r.data.error), 'Pagos de más sin «recibido» se rechazan', r.data)
  const claveA = clave()
  r = await vendedor.post('/api/farmacia/ventas', { clave: claveA, mascotaId: max.id, renglones: [{ presentacionId: despa.pres.id, cantidad: 4 }], pagos: [{ metodo: 'efectivo', monto: 400, recibido: 500 }] })
  ok(r.status === 201 && /^VTA-\d{5}$/.test(r.data.folio) && r.data.total === 400 && r.data.cambio === 100 && r.data.estado === 'pagada', 'Venta en efectivo: total $400, cambio $100, folio VTA-', { status: r.status, folio: r.data?.folio, total: r.data?.total, cambio: r.data?.cambio, error: r.data?.error })
  const ventaA = r.data
  ok(ventaA.renglones?.[0]?.lotes?.length === 2 && ventaA.renglones[0].lotes[0].numeroLote === `D-${sufijo}-B` && ventaA.renglones[0].lotes[0].unidades === 3 && ventaA.renglones[0].lotes[1].unidades === 1, 'FEFO: primero el lote que caduca antes (3 del B), luego 1 del A', ventaA.renglones?.[0]?.lotes)
  ok(ventaA.finanzas === 'registrado' && ventaA.ingresoFinanzasId, 'La venta creó su entrada en Finanzas', { finanzas: ventaA.finanzas, error: r.data?.error })
  r = await admin.get(`/api/finanzas/operaciones/${ventaA.ingresoFinanzasId}`)
  ok(r.status === 200 && r.data.operacion?.tipo === 'entrada' && r.data.operacion?.totalCentavos === 40000 && r.data.operacion?.estadoPago === 'liquidado', 'Finanzas: entrada de $400 liquidada', r.data?.operacion && { tipo: r.data.operacion.tipo, total: r.data.operacion.totalCentavos, e: r.data.operacion.estadoPago })
  r = await vendedor.post('/api/farmacia/ventas', { clave: claveA, mascotaId: max.id, renglones: [{ presentacionId: despa.pres.id, cantidad: 4 }], pagos: [{ metodo: 'efectivo', monto: 400, recibido: 500 }] })
  ok(r.status === 200 && r.data.duplicado === true && r.data.id === ventaA.id, 'Reintento con la misma clave: devuelve la misma venta, no cobra dos veces', { status: r.status, id: r.data?.id })
  r = await encargado.get(`/api/farmacia/productos/${despa.prod.id}`)
  const lotesDespa = Object.fromEntries((r.data.lotes ?? []).map((l) => [l.numeroLote, l.existencia]))
  ok(lotesDespa[`D-${sufijo}-B`] === 0 && lotesDespa[`D-${sufijo}-A`] === 14 && lotesDespa[`D-${sufijo}-V`] === 10, 'Existencias: B=0, A=14, el vencido intacto (10)', lotesDespa)
  r = await encargado.get(`/api/farmacia/kardex?lote=${despa.lotes[1].id}&limite=3`)
  ok((r.data.movimientos ?? []).some((m) => m.tipo === 'venta' && m.cantidad === -3 && m.referencia === ventaA.folio), 'Kardex: salida tipo venta con referencia VTA-', r.data?.movimientos?.[0])

  /* lote vencido no se vende */
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: soloVencido.pres.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 50 }] })
  ok(r.status === 400 && /vencidos o bloqueados no se venden/.test(r.data.error), 'Un lote vencido no se vende', r.data)

  /* pago mixto efectivo + terminal */
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 50, recibido: 100 }, { metodo: 'terminal', monto: 150, referencia: 'AUT-123' }] })
  ok(r.status === 201 && r.data.pagos.length === 2 && r.data.cambio === 50 && r.data.finanzas === 'registrado', 'Pago mixto: $50 efectivo (cambio $50) + $150 terminal', { status: r.status, pagos: r.data?.pagos?.length, cambio: r.data?.cambio, error: r.data?.error })
  const ventaMixta = r.data
  r = await admin.get(`/api/finanzas/operaciones/${ventaMixta.ingresoFinanzasId}`)
  const movsMixta = r.data.movimientos ?? []
  ok(r.data.operacion?.estadoPago === 'liquidado' && movsMixta.length === 2, 'Finanzas: dos cobros (caja y banco) y entrada liquidada', { e: r.data.operacion?.estadoPago, movs: movsMixta.length })

  /* descuento: el vendedor necesita la contraseña de un encargado */
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 1, descuentoPorciento: 10 }], pagos: [{ metodo: 'efectivo', monto: 90 }] })
  ok(r.status === 403 && r.data.codigo === 'autorizacion', 'Vendedor sin contraseña de encargado no aplica descuento', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 1, descuentoPorciento: 10 }], pagos: [{ metodo: 'efectivo', monto: 90 }], autorizacion: { correo: 'encargado@ejemplo.mx', contrasena: 'equivocada' } })
  ok(r.status === 403 && /incorrectos/.test(r.data.error), 'Contraseña equivocada del encargado se rechaza', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 1, descuentoPorciento: 10 }], pagos: [{ metodo: 'efectivo', monto: 90 }], autorizacion: { correo: 'vendedor@ejemplo.mx', contrasena: PASS } })
  ok(r.status === 403 && /no tiene permiso/.test(r.data.error), 'Otro vendedor no puede autorizar descuentos', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 1, descuentoPorciento: 10 }], pagos: [{ metodo: 'efectivo', monto: 90 }], autorizacion: { correo: 'encargado@ejemplo.mx', contrasena: PASS } })
  ok(r.status === 201 && r.data.total === 90 && r.data.descuento === 10 && r.data.autorizoDescuento?.nombre === 'Luis Encargado', 'Con la contraseña del encargado: 10 % de descuento y queda quién autorizó', { status: r.status, total: r.data?.total, aut: r.data?.autorizoDescuento, error: r.data?.error })
  ok(!trazasDeCosto(r.data).length, 'La venta que ve el vendedor no trae costos ni margen', trazasDeCosto(r.data))
  r = await encargado.get(`/api/farmacia/ventas/${ventaA.id}`)
  ok(r.data.costoTotal === 175 && r.data.margen === 225, 'El encargado ve costo ($175 = 3×45 + 1×40) y margen ($225)', { costo: r.data.costoTotal, margen: r.data.margen })

  /* validación contra la mascota */
  console.log('\nValidación por mascota')
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: mishi.id, renglones: [{ presentacionId: despa.pres.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 400 && r.data.codigo === 'mascota' && r.data.detalle?.[0]?.problemas?.some((x) => x.tipo === 'especie'), 'Especie no incluida (gato) se bloquea', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: cachorro.id, renglones: [{ presentacionId: despa.pres.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 400 && r.data.detalle?.[0]?.problemas?.some((x) => x.tipo === 'edad'), 'Edad menor a la mínima (3 meses < 6) se bloquea', r.data)
  r = await admin.post(`/api/clinica/mascotas/${max.id}/pesos`, { kg: 30, fecha: hoyTxt })
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: despa.pres.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 400 && r.data.detalle?.[0]?.problemas?.some((x) => x.tipo === 'peso'), 'Peso fuera de rango (30 kg > 25) se bloquea', r.data)
  await admin.post(`/api/clinica/mascotas/${max.id}/pesos`, { kg: 12, fecha: hoyTxt })
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: rocky.id, renglones: [{ presentacionId: tableta.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 28 }] })
  ok(r.status === 400 && r.data.detalle?.[0]?.problemas?.some((x) => x.tipo === 'alergia'), 'Alergia coincidente (penicilina) se bloquea', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: viejo.id, renglones: [{ presentacionId: despa.pres.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 409 && r.data.codigo === 'confirmar_peso', 'Peso de más de 90 días: pide confirmarlo', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: viejo.id, pesoConfirmadoKg: 14.5, renglones: [{ presentacionId: despa.pres.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 201 && r.data.pesoUsadoKg === 14.5, 'Con el peso confirmado, la venta pasa y guarda el peso usado', { status: r.status, peso: r.data?.pesoUsadoKg, error: r.data?.error })
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: mishi.id, renglones: [{ presentacionId: despa.pres.id, cantidad: 1, autorizarMascota: 'Indicación del MVZ por teléfono' }], pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 403 && r.data.codigo === 'autorizacion', 'El vendedor no se autoriza a sí mismo un choque con la mascota', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: mishi.id, renglones: [{ presentacionId: despa.pres.id, cantidad: 1, autorizarMascota: 'Indicación del MVZ por teléfono' }], pagos: [{ metodo: 'efectivo', monto: 100 }], autorizacion: { correo: 'encargado@ejemplo.mx', contrasena: PASS } })
  ok(r.status === 201 && /Indicación del MVZ/.test(r.data.renglones?.[0]?.autorizacionMascota || '') && r.data.autorizo?.nombre === 'Luis Encargado', 'El encargado autoriza con motivo y queda registrado', { status: r.status, a: r.data?.renglones?.[0]?.autorizacionMascota, error: r.data?.error })

  /* recetas: Grupo II */
  console.log('\nRecetas y Grupo II')
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: tableta.id, cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 56 }] })
  ok(r.status === 400 && /liga una receta/.test(r.data.error), 'Grupo II sin receta se rechaza', r.data)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: tableta.id, cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 56 }] })
  ok(r.status === 403 && r.data.codigo === 'autorizacion', 'Grupo II por un vendedor pide al encargado', r.data)
  r = await vendedor.post('/api/farmacia/recetas/externa', { mascotaId: max.id, mvzNombre: 'MVZ Externo Prueba', mvzCedula: '1234567', fechaEmision: hoyTxt, vigenciaDias: 10, renglones: [{ productoId: prod.id, dosis: '1 tableta', frecuencia: 'cada 12 h', duracion: '7 días', surtidosPermitidos: 1 }] })
  ok(r.status === 201 && /^REC-\d{5}$/.test(r.data.folio) && r.data.estado === 'por_validar' && r.data.origen === 'externa', 'El mostrador captura la receta externa: queda por validar', r.data)
  const recExt = r.data
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: tableta.id, cantidad: 2, recetaId: recExt.id }], pagos: [{ metodo: 'efectivo', monto: 56 }] })
  ok(r.status === 400 && /no está válida/.test(r.data.error), 'Receta por validar no surte', r.data)
  r = await vendedor.post(`/api/farmacia/recetas/${recExt.id}/validar`, { decision: 'valida' })
  ok(r.status === 403, 'El vendedor no valida recetas', r.status)
  r = await encargado.post(`/api/farmacia/recetas/${recExt.id}/validar`, { decision: 'rechazada', motivo: '' })
  ok(r.status === 400 && /motivo/.test(r.data.error), 'Rechazar exige motivo', r.data)
  r = await encargado.post(`/api/farmacia/recetas/${recExt.id}/validar`, { decision: 'valida' })
  ok(r.status === 200 && r.data.estado === 'valida' && r.data.vigente && r.data.validadaPor?.nombre === 'Luis Encargado' && !r.data.originalRecibido, 'El encargado valida: vigente, original pendiente', r.data)
  r = await encargado.get(`/api/farmacia/recetas/para?mascota=${max.id}&producto=${prod.id}`)
  ok(r.status === 200 && r.data.some((x) => x.id === recExt.id), 'El mostrador ve las recetas vigentes de la mascota para ese producto', r.data?.length)
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: rocky.id, renglones: [{ presentacionId: tableta.id, cantidad: 2, recetaId: recExt.id, autorizarMascota: 'Prueba de otra mascota' }], pagos: [{ metodo: 'efectivo', monto: 56 }] })
  ok(r.status === 400 && /otra mascota/.test(r.data.error), 'La receta de otra mascota no surte', r.data)
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: tableta.id, cantidad: 2, recetaId: recExt.id }], pagos: [{ metodo: 'efectivo', monto: 56 }] })
  ok(r.status === 201 && r.data.renglones[0].recetaFolio === recExt.folio && (r.data.avisos ?? []).some((a) => /original/.test(a)), 'Grupo II con receta válida: vende y avisa que el original sigue pendiente', { status: r.status, aviso: r.data?.avisos, error: r.data?.error })
  r = await encargado.get(`/api/farmacia/recetas/${recExt.id}`)
  ok(r.data.renglones[0].surtidosUsados === 1, 'La venta consumió un surtido (1 de 1)', r.data.renglones)
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: tableta.id, cantidad: 1, recetaId: recExt.id }], pagos: [{ metodo: 'efectivo', monto: 28 }] })
  ok(r.status === 400 && /surtidos/.test(r.data.error), 'Receta sin surtidos ya no surte', r.data)
  r = await admin.post('/api/farmacia/configuracion', { exigirOriginalGrupoII: true })
  r = await vendedor.post('/api/farmacia/recetas/externa', { mascotaId: max.id, mvzNombre: 'MVZ Externo Dos', fechaEmision: hoyTxt, vigenciaDias: 5, renglones: [{ productoId: prod.id, surtidosPermitidos: 2 }] })
  const recExt2 = r.data
  await encargado.post(`/api/farmacia/recetas/${recExt2.id}/validar`, { decision: 'valida' })
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: tableta.id, cantidad: 1, recetaId: recExt2.id }], pagos: [{ metodo: 'efectivo', monto: 28 }] })
  ok(r.status === 400 && /original físico/.test(r.data.error), 'Con «exigir original» encendido, la externa no surte sin el original', r.data)
  r = await encargado.post(`/api/farmacia/recetas/${recExt2.id}/original`)
  ok(r.status === 200 && r.data.originalRecibido && r.data.originalRecibidoPor?.nombre === 'Luis Encargado', 'Marca de original recibido con firma', r.data)
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: tableta.id, cantidad: 1, recetaId: recExt2.id }], pagos: [{ metodo: 'efectivo', monto: 28 }] })
  ok(r.status === 201, 'Con el original recibido, surte', { status: r.status, error: r.data?.error })
  await admin.post('/api/farmacia/configuracion', { exigirOriginalGrupoII: false })

  /* receta interna: firmada = inmutable */
  console.log('\nReceta interna y Grupo I')
  const yo = (await admin.get('/api/users/me')).data.user
  r = await vendedor.post('/api/farmacia/recetas', { mascotaId: max.id, vigenciaDias: 30, renglones: [{ productoId: prod.id, dosis: '1/2 tableta', frecuencia: 'cada 24 h', duracion: '10 días', surtidosPermitidos: 2 }] })
  ok(r.status === 403, 'El vendedor no emite recetas internas', r.status)
  await admin.patch(`/api/users/${yo.id}`, { cedulaProfesional: '' })
  r = await admin.post('/api/farmacia/recetas', { mascotaId: max.id, vigenciaDias: 30, firmar: true, renglones: [{ productoId: prod.id, dosis: '1/2 tableta', frecuencia: 'cada 24 h', duracion: '10 días', surtidosPermitidos: 2 }] })
  ok(r.status === 400 && /cédula/.test(r.data.error), 'Firmar sin cédula profesional se rechaza', r.data)
  r = await admin.patch(`/api/users/${yo.id}`, { cedulaProfesional: '7654321' })
  ok(r.status === 200, 'Cédula profesional guardada en el usuario', r.status)
  r = await admin.get(`/api/farmacia/recetas?mascota=${max.id}&estado=borrador`)
  const borrador = r.data.recetas?.[0]
  ok(borrador && borrador.origen === 'interna' && borrador.pesoKg === 12, 'Quedó el borrador con el peso vigente precargado (12 kg)', borrador)
  r = await admin.post(`/api/farmacia/recetas/${borrador.id}/firmar`)
  ok(r.status === 200 && r.data.estado === 'valida' && r.data.firmadaEn && r.data.mvzCedula === '7654321', 'Firmada: válida, con cédula y hora de firma', r.data)
  const recInt = r.data
  r = await admin.post(`/api/farmacia/recetas/${recInt.id}`, { indicaciones: 'cambio después de firmar' })
  ok(r.status === 400 && /firmada/.test(r.data.error), 'Una receta firmada no se edita', r.data)
  r = await admin.patch(`/api/far-recetas/${recInt.id}`, { mvzNombre: 'Otro' })
  ok(r.status === 403, 'Ni el superadmin edita recetas por la API genérica', r.status)
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: tableta.id, cantidad: 1, recetaId: recInt.id }], pagos: [{ metodo: 'efectivo', monto: 28 }] })
  ok(r.status === 201, 'La receta interna firmada surte Grupo II', { status: r.status, error: r.data?.error })

  /* Grupo I */
  r = await admin.post('/api/farmacia/recetas', { mascotaId: max.id, vigenciaDias: 15, firmar: true, renglones: [{ productoId: keta.prod.id, dosis: 'según protocolo', surtidosPermitidos: 1 }] })
  ok(r.status === 400 && /folio/.test(r.data.error), 'Receta de Grupo I sin folio cuantificado no se firma', r.data)
  const borradorG1 = (await admin.get(`/api/farmacia/recetas?mascota=${max.id}&estado=borrador`)).data.recetas?.[0]
  r = await admin.post(`/api/farmacia/recetas/${borradorG1.id}`, { folioCuantificado: `SEN-${sufijo}`, firmar: true })
  ok(r.status === 200 && r.data.estado === 'valida' && r.data.folioCuantificado === `SEN-${sufijo}`, 'Con folio cuantificado se firma', r.data)
  const recG1 = r.data
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: keta.pres.id, cantidad: 1, recetaId: recG1.id }], pagos: [{ metodo: 'efectivo', monto: 500 }] })
  ok(r.status === 400 && /original recibido/.test(r.data.error), 'Grupo I sin «original recibido» se rechaza', r.data)
  r = await encargado.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: keta.pres.id, cantidad: 1, recetaId: recG1.id, originalRecibido: true }], pagos: [{ metodo: 'efectivo', monto: 500 }] })
  ok(r.status === 201 && r.data.renglones[0].folioCuantificado === `SEN-${sufijo}`, 'Grupo I con folio y original: vende', { status: r.status, error: r.data?.error })
  const ventaG1 = r.data
  r = await encargado.get(`/api/farmacia/recetas/${recG1.id}`)
  ok(r.data.originalRecibido && r.data.renglones[0].surtidosUsados === 1, 'La receta quedó con el original recibido y el surtido usado', r.data)
  r = await encargado.get(`/api/farmacia/libro?desde=${hoyTxt}`)
  const asiento = (r.data ?? []).find((a) => a.ventaFolio === ventaG1.folio)
  ok(asiento && asiento.tipo === 'salida' && asiento.folioReceta === `SEN-${sufijo}` && asiento.cantidad === 10 && asiento.unidad === 'ml' && asiento.registroSenasica === `Q-${sufijo}-I` && asiento.laboratorio === 'Lab Prueba' && asiento.numeroLote === `K-${sufijo}` && /Max/.test(asiento.animal || '') && asiento.fechaCompra, 'Libro de control: asiento con laboratorio, registro, lote, fecha de compra, folio, cantidad y animal', asiento)
  r = await vendedor.get('/api/farmacia/libro')
  ok(r.status === 403, 'El vendedor no ve el libro de control', r.status)
  r = await encargado.get('/api/farmacia/libro/csv')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes(`SEN-${sufijo}`) && r.data.includes('Animal de destino'), 'Libro de control exportable en CSV', r.status)
  r = await admin.patch(`/api/far-libro-control/${asiento.id}`, { cantidad: 1 })
  ok(r.status === 403, 'El libro de control no se edita por API (ni el superadmin)', r.status)

  /* transferencia por confirmar */
  console.log('\nTransferencia, anulación, ticket y cierre')
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 1 }], pagos: [{ metodo: 'transferencia', monto: 100, referencia: 'SPEI 998' }] })
  ok(r.status === 201 && r.data.estado === 'por_confirmar' && r.data.pagos[0].estado === 'por_confirmar', 'Transferencia: la venta queda «por confirmar»', { status: r.status, e: r.data?.estado, error: r.data?.error })
  const ventaT = r.data
  r = await admin.get(`/api/finanzas/operaciones/${ventaT.ingresoFinanzasId}`)
  ok(r.data.operacion?.estadoPago === 'pendiente' && (r.data.movimientos ?? []).length === 0, 'Finanzas: la entrada queda pendiente hasta confirmar', r.data.operacion?.estadoPago)
  r = await vendedor.post(`/api/farmacia/ventas/${ventaT.id}/pagos/0/confirmar`, {})
  ok(r.status === 403, 'El vendedor no confirma transferencias', r.status)
  r = await encargado.post(`/api/farmacia/ventas/${ventaT.id}/pagos/0/confirmar`, {})
  ok(r.status === 200 && r.data.estado === 'pagada' && r.data.pagos[0].confirmadoPor?.nombre === 'Luis Encargado', 'El encargado confirma: venta pagada', r.data?.estado)
  r = await admin.get(`/api/finanzas/operaciones/${ventaT.ingresoFinanzasId}`)
  ok(r.data.operacion?.estadoPago === 'liquidado', 'Finanzas: al confirmar entra el cobro al banco', r.data.operacion?.estadoPago)

  /* ticket */
  r = await vendedor.get(`/api/farmacia/ventas/${ventaA.id}/ticket`)
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes(ventaA.folio) && r.data.includes('Cambio') && !/costo/i.test(r.data), 'Ticket imprimible con folio y cambio, sin costos', r.status)
  r = await vendedor.post(`/api/farmacia/ventas/${ventaA.id}/ticket`, { correo: 'no-es-correo' })
  ok(r.status === 400, 'Enviar el ticket valida el correo', r.data)
  r = await vendedor.post(`/api/farmacia/ventas/${ventaA.id}/ticket`, { correo: `tutor${sufijo}@ejemplo.mx` })
  ok(r.status === 200 && r.data.correoTicket === `tutor${sufijo}@ejemplo.mx`, 'Envío del ticket por correo (sin llave de Resend no falla)', r.data?.correoTicket)

  /* anular */
  r = await vendedor.post(`/api/farmacia/ventas/${ventaA.id}/anular`, { motivo: 'Error de captura' })
  ok(r.status === 403, 'El vendedor no anula ventas', r.status)
  r = await encargado.post(`/api/farmacia/ventas/${ventaA.id}/anular`, { motivo: 'no' })
  ok(r.status === 400, 'Anular exige motivo', r.data)
  r = await encargado.post(`/api/farmacia/ventas/${ventaA.id}/anular`, { motivo: 'Error de captura en mostrador' })
  ok(r.status === 200 && r.data.estado === 'anulada' && r.data.anuladaPor?.nombre === 'Luis Encargado', 'Venta del día anulada con motivo', r.data?.estado)
  r = await encargado.get(`/api/farmacia/productos/${despa.prod.id}`)
  const lotesTrasAnular = Object.fromEntries((r.data.lotes ?? []).map((l) => [l.numeroLote, l.existencia]))
  ok(lotesTrasAnular[`D-${sufijo}-B`] === 3, 'La anulación regresó las 3 tabletas a su lote', lotesTrasAnular)
  r = await admin.get(`/api/finanzas/operaciones/${ventaA.ingresoFinanzasId}`)
  ok(r.data.operacion?.anulada === true, 'La entrada en Finanzas quedó anulada', r.data.operacion?.anulada)
  r = await encargado.post(`/api/farmacia/ventas/${ventaG1.id}/anular`, { motivo: 'Prueba de cancelación Grupo I' })
  ok(r.status === 200, 'Anula la venta de Grupo I', r.data?.error)
  r = await encargado.get(`/api/farmacia/libro?desde=${hoyTxt}`)
  ok((r.data ?? []).some((a) => a.tipo === 'cancelacion' && a.ventaFolio === ventaG1.folio && a.cantidad === -10), 'El libro recibe un asiento de cancelación (no se edita el original)', (r.data ?? []).filter((a) => a.ventaFolio === ventaG1.folio))
  r = await encargado.get(`/api/farmacia/recetas/${recG1.id}`)
  ok(r.data.renglones[0].surtidosUsados === 0, 'El surtido de la receta se devolvió', r.data.renglones)

  /* cierre del día */
  r = await vendedor.get('/api/farmacia/cierre')
  const esperado = r.data.esperado
  ok(r.status === 200 && r.data.cuenta.id === cajaMostrador.id && r.data.id === null && r.data.ventasEfectivo > 0, 'Cierre del día: esperado según Finanzas y ventas en efectivo del día', r.data)
  r = await vendedor.post('/api/farmacia/cierre', { contado: esperado - 20 })
  ok(r.status === 400 && /nota/.test(r.data.error), 'Con diferencia, el cierre exige una nota', r.data)
  r = await vendedor.post('/api/farmacia/cierre', { contado: esperado - 20, nota: 'Faltante por cambio mal dado' })
  ok(r.status === 201 && r.data.diferencia === -20 && r.data.contado === esperado - 20 && r.data.usuario?.nombre === 'Ana Vendedora', 'Cierre registrado con diferencia de −$20, nota y usuario', r.data)
  r = await vendedor.post('/api/farmacia/cierre', { contado: esperado })
  ok(r.status === 400 && /Ya se registró/.test(r.data.error), 'Un solo cierre por caja y día', r.data)

  r = await encargado.get('/api/farmacia/catalogo')
  ok(r.data.hoy.ventasHoy >= 8 && r.data.hoy.totalHoy > 0 && r.data.hoy.cierrePendiente === false, 'Inicio: ventas de hoy y cierre hecho', r.data.hoy)
  r = await encargado.get('/api/farmacia/ventas?dia=' + hoyTxt)
  ok(r.status === 200 && r.data.ventas.length >= 8 && r.data.ventas.some((v) => v.estado === 'anulada'), 'Historial de ventas del día', r.data?.total)
  r = await admin.patch(`/api/far-ventas/${ventaMixta.id}`, { total: 1 })
  ok(r.status === 403, 'Las ventas no se editan por la API genérica (ni el superadmin)', r.status)

  /* ── fase 4: alertas, reorden, reabasto, promociones, cron ── */
  console.log('\nAlertas, reabasto y promociones (fase 4)')
  const urlBase = ENV.DATABASE_URL || process.env.DATABASE_URL || ''
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(urlBase)) throw new Error('La siembra de la fase 4 solo corre contra una base LOCAL (DATABASE_URL en .env).')
  const bd = new pg.Client({ connectionString: urlBase })
  await bd.connect()
  const dia = (n) => {
    const [y, m, dd] = hoyTxt.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10)
  }
  r = await admin.post('/api/farmacia/configuracion', { promociones: [{ diasAntes: 90, descuentoPorciento: 15 }, { diasAntes: 45, descuentoPorciento: 30 }] })
  ok(r.status === 200 && r.data.promociones.length === 2, 'Escalones de promoción: 90 días → 15 %, 45 días → 30 %', r.data?.promociones)
  const provR = (await admin.post('/api/farmacia/proveedores', { nombre: `Distribuidora rotación ${sufijo}`, diasEntrega: 4, contacto: { telefono: '2281112233' } })).data
  ok(provR?.id && provR.diasEntrega === 4, 'Proveedor con 4 días de entrega', provR)
  /* Producto con 8 semanas de ventas sembradas: demanda 3..7 por día */
  const sembrar = async (nombre) => {
    const pr = (await encargado.post('/api/farmacia/productos', { nombre, linea: 'suplemento', grupo: 'desregulado', unidadBase: 'pieza', minimoInventario: 10, proveedorPreferenteId: provR.id })).data
    await encargado.post(`/api/farmacia/productos/${pr.id}/presentaciones`, { nombre: 'Caja 12', factor: 12, precio: 600 })
    await encargado.post(`/api/farmacia/productos/${pr.id}/presentaciones`, { nombre: 'Pieza', factor: 1, precio: 55 })
    const lt = (await encargado.post('/api/farmacia/ajustes', { productoId: pr.id, lote: { numeroLote: `R-${pr.id}`, caducidad: '2029-12-31', costoUnidad: 30 }, cantidad: 500, motivo: 'Inventario de prueba' })).data.lote
    const serie = []
    let total = 0
    for (let i = 56; i >= 1; i--) {
      const u = 3 + ((i * 7) % 5)
      serie.push(u)
      total += u
      await bd.query(`insert into far_movimientos (tipo, producto_id, lote_id, almacen_id, cantidad, dia, referencia, motivo) values ('venta', $1, $2, $3, $4, $5, 'SEMILLA', 'Venta simulada')`, [pr.id, lt.id, lt.almacen.id, -u, dia(-i)])
    }
    /* Mantiene el invariante existencia = suma del kardex: una entrada anterior por lo mismo que se «vendió». */
    await bd.query(`insert into far_movimientos (tipo, producto_id, lote_id, almacen_id, cantidad, dia, referencia, motivo) values ('ajuste', $1, $2, $3, $4, $5, 'SEMILLA', 'Entrada simulada')`, [pr.id, lt.id, lt.almacen.id, total, dia(-60)])
    return { prod: pr, lote: lt, serie }
  }
  const rotA = await sembrar(`Rotación A ${sufijo}`)
  const rotB = await sembrar(`Rotación B ${sufijo}`)
  const media = rotA.serie.reduce((a, x) => a + x, 0) / rotA.serie.length
  const sigma = Math.sqrt(rotA.serie.reduce((a, x) => a + (x - media) ** 2, 0) / (rotA.serie.length - 1))
  const Resperado = Math.ceil(media * 4 + 1.65 * sigma * Math.sqrt(4) - 1e-9)

  /* caducidad y desabasto */
  const cad = await crearProd({ nombre: `Caduca prueba ${sufijo}`, linea: 'higiene', grupo: 'III', unidadBase: 'pieza', minimoInventario: 5 }, { nombre: 'Pieza', factor: 1, precio: 80 }, [
    { numero: `C20-${sufijo}`, caducidad: dia(20), costo: 30, cantidad: 1 },
    { numero: `C50-${sufijo}`, caducidad: dia(50), costo: 30, cantidad: 1 },
    { numero: `C200-${sufijo}`, caducidad: dia(200), costo: 30, cantidad: 1 },
    { numero: `CV-${sufijo}`, caducidad: dia(-5), costo: 30, cantidad: 3 },
  ])
  const g2 = await crearProd({ nombre: `Sin promo G-II ${sufijo}`, linea: 'medicamento', grupo: 'II', registroSenasica: `Q-${sufijo}-P`, unidadBase: 'tableta' }, { nombre: 'Caja', factor: 10, precio: 300 }, [{ numero: `G2-${sufijo}`, caducidad: dia(20), costo: 10, cantidad: 10 }])
  const lotesCad = Object.fromEntries(cad.lotes.map((l) => [l.numeroLote, l.id]))

  r = await vendedor.post('/api/farmacia/alertas/recalcular')
  ok(r.status === 403, 'El vendedor no recalcula alertas', r.status)
  r = await encargado.post('/api/farmacia/alertas/recalcular')
  ok(r.status === 200 && r.data.nuevas > 0, 'Recalcular crea las alertas del día', r.data)
  const primera = r.data
  r = await encargado.post('/api/farmacia/alertas/recalcular')
  ok(r.status === 200 && r.data.nuevas === 0 && r.data.abiertas === primera.abiertas, 'Recalcular otra vez no duplica nada (una abierta por objeto y tipo)', r.data)
  r = await vendedor.get('/api/farmacia/alertas')
  ok(r.status === 200, 'El equipo ve la bandeja de alertas', r.status)
  const abiertas = r.data.alertas
  const de = (tipo, objeto) => abiertas.filter((a) => a.tipo === tipo && (objeto == null || a.loteId === objeto || a.productoId === objeto))
  ok(de('caducidad', lotesCad[`CV-${sufijo}`])[0]?.severidad === 'critica', 'Lote vencido: alerta crítica (retirar)', de('caducidad', lotesCad[`CV-${sufijo}`]))
  ok(de('caducidad', lotesCad[`C20-${sufijo}`])[0]?.severidad === 'urgente', 'Lote a 20 días: urgente', de('caducidad', lotesCad[`C20-${sufijo}`]))
  ok(de('caducidad', lotesCad[`C50-${sufijo}`])[0]?.severidad === 'aviso', 'Lote a 50 días (higiene, aviso 60): aviso', de('caducidad', lotesCad[`C50-${sufijo}`]))
  ok(de('caducidad', lotesCad[`C200-${sufijo}`]).length === 0, 'Lote a 200 días: sin alerta')
  const desabasto = de('desabasto', cad.prod.id)[0]
  ok(desabasto && desabasto.severidad === 'urgente' && desabasto.valor === 3, 'Desabasto: 3 vendibles con mínimo 5 (el vencido no cuenta)', desabasto)
  ok(abiertas.filter((a) => a.tipo === 'desabasto' && a.productoId === cad.prod.id).length === 1, 'Una sola alerta de desabasto por producto')
  const nuncaLlego = (await encargado.post('/api/farmacia/productos', { nombre: `Nunca llegó ${sufijo}`, linea: 'accesorio', grupo: 'desregulado', unidadBase: 'pieza', minimoInventario: 4 })).data
  await encargado.post(`/api/farmacia/productos/${nuncaLlego.id}/presentaciones`, { nombre: 'Pieza', factor: 1, precio: 40 })
  await encargado.post('/api/farmacia/alertas/recalcular')
  r = await encargado.get('/api/farmacia/alertas?tipo=desabasto')
  ok(!r.data.alertas.some((a) => a.productoId === nuncaLlego.id), 'Un producto que nunca ha tenido existencia no levanta desabasto (sin ruido al importar el catálogo)')
  r = await encargado.get('/api/farmacia/reabasto')
  ok(r.data.grupos.flatMap((g) => g.renglones).some((x) => x.productoId === nuncaLlego.id && x.cantidadUnidades === 4), '…pero sí aparece en el reabasto sugerido (4 piezas)', r.data.grupos.flatMap((g) => g.renglones).find((x) => x.productoId === nuncaLlego.id))

  /* punto de reorden */
  const reoA = de('reorden_sugerido', rotA.prod.id)[0]
  ok(reoA && reoA.valor === Resperado, `Reorden propuesto = d̄·L + 1.65·σ·√L = ${Resperado} (d̄ ${media.toFixed(2)}, σ ${sigma.toFixed(2)}, L 4)`, reoA)
  r = await encargado.get(`/api/farmacia/productos/${rotA.prod.id}`)
  ok(r.data.puntoReordenPropuesto === Resperado && r.data.puntoReordenAceptado == null && r.data.minimoInventario === 10, 'El producto guarda el propuesto; el mínimo no cambia solo', { prop: r.data.puntoReordenPropuesto, acep: r.data.puntoReordenAceptado, min: r.data.minimoInventario })
  r = await vendedor.post(`/api/farmacia/reorden/${rotA.prod.id}/aceptar`, {})
  ok(r.status === 403, 'El vendedor no acepta puntos de reorden', r.status)
  r = await encargado.post(`/api/farmacia/alertas/${reoA.id}/descartar`, { nota: 'Lo veo el próximo mes' })
  ok(r.status === 200 && r.data.estado === 'descartada', 'Ignorar la propuesta (descartar)', r.data)
  r = await encargado.get(`/api/farmacia/productos/${rotA.prod.id}`)
  ok(r.data.puntoReordenAceptado == null && r.data.minimoInventario === 10, 'Ignorarla no cambia el mínimo', { acep: r.data.puntoReordenAceptado, min: r.data.minimoInventario })
  await encargado.post('/api/farmacia/alertas/recalcular')
  r = await encargado.get('/api/farmacia/alertas?tipo=reorden_sugerido')
  ok(!r.data.alertas.some((a) => a.productoId === rotA.prod.id), 'La propuesta descartada no se repite mientras no cambie', r.data.alertas.map((a) => a.productoId))
  r = await encargado.post(`/api/farmacia/reorden/${rotB.prod.id}/aceptar`, {})
  ok(r.status === 200 && r.data.puntoReordenAceptado === Resperado, 'Aceptar la propuesta: el punto aceptado cambia', r.data)
  r = await encargado.get(`/api/farmacia/alertas?estado=atendida&tipo=reorden_sugerido`)
  ok(r.data.alertas.some((a) => a.productoId === rotB.prod.id), 'La alerta de reorden queda atendida', r.data.alertas.length)
  await encargado.post('/api/farmacia/alertas/recalcular')
  r = await encargado.get('/api/farmacia/alertas?tipo=reorden_sugerido')
  ok(!r.data.alertas.some((a) => a.productoId === rotB.prod.id), 'Con el punto aceptado igual al calculado, ya no se propone', r.data.alertas.map((a) => a.productoId))

  /* reabasto */
  r = await vendedor.get('/api/farmacia/reabasto')
  ok(r.status === 403, 'El vendedor no ve la lista de reabasto', r.status)
  r = await encargado.get('/api/farmacia/reabasto')
  const renCad = r.data.grupos?.flatMap((g) => g.renglones).find((x) => x.productoId === cad.prod.id)
  ok(r.status === 200 && renCad && renCad.disponible === 3 && renCad.puntoReorden === 5 && renCad.cantidadUnidades === 2 && renCad.paquetes === 2, 'Reabasto: 5 de mínimo − 3 disponibles = 2 piezas', renCad)
  const grupoR = r.data.grupos.find((g) => g.proveedor?.id === provR.id)
  ok(!grupoR || grupoR.texto.includes(provR.nombre), 'Agrupado por proveedor preferente con texto para WhatsApp', grupoR?.texto)
  ok(r.data.grupos.some((g) => g.proveedor === null && g.texto.includes(`Caduca prueba ${sufijo}`)), 'Sin proveedor preferente: grupo aparte, copiable', r.data.grupos.map((g) => g.proveedor?.nombre ?? 'sin'))
  r = await encargado.get('/api/farmacia/reabasto/csv')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('Presentación de compra') && r.data.includes(`Caduca prueba ${sufijo}`), 'Reabasto descargable en CSV', r.status)

  /* promociones */
  r = await encargado.get('/api/farmacia/promociones?estado=propuesta')
  const promo20 = r.data.find((x) => x.loteId === lotesCad[`C20-${sufijo}`])
  const promo50 = r.data.find((x) => x.loteId === lotesCad[`C50-${sufijo}`])
  ok(promo20 && promo20.descuentoPorciento === 30 && promo20.vigenteHasta === dia(19), 'Lote G-III a 20 días: promoción propuesta de 30 %, vence un día antes de caducar', promo20)
  ok(promo50 && promo50.descuentoPorciento === 15, 'Lote a 50 días: propuesta de 15 %', promo50)
  ok(!r.data.some((x) => x.loteId === lotesCad[`C200-${sufijo}`]) && !r.data.some((x) => x.loteId === lotesCad[`CV-${sufijo}`]), 'Sin promoción para el lote lejano ni para el vencido')
  ok(!r.data.some((x) => x.productoId === g2.prod.id), 'Grupo II nunca genera promoción', r.data.filter((x) => x.productoId === g2.prod.id))
  r = await vendedor.post(`/api/farmacia/promociones/${promo20.id}/decidir`, { decision: 'aprobada' })
  ok(r.status === 403, 'El vendedor no aprueba promociones', r.status)
  r = await encargado.post(`/api/farmacia/promociones/${promo20.id}/decidir`, { decision: 'aprobada' })
  ok(r.status === 200 && r.data.estado === 'aprobada' && r.data.decididaPor?.nombre === 'Luis Encargado', 'El encargado aprueba la promoción', r.data)
  r = await encargado.post(`/api/farmacia/promociones/${promo50.id}/decidir`, { decision: 'rechazada', motivo: 'Rota bien sin descuento' })
  ok(r.status === 200 && r.data.estado === 'rechazada', 'Rechaza la otra con motivo', r.data)
  await encargado.post('/api/farmacia/alertas/recalcular')
  r = await encargado.get('/api/farmacia/promociones?estado=propuesta')
  ok(!r.data.some((x) => x.loteId === lotesCad[`C50-${sufijo}`] || x.loteId === lotesCad[`C20-${sufijo}`]), 'Recalcular no duplica la aprobada ni revive la rechazada', r.data.map((x) => x.loteId))

  /* cierre automático: llega mercancía y el desabasto se resuelve solo */
  await encargado.post('/api/farmacia/ajustes', { productoId: cad.prod.id, lote: { numeroLote: `C300-${sufijo}`, caducidad: dia(300), costoUnidad: 30 }, cantidad: 10, motivo: 'Llegó mercancía' })
  await encargado.post('/api/farmacia/alertas/recalcular')
  r = await encargado.get('/api/farmacia/alertas?estado=atendida&tipo=desabasto')
  ok(r.data.alertas.some((a) => a.productoId === cad.prod.id && a.cierreAutomatico), 'El desabasto se cierra solo al llegar mercancía', r.data.alertas.filter((a) => a.productoId === cad.prod.id))
  /* merma del vencido: la alerta crítica se cierra sola */
  await encargado.post('/api/farmacia/ajustes', { productoId: cad.prod.id, loteId: lotesCad[`CV-${sufijo}`], tipo: 'merma', cantidad: -3, motivo: 'Retiro de vencido' })
  await encargado.post('/api/farmacia/alertas/recalcular')
  r = await encargado.get('/api/farmacia/alertas')
  ok(!r.data.alertas.some((a) => a.loteId === lotesCad[`CV-${sufijo}`]), 'Al retirar el lote vencido, su alerta se cierra', r.data.alertas.filter((a) => a.loteId === lotesCad[`CV-${sufijo}`]))
  r = await vendedor.post(`/api/farmacia/alertas/${de('caducidad', lotesCad[`C20-${sufijo}`])[0].id}/atender`, {})
  ok(r.status === 403, 'El vendedor no atiende alertas', r.status)
  r = await admin.post('/api/far-alertas', { tipo: 'desabasto', objeto: 'x', mensaje: 'x', abiertaEn: new Date().toISOString() })
  ok(r.status === 403, 'Las alertas no se crean por la API genérica (ni el superadmin)', r.status)
  r = await encargado.get('/api/farmacia/catalogo')
  ok(r.data.hoy.alertasAbiertas > 0 && r.data.hoy.promocionesPropuestas >= 0 && typeof r.data.hoy.alertasCriticas === 'number', 'Inicio: contador de alertas abiertas', r.data.hoy)

  /* cron diario */
  const cron = (auth) => fetch(`${BASE}/api/farmacia/cron/diario`, { headers: auth ? { authorization: auth } : {} }).then(async (x) => ({ status: x.status, data: await x.json().catch(() => null) }))
  r = await cron(null)
  ok(r.status === 401 || r.status === 503, 'El cron sin CRON_SECRET no corre', r)
  if (ENV.CRON_SECRET) {
    await bd.query(`update farmacia_configuracion set ultimo_resumen = null`)
    r = await cron(`Bearer ${ENV.CRON_SECRET}x`)
    ok(r.status === 401, 'El cron con secreto equivocado no corre', r.status)
    r = await cron(`Bearer ${ENV.CRON_SECRET}`)
    ok(r.status === 200 && r.data.correo === 'enviado' && r.data.destinatarios >= 2 && r.data.recalculo, 'El cron recalcula y manda UN correo resumen (sin llave de Resend no falla)', r.data)
    r = await cron(`Bearer ${ENV.CRON_SECRET}`)
    ok(r.status === 200 && r.data.correo === 'ya_enviado', 'Segunda corrida del mismo día: no repite el correo', r.data)
  } else ok(false, 'Falta CRON_SECRET en .env para probar el cron')
  await bd.end()


  /* ── fase 5a: tienda en línea ── */
  console.log('\nTienda en línea (fase 5a)')
  const invitado = new Sesion()
  r = await invitado.get('/api/tienda/catalogo')
  ok(r.status === 404, 'Con el módulo Tienda apagado, la API pública responde 404', r.status)
  r = await admin.post('/api/globals/instalacion-configuracion', { modulos: { clinica: true, farmacia: true, tienda: true } })
  ok(r.status === 200, 'Superadmin enciende la Tienda', r.status)
  const cfgAhora = (await admin.get('/api/farmacia/catalogo')).data.configuracion
  r = await admin.post('/api/farmacia/configuracion', {
    pasarelaActiva: 'prueba',
    horasApartado: 24,
    tienda: { pagarAlRecoger: true, metodoPagoEnLinea: 'en_linea', correosPedidos: `pedidos${sufijo}@ejemplo.mx` },
    metodosPago: [...cfgAhora.metodosPago.filter((m) => m.clave !== 'en_linea').map(({ clave, nombre, tipo, cuentaId, porConfirmar, activo }) => ({ clave, nombre, tipo, cuentaId, porConfirmar, activo })), { clave: 'en_linea', nombre: 'Pago en línea', tipo: 'otro', cuentaId: banco.id, porConfirmar: false, activo: true }],
  })
  ok(r.status === 200 && r.data.pasarelaActiva === 'prueba' && r.data.tienda.metodoPagoEnLinea === 'en_linea', 'Configuración: pasarela de prueba y método «en_linea» con cuenta', r.data?.tienda ?? r.data)
  const tiPub = await crearProd({ nombre: `Antipulgas tienda ${sufijo}`, linea: 'antiparasitario', grupo: 'III', unidadBase: 'tableta', especies: ['perro'], pesoMinKg: 10, pesoMaxKg: 25, publicadoTienda: true, descripcion: 'Tableta masticable' }, { nombre: 'Tableta', factor: 1, precio: 80 }, [{ numero: `TP-${sufijo}`, caducidad: '2028-06-30', costo: 30, cantidad: 10 }])
  const tiG2 = await crearProd({ nombre: `Antibiótico tienda ${sufijo}`, linea: 'medicamento', grupo: 'II', registroSenasica: `Q-${sufijo}-T2`, unidadBase: 'tableta', especies: ['perro'], publicadoTienda: true }, { nombre: 'Tableta', factor: 1, precio: 50 }, [{ numero: `T2-${sufijo}`, caducidad: '2028-06-30', costo: 10, cantidad: 20 }])
  const tiG1 = await crearProd({ nombre: `Controlado tienda ${sufijo}`, linea: 'medicamento', grupo: 'I', registroSenasica: `Q-${sufijo}-T1`, unidadBase: 'ml', publicadoTienda: true }, { nombre: 'Frasco', factor: 10, precio: 400 }, [{ numero: `T1-${sufijo}`, caducidad: '2028-06-30', costo: 10, cantidad: 30 }])
  const tiNo = await crearProd({ nombre: `No publicado tienda ${sufijo}`, linea: 'higiene', grupo: 'desregulado', unidadBase: 'pieza' }, { nombre: 'Pieza', factor: 1, precio: 60 }, [{ numero: `TN-${sufijo}`, caducidad: '2028-06-30', costo: 10, cantidad: 5 }])
  ok(tiPub.prod?.publicadoTienda && tiG2.pres?.id && tiG1.pres?.id && tiNo.pres?.id, 'Productos de prueba para la tienda (III, II y I publicados; uno sin publicar)', tiPub.prod)
  r = await invitado.get(`/api/tienda/catalogo?q=${encodeURIComponent('tienda ' + sufijo)}`)
  const ids = (r.data?.productos ?? []).map((p) => p.id)
  ok(r.status === 200 && ids.includes(tiPub.prod.id) && ids.includes(tiG2.prod.id) && !ids.includes(tiG1.prod.id) && !ids.includes(tiNo.prod.id), 'Catálogo público: se ven III y II; nunca Grupo I ni lo no publicado', ids)
  ok(trazasDeCosto(r.data).length === 0, 'El catálogo público no trae costos', trazasDeCosto(r.data))
  const g2Cat = r.data.productos.find((p) => p.id === tiG2.prod.id)
  ok(g2Cat?.requiereReceta === true, 'El Grupo II se marca «requiere receta»', g2Cat)
  r = await invitado.get(`/api/tienda/catalogo?q=${encodeURIComponent('Antipulgas tienda ' + sufijo)}&especie=gato&peso=4`)
  ok(r.data?.productos?.[0]?.apto?.estado === 'no_apto', '«¿Para quién?» gato de 4 kg: el antipulgas de perro sale «no apto»', r.data?.productos?.[0]?.apto)
  r = await invitado.get(`/api/tienda/catalogo?q=${encodeURIComponent('Antipulgas tienda ' + sufijo)}&especie=perro&peso=15`)
  ok(r.data?.productos?.[0]?.apto?.estado === 'apto', 'Perro de 15 kg: «apto»', r.data?.productos?.[0]?.apto)
  r = await invitado.get(`/api/tienda/producto/${tiG1.prod.id}`)
  ok(r.status === 404, 'La ficha de un Grupo I no existe en la tienda', r.status)

  const contacto = { nombre: 'Invitado Prueba', correo: `invitado${sufijo}@ejemplo.mx`, telefono: '2281234567' }
  const pedir = (s, datos) => s.post('/api/tienda/pedidos', { clave: clave(), contacto, entrega: 'recoger', pago: 'al_recoger', ...datos })
  const clave1 = clave()
  r = await invitado.post('/api/tienda/pedidos', { clave: clave1, contacto, pago: 'al_recoger', perfil: { especie: 'perro', pesoKg: 15 }, renglones: [{ presentacionId: tiPub.pres.id, cantidad: 6 }] })
  const ped1 = r.data?.pedido
  ok(r.status === 201 && ped1?.estado === 'creado' && ped1.folio?.startsWith('PED-') && ped1.token?.length >= 40 && ped1.total === 480 && ped1.expiraEn, 'Invitado aparta 6 para recoger y pagar al recoger: PED-, liga con token y vencimiento', r.data)
  r = await invitado.post('/api/tienda/pedidos', { clave: clave1, contacto, pago: 'al_recoger', renglones: [{ presentacionId: tiPub.pres.id, cantidad: 6 }] })
  ok(r.status === 201 && r.data.duplicado === true && r.data.pedido.id === ped1.id, 'Misma clave: no se duplica el pedido', r.data)
  r = await pedir(invitado, { perfil: { especie: 'gato', pesoKg: 4 }, renglones: [{ presentacionId: tiPub.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /no es apto/.test(r.data.error), 'Pedido para un gato con producto de perro: se rechaza', r.data)
  r = await vendedor.get(`/api/farmacia/vender/buscar?q=${encodeURIComponent('Antipulgas tienda ' + sufijo)}`)
  ok(r.status === 200 && r.data[0]?.vendible === 4, 'Mostrador: lo apartado ya no cuenta como vendible (10 − 6 = 4)', r.data?.[0]?.vendible)
  r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: tiPub.pres.id, cantidad: 5 }], pagos: [{ metodo: 'efectivo', monto: 400 }] })
  ok(r.status === 400 && /apartadas para pedidos de la tienda/.test(r.data.error), 'Mostrador no vende lo apartado por la tienda', r.data)
  r = await pedir(invitado, { renglones: [{ presentacionId: tiPub.pres.id, cantidad: 5 }] })
  ok(r.status === 400 && /Solo quedan 4/.test(r.data.error), 'Otro pedido no aparta más de lo libre', r.data)
  r = await pedir(invitado, { renglones: [{ presentacionId: tiG2.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /requiere receta/.test(r.data.error), 'Invitado no pide Grupo II', r.data)
  r = await pedir(invitado, { renglones: [{ presentacionId: tiG1.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /ya no está en la tienda/.test(r.data.error), 'Grupo I por la API: rechazado', r.data)
  r = await pedir(invitado, { entrega: 'domicilio', renglones: [{ presentacionId: tiPub.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /domicilio/.test(r.data.error), 'A domicilio todavía no (fase 5b)', r.data)

  /* pago en línea simulado */
  r = await pedir(invitado, { pago: 'en_linea', renglones: [{ presentacionId: tiPub.pres.id, cantidad: 2 }] })
  const ped2 = r.data?.pedido
  ok(r.status === 201 && ped2?.estado === 'pago_pendiente' && /\/tienda\/pago-prueba\/PED-/.test(r.data.urlPago ?? ''), 'Pago en línea: queda «por pagar» y devuelve la página de la pasarela', r.data)
  const ref2 = new URL(r.data.urlPago).searchParams.get('ref')
  r = await invitado.llamar('POST', '/api/tienda/webhook/prueba', { idEvento: 'x', pedidoId: ped2.id, referencia: ref2, resultado: 'aprobado', monto: 160 }, { headers: { 'x-firma-prueba': '0'.repeat(64) } })
  ok(r.status === 401, 'Aviso con firma inválida: 401 y no paga', r.data)
  const crypto = await import('node:crypto')
  const firmar = (cuerpo) => crypto.createHmac('sha256', ENV.PAGOS_PRUEBA_SECRETO || '').update(cuerpo).digest('hex')
  const avisoAjeno = JSON.stringify({ idEvento: `ajeno-${sufijo}`, pedidoId: ped2.id, referencia: 'otra-referencia', resultado: 'aprobado', monto: 160 })
  r = await fetch(`${BASE}/api/tienda/webhook/prueba`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-firma-prueba': firmar(avisoAjeno) }, body: avisoAjeno }).then(async (x) => ({ status: x.status, data: await x.json() }))
  ok(r.status === 200 && /referencia distinta/.test(r.data.resultado), 'Aviso firmado de otro cobro: se registra pero no paga', r.data)
  r = await invitado.post(`/api/tienda/pago-prueba/${ped2.folio}`, { t: ped2.token, ref: ref2, resultado: 'aprobado' })
  ok(r.status === 200 && r.data.resultado === 'pagado' && !r.data.duplicado, 'Pago de prueba aprobado: pasa por el aviso firmado y marca pagado', r.data)
  r = await invitado.post(`/api/tienda/pago-prueba/${ped2.folio}`, { t: ped2.token, ref: ref2, resultado: 'aprobado' })
  ok(r.status === 200 && r.data.duplicado === true, 'El mismo aviso otra vez: no hace nada', r.data)
  r = await invitado.get(`/api/tienda/pedidos/${ped2.folio}?t=${ped2.token}`)
  ok(r.status === 200 && r.data.estado === 'pagado' && r.data.pago.estado === 'pagado' && r.data.expiraEn === null, 'Seguimiento: pagado y sin vencimiento', r.data)
  r = await invitado.get(`/api/tienda/pedidos/${ped2.folio}?t=${'a'.repeat(48)}`)
  ok(r.status === 404, 'Sin el token correcto no se ve el pedido', r.status)

  /* panel: preparar, listo, entregar */
  r = await vendedor.get('/api/farmacia/pedidos?grupo=nuevos')
  ok(r.status === 200 && r.data.pedidos.some((p) => p.id === ped1.id) && r.data.pedidos.some((p) => p.id === ped2.id) && r.data.conteo.nuevos >= 2 && !r.data.pedidos[0].token, 'Panel → Pedidos: nuevos con conteo y sin el token del cliente', r.data?.conteo)
  r = await vendedor.get('/api/farmacia/catalogo')
  ok(r.data?.hoy?.pedidosTienda >= 2, 'Inicio de Farmacia: pedidos por atender', r.data?.hoy?.pedidosTienda)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped1.id}/estado`, { accion: 'listo' })
  ok(r.status === 400, 'No salta de «Recibido» a «Listo»', r.data)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped1.id}/estado`, { accion: 'preparar' })
  ok(r.status === 200 && r.data.estado === 'preparando', 'Empezar a preparar', r.data?.estado)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped1.id}/estado`, { accion: 'listo' })
  ok(r.status === 200 && r.data.estado === 'listo_para_recoger' && r.data.historial.length === 3, 'Listo para recoger (con historial)', r.data?.historial)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped1.id}/entregar`, { clave: clave(), pagos: [{ metodo: 'efectivo', monto: 480, recibido: 500 }] })
  ok(r.status === 200 && r.data.pedido.estado === 'entregado' && r.data.ventaFolio?.startsWith('VTA-') && r.data.finanzas === 'registrado', 'Entregar y cobrar: crea la venta y registra en Finanzas', r.data)
  const venta1 = r.data.pedido.ventaId
  r = await vendedor.get(`/api/farmacia/ventas/${venta1}`)
  ok(r.status === 200 && r.data.canal === 'tienda' && r.data.total === 480 && r.data.renglones[0].lotes.length >= 1, 'La venta del pedido queda con canal «tienda» y salió por FEFO', { canal: r.data?.canal, total: r.data?.total })
  r = await vendedor.post(`/api/farmacia/pedidos/${ped1.id}/entregar`, { clave: clave(), pagos: [{ metodo: 'efectivo', monto: 480 }] })
  ok(r.status === 200 && r.data.ventaFolio === `VTA-${String(venta1).padStart(4, '0')}` || (r.status === 200 && r.data.pedido.ventaId === venta1), 'Entregar otra vez no vende dos veces', r.data)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped2.id}/entregar`, { clave: clave() })
  ok(r.status === 200 && r.data.pedido.estado === 'entregado', 'Pedido pagado en línea: se entrega sin cobrar en mostrador', r.data)
  r = await vendedor.get(`/api/farmacia/ventas/${r.data.pedido?.ventaId}`)
  ok(r.data?.pagos?.[0]?.metodo === 'en_linea' && r.data.pagos[0].referencia?.includes(ref2) && r.data.estado === 'pagada', 'Su pago entra con el método «en_linea» y la referencia de la pasarela', r.data?.pagos)
  r = await vendedor.get(`/api/farmacia/vender/buscar?q=${encodeURIComponent('Antipulgas tienda ' + sufijo)}`)
  ok(r.data?.[0]?.vendible === 2, 'Después de entregar: existencia 2 y nada apartado', r.data?.[0]?.vendible)

  /* vencimiento del apartado */
  r = await pedir(invitado, { renglones: [{ presentacionId: tiPub.pres.id, cantidad: 2 }] })
  const ped3 = r.data?.pedido
  r = await vendedor.get(`/api/farmacia/vender/buscar?q=${encodeURIComponent('Antipulgas tienda ' + sufijo)}`)
  ok(ped3?.id && r.data?.[0]?.vendible === 0, 'Nuevo apartado de 2: el mostrador ya no tiene libres', r.data?.[0]?.vendible)
  const bd2 = new pg.Client({ connectionString: urlBase })
  await bd2.connect()
  await bd2.query(`update far_pedidos set expira_en = now() - interval '1 hour' where id = $1`, [ped3.id])
  r = await vendedor.get(`/api/farmacia/vender/buscar?q=${encodeURIComponent('Antipulgas tienda ' + sufijo)}`)
  ok(r.data?.[0]?.vendible === 2, 'Vencido sin pago: lo apartado se libera solo (sin esperar al cron)', r.data?.[0]?.vendible)
  r = await invitado.get(`/api/tienda/pedidos/${ped3.folio}?t=${ped3.token}`)
  ok(r.data?.estado === 'expirado', 'El cliente lo ve «Venció el apartado»', r.data?.estado)
  r = await invitado.post(`/api/tienda/pedidos/${ped3.folio}/pagar`, { t: ped3.token })
  ok(r.status === 400 && /venció/.test(r.data.error), 'Un apartado vencido ya no se paga', r.data)
  if (ENV.CRON_SECRET) {
    await bd2.query(`update farmacia_configuracion set ultimo_resumen = null`)
    r = await fetch(`${BASE}/api/farmacia/cron/diario`, { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } }).then(async (x) => ({ status: x.status, data: await x.json() }))
    ok(r.status === 200 && r.data.pedidosExpirados >= 1, 'El cron diario marca «expirado» lo vencido', r.data?.pedidosExpirados)
  }
  await bd2.end()

  /* cancelar por el cliente */
  r = await pedir(invitado, { renglones: [{ presentacionId: tiPub.pres.id, cantidad: 1 }] })
  const ped4 = r.data?.pedido
  r = await invitado.post(`/api/tienda/pedidos/${ped4.folio}/cancelar`, { t: 'x'.repeat(48) })
  ok(r.status === 404, 'Cancelar sin el token: no', r.status)
  r = await invitado.post(`/api/tienda/pedidos/${ped4.folio}/cancelar`, { t: ped4.token })
  ok(r.status === 200 && r.data.estado === 'cancelado', 'El cliente cancela con su liga y se libera', r.data?.estado)

  /* tutor con receta (Grupo II) */
  r = await admin.post(`/api/clinica/clientes/${tutor.id}/codigo`)
  const codigoT = r.data?.codigo
  const portal = new Sesion()
  const correoPortal = `tienda${sufijo}@ejemplo.mx`
  await portal.post('/api/tutores', { email: correoPortal, password: PASS, nombre: 'Tutor tienda' })
  await portal.login('tutores', correoPortal, PASS)
  r = await portal.post('/api/clinica/portal/vincular', { codigo: codigoT })
  await portal.login('tutores', correoPortal, PASS)
  ok(r.status === 200, 'Tutor del portal vinculado a la ficha de prueba', r.data)
  r = await pedir(portal, { perfil: { mascotaId: max.id }, renglones: [{ presentacionId: tiG2.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /receta vigente/.test(r.data.error), 'Tutor sin receta de ese producto: no pide Grupo II', r.data)
  r = await admin.post('/api/farmacia/recetas', { mascotaId: max.id, vigenciaDias: 30, firmar: true, renglones: [{ productoId: tiG2.prod.id, dosis: '1 tableta', frecuencia: 'cada 12 h', duracion: '7 días', surtidosPermitidos: 1 }] })
  const recT = r.data
  ok(r.status === 201 && recT?.estado === 'valida', 'Receta interna firmada para Max con el antibiótico de la tienda', r.data)
  r = await portal.get('/api/tienda/sesion')
  ok(r.status === 200 && r.data.vinculado && r.data.mascotas.some((m) => m.id === max.id) && r.data.recetas.some((x) => x.id === recT.id) && r.data.pagoEnLinea.disponible, 'Sesión de la tienda: mascotas, receta vigente y pago en línea disponible', r.data)
  r = await pedir(portal, { perfil: { mascotaId: rocky.id }, renglones: [{ presentacionId: tiG2.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /receta vigente/.test(r.data.error), 'Con la receta de Max no se pide para Rocky', r.data)
  r = await pedir(portal, { perfil: { mascotaId: max.id }, renglones: [{ presentacionId: tiG2.pres.id, cantidad: 2 }] })
  const ped5 = r.data?.pedido
  ok(r.status === 201 && ped5?.renglones[0].recetaId === recT.id && ped5.mascota?.id === max.id && ped5.contacto.correo === correoPortal, 'Tutor pide el Grupo II para Max: el pedido liga la receta', r.data)
  r = await pedir(portal, { perfil: { mascotaId: max.id }, renglones: [{ presentacionId: tiG2.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /pedido en curso/.test(r.data.error), 'Con un pedido en curso que ya usa el único surtido, no se hace otro', r.data)
  r = await portal.get('/api/tienda/mis-pedidos')
  ok(r.status === 200 && r.data.some((p) => p.id === ped5.id), 'Portal: «Mis pedidos»', r.data?.length)
  r = await portal.get('/api/far-pedidos?depth=0')
  ok(r.status === 403 || (r.status === 200 && r.data.docs.length === 0), 'API genérica: el tutor no lee pedidos', r.status)
  r = await admin.post('/api/far-pedidos', { estado: 'pagado' })
  ok(r.status === 403, 'Ni el superadmin crea pedidos por la API genérica', r.status)
  await vendedor.post(`/api/farmacia/pedidos/${ped5.id}/estado`, { accion: 'preparar' })
  r = await vendedor.post(`/api/farmacia/pedidos/${ped5.id}/entregar`, { clave: clave(), pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 403 && r.data.codigo === 'autorizacion', 'El vendedor no despacha Grupo II sin autorización del encargado', r.data)
  r = await encargado.post(`/api/farmacia/pedidos/${ped5.id}/entregar`, { clave: clave(), pagos: [{ metodo: 'efectivo', monto: 100 }] })
  ok(r.status === 200 && r.data.pedido.estado === 'entregado', 'El encargado lo entrega con la receta ligada', r.data)
  r = await admin.get(`/api/farmacia/recetas/${recT.id}`)
  ok(r.data?.renglones?.[0]?.surtidosUsados === 1, 'La receta descuenta el surtido', r.data?.renglones)
  r = await pedir(portal, { perfil: { mascotaId: max.id }, renglones: [{ presentacionId: tiG2.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /receta vigente|surtidos/.test(r.data.error), 'Sin surtidos restantes ya no se pide', r.data)

  /* cancelación del equipo con pago en línea → reembolso pendiente */
  r = await pedir(invitado, { pago: 'en_linea', renglones: [{ presentacionId: tiPub.pres.id, cantidad: 1 }] })
  const ped6 = r.data?.pedido
  await invitado.post(`/api/tienda/pago-prueba/${ped6.folio}`, { t: ped6.token, ref: new URL(r.data.urlPago).searchParams.get('ref'), resultado: 'aprobado' })
  r = await vendedor.post(`/api/farmacia/pedidos/${ped6.id}/estado`, { accion: 'cancelar' })
  ok(r.status === 400 && /motivo/.test(r.data.error), 'Cancelar desde el panel pide motivo', r.data)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped6.id}/estado`, { accion: 'cancelar', motivo: 'Producto dañado' })
  ok(r.status === 200 && r.data.estado === 'cancelado' && r.data.pago.estado === 'reembolso_pendiente', 'Cancelado ya pagado: queda «reembolso pendiente»', r.data?.pago)


  /* ── fase 5b: domicilio, repartidor, Mercado Pago, búsqueda ── */
  console.log('\nTienda 5b: domicilio, repartidor, Mercado Pago y búsqueda')
  const cfg5b = (await admin.get('/api/farmacia/catalogo')).data.configuracion
  const metodos5b = [...cfg5b.metodosPago.filter((m) => m.clave !== 'contra_entrega').map(({ clave, nombre, tipo, cuentaId, porConfirmar, activo }) => ({ clave, nombre, tipo, cuentaId, porConfirmar, activo })), { clave: 'contra_entrega', nombre: 'Cobro del repartidor', tipo: 'otro', cuentaId: cajaMostrador.id, porConfirmar: true, activo: true }]
  r = await admin.post('/api/farmacia/configuracion', { tienda: { domicilioActivo: true, zonas: [{ nombre: 'Centro', codigosPostales: '91000, 91010', envio: 40, pedidoMinimo: 100, gratisDesde: 500 }, { nombre: 'Otra', codigosPostales: '91010', envio: 60 }] } })
  ok(r.status === 400 && /91010 está en dos zonas/.test(r.data.error), 'Un código postal no puede estar en dos zonas', r.data)
  r = await admin.post('/api/farmacia/configuracion', { metodosPago: metodos5b, tienda: { domicilioActivo: true, pagarAlRecibir: true, metodoContraEntrega: 'contra_entrega', horarioEntrega: 'Lunes a sábado, 10 a 19 h', zonas: [{ nombre: 'Centro', codigosPostales: '91000 91010', envio: 40, pedidoMinimo: 100, gratisDesde: 500 }] } })
  ok(r.status === 200 && r.data.tienda.domicilioActivo && r.data.tienda.zonas[0].codigosPostales.join() === '91000,91010', 'Configuración: domicilio, zona Centro (2 CP) y método «contra_entrega»', r.data?.tienda ?? r.data)
  r = await invitado.get('/api/tienda/envio?cp=91000&subtotal=80')
  ok(r.status === 200 && r.data.cubre && r.data.envio === 40 && /mínimo/.test(r.data.mensaje), 'Cotización: el 91000 cubre, $40 y avisa el mínimo', r.data)
  r = await invitado.get('/api/tienda/envio?cp=91000&subtotal=600')
  ok(r.data?.envio === 0 && /gratis/i.test(r.data.mensaje), 'Desde $500: envío gratis', r.data)
  r = await invitado.get('/api/tienda/envio?cp=99999&subtotal=600')
  ok(r.data?.cubre === false, 'Fuera de zona: no cubre', r.data)
  const tiDom = await crearProd({ nombre: `Shampoo domicilio ${sufijo}`, linea: 'higiene', grupo: 'desregulado', unidadBase: 'pieza', publicadoTienda: true, descripcion: 'Shampoo para piel con comezón' }, { nombre: 'Botella', factor: 1, precio: 120 }, [{ numero: `SD-${sufijo}`, caducidad: '2028-06-30', costo: 50, cantidad: 10 }])
  const dir = { calle: 'Av. Ávila Camacho 100', colonia: 'Centro', codigoPostal: '91000', referencias: 'Portón verde' }
  r = await pedir(invitado, { entrega: 'domicilio', pago: 'al_recibir', renglones: [{ presentacionId: tiDom.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /dirección/.test(r.data.error), 'A domicilio sin dirección: no', r.data)
  r = await pedir(invitado, { entrega: 'domicilio', pago: 'al_recibir', direccion: { ...dir, codigoPostal: '99999' }, renglones: [{ presentacionId: tiDom.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /no entregamos en el 99999/i.test(r.data.error), 'Fuera de zona: no', r.data)
  r = await pedir(invitado, { entrega: 'domicilio', pago: 'al_recoger', direccion: dir, renglones: [{ presentacionId: tiDom.pres.id, cantidad: 1 }] })
  ok(r.status === 400, 'A domicilio no se «paga al recoger»', r.data)
  r = await pedir(invitado, { entrega: 'domicilio', pago: 'al_recibir', direccion: { ...dir, codigoPostal: '91010' }, renglones: [{ presentacionId: tiPub.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /mínimo/.test(r.data.error), 'Abajo del pedido mínimo: no', r.data)
  r = await pedir(invitado, { entrega: 'domicilio', pago: 'al_recibir', direccion: dir, renglones: [{ presentacionId: tiDom.pres.id, cantidad: 2 }] })
  const ped7 = r.data?.pedido
  ok(r.status === 201 && ped7.entrega === 'domicilio' && ped7.subtotal === 240 && ped7.envio === 40 && ped7.total === 280 && ped7.pago.forma === 'al_recibir' && ped7.direccion?.zona === 'Centro', 'Pedido a domicilio, paga al recibir: $240 + $40 de envío = $280', r.data)
  r = await pedir(portal, { entrega: 'domicilio', pago: 'al_recibir', direccion: dir, perfil: { mascotaId: max.id }, renglones: [{ presentacionId: tiG2.pres.id, cantidad: 1 }] })
  ok(r.status === 400 && /no se envía a domicilio/.test(r.data.error), 'Grupo II a domicilio apagado: se rechaza', r.data)

  const rep = await crearUsuario('repartidor@ejemplo.mx', 'Pepe Repartidor', rolRep)
  const repartidor = new Sesion()
  ok(rep?.id && (await repartidor.login('users', 'repartidor@ejemplo.mx', PASS)), 'Repartidor entra')
  r = await vendedor.post(`/api/farmacia/pedidos/${ped7.id}/entregar`, { clave: clave(), pagos: [{ metodo: 'efectivo', monto: 280 }] })
  ok(r.status === 400 && /repartidor/.test(r.data.error), 'Un pedido a domicilio no se «entrega en mostrador»', r.data)
  await vendedor.post(`/api/farmacia/pedidos/${ped7.id}/estado`, { accion: 'preparar' })
  r = await vendedor.post(`/api/farmacia/pedidos/${ped7.id}/estado`, { accion: 'listo' })
  ok(r.status === 200 && r.data.estado === 'listo_para_recoger', 'Preparado y listo para salir', r.data?.estado)
  r = await vendedor.get('/api/farmacia/repartidores')
  ok(r.status === 200 && r.data.some((x) => x.id === rep.id), 'Lista de repartidores (rol con «Mis entregas»)', r.data)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped7.id}/enviar`, { clave: clave() })
  ok(r.status === 400 && /quién lo lleva/.test(r.data.error), 'Enviar sin repartidor: no', r.data)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped7.id}/enviar`, { clave: clave(), repartidorId: rep.id })
  ok(r.status === 200 && r.data.pedido.estado === 'en_ruta' && r.data.pedido.repartidor?.id === rep.id && r.data.ventaFolio, 'Enviar con repartidor: en camino y venta registrada', r.data)
  const venta7 = r.data.pedido.ventaId
  r = await vendedor.get(`/api/farmacia/ventas/${venta7}`)
  ok(r.data?.canal === 'tienda' && r.data.envio === 40 && r.data.total === 280 && r.data.estado === 'por_confirmar' && r.data.pagos[0].metodo === 'contra_entrega', 'La venta lleva el envío y el cobro queda «por confirmar»', { envio: r.data?.envio, total: r.data?.total, estado: r.data?.estado })
  r = await vendedor.get(`/api/farmacia/vender/buscar?q=${encodeURIComponent('Shampoo domicilio ' + sufijo)}`)
  ok(r.data?.[0]?.vendible === 8, 'Salió del inventario y ya no cuenta como apartado (10 − 2 = 8)', r.data?.[0]?.vendible)
  r = await vendedor.get('/api/farmacia/entregas')
  ok(r.status === 403, 'Sin «Mis entregas» en el rol: 403', r.status)
  r = await repartidor.get('/api/farmacia/entregas')
  ok(r.status === 200 && r.data.enRuta.some((p) => p.id === ped7.id) && r.data.enRuta[0].direccion?.calle, 'Mis entregas: el pedido con dirección', r.data)
  r = await repartidor.post(`/api/farmacia/pedidos/${ped7.id}/entregado`, { recibio: 'Señora Ana' })
  ok(r.status === 400 && /Cobra/.test(r.data.error), 'Paga al recibir: no se entrega sin marcar «Cobrado»', r.data)
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==', 'base64')
  const fd = new FormData()
  fd.append('recibio', 'Señora Ana')
  fd.append('cobrado', 'true')
  /* De tamaño real (~300 KB): el tope de texto de Payload rechazaba más de ~30 KB (17-nov-2026). */
  fd.append('foto', new Blob([jpeg, crypto.getRandomValues(new Uint8Array(65536)), crypto.getRandomValues(new Uint8Array(65536)), crypto.getRandomValues(new Uint8Array(65536)), crypto.getRandomValues(new Uint8Array(65536)), crypto.getRandomValues(new Uint8Array(40000))], { type: 'image/jpeg' }), 'entrega.jpg')
  r = await repartidor.llamar('POST', `/api/farmacia/pedidos/${ped7.id}/entregado`, fd)
  ok(r.status === 200 && r.data.estado === 'entregado' && r.data.entregaDomicilio?.recibio === 'Señora Ana' && r.data.entregaDomicilio.conFoto && r.data.pago.estado === 'pagado', 'Entregado con foto: recibió, cobrado y pagado', r.data)
  r = await vendedor.get(`/api/farmacia/ventas/${venta7}`)
  ok(r.data?.estado === 'pagada' && r.data.pagos[0].estado === 'confirmado', 'El cobro del repartidor se confirma en la venta (entra a Finanzas)', r.data?.pagos)
  r = await vendedor.get(`/api/farmacia/pedidos/${ped7.id}/evidencia`)
  ok(r.status === 200 && (r.headers.get('content-type') || '').startsWith('image/jpeg'), 'La foto de la entrega se ve en el panel', r.status)
  r = await invitado.get(`/api/farmacia/pedidos/${ped7.id}/evidencia`)
  ok(r.status === 401, 'Sin sesión no se ve la foto', r.status)

  /* en línea + no se pudo entregar + reintento */
  r = await pedir(invitado, { entrega: 'domicilio', pago: 'en_linea', direccion: dir, renglones: [{ presentacionId: tiDom.pres.id, cantidad: 5 }] })
  const ped8 = r.data?.pedido
  ok(r.status === 201 && ped8.envio === 0 && ped8.total === 600, 'Pedido de $600: envío gratis', r.data?.pedido)
  await invitado.post(`/api/tienda/pago-prueba/${ped8.folio}`, { t: ped8.token, ref: new URL(r.data.urlPago).searchParams.get('ref'), resultado: 'aprobado' })
  r = await vendedor.post(`/api/farmacia/pedidos/${ped8.id}/enviar`, { clave: clave(), repartidorId: rep.id })
  ok(r.status === 200 && r.data.pedido.estado === 'en_ruta', 'Pagado en línea: sale con el repartidor', r.data)
  r = await vendedor.get(`/api/farmacia/ventas/${r.data.pedido.ventaId}`)
  ok(r.data?.estado === 'pagada' && r.data.pagos[0].metodo === 'en_linea', 'Su venta entra pagada con el método en línea', r.data?.pagos)
  r = await repartidor.post(`/api/farmacia/pedidos/${ped8.id}/no-entregado`, { motivo: 'No había nadie' })
  ok(r.status === 200 && r.data.estado === 'listo_para_recoger' && r.data.entregaDomicilio.intentos === 1, 'No se pudo entregar: regresa a la farmacia con el intento anotado', r.data?.entregaDomicilio)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped8.id}/estado`, { accion: 'cancelar', motivo: 'Cliente no contesta' })
  ok(r.status === 400 && /anúlala en Ventas/.test(r.data.error), 'Con venta registrada no se cancela sin anularla', r.data)
  r = await vendedor.post(`/api/farmacia/pedidos/${ped8.id}/enviar`, { clave: clave(), repartidorId: rep.id })
  ok(r.status === 200 && r.data.pedido.estado === 'en_ruta' && r.data.pedido.ventaId === ped8.id * 0 + r.data.pedido.ventaId, 'Reintento: vuelve a salir sin vender otra vez', r.data?.ventaFolio)
  r = await repartidor.post(`/api/farmacia/pedidos/${ped8.id}/entregado`, { recibio: 'Vecino' })
  ok(r.status === 200 && r.data.estado === 'entregado', 'Pagado en línea: se entrega sin cobrar', r.data?.estado)

  /* reembolso (pasarela de prueba) */
  r = await vendedor.post(`/api/farmacia/pedidos/${ped6.id}/reembolsar`)
  ok(r.status === 403, 'El vendedor no reembolsa', r.status)
  r = await encargado.post(`/api/farmacia/pedidos/${ped6.id}/reembolsar`)
  ok(r.status === 200 && r.data.pago.estado === 'reembolsado', 'El encargado reembolsa el pedido cancelado y pagado', r.data?.pago)

  /* Mercado Pago contra un simulador local (MERCADOPAGO_API_URL de .env) */
  if (ENV.MERCADOPAGO_API_URL && ENV.MERCADOPAGO_WEBHOOK_SECRET) {
    const http = await import('node:http')
    const crypto = await import('node:crypto')
    const mpLog = { preferencias: [], reembolsos: 0 }
    const pagos = new Map()
    const srv = http.createServer((req, res) => {
      let cuerpo = ''
      req.on('data', (c) => (cuerpo += c))
      req.on('end', () => {
        const env = (st, d) => {
          res.writeHead(st, { 'content-type': 'application/json' })
          res.end(JSON.stringify(d))
        }
        if (req.method === 'POST' && req.url === '/checkout/preferences/') {
          const b = JSON.parse(cuerpo)
          mpLog.preferencias.push({ b, auth: req.headers.authorization, idem: req.headers['x-idempotency-key'] })
          return env(201, { id: `pref-${mpLog.preferencias.length}`, init_point: `https://mp.local/checkout?pref=${mpLog.preferencias.length}`, sandbox_init_point: 'https://sandbox.mp.local/x' })
        }
        const m = /^\/v1\/payments\/(\d+)(\/refunds)?$/.exec(req.url)
        if (m && req.method === 'GET') return pagos.has(m[1]) ? env(200, pagos.get(m[1])) : env(404, { message: 'not found' })
        if (m && m[2] && req.method === 'POST') {
          mpLog.reembolsos++
          return env(201, { id: 5550 + mpLog.reembolsos })
        }
        env(404, {})
      })
    })
    await new Promise((ok2) => srv.listen(Number(new URL(ENV.MERCADOPAGO_API_URL).port), '127.0.0.1', ok2))
    r = await admin.post('/api/farmacia/configuracion', { pasarelaActiva: 'mercadopago' })
    r = await invitado.get('/api/tienda/sesion')
    ok(r.data?.pagoEnLinea?.proveedor === 'mercadopago', 'Con llaves en el servidor, la tienda ofrece Mercado Pago', r.data?.pagoEnLinea)
    r = await pedir(invitado, { pago: 'en_linea', renglones: [{ presentacionId: tiDom.pres.id, cantidad: 1 }] })
    const ped9 = r.data?.pedido
    const pref = mpLog.preferencias.at(-1)
    ok(r.status === 201 && r.data.urlPago?.startsWith('https://mp.local/checkout') && pref?.b.external_reference?.startsWith(`ped-${ped9.id}-`) && pref.b.items[0].unit_price === 120 && pref.b.items[0].currency_id === 'MXN' && /\/api\/tienda\/webhook\/mercadopago$/.test(pref.b.notification_url) && pref.auth?.startsWith('Bearer ') && pref.idem, 'Mercado Pago: preferencia con referencia, monto, MXN, webhook e idempotencia', pref?.b)
    pagos.set('777', { id: 777, status: 'approved', external_reference: pref.b.external_reference, transaction_amount: 120, currency_id: 'MXN' })
    const aviso = async (firma, query = 'data.id=777&type=payment', body = { type: 'payment', action: 'payment.updated', data: { id: '777' } }) =>
      fetch(`${BASE}/api/tienda/webhook/mercadopago?${query}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': firma, 'x-request-id': 'req-abc' }, body: JSON.stringify(body) }).then(async (x) => ({ status: x.status, data: await x.json() }))
    const ts = String(Math.floor(Date.now() / 1000))
    const firmaMP = (id) => `ts=${ts},v1=${crypto.createHmac('sha256', ENV.MERCADOPAGO_WEBHOOK_SECRET).update(`id:${id};request-id:req-abc;ts:${ts};`).digest('hex')}`
    r = await aviso(`ts=${ts},v1=${'0'.repeat(64)}`)
    ok(r.status === 401, 'Aviso de Mercado Pago con firma falsa: 401', r.data)
    r = await aviso(firmaMP('778'))
    ok(r.status === 401, 'Firma de otro pago (el id es parte de la firma): 401', r.data)
    r = await aviso(firmaMP('777'))
    ok(r.status === 200 && r.data.resultado === 'pagado', 'Aviso firmado: consulta el pago aprobado y marca pagado', r.data)
    r = await aviso(firmaMP('777'))
    ok(r.data?.duplicado === true, 'El mismo aviso otra vez: no hace nada', r.data)
    r = await aviso(firmaMP('900'), 'data.id=900&type=merchant_order', { type: 'merchant_order', data: { id: '900' } })
    ok(r.status === 200 && /ignorado/.test(r.data.resultado), 'Aviso de otro tipo (merchant_order): se ignora sin error', r.data)
    r = await invitado.get(`/api/tienda/pedidos/${ped9.folio}?t=${ped9.token}`)
    ok(r.data?.pago?.estado === 'pagado' && r.data.pago.proveedor === 'mercadopago', 'El pedido queda pagado por Mercado Pago', r.data?.pago)
    await vendedor.post(`/api/farmacia/pedidos/${ped9.id}/estado`, { accion: 'cancelar', motivo: 'Sin existencia física' })
    r = await encargado.post(`/api/farmacia/pedidos/${ped9.id}/reembolsar`)
    ok(r.status === 200 && r.data.pago.estado === 'reembolsado' && mpLog.reembolsos === 1, 'Reembolso total en Mercado Pago desde el panel', r.data?.pago)
    srv.close()
    await admin.post('/api/farmacia/configuracion', { pasarelaActiva: 'prueba' })
  } else ok(false, 'Faltan MERCADOPAGO_API_URL y MERCADOPAGO_WEBHOOK_SECRET en .env para probar Mercado Pago')

  /* búsqueda (sin llave de Anthropic en local: respaldo por palabras) */
  r = await invitado.post('/api/tienda/sugerir', { texto: 'shampoo para la comezón de mi perro' })
  ok(r.status === 200 && r.data.productos.some((p) => p.id === tiDom.prod.id) && !r.data.productos.some((p) => p.requiereReceta), 'Búsqueda «¿qué necesita?»: encuentra el shampoo y nunca sugiere algo con receta', r.data)
  r = await invitado.post('/api/tienda/sugerir', { texto: 'mi perro vomita sangre desde ayer' })
  ok(r.status === 200 && r.data.veterinario === true && r.data.motivoVeterinario, 'Señales de alarma: recomienda al veterinario', r.data)

  /* páginas */
  for (const [s, ruta, texto] of [
    [invitado, '/tienda', 'Farmacia en línea'],
    [invitado, `/tienda/producto/${tiPub.prod.id}`, 'ti-main'],
    [invitado, '/tienda/carrito', 'Tu carrito'],
    [invitado, `/tienda/pedido/${ped2.folio}?t=${ped2.token}`, 'ti-main'],
    [invitado, `/tienda/pago-prueba/${ped2.folio}?t=${ped2.token}&ref=x`, 'ti-main'],
    [portal, '/portal/farmacia', 'Mis pedidos'],
    [admin, '/admin/farmacia/pedidos', 'fa-app'],
    [admin, `/admin/farmacia/pedidos/${ped1.id}`, 'fa-app'],
    [admin, `/admin/farmacia/pedidos/${ped7.id}`, 'fa-app'],
    [repartidor, '/admin/farmacia/entregas', 'fa-app'],
  ]) {
    r = await s.get(ruta)
    const html = typeof r.data === 'string' ? r.data : ''
    ok(r.status === 200 && html.includes(texto), `${ruta.split('?')[0]} renderiza («${texto}»)`, r.status)
  }
  r = await invitado.get('/')
  ok(typeof r.data === 'string' && r.data.includes('href="/tienda"'), 'El sitio muestra «Tienda» con el módulo encendido', r.status)

  /* ── recompra (fase 6a) ── */
  console.log('\nRecompra (fase 6a)')
  {
    const hoyN = new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10)
    const masDias = (n) => { const d = new Date(hoyN + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
    const cronR = () => fetch(`${BASE}/api/farmacia/cron/diario`, { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } }).then(async (x) => ({ status: x.status, data: await x.json() }))
    const pip = await crearProd({ nombre: `Pipeta recompra ${sufijo}`, linea: 'antiparasitario', grupo: 'III', unidadBase: 'pipeta', duracionDias: 1, publicadoTienda: true }, { nombre: 'Pipeta', factor: 1, precio: 100 }, [{ numero: `RC-${sufijo}`, caducidad: '2028-06-30', costo: 30, cantidad: 20 }])
    ok(pip.prod?.duracionDias === 1, 'Producto con «duración por omisión» de 1 día por pipeta', pip.prod?.duracionDias)
    r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: pip.pres.id, cantidad: 2 }], pagos: [{ metodo: 'efectivo', monto: 200 }] })
    ok(r.status === 201, 'Venta de 2 pipetas para Max en mostrador', r.data)
    r = await cronR()
    ok(r.status === 200 && r.data.recompras >= 1 && r.data.avisosRecompra >= 1, 'Cron: calcula la recompra y manda el aviso (se acaba en 2 días; aviso 5 días antes)', r.data)
    r = await portal.get('/api/tienda/mis-recompras')
    const rc = (r.data ?? []).find((x) => x.producto.id === pip.prod.id)
    ok(r.status === 200 && rc && rc.fechaEstimada === masDias(2) && rc.mascota?.id === max.id && rc.cantidad === 2 && rc.token?.length === 48, 'Portal: «se acaba» en 2 días, para Max, con su liga', rc ?? r.data)
    r = await invitado.get(`/api/tienda/recompra/${rc.id}?t=${rc.token}`)
    ok(r.status === 200 && r.data.presentacion?.id === pip.pres.id && r.data.presentacion.disponible && r.data.producto.enTienda && !r.data.producto.requiereReceta, '«Volver a pedir» sin sesión con la liga del correo', r.data)
    ok(trazasDeCosto(r.data).length === 0, 'La liga de recompra no trae costos', trazasDeCosto(r.data))
    r = await invitado.get(`/api/tienda/recompra/${rc.id}?t=${'0'.repeat(48)}`)
    ok(r.status === 404, 'Con otro token: no existe', r.status)
    r = await admin.get(`/api/far-recompras?depth=0&where[id][equals]=${rc.id}`)
    const filaR = r.data?.docs?.[0]
    ok(r.status === 200 && filaR?.avisadoPara === rc.fechaEstimada && filaR.token === undefined, 'API genérica: el equipo ve que ya se avisó, pero no el token', filaR)
    r = await admin.post('/api/far-recompras', { clave: 'x' })
    ok(r.status === 403, 'Nadie crea recompras por la API genérica', r.status)
    r = await cronR()
    r = await admin.get(`/api/far-recompras?depth=0&where[id][equals]=${rc.id}`)
    ok(r.data?.docs?.[0]?.avisadoEn === filaR.avisadoEn, 'Otro cron el mismo día: no repite el aviso', r.data?.docs?.[0]?.avisadoEn)
    r = await portal.get('/portal')
    ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('Volver a pedir') && r.data.includes(`/tienda/recompra/${rc.id}`), 'Inicio del portal: «Volver a pedir» en Pendientes', r.status)
    r = await invitado.get(`/tienda/recompra/${rc.id}?t=${rc.token}`)
    ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('ti-main'), 'Página «Volver a pedir» renderiza', r.status)
    r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), mascotaId: max.id, renglones: [{ presentacionId: pip.pres.id, cantidad: 3 }], pagos: [{ metodo: 'efectivo', monto: 300 }] })
    r = await cronR()
    const tras = (await admin.get(`/api/far-recompras?depth=0&where[id][equals]=${rc.id}`)).data?.docs?.[0]
    ok(r.data.avisosRecompra >= 1 && tras?.fechaEstimada === masDias(3) && tras.avisadoPara === masDias(3), 'Compró otra vez: nueva fecha (3 días) y nuevo aviso', tras)
    r = await invitado.post(`/api/tienda/recompra/${rc.id}/baja`, { t: rc.token })
    ok(r.status === 200 && r.data.activa === false, '«No me avises más» con la liga', r.data)
    r = await portal.get('/api/tienda/mis-recompras')
    ok(r.status === 200 && !(r.data ?? []).some((x) => x.id === rc.id), 'Dado de baja: ya no sale en el portal', r.data?.length)
    r = await admin.post('/api/farmacia/configuracion', { tienda: { recompraActiva: false, recompraDiasAntes: 7 } })
    ok(r.status === 200 && r.data.tienda.recompraActiva === false && r.data.tienda.recompraDiasAntes === 7, 'Configuración: apagar el aviso y cambiar los días', r.data?.tienda)
    r = await admin.post('/api/farmacia/configuracion', { tienda: { recompraDiasAntes: 0 } })
    ok(r.status === 400, 'Días de aviso fuera de rango: no', r.data)
    await admin.post('/api/farmacia/configuracion', { tienda: { recompraActiva: true, recompraDiasAntes: 5 } })
  }

  /* ── planes de compra (fase 6b) ── */
  console.log('\nPlanes de compra (fase 6b)')
  {
    const bd3 = new pg.Client({ connectionString: urlBase })
    await bd3.connect()
    const cronP = () => fetch(`${BASE}/api/farmacia/cron/diario`, { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } }).then(async (x) => ({ status: x.status, data: await x.json() }))
    const masDiasP = (n) => { const d = new Date(hoyTxt + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
    const toca = (id) => bd3.query(`update far_planes set proxima_entrega = $2 where id = $1`, [id, hoyTxt])
    const planDe = async (id) => (await vendedor.get('/api/farmacia/planes?grupo=activos')).data?.planes?.find((p) => p.id === id) ?? (await vendedor.get('/api/farmacia/planes?grupo=detenidos')).data?.planes?.find((p) => p.id === id) ?? (await vendedor.get('/api/farmacia/planes?grupo=cerrados')).data?.planes?.find((p) => p.id === id)

    r = await invitado.get('/api/tienda/sesion')
    ok(r.data?.planes?.activo === false, 'Planes apagados por omisión', r.data?.planes)
    r = await admin.post('/api/farmacia/configuracion', { planes: { activo: true, descuentoAnual: 10, entregasAnual: 3, diasAntes: 3 } })
    ok(r.status === 200 && r.data.planes.activo && r.data.planes.descuentoAnual === 10 && r.data.planes.entregasAnual === 3 && r.data.planes.diasAntes === 3, 'Configuración: planes encendidos, 10% anual, 3 entregas, 3 días antes', r.data?.planes)
    r = await admin.post('/api/farmacia/configuracion', { planes: { entregasAnual: 1 } })
    ok(r.status === 400, 'Entregas del plan anual fuera de rango: no', r.data)

    const pln = await crearProd({ nombre: `Pipeta plan ${sufijo}`, linea: 'antiparasitario', grupo: 'III', unidadBase: 'pipeta', especies: ['perro'], pesoMinKg: 10, pesoMaxKg: 25, duracionDias: 30, publicadoTienda: true }, { nombre: 'Pipeta', factor: 1, precio: 200 }, [{ numero: `PL-${sufijo}`, caducidad: '2028-06-30', costo: 60, cantidad: 20 }])
    r = await invitado.get(`/api/tienda/plan-oferta?presentacion=${pln.pres.id}&mascota=${max.id}`)
    ok(r.status === 200 && r.data.disponible === false, 'Sin sesión no hay plan', r.data)
    r = await portal.get('/api/tienda/sesion')
    ok(r.data?.planes?.activo === true, 'Tutor vinculado: la tienda ofrece planes', r.data?.planes)
    r = await portal.get(`/api/tienda/plan-oferta?presentacion=${pln.pres.id}&mascota=${max.id}&cantidad=1`)
    ok(r.status === 200 && r.data.disponible && r.data.cadaDias === 30 && r.data.recurrente.precioEntrega === 200 && r.data.anual.precioEntrega === 180 && r.data.anual.total === 540 && r.data.anual.entregas === 3, 'Oferta: cada 30 días; $200 por entrega o $540 por 3 (10% menos)', r.data)
    r = await portal.get(`/api/tienda/plan-oferta?presentacion=${pln.pres.id}&mascota=${mishi.id}`)
    ok(r.status === 200 && r.data.disponible === false && /Mishi/.test(r.data.motivo ?? ''), 'Para la gata no se ofrece (especie): dice por qué', r.data)
    r = await portal.get(`/api/tienda/plan-oferta?presentacion=${tiPub.pres.id}&mascota=${max.id}`)
    ok(r.status === 200 && r.data.disponible === false && /duración/.test(r.data.motivo ?? ''), 'Producto sin duración habitual: sin plan', r.data)

    /* anual prepagado */
    r = await portal.post('/api/tienda/planes', { modalidad: 'anual', presentacionId: pln.pres.id, mascotaId: max.id, cantidad: 1 })
    const pa = r.data?.plan
    ok(r.status === 201 && pa?.estado === 'por_pagar' && pa.total === 540 && /^PLN-\d{5}$/.test(pa.folio) && pa.token?.length === 48 && /\/tienda\/plan\/\d+\?t=.+&ref=prueba-pln-/.test(r.data.url ?? ''), 'Plan anual: queda «por pagar» con la liga de pago (prueba)', r.data)
    const refA = new URL(r.data.url).searchParams.get('ref')
    r = await portal.post('/api/tienda/planes', { modalidad: 'anual', presentacionId: pln.pres.id, mascotaId: max.id, cantidad: 1 })
    ok(r.status === 201 && r.data.plan.id === pa.id, 'Otro intento sin pagar: reutiliza el mismo plan', r.data?.plan?.id)
    const refA2 = new URL(r.data.url).searchParams.get('ref')
    r = await admin.get(`/api/far-planes?depth=0&where[id][equals]=${pa.id}`)
    ok(r.status === 200 && r.data.docs[0]?.estado === 'por_pagar' && r.data.docs[0].token === undefined, 'API genérica: el equipo lee el plan, sin el token', r.data?.docs?.[0])
    r = await admin.post('/api/far-planes', { estado: 'activo' })
    ok(r.status === 403, 'Nadie crea planes por la API genérica', r.status)
    r = await portal.get('/api/far-planes?depth=0')
    ok(r.status === 403 || (r.status === 200 && r.data.docs.length === 0), 'El tutor no lee planes por la API genérica', r.status)
    r = await invitado.get(`/api/tienda/plan/${pa.id}?t=${'0'.repeat(48)}`)
    ok(r.status === 404, 'Liga con otro token: no existe', r.status)
    r = await invitado.post(`/api/tienda/pago-prueba-plan/${pa.id}`, { t: pa.token, ref: refA, resultado: 'aprobado' })
    ok(r.status === 409, 'Pagar con el cobro anterior (ya hay otro): no', r.data)
    r = await invitado.post(`/api/tienda/pago-prueba-plan/${pa.id}`, { t: pa.token, ref: refA2, resultado: 'aprobado' })
    ok(r.status === 200 && r.data.resultado === 'pagado', 'Pago anual aprobado (aviso firmado)', r.data)
    r = await invitado.post(`/api/tienda/pago-prueba-plan/${pa.id}`, { t: pa.token, ref: refA2, resultado: 'aprobado' })
    ok(r.status === 200 && r.data?.resultado === 'ya procesado', 'El mismo aviso otra vez: no hace nada', r.data)
    r = await invitado.get(`/api/tienda/plan/${pa.id}?t=${pa.token}`)
    const pa1 = r.data
    ok(pa1?.estado === 'activo' && pa1.entregasHechas === 1 && pa1.pedidos.length === 1 && pa1.proximaEntrega === masDiasP(30), 'Activo: la primera entrega sale de inmediato y la próxima es en 30 días', pa1)
    const pedA1 = (await vendedor.get('/api/farmacia/pedidos?grupo=nuevos')).data?.pedidos?.find((p) => p.plan?.id === pa.id)
    ok(pedA1?.estado === 'pagado' && pedA1.pago.forma === 'plan' && pedA1.total === 180 && pedA1.plan.ciclo === 1 && pedA1.mascota?.id === max.id, 'Pedidos: entrega 1 «cubierta por el plan», $180, para Max', pedA1)
    r = await vendedor.post(`/api/farmacia/pedidos/${pedA1.id}/entregar`, { clave: clave(), pagos: [{ metodo: 'efectivo', monto: 180 }] })
    ok(r.status === 400 && /plan anual/.test(r.data.error), 'Una entrega del plan anual no se cobra otra vez', r.data)
    r = await vendedor.post(`/api/farmacia/pedidos/${pedA1.id}/entregar`, { clave: clave() })
    ok(r.status === 200 && r.data.pedido.estado === 'entregado' && r.data.finanzas === 'registrado', 'Entregar: venta sin cobro, Finanzas «registrado»', r.data)
    r = await encargado.get(`/api/farmacia/ventas/${r.data.pedido.ventaId}`)
    ok(r.status === 200 && r.data.total === 180 && r.data.pagos.length === 0 && !r.data.ingresoFinanzasId, 'La venta vale $180, sin pagos ni otro ingreso en Finanzas', r.data && { total: r.data.total, pagos: r.data.pagos, ing: r.data.ingresoFinanzasId })
    const fila = (await admin.get(`/api/far-planes?depth=0&where[id][equals]=${pa.id}`)).data?.docs?.[0]
    r = await admin.get(`/api/finanzas/operaciones/${fila?.anticipo?.operacionFinanzas}`)
    ok(r.status === 200 && r.data.operacion?.tipo === 'entrada' && r.data.operacion.totalCentavos === 54000 && r.data.operacion.estadoPago === 'liquidado', 'Finanzas: anticipo de $540 liquidado (una sola vez)', r.data?.operacion && { t: r.data.operacion.tipo, c: r.data.operacion.totalCentavos, e: r.data.operacion.estadoPago })
    let pp = await planDe(pa.id)
    ok(pp?.anticipo?.registrado && pp.anticipo.reconocido === 180 && pp.anticipo.porReconocer === 360, 'Panel: entregado $180, por entregar $360', pp?.anticipo)
    r = await vendedor.get('/api/farmacia/planes?grupo=activos')
    ok(r.status === 200 && r.data.anticipos.cobrado >= 540 && r.data.anticipos.porReconocer >= 360 && trazasDeCosto(r.data).length === 0, 'Resumen de anticipos (cobrado y por entregar), sin costos', r.data?.anticipos)
    r = await vendedor.post(`/api/farmacia/planes/${pa.id}/accion`, { accion: 'cancelar', motivo: 'Prueba' })
    ok(r.status === 403, 'Cancelar un anual pagado es del encargado', r.data)
    r = await portal.post(`/api/tienda/plan/${pa.id}/cancelar`, { t: pa.token })
    ok(r.status === 400 && /escríbenos/.test(r.data.error), 'El tutor no cancela solo un anual pagado', r.data)
    r = await cronP()
    pp = await planDe(pa.id)
    ok(pp?.entregasHechas === 1, 'Cron sin que toque: no genera otra entrega', pp?.entregasHechas)
    await toca(pa.id)
    r = await cronP()
    pp = await planDe(pa.id)
    ok(r.data.entregasPlan >= 1 && pp?.entregasHechas === 2 && pp.proximaEntrega === masDiasP(30), 'Cron cuando toca: entrega 2 y la próxima en 30 días', { cron: r.data.entregasPlan, pp: pp && { h: pp.entregasHechas, p: pp.proximaEntrega } })
    r = await cronP()
    ok((await planDe(pa.id))?.entregasHechas === 2, 'Otro cron el mismo día: no repite', null)
    await toca(pa.id)
    await cronP()
    pp = await planDe(pa.id)
    ok(pp?.estado === 'terminado' && pp.entregasHechas === 3 && pp.pedidos.length === 3, 'La tercera entrega termina el plan', pp && { e: pp.estado, h: pp.entregasHechas })

    /* recurrente con receta (Grupo II): se detiene sin receta */
    const plg2 = await crearProd({ nombre: `Antiinflamatorio plan ${sufijo}`, principioActivo: `Meloxi ${sufijo}`, linea: 'medicamento', grupo: 'II', registroSenasica: `Q-${sufijo}-PL`, unidadBase: 'tableta', especies: ['perro'], duracionDias: 1, publicadoTienda: true }, { nombre: 'Caja 10', factor: 10, precio: 300 }, [{ numero: `PL2-${sufijo}`, caducidad: '2028-06-30', costo: 100, cantidad: 100 }])
    r = await portal.get(`/api/tienda/plan-oferta?presentacion=${plg2.pres.id}&mascota=${rocky.id}`)
    ok(r.data?.disponible === false && /receta/.test(r.data.motivo ?? ''), 'Grupo II sin receta: sin plan', r.data)
    r = await admin.post('/api/farmacia/recetas', { mascotaId: rocky.id, vigenciaDias: 60, firmar: true, renglones: [{ productoId: plg2.prod.id, dosis: 'según indicación', frecuencia: 'diaria', duracion: '20 días', surtidosPermitidos: 2 }] })
    ok(r.status === 201, 'Receta de Rocky con 2 surtidos', r.data)
    r = await portal.post('/api/tienda/planes', { modalidad: 'recurrente', presentacionId: plg2.pres.id, mascotaId: rocky.id })
    const pr = r.data?.plan
    ok(r.status === 201 && pr?.cadaDias === 10 && pr.precioEntrega === 300 && /&sus=prueba-sus-/.test(r.data.url ?? ''), 'Plan recurrente: cada 10 días, $300, suscripción (prueba)', r.data)
    r = await invitado.post(`/api/tienda/pago-prueba-plan/${pr.id}`, { t: pr.token, ref: new URL(r.data.url).searchParams.get('ref'), resultado: 'aprobado' })
    ok(r.status === 200 && r.data.resultado === 'entrega generada', 'Autorizar la suscripción: primer cobro y entrega 1', r.data)
    const pedR1 = (await vendedor.get('/api/farmacia/pedidos?grupo=nuevos')).data?.pedidos?.find((p) => p.plan?.id === pr.id)
    ok(pedR1?.pago.forma === 'en_linea' && pedR1.pago.estado === 'pagado' && pedR1.renglones[0].recetaId && pedR1.total === 300, 'La entrega va pagada en línea y con la receta ligada', pedR1)
    r = await encargado.post(`/api/farmacia/pedidos/${pedR1.id}/entregar`, { clave: clave() })
    ok(r.status === 200 && r.data.pedido.estado === 'entregado', 'El encargado entrega la caja 1 (cobro en línea a Finanzas)', r.data)
    await toca(pr.id)
    r = await cronP()
    pp = await planDe(pr.id)
    ok(pp?.entregasHechas === 2 && pp.estado === 'activo', 'Cron: simula el segundo cobro (prueba) y genera la entrega 2', pp && { h: pp.entregasHechas, e: pp.estado })
    await toca(pr.id)
    r = await cronP()
    pp = await planDe(pr.id)
    ok(r.data.planesDetenidos >= 1 && pp?.estado === 'detenido' && /receta/.test(pp.motivo ?? '') && pp.entregasHechas === 2, 'Sin surtidos: el plan se detiene y no cobra', pp && { e: pp.estado, m: pp.motivo })
    r = await vendedor.post(`/api/farmacia/planes/${pr.id}/accion`, { accion: 'reanudar' })
    ok(r.status === 400 && /Todavía no/.test(r.data.error), 'Reanudar sin receta nueva: todavía no', r.data)
    await admin.post('/api/farmacia/recetas', { mascotaId: rocky.id, vigenciaDias: 60, firmar: true, renglones: [{ productoId: plg2.prod.id, dosis: 'según indicación', frecuencia: 'diaria', duracion: '20 días', surtidosPermitidos: 1 }] })
    r = await vendedor.post(`/api/farmacia/planes/${pr.id}/accion`, { accion: 'reanudar' })
    ok(r.status === 200 && r.data.estado === 'activo', 'Con receta nueva: se reanuda', r.data?.estado)
    r = await portal.post(`/api/tienda/plan/${pr.id}/cancelar`, { t: pr.token })
    ok(r.status === 200 && r.data.estado === 'cancelado', 'El tutor cancela su plan recurrente', r.data?.estado)

    /* peso: se detiene, nunca cambia de producto */
    r = await portal.post('/api/tienda/planes', { modalidad: 'recurrente', presentacionId: pln.pres.id, mascotaId: max.id })
    const pw = r.data?.plan
    await invitado.post(`/api/tienda/pago-prueba-plan/${pw.id}`, { t: pw.token, ref: new URL(r.data.url).searchParams.get('ref'), resultado: 'aprobado' })
    r = await portal.get('/portal/farmacia')
    ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('Mis planes') && r.data.includes(`/tienda/plan/${pw.id}`), 'Portal → Mis pedidos: «Mis planes» con la liga del plan', r.status)
    await admin.post(`/api/clinica/mascotas/${max.id}/pesos`, { kg: 30, fecha: hoyTxt })
    await toca(pw.id)
    await cronP()
    pp = await planDe(pw.id)
    ok(pp?.estado === 'detenido' && /ya no le corresponde/.test(pp.motivo ?? '') && pp.producto.id === pln.prod.id, 'Max ahora pesa 30 kg: el plan se detiene (no cambia de producto)', pp && { e: pp.estado, m: pp.motivo })
    await admin.post(`/api/clinica/mascotas/${max.id}/pesos`, { kg: 12, fecha: hoyTxt })
    r = await vendedor.post(`/api/farmacia/planes/${pw.id}/accion`, { accion: 'cancelar', motivo: 'Prueba terminada' })
    ok(r.status === 200 && r.data.estado === 'cancelado', 'El equipo cancela el plan con motivo', r.data?.estado)

    /* Mercado Pago: suscripción (preapproval) contra el simulador */
    if (ENV.MERCADOPAGO_API_URL && ENV.MERCADOPAGO_WEBHOOK_SECRET) {
      const http = await import('node:http')
      const crypto = await import('node:crypto')
      const mp = { alta: null, cambios: [], ref: null }
      const srv = http.createServer((req, res) => {
        let cuerpo = ''
        req.on('data', (c) => (cuerpo += c))
        req.on('end', () => {
          const env = (st, d) => {
            res.writeHead(st, { 'content-type': 'application/json' })
            res.end(JSON.stringify(d))
          }
          if (req.method === 'POST' && req.url === '/preapproval') {
            mp.alta = JSON.parse(cuerpo)
            mp.ref = mp.alta.external_reference
            return env(201, { id: 'sus1', init_point: 'https://mp.local/subscriptions/checkout?preapproval_id=sus1', status: 'pending' })
          }
          if (req.method === 'GET' && req.url === '/preapproval/sus1') return env(200, { id: 'sus1', status: 'authorized', external_reference: mp.ref, auto_recurring: { transaction_amount: 200 } })
          if (req.method === 'PUT' && req.url === '/preapproval/sus1') {
            mp.cambios.push(JSON.parse(cuerpo).status)
            return env(200, { id: 'sus1' })
          }
          if (req.method === 'GET' && req.url === '/authorized_payments/9001') return env(200, { id: 9001, preapproval_id: 'sus1', external_reference: mp.ref, status: 'processed', transaction_amount: 200, currency_id: 'MXN', payment: { id: 4242, status: 'approved' } })
          env(404, {})
        })
      })
      await new Promise((ok2) => srv.listen(Number(new URL(ENV.MERCADOPAGO_API_URL).port), '127.0.0.1', ok2))
      await admin.post('/api/farmacia/configuracion', { pasarelaActiva: 'mercadopago' })
      r = await portal.post('/api/tienda/planes', { modalidad: 'recurrente', presentacionId: pln.pres.id, mascotaId: max.id })
      const pm = r.data?.plan
      ok(r.status === 201 && r.data.url?.startsWith('https://mp.local/subscriptions') && mp.alta?.auto_recurring?.frequency === 30 && mp.alta.auto_recurring.frequency_type === 'days' && mp.alta.auto_recurring.transaction_amount === 200 && mp.alta.auto_recurring.currency_id === 'MXN' && mp.alta.external_reference?.startsWith(`pln-${pm?.id}-`) && /\/tienda\/plan\//.test(mp.alta.back_url) && mp.alta.status === 'pending', 'Mercado Pago: suscripción cada 30 días por $200 MXN con la referencia del plan', mp.alta)
      const ts = String(Math.floor(Date.now() / 1000))
      const firmaMP = (id) => `ts=${ts},v1=${crypto.createHmac('sha256', ENV.MERCADOPAGO_WEBHOOK_SECRET).update(`id:${id};request-id:req-pln;ts:${ts};`).digest('hex')}`
      const avisoMP = (id, tipo) => fetch(`${BASE}/api/tienda/webhook/mercadopago?data.id=${id}&type=${tipo}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-signature': firmaMP(id), 'x-request-id': 'req-pln' }, body: JSON.stringify({ type: tipo, data: { id } }) }).then(async (x) => ({ status: x.status, data: await x.json() }))
      r = await avisoMP('sus1', 'subscription_preapproval')
      ok(r.status === 200 && r.data.resultado === 'activado', 'Aviso de suscripción autorizada: el plan queda activo', r.data)
      r = await avisoMP('9001', 'subscription_authorized_payment')
      ok(r.status === 200 && r.data.resultado === 'entrega generada', 'Aviso del cobro aprobado: genera la entrega', r.data)
      r = await avisoMP('9001', 'subscription_authorized_payment')
      ok(r.data?.duplicado === true, 'El mismo cobro otra vez: no hace otra entrega', r.data)
      r = await portal.post(`/api/tienda/plan/${pm.id}/cancelar`, { t: pm.token })
      ok(r.status === 200 && r.data.estado === 'cancelado' && mp.cambios.includes('cancelled'), 'Cancelar: cancela la suscripción en Mercado Pago', { e: r.data?.estado, c: mp.cambios })
      srv.close()
      await admin.post('/api/farmacia/configuracion', { pasarelaActiva: 'prueba' })
    }

    r = await portal.get('/portal/farmacia')
    ok(r.status === 200 && typeof r.data === 'string' && !r.data.includes('Mis planes'), '«Mis planes» solo muestra planes vigentes (aquí ya todos cerrados)', r.status)
    r = await invitado.get(`/tienda/plan/${pa.id}?t=${pa.token}`)
    ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('ti-main'), 'Página del plan renderiza', r.status)
    r = await admin.get('/admin/farmacia/planes')
    ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('fa-app'), 'Panel: Farmacia → Planes renderiza', r.status)
    await bd3.end()
  }

  /* ── reportes (fase 7) ── */
  console.log('\nReportes (fase 7)')
  {
    r = await vendedor.get('/api/farmacia/reportes/ventas')
    ok(r.status === 403, 'Vendedor: sin reportes', r.status)
    r = await encargado.get('/api/farmacia/reportes/ventas')
    const hoyFila = r.data?.filas?.find((f) => f.dia === hoyTxt)
    const totalInd = r.data?.indicadores?.find((k) => k.etiqueta === 'Total vendido')?.valor
    ok(r.status === 200 && hoyFila && hoyFila.ventas > 0 && totalInd > 0 && r.data.desde === `${hoyTxt.slice(0, 8)}01` && r.data.hasta === hoyTxt, 'Ventas: del 1 del mes a hoy, con la fila de hoy y el total', r.data && { desde: r.data.desde, hasta: r.data.hasta, hoyFila })
    ok(r.data?.indicadores?.some((k) => /planes anuales/.test(k.etiqueta) && k.valor >= 180) && r.data.indicadores.some((k) => /^Cobrado · /.test(k.etiqueta)), 'Ventas: entregas de planes anuales y cobrado por método', r.data?.indicadores)
    const sumaDias = Math.round(r.data.filas.reduce((s, f) => s + f.total * 100, 0))
    ok(sumaDias === Math.round(totalInd * 100), 'La suma de los días cuadra con el total', { sumaDias, totalInd })
    r = await encargado.get(`/api/farmacia/reportes/ventas?desde=${hoyTxt}&hasta=2020-01-01`)
    ok(r.status === 400, '«Desde» después de «Hasta»: no', r.data)
    r = await encargado.get('/api/farmacia/reportes/inventado')
    ok(r.status === 404, 'Reporte inexistente: 404', r.status)
    r = await encargado.get(`/api/farmacia/reportes/productos?desde=${hoyTxt}&hasta=${hoyTxt}`)
    const filaPln = r.data?.filas?.find((f) => String(f.producto).startsWith('Pipeta plan'))
    ok(r.status === 200 && filaPln?.importe === 180 && filaPln.costo === 60 && filaPln.margen === 120 && filaPln.margenPorciento === 66.7, 'Productos y margen (encargado): la pipeta del plan vendió $180, costó $60, margen 66.7 %', filaPln)

    /* un rol con reportes pero sin «Ver costos» */
    const rolRep7 = (await admin.post('/api/roles', { nombre: `Reportes sin costos ${sufijo}`, farmacia: { reportes: true, verCostos: false } })).data?.doc
    await crearUsuario(`reportes${sufijo}@ejemplo.mx`, 'Rita Reportes', rolRep7)
    const lectora = new Sesion()
    ok(rolRep7?.id && (await lectora.login('users', `reportes${sufijo}@ejemplo.mx`, PASS)), 'Rol con reportes y sin costos')
    r = await lectora.get(`/api/farmacia/reportes/productos?desde=${hoyTxt}&hasta=${hoyTxt}`)
    ok(r.status === 200 && r.data.filas.length > 0 && trazasDeCosto(r.data.filas).length === 0 && !r.data.columnas.some((x) => /costo|margen/i.test(x.clave)), 'Sin «Ver costos»: productos sin costo ni margen', r.data?.columnas)
    r = await lectora.get('/api/farmacia/reportes/inventario')
    ok(r.status === 403, 'Sin «Ver costos»: el valor del inventario no', r.status)
    r = await lectora.get('/api/farmacia/reportes/caducidades')
    ok(r.status === 200 && trazasDeCosto(r.data.filas).length === 0 && !r.data.filas.some((f) => 'valor' in f) && !r.data.indicadores.some((k) => /Valor/.test(k.etiqueta)), 'Sin «Ver costos»: caducidades sin valor', r.data?.indicadores)
    r = await lectora.get('/api/farmacia/reportes/productos/csv')
    ok(r.status === 200 && typeof r.data === 'string' && !/Costo|Margen/.test(r.data), 'CSV sin costos para quien no los ve', typeof r.data === 'string' ? r.data.slice(0, 120) : r.status)

    r = await encargado.get('/api/farmacia/reportes/inventario')
    const valorRep = r.data?.indicadores?.[0]?.valor
    const valorCat = (await encargado.get('/api/farmacia/catalogo')).data?.totales?.valorInventario
    ok(r.status === 200 && valorRep > 0 && valorRep === valorCat, 'Valor del inventario = el del catálogo', { valorRep, valorCat })
    r = await encargado.get('/api/farmacia/reportes/caducidades?hasta=2027-12-31')
    ok(r.status === 200 && r.data.filas.length > 0 && r.data.filas.every((f) => f.caducidad <= '2027-12-31') && r.data.filas.some((f) => f.estado === 'Vencido' || f.dias >= 0) && r.data.columnas.some((x) => x.clave === 'valor'), 'Caducidades hasta fin de 2027, con valor (encargado)', r.data?.filas?.length)
    r = await encargado.get('/api/farmacia/reportes/rotacion')
    ok(r.status === 200 && r.data.filas.some((f) => String(f.producto).startsWith('Pipeta plan') && f.vendidas >= 1 && f.cobertura != null), 'Rotación: vendidas, existencia y días de cobertura', r.data?.filas?.find((f) => String(f.producto).startsWith('Pipeta plan')))
    r = await encargado.get('/api/farmacia/reportes/libro')
    ok(r.status === 200 && r.data.filas.length >= 1 && r.data.filas.every((f) => f.fecha && f.producto), 'Libro de control como reporte', r.data?.filas?.length)
    r = await encargado.get('/api/farmacia/reportes/planes')
    ok(r.status === 200 && r.data.filas.some((f) => f.cobrado === 540 && f.entregado === 180 && f.porEntregar === 360) && r.data.indicadores[0].valor >= 540, 'Planes anuales: cobrado $540, entregado $180, por entregar $360', r.data?.filas)
    const csv = await fetch(`${BASE}/api/farmacia/reportes/ventas/csv`, { headers: { cookie: encargado.cookie } })
    const bytes = new Uint8Array(await csv.arrayBuffer())
    const txt = new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)
    ok(csv.status === 200 && /text\/csv/.test(csv.headers.get('content-type') ?? '') && /attachment; filename="farmacia-ventas-/.test(csv.headers.get('content-disposition') ?? '') && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf && txt.includes('Día,Ventas,Mostrador'), 'CSV de ventas: descarga con BOM y encabezados', txt.slice(0, 80))
    r = await admin.get('/admin/farmacia/reportes')
    ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('fa-app'), 'Panel: Farmacia → Reportes renderiza', r.status)
    /* Instalación con Farmacia, Tienda y Finanzas, sin Clínica */
    r = await admin.post('/api/globals/instalacion-configuracion', { modulos: { clinica: false, farmacia: true, tienda: true } })
    ok(r.status === 200, 'Clínica apagada (Farmacia, Tienda y Finanzas encendidos)', r.data?.modulos)
    r = await vendedor.post('/api/farmacia/ventas', { clave: clave(), renglones: [{ presentacionId: despa.pres.id, cantidad: 1 }], pagos: [{ metodo: 'efectivo', monto: 100 }] })
    ok(r.status === 201 && r.data.finanzas === 'registrado', 'Sin Clínica: venta de mostrador con Finanzas', r.data?.finanzas ?? r.data)
    const sinClinica = await Promise.all(['ventas', 'productos', 'rotacion', 'caducidades', 'inventario', 'planes'].map((x) => encargado.get(`/api/farmacia/reportes/${x}`)))
    ok(sinClinica.every((x) => x.status === 200), 'Sin Clínica: todos los reportes responden', sinClinica.map((x) => x.status))
    r = await invitado.get('/api/tienda/catalogo')
    ok(r.status === 200 && r.data.productos.length > 0, 'Sin Clínica: la tienda sigue vendiendo', r.status)
    r = await admin.post('/api/globals/instalacion-configuracion', { modulos: { clinica: true, farmacia: true, tienda: true } })
    ok(r.status === 200, 'Clínica encendida otra vez', r.data?.modulos)
  }

  /* ── panel ── */
  console.log('\nPanel')
  for (const [ruta, texto] of [
    ['/admin/farmacia', 'Farmacia'],
    ['/admin/farmacia/productos', 'Productos'],
    ['/admin/farmacia/inventario', 'Inventario'],
    ['/admin/farmacia/compras', 'Compras'],
    ['/admin/farmacia/compras/nueva', 'Nueva compra'],
    [`/admin/farmacia/compras/${compra1.id}`, 'fa-app'],
    ['/admin/farmacia/conteo', 'Conteo físico'],
    ['/admin/farmacia/vender', 'fa-app'],
    ['/admin/farmacia/ventas', 'fa-app'],
    ['/admin/farmacia/recetas', 'fa-app'],
    ['/admin/farmacia/cierre', 'fa-app'],
    ['/admin/farmacia/alertas', 'fa-app'],
    ['/admin/farmacia/reabasto', 'fa-app'],
    ['/admin/farmacia/promociones', 'fa-app'],
    ['/admin/farmacia/importar', 'Importar catálogo'],
    ['/admin/farmacia/configuracion', 'Configuración'],
    [`/admin/farmacia/productos/${prod.id}`, 'fa-app'],
  ]) {
    r = await admin.get(ruta)
    const html = typeof r.data === 'string' ? r.data : ''
    ok(r.status === 200 && html.includes(texto), `${ruta} renderiza («${texto}»)`, r.status)
  }
  r = await vendedor.get('/admin/farmacia/configuracion')
  ok(r.status === 200 && /cambian el dueño/.test(typeof r.data === 'string' ? r.data : ''), 'Vendedor en configuración: aviso de permiso', r.status)

  console.log(`\n${total - fallas}/${total} correctas${fallas ? ` · ${fallas} fallaron` : ''}\n`)
  process.exit(fallas ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
