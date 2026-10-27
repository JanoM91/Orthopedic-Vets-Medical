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
 */
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
