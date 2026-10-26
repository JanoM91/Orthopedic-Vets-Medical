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

  /* ── panel ── */
  console.log('\nPanel')
  for (const [ruta, texto] of [
    ['/admin/farmacia', 'Farmacia'],
    ['/admin/farmacia/productos', 'Productos'],
    ['/admin/farmacia/inventario', 'Inventario'],
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
