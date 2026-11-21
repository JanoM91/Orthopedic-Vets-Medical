/**
 * Prueba de integración de los PAQUETES con saldo de usos (nov-2026) contra
 * la app corriendo con una base Postgres LOCAL (nunca la de producción).
 *
 *   npm run start
 *   npm run test:clinica          (deja el primer usuario, roles, agenda y sitio publicado)
 *   npm run test:estetica         (deja a Recepción)
 *   npm run test:farmacia         (opcional: con él se prueban también los productos)
 *   node scripts/probarPaquetes.mjs [http://localhost:3000]
 *
 * Crea su propio cliente, mascota, paquetes y tutor (con sufijo), así se puede
 * correr varias veces.
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
  async llamar(metodo, ruta, cuerpo) {
    const headers = {}
    if (this.cookie) headers.cookie = this.cookie
    let body
    if (cuerpo !== undefined) {
      headers['content-type'] = 'application/json'
      body = JSON.stringify(cuerpo)
    }
    const r = await fetch(BASE + ruta, { method: metodo, headers, body, redirect: 'manual' })
    for (const c of r.headers.getSetCookie?.() || []) {
      const [par] = c.split(';')
      if (par.startsWith('payload-token=')) this.cookie = par
    }
    const tipo = r.headers.get('content-type') || ''
    const data = tipo.includes('json') ? await r.json().catch(() => null) : await r.text().catch(() => null)
    return { status: r.status, data }
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
  async login(coleccion, email, password) {
    return (await this.post(`/api/${coleccion}/login`, { email, password })).status === 200
  }
}

const prox = (dow, semanas) => {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() + 7 * semanas)
  while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

async function main() {
  const admin = new Sesion()
  const recepcion = new Sesion()
  console.log('\nArranque')
  ok(await admin.login('users', CORREO, PASS), 'Superadmin entra (corre antes test:clinica)')
  ok(await recepcion.login('users', 'recepcion@ejemplo.mx', PASS), 'Recepción entra (corre antes test:estetica)')
  const sufijo = Date.now().toString().slice(-6)
  const cat = (await admin.get('/api/clinica/agenda/catalogo')).data
  const consulta = cat.servicios.find((s) => s.nombre === 'Consulta general')
  ok(consulta, 'Servicio «Consulta general» del arranque')
  await admin.patch(`/api/servicios/${consulta.id}`, { precio: 400 })

  console.log('\nCatálogo (Clínica → Paquetes)')
  let r = await recepcion.post('/api/paquetes', { nombre: `Rehabilitación ${sufijo}`, contenido: [{ tipo: 'servicio', servicio: consulta.id, cantidad: 2 }], precio: 700 })
  ok(r.status === 403, 'Recepción no arma paquetes (pide «Configurar agenda»)', r.status)
  r = await admin.post('/api/paquetes', { nombre: `Duplicado ${sufijo}`, contenido: [{ tipo: 'servicio', servicio: consulta.id, cantidad: 1 }, { tipo: 'servicio', servicio: consulta.id, cantidad: 1 }], precio: 100 })
  ok(r.status >= 400 && JSON.stringify(r.data).includes('dos veces'), 'Un servicio repetido en el paquete se rechaza', r.data)
  r = await admin.post('/api/paquetes', { nombre: `Rehabilitación ${sufijo}`, descripcion: 'Dos consultas de seguimiento.', contenido: [{ tipo: 'servicio', servicio: consulta.id, cantidad: 2 }], precio: 700, vigenciaDias: 30, enLinea: true })
  const paq = r.data?.doc
  ok(r.status === 201 && paq?.id, 'Superadmin crea «Rehabilitación» (2 consultas, $700, 30 días)', r.data)
  const oculto = (await admin.post('/api/paquetes', { nombre: `Solo mostrador ${sufijo}`, contenido: [{ tipo: 'servicio', servicio: consulta.id, cantidad: 3 }], precio: 900, enLinea: false })).data?.doc
  ok(oculto?.id, 'Otro paquete que no se muestra en línea')

  /* ── venta ── */
  console.log('\nVender')
  r = await recepcion.post('/api/clinica/clientes', { nombre: 'Paula', apellidos: `Paquetes ${sufijo}`, telefono: `228${sufijo}4`, email: `paula${sufijo}@ejemplo.mx` })
  const cli = r.data.cliente
  const luna = (await recepcion.post('/api/clinica/mascotas', { nombre: `Luna ${sufijo}`, especie: 'perro', pesoKg: 12, tutores: [{ clienteId: cli.id, principal: true }] })).data
  ok(cli?.id && luna?.id, 'Cliente y mascota de prueba')
  r = await recepcion.get(`/api/clinica/mascotas/${luna.id}/paquetes`)
  ok(r.status === 200 && r.data.vendidos.length === 0 && r.data.catalogo.some((p) => p.id === paq.id) && r.data.catalogo.some((p) => p.id === oculto.id), 'Expediente → Paquetes: sin vendidos; el catálogo trae los dos', r.data?.catalogo?.map((p) => p.nombre))
  r = await recepcion.post(`/api/clinica/mascotas/${luna.id}/paquetes`, { paqueteId: paq.id })
  const v1 = r.data
  ok(r.status === 201 && v1.estado === 'activo' && v1.precio === 700 && v1.renglones[0].quedan === 2 && v1.vence, 'Recepción vende: activo, $700, quedan 2, con vencimiento', v1)
  r = await admin.get(`/api/paq-vendidos/${v1.id}?depth=0`)
  ok(r.status === 200 && r.data.cargoFinanzas, 'La venta deja su entrada por cobrar en Finanzas', r.data?.cargoFinanzas)
  const cargo = (await admin.get(`/api/finanzas/operaciones/${r.data.cargoFinanzas}`)).data?.operacion
  ok(cargo?.totalCentavos === 70000 && /Paquete/.test(cargo.concepto), 'Entrada de $700 con «Paquete …» en el concepto', cargo && { t: cargo.totalCentavos, c: cargo.concepto })
  r = await recepcion.post('/api/paq-vendidos', { paquete: paq.id, nombre: 'x', mascota: luna.id, precio: 1, fecha: '2026-01-01', renglones: [] })
  ok(r.status === 403, 'La API genérica no crea paquetes vendidos (solo el servicio)', r.status)

  /* ── citas ── */
  console.log('\nCitas ligadas al paquete')
  const dia = prox(2, 2)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: luna.id, servicioId: consulta.id, dia, hora: '10:00', confirmar: true })
  const c1 = r.data
  ok(r.status === 201 && c1.paquete?.id === v1.id, 'Al agendar la consulta, la cita se liga sola al paquete', c1?.paquete)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: luna.id, servicioId: consulta.id, dia, hora: '12:00', confirmar: true, usarPaquete: false })
  const cSin = r.data
  ok(r.status === 201 && cSin.paquete === null, 'Con «no descontar», la cita queda sin paquete', cSin?.paquete)
  r = await recepcion.get(`/api/clinica/mascotas/${luna.id}/paquetes`)
  let s = r.data.vendidos[0].renglones[0]
  ok(s.apartados === 1 && s.quedan === 1, 'La cita aparta un uso: queda 1', s)

  console.log('\nUso sin cita')
  r = await recepcion.post(`/api/clinica/paquetes/${v1.id}/uso`, { renglon: 0, nota: 'sesión sin cita' })
  ok(r.status === 200 && r.data.renglones[0].quedan === 0 && r.data.usos.length === 1 && r.data.usos[0].origen === 'manual', 'Registrar uso a mano: quedan 0', r.data?.renglones)
  r = await recepcion.post(`/api/clinica/paquetes/${v1.id}/uso`, { renglon: 0 })
  ok(r.status === 400 && /apartados/.test(r.data.error), 'Otro uso: no quedan libres (1 apartado por la cita)', r.data)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: luna.id, servicioId: consulta.id, dia, hora: '16:00', confirmar: true })
  ok(r.status === 201 && r.data.paquete === null, 'Sin saldo libre, una cita nueva ya no se liga', r.data?.paquete)
  const c3 = r.data

  console.log('\nFinalizar')
  for (const e of ['llegada', 'atencion']) await recepcion.post(`/api/clinica/agenda/citas/${c1.id}/estado`, { estado: e })
  r = await recepcion.post(`/api/clinica/agenda/citas/${c1.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 200 && r.data.cargoFinanzas === null && r.data.historial.at(-1).detalle?.includes('paquete'), 'Finalizar la cita del paquete: sin cargo y «Descontada del paquete»', r.data && { cargo: r.data.cargoFinanzas, h: r.data.historial.at(-1) })
  r = await recepcion.post(`/api/clinica/agenda/citas/${c1.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 400, 'No se finaliza dos veces', r.status)
  r = await recepcion.get(`/api/clinica/mascotas/${luna.id}/paquetes`)
  const v1b = r.data.vendidos.find((x) => x.id === v1.id)
  ok(v1b.estado === 'agotado' && v1b.renglones[0].usados === 2 && v1b.renglones[0].apartados === 0 && v1b.usos.some((u) => u.origen === 'cita' && u.cita === c1.folio), 'Paquete agotado: 2 usos (cita y a mano)', v1b)
  for (const e of ['llegada', 'atencion']) await recepcion.post(`/api/clinica/agenda/citas/${cSin.id}/estado`, { estado: e })
  r = await recepcion.post(`/api/clinica/agenda/citas/${cSin.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 200 && r.data.cargoFinanzas, 'La cita sin paquete se cobra como siempre', r.data?.cargoFinanzas)
  await recepcion.post(`/api/clinica/agenda/citas/${c3.id}/estado`, { estado: 'cancelada', motivo: 'prueba' })

  console.log('\nCancelar')
  r = await recepcion.post(`/api/clinica/paquetes/${v1.id}/cancelar`, { motivo: 'prueba de cancelación' })
  ok(r.status === 400 && /usos/.test(r.data.error), 'Con usos no se puede cancelar', r.data)
  const v2 = (await recepcion.post(`/api/clinica/mascotas/${luna.id}/paquetes`, { paqueteId: oculto.id })).data
  r = await recepcion.post(`/api/clinica/paquetes/${v2.id}/cancelar`, { motivo: 'no' })
  ok(r.status === 400, 'El motivo es obligatorio (5 caracteres)', r.status)
  r = await recepcion.post(`/api/clinica/paquetes/${v2.id}/cancelar`, { motivo: 'el cliente cambió de opinión' })
  ok(r.status === 200 && r.data.estado === 'cancelado', 'Sin usos se cancela', r.data?.estado)
  const cargo2 = (await admin.get(`/api/paq-vendidos/${v2.id}?depth=0`)).data?.cargoFinanzas
  r = await admin.get(`/api/finanzas/operaciones/${cargo2}`)
  ok(r.data?.operacion?.anulada === true, 'Su entrada en Finanzas queda anulada', r.data?.operacion && { anulada: r.data.operacion.anulada })
  r = await recepcion.post(`/api/clinica/paquetes/${v2.id}/uso`, { renglon: 0 })
  ok(r.status === 400 && /cancelado/.test(r.data.error), 'Un paquete cancelado no se usa', r.data)

  /* ── estética: precio por talla y adicionales ── */
  console.log('\nEstética por talla')
  const bano = cat.servicios.find((x) => x.nombre === 'Baño')
  const adicional = ((await admin.get('/api/est-adicionales?where[activo][equals]=true&depth=0&limit=1')).data?.docs ?? [])[0]
  if (!bano?.estetica || !adicional) {
    console.log('  · (sin estética configurada: corre antes test:estetica)')
  } else {
    const pBano = (await admin.post('/api/paquetes', { nombre: `Baño mensual ${sufijo}`, contenido: [{ tipo: 'servicio', servicio: bano.id, cantidad: 4 }], precio: 0, preciosTalla: { chico: 800, mediano: 1000, grande: 1300 }, vigenciaDias: 120, enLinea: true })).data?.doc
    ok(pBano?.id, 'Paquete de estética con precio por talla')
    const sinTalla = (await recepcion.post('/api/clinica/mascotas', { nombre: `Sin talla ${sufijo}`, especie: 'perro', tutores: [{ clienteId: cli.id, principal: true }] })).data
    r = await recepcion.post(`/api/clinica/mascotas/${sinTalla.id}/paquetes`, { paqueteId: pBano.id })
    ok(r.status === 400 && /talla/.test(r.data.error), 'Sin talla no se vende un paquete por talla', r.data)
    r = await recepcion.post(`/api/clinica/mascotas/${luna.id}/paquetes`, { paqueteId: pBano.id })
    const vb = r.data
    ok(r.status === 201 && vb.precio === 1000 && /mediana/i.test(vb.talla ?? ''), 'Luna (12 kg, mediana) paga $1,000', vb && { p: vb.precio, t: vb.talla })
    r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: luna.id, servicioId: bano.id, dia: prox(4, 2), hora: '11:00', confirmar: true, adicionales: [adicional.id] })
    const cb = r.data
    ok(r.status === 201 && cb.paquete?.id === vb.id, 'El baño se liga al paquete', cb?.paquete ?? r.data)
    for (const e of ['llegada', 'atencion']) await recepcion.post(`/api/clinica/agenda/citas/${cb.id}/estado`, { estado: e })
    r = await recepcion.post(`/api/clinica/agenda/citas/${cb.id}/estado`, { estado: 'finalizada' })
    const op = r.data?.cargoFinanzas ? (await admin.get(`/api/finanzas/operaciones/${r.data.cargoFinanzas}`)).data?.operacion : null
    ok(r.status === 200 && op?.totalCentavos === Math.round(adicional.precio * 100) && op.concepto.includes(adicional.nombre), 'Al finalizar solo se cobra el adicional, no el baño', op && { t: op.totalCentavos, c: op.concepto })
    r = await recepcion.get(`/api/clinica/mascotas/${luna.id}/paquetes`)
    ok(r.data.vendidos.find((x) => x.id === vb.id)?.renglones[0].quedan === 3, 'Quedan 3 baños', r.data.vendidos.find((x) => x.id === vb.id)?.renglones)
  }

  /* ── portal ── */
  console.log('\nApp del cliente')
  const codigo = (await recepcion.post(`/api/clinica/clientes/${cli.id}/codigo`)).data?.codigo
  const tutor = new Sesion()
  const correoT = `paula.portal${sufijo}@ejemplo.mx`
  await tutor.post('/api/tutores', { email: correoT, password: PASS, nombre: 'Paula (portal)' })
  await tutor.login('tutores', correoT, PASS)
  await tutor.post('/api/clinica/portal/vincular', { codigo })
  await tutor.login('tutores', correoT, PASS)
  r = await tutor.get('/api/clinica/portal/paquetes')
  ok(r.status === 200 && r.data.catalogo.some((p) => p.id === paq.id) && !r.data.catalogo.some((p) => p.id === oculto.id), 'Portal: solo los paquetes en línea', r.data?.catalogo?.map((p) => p.nombre))
  ok(r.data.mios.some((x) => x.id === v1.id && x.estado === 'agotado') && !r.data.mios.some((x) => x.id === v2.id) && r.data.mios.every((x) => x.usos === null), 'Portal: sus paquetes (sin los cancelados ni los usos internos)', r.data?.mios)
  r = await tutor.post('/api/clinica/portal/paquetes/solicitar', { paqueteId: paq.id, mascotaId: luna.id, nota: 'para su rodilla' })
  const sol = r.data
  ok(r.status === 201 && /^SOL-/.test(sol.folio), 'Portal: «Lo quiero» deja una solicitud', r.data)
  r = await tutor.post('/api/clinica/portal/paquetes/solicitar', { paqueteId: paq.id, mascotaId: luna.id })
  ok(r.status === 201 && r.data.folio === sol.folio, 'Pedirlo otra vez devuelve la misma solicitud', r.data)
  r = await tutor.post('/api/clinica/portal/paquetes/solicitar', { paqueteId: oculto.id, mascotaId: luna.id })
  ok(r.status === 400, 'Un paquete que no está en línea no se pide desde la app', r.status)
  const solId = Number(sol.folio.slice(4))
  r = await admin.get(`/api/solicitudes/${solId}?depth=0`)
  ok(r.data?.paquete === paq.id && r.data.mascotaFicha === luna.id && r.data.cliente === cli.id && r.data.servicioNombre?.startsWith('Paquete:'), 'La solicitud trae paquete, cliente y mascota', r.data && { p: r.data.paquete, m: r.data.mascotaFicha, s: r.data.servicioNombre })
  r = await recepcion.post(`/api/clinica/mascotas/${luna.id}/paquetes`, { paqueteId: paq.id, solicitudId: solId })
  const v3 = r.data
  ok(r.status === 201 && v3.renglones[0].quedan === 2, 'Recepción vende el paquete de la solicitud', r.status)
  r = await admin.get(`/api/solicitudes/${solId}?depth=0`)
  ok(r.data?.estado === 'vendida', 'La solicitud queda «Paquete vendido»', r.data?.estado)

  /* ── sitio ── */
  console.log('\nSitio público')
  r = await fetch(`${BASE}/paquetes`)
  let h = await r.text()
  ok(r.status === 200 && h.includes(paq.nombre) && !h.includes(oculto.nombre) && h.includes(`/reservar?paquete=${paq.id}`), '/paquetes muestra los paquetes en línea con «Lo quiero»', r.status)
  h = await (await fetch(`${BASE}/`)).text()
  ok(h.includes('st-paquetes') && h.includes(paq.nombre), 'La portada trae la sección de paquetes')
  h = await (await fetch(`${BASE}/reservar?paquete=${paq.id}`)).text()
  ok(h.includes('Pide tu paquete') && h.includes(paq.nombre), '/reservar?paquete= arma la solicitud del paquete')
  const visitante = new Sesion()
  r = await visitante.post('/api/sitio/solicitudes', { nombre: 'Visitante Paquete', whatsapp: `229${sufijo}8`, mascota: 'Toby', especie: 'perro', paqueteId: paq.id, privacidad: true })
  ok(r.status === 201, 'Un visitante pide el paquete sin cuenta', r.data)
  r = await admin.get(`/api/solicitudes/${Number(r.data.folio.slice(4))}?depth=0`)
  ok(r.data?.paquete === paq.id && r.data.servicioNombre === `Paquete: ${paq.nombre}`, 'Su solicitud dice qué paquete pidió', r.data && { p: r.data.paquete, s: r.data.servicioNombre })
  r = await visitante.post('/api/sitio/solicitudes', { nombre: 'Visitante Oculto', whatsapp: `229${sufijo}9`, mascota: 'Toby', especie: 'perro', paqueteId: oculto.id, privacidad: true })
  ok(r.status === 400, 'Un paquete que no está en línea no se pide desde el sitio', r.status)

  /* ── productos (con test:farmacia) ── */
  console.log('\nProductos de la farmacia')
  const modulos = (await admin.get('/api/globals/instalacion-configuracion')).data?.modulos ?? {}
  const lotes = modulos.farmacia ? (await admin.get('/api/far-lotes?where[existencia][greater_than]=2&where[bloqueado][not_equals]=true&depth=1&limit=100')).data?.docs ?? [] : []
  const libre = lotes.find((l) => l.producto && typeof l.producto === 'object' && ['III', 'desregulado'].includes(l.producto.grupo) && l.producto.activo !== false)
  if (!libre) {
    console.log('  · (sin farmacia con existencias: se omiten los productos; corre antes test:farmacia)')
  } else {
    const pres = (await admin.get(`/api/far-presentaciones?where[producto][equals]=${libre.producto.id}&where[factor][equals]=1&depth=0&limit=1`)).data?.docs?.[0] ?? (await admin.get(`/api/far-presentaciones?where[producto][equals]=${libre.producto.id}&depth=0&limit=1`)).data?.docs?.[0]
    ok(pres?.titulo === `${libre.producto.nombre} · ${pres?.nombre}`, 'La presentación se ve como «Producto · presentación»', pres?.titulo)
    const controlado = (await admin.get('/api/far-productos?where[grupo][equals]=II&depth=0&limit=1')).data?.docs?.[0]
    const presII = controlado ? (await admin.get(`/api/far-presentaciones?where[producto][equals]=${controlado.id}&depth=0&limit=1`)).data?.docs?.[0] : null
    if (presII) {
      const pII = (await admin.post('/api/paquetes', { nombre: `Con receta ${sufijo}`, contenido: [{ tipo: 'producto', presentacion: presII.id, cantidad: 1 }], precio: 100 })).data?.doc
      r = await recepcion.get(`/api/clinica/mascotas/${luna.id}/paquetes`)
      ok(pII?.id && !r.data.catalogo.some((p) => p.id === pII.id), 'Un paquete con Grupo II no se ofrece para vender', r.data?.catalogo?.map((p) => p.nombre))
      r = await recepcion.post(`/api/clinica/mascotas/${luna.id}/paquetes`, { paqueteId: pII.id })
      ok(r.status === 400, 'Ni se puede vender por la API', r.status)
    }
    const pProd = (await admin.post('/api/paquetes', { nombre: `Cuidado en casa ${sufijo}`, contenido: [{ tipo: 'servicio', servicio: consulta.id, cantidad: 1 }, { tipo: 'producto', presentacion: pres.id, cantidad: 2 }], precio: 500, enLinea: true })).data?.doc
    const v4 = (await recepcion.post(`/api/clinica/mascotas/${luna.id}/paquetes`, { paqueteId: pProd.id })).data
    ok(v4?.renglones?.[1]?.tipo === 'producto' && v4.renglones[1].quedan === 2, 'Paquete con producto vendido: quedan 2 piezas', v4?.renglones)
    const existencia = async () => (await admin.get(`/api/far-lotes?where[producto][equals]=${libre.producto.id}&depth=0&limit=200`)).data?.docs?.reduce((a, l) => a + Number(l.existencia), 0)
    const antes = await existencia()
    r = await admin.post(`/api/clinica/paquetes/${v4.id}/entrega`, { renglon: 1, cantidad: 1 })
    ok(r.status === 200 && r.data.renglones[1].quedan === 1 && r.data.renglones[1].usados === 1, 'Entregar 1 pieza: queda 1', r.data?.renglones?.[1] ?? r.data)
    const uso = r.data?.usos?.find((u) => u.origen === 'entrega')
    const venta = uso?.venta ? (await admin.get(`/api/far-ventas/${uso.venta}?depth=0`)).data : null
    ok(venta && Number(venta.total) === 0, 'La entrega es una venta de mostrador en cero', venta && { total: venta.total })
    const despues = await existencia()
    ok(Math.abs(antes - despues - Number(pres.factor)) < 0.001, 'El inventario baja una pieza (kardex, lote que caduca primero)', { antes, despues, factor: pres.factor })
    r = await admin.post(`/api/clinica/paquetes/${v4.id}/entrega`, { renglon: 1, cantidad: 5 })
    ok(r.status === 400 && /quedan/.test(r.data.error), 'No se entrega más de lo que queda', r.data)
    r = await admin.post(`/api/clinica/paquetes/${v4.id}/uso`, { renglon: 1 })
    ok(r.status === 400 && /Entregar/.test(r.data.error), 'Un producto no se «usa»: se entrega', r.data)
  }

  console.log(`\n${total - fallas}/${total} correctas`)
  process.exit(fallas ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
