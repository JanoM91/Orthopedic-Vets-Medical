/**
 * Prueba de integración del módulo de Estética (nov-2026) contra la app
 * corriendo con una base Postgres LOCAL (nunca la de producción).
 *
 *   npm run start
 *   npm run test:clinica          (deja el primer usuario, roles, agenda y sitio publicado)
 *   node scripts/probarEstetica.mjs [http://localhost:3000]
 *
 * Enciende el módulo «estetica» y lo deja encendido. Crea su propio cliente,
 * mascotas y tutor del portal (con sufijo), así se puede correr varias veces.
 */
import fs from 'node:fs'

const BASE = process.argv[2] || 'http://localhost:3000'
/* CRON_SECRET de .env (recordatorio «¿ya le toca su baño?», E3). */
const ENV = Object.fromEntries(
  (fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '')
    .split('\n')
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
)
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
    if (cuerpo instanceof FormData) body = cuerpo
    else if (cuerpo !== undefined) {
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

const sumarMin = (h, m) => {
  const t = Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) + m
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

async function main() {
  const admin = new Sesion()
  console.log('\nArranque')
  ok(await admin.login('users', CORREO, PASS), 'Superadmin entra (corre antes test:clinica)')
  const roles = (await admin.get('/api/roles?limit=50&depth=0')).data?.docs ?? []
  const rolRec = roles.find((x) => x.nombre === 'Recepción')
  if (!(await admin.get(`/api/users?where[email][equals]=${encodeURIComponent('recepcion@ejemplo.mx')}&depth=0`)).data?.docs?.[0]) await admin.post('/api/users', { email: 'recepcion@ejemplo.mx', password: PASS, name: 'Sofía Recepción', rolDeAcceso: rolRec.id })
  const recepcion = new Sesion()
  ok(await recepcion.login('users', 'recepcion@ejemplo.mx', PASS), 'Recepción entra')
  let cat = (await admin.get('/api/clinica/agenda/catalogo')).data
  if (!cat.servicios.length) {
    await admin.post('/api/clinica/agenda/arranque')
    cat = (await admin.get('/api/clinica/agenda/catalogo')).data
  }
  const bano = cat.servicios.find((s) => s.nombre === 'Baño')
  ok(bano && bano.recursoPorDefecto, 'Servicio «Baño» del arranque de la agenda', bano)
  const sufijo = Date.now().toString().slice(-6)

  /* ── módulo apagado ── */
  console.log('\nMódulo apagado (por omisión en instalaciones nuevas)')
  const modulos = (await admin.get('/api/globals/instalacion-configuracion')).data?.modulos ?? {}
  await admin.post('/api/globals/instalacion-configuracion', { modulos: { ...modulos, estetica: false } })
  cat = (await recepcion.get('/api/clinica/agenda/catalogo')).data
  ok(cat.estetica?.activa === false && cat.servicios.every((s) => s.estetica === false), 'Apagado: la agenda no cotiza por talla', cat.estetica)
  r = await admin.post('/api/est-adicionales', { nombre: `Prueba apagado ${sufijo}`, precio: 10 })
  ok(r.status === 403, 'Apagado: adicionales responden 403 incluso al superadmin', r.status)

  console.log('\nEncender y configurar')
  r = await recepcion.post('/api/globals/instalacion-configuracion', { modulos: { ...modulos, estetica: true } })
  ok(r.status === 403, 'Solo el superadmin enciende módulos', r.status)
  r = await admin.post('/api/globals/instalacion-configuracion', { modulos: { ...modulos, estetica: true } })
  ok(r.status === 200 && r.data.result?.modulos?.estetica === true, 'Superadmin enciende Estética', r.data?.result?.modulos)
  r = await recepcion.post('/api/globals/estetica-configuracion', { nombreMarca: 'X' })
  ok(r.status === 403, 'Recepción no configura la estética', r.status)
  const marca = `Estética de prueba ${sufijo}`
  r = await admin.post('/api/globals/estetica-configuracion', { nombreMarca: marca, tallas: { chicoHasta: 10, medianoHasta: 25, grandeHasta: 40 } })
  ok(r.status === 200, 'Nombre de la estética y tallas por peso', r.data)
  r = await admin.patch(`/api/servicios/${bano.id}`, { estetica: true, precio: null, preciosTalla: { chico: 250, mediano: 350, grande: 450, gigante: 550 }, duracionTalla: { chico: 60, mediano: 90, grande: 120, gigante: 150 } })
  ok(r.status === 200, '«Baño» de estética: precio y duración por talla', r.data?.errors)
  r = await recepcion.post('/api/est-adicionales', { nombre: `Uñas ${sufijo}`, precio: 80 })
  ok(r.status === 403, 'Recepción no crea adicionales', r.status)
  const unas = (await admin.post('/api/est-adicionales', { nombre: `Corte de uñas ${sufijo}`, precio: 80, duracionMin: 15, enLinea: true, orden: 1 })).data?.doc
  const deslanado = (await admin.post('/api/est-adicionales', { nombre: `Deslanado ${sufijo}`, precio: 150, duracionMin: 30, enLinea: false, orden: 2 })).data?.doc
  ok(unas?.id && deslanado?.id, 'Adicionales: uñas (en línea) y deslanado (solo en la clínica)')
  cat = (await recepcion.get('/api/clinica/agenda/catalogo')).data
  const banoV = cat.servicios.find((s) => s.id === bano.id)
  ok(cat.estetica.activa && cat.estetica.nombre === marca && cat.estetica.adicionales.some((a) => a.id === deslanado.id) && banoV.estetica && banoV.precioDesde === 250 && banoV.preciosTalla?.gigante === 550, 'Catálogo: estética activa, adicionales y «desde $250»', { e: cat.estetica, b: banoV })

  /* ── mascotas ── */
  r = await recepcion.post('/api/clinica/clientes', { nombre: 'Rebeca', apellidos: `Estética ${sufijo}`, telefono: `229${sufijo}7`, email: `rebeca${sufijo}@ejemplo.mx` })
  const cli = r.data.cliente
  const mascota = async (d) => (await recepcion.post('/api/clinica/mascotas', { especie: 'perro', tutores: [{ clienteId: cli.id, principal: true }], ...d })).data
  const chispa = await mascota({ nombre: `Chispa ${sufijo}`, pesoKg: 8 })
  const bruno = await mascota({ nombre: `Bruno ${sufijo}`, pesoKg: 18 })
  const nube = await mascota({ nombre: `Nube ${sufijo}` })
  const oso = await mascota({ nombre: `Oso ${sufijo}`, pesoKg: 8, tallaEstetica: 'grande' })
  ok(chispa?.id && bruno?.id && nube?.id && oso?.tallaEstetica === 'grande', 'Mascotas: 8 kg, 18 kg, sin peso y una con talla fijada', { oso: oso?.tallaEstetica })
  r = await recepcion.get('/api/clinica/catalogo')
  ok(r.data?.estetica?.activa === true && r.data.estetica.nombre === marca, 'El catálogo de la clínica sabe que hay estética (talla en el formulario)', r.data?.estetica)

  console.log('\nCotizar por talla')
  const cot = (s, m, ads = []) => s.get(`/api/clinica/agenda/cotizar?servicio=${bano.id}&mascota=${m}${ads.length ? `&adicionales=${ads.join(',')}` : ''}`)
  r = await cot(recepcion, chispa.id)
  ok(r.status === 200 && r.data.talla === 'chico' && r.data.origenTalla === 'peso' && r.data.total === 250 && r.data.duracionMin === 60, '8 kg: chica, $250, 60 min', r.data)
  r = await cot(recepcion, chispa.id, [unas.id])
  ok(r.data?.total === 330 && r.data.duracionMin === 75 && r.data.adicionales.length === 1, '+ uñas: $330 y 75 min', r.data)
  r = await cot(recepcion, bruno.id, [unas.id, deslanado.id])
  ok(r.data?.talla === 'mediano' && r.data.total === 580 && r.data.duracionMin === 135, '18 kg + uñas + deslanado: mediana, $580, 135 min', r.data)
  r = await cot(recepcion, nube.id)
  ok(r.data?.talla === null && r.data.total === null && r.data.duracionMin === bano.duracionMin, 'Sin peso: talla y precio por confirmar, duración del servicio', r.data)
  r = await cot(recepcion, oso.id)
  ok(r.data?.talla === 'grande' && r.data.origenTalla === 'fijada' && r.data.total === 450, 'Talla fijada a mano manda sobre el peso', r.data)
  r = await recepcion.get(`/api/clinica/agenda/cotizar?servicio=${cat.servicios.find((s) => s.nombre === 'Consulta general').id}&mascota=${chispa.id}`)
  ok(r.status === 400, 'Un servicio que no es de estética no se cotiza por talla', r.data)

  console.log('\nAgendar y cobrar')
  const prox = (dow, semanas) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 7 * semanas); while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
  const dia = prox(3, 3)
  r = await recepcion.get(`/api/clinica/agenda/disponibilidad?servicio=${bano.id}&dia=${dia}&mascota=${bruno.id}&adicionales=${unas.id}`)
  ok(r.status === 200 && r.data.duracionMin === 105, 'Disponibilidad con la duración de la talla y los adicionales (105 min)', r.data?.duracionMin)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: bruno.id, servicioId: bano.id, dia, hora: '09:00', confirmar: true, adicionales: [unas.id] })
  const cBruno = r.data
  ok(r.status === 201 && cBruno.horaFin === sumarMin('09:00', 105) && cBruno.estetica?.talla === 'mediano' && cBruno.estetica.total === 430 && cBruno.estetica.adicionales[0]?.nombre === unas.nombre, 'Cita de Bruno: 105 min, talla mediana, $430 pactados', cBruno)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: chispa.id, servicioId: bano.id, dia, hora: '10:00', confirmar: true })
  ok(r.status === 409, 'Choca con la cita de Bruno (que dura hasta las 10:45)', r.status)
  /* el precio cambia después de agendar: se cobra lo pactado */
  await admin.patch(`/api/servicios/${bano.id}`, { preciosTalla: { chico: 250, mediano: 400, grande: 450, gigante: 550 } })
  for (const e of ['llegada', 'atencion']) await recepcion.post(`/api/clinica/agenda/citas/${cBruno.id}/estado`, { estado: e })
  r = await recepcion.post(`/api/clinica/agenda/citas/${cBruno.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 200 && r.data.cargoFinanzas, 'Finalizar genera el cargo', r.data)
  r = await admin.get(`/api/finanzas/operaciones/${r.data.cargoFinanzas}`)
  ok(r.data?.operacion?.totalCentavos === 43000 && /talla mediana/.test(r.data.operacion.concepto) && r.data.operacion.concepto.includes(unas.nombre), 'Cargo de $430 (lo pactado, aunque el precio subió), con talla y adicional en el concepto', r.data?.operacion && { t: r.data.operacion.totalCentavos, c: r.data.operacion.concepto })
  await admin.patch(`/api/servicios/${bano.id}`, { preciosTalla: { chico: 250, mediano: 350, grande: 450, gigante: 550 } })

  /* sin peso: se agenda, y para cobrar hace falta la talla */
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: nube.id, servicioId: bano.id, dia, hora: '12:00', confirmar: true })
  const cNube = r.data
  ok(r.status === 201 && cNube.estetica?.talla === null && cNube.estetica.total === null, 'Nube sin peso: cita con precio por confirmar', cNube?.estetica)
  for (const e of ['llegada', 'atencion']) await recepcion.post(`/api/clinica/agenda/citas/${cNube.id}/estado`, { estado: e })
  r = await recepcion.post(`/api/clinica/agenda/citas/${cNube.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 400 && /talla/.test(r.data.error), 'Sin talla no se puede cobrar la estética: pide peso o talla', r.data)
  await recepcion.post(`/api/clinica/mascotas/${nube.id}/pesos`, { kg: 30, fecha: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date()) })
  r = await recepcion.post(`/api/clinica/agenda/citas/${cNube.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 200 && r.data.estetica?.talla === 'grande' && r.data.estetica.total === 450 && r.data.cargoFinanzas, 'Con su peso (30 kg): grande, $450 y cargo', r.data?.estetica)

  console.log('\nPortal del tutor')
  const codigo = (await recepcion.post(`/api/clinica/clientes/${cli.id}/codigo`)).data?.codigo
  const tutor = new Sesion()
  const correoT = `rebeca.portal${sufijo}@ejemplo.mx`
  await tutor.post('/api/tutores', { email: correoT, password: PASS, nombre: 'Rebeca (portal)' })
  await tutor.login('tutores', correoT, PASS)
  await tutor.post('/api/clinica/portal/vincular', { codigo })
  await tutor.login('tutores', correoT, PASS)
  r = await tutor.get('/api/clinica/portal/citas')
  ok(r.status === 200 && r.data.estetica?.activa && r.data.estetica.adicionales.some((a) => a.id === unas.id) && !r.data.estetica.adicionales.some((a) => a.id === deslanado.id), 'Portal: solo los adicionales «en línea»', r.data?.estetica?.adicionales?.map((a) => a.nombre))
  const pcot = (m, ads = []) => tutor.get(`/api/clinica/portal/citas/cotizar?servicio=${bano.id}&mascota=${m}${ads.length ? `&adicionales=${ads.join(',')}` : ''}`)
  r = await pcot(chispa.id, [unas.id])
  ok(r.status === 200 && r.data.total === 330, 'Portal: cotiza su mascota con uñas ($330)', r.data)
  r = await pcot(chispa.id, [deslanado.id])
  ok(r.status === 400, 'Portal: el deslanado no se pide en línea', r.data)
  const ajena = (await recepcion.post('/api/clinica/clientes', { nombre: 'Otro', apellidos: `Tutor ${sufijo}`, telefono: `231${sufijo}5`, forzar: true })).data?.cliente
  const ajenaM = (await recepcion.post('/api/clinica/mascotas', { nombre: `Ajena ${sufijo}`, especie: 'perro', pesoKg: 5, tutores: [{ clienteId: ajena.id, principal: true }] })).data
  r = await pcot(ajenaM.id)
  ok(r.status === 404, 'Portal: no cotiza una mascota ajena', r.status)
  r = await tutor.get(`/api/clinica/portal/citas/calendario?servicio=${bano.id}&desde=${dia}&hasta=${dia}&mascota=${ajenaM.id}`)
  ok(r.status === 404, 'Portal: el calendario tampoco acepta una mascota ajena', r.status)
  r = await tutor.post('/api/clinica/portal/citas', { mascotaId: chispa.id, servicioId: bano.id, dia, hora: '15:00', adicionales: [unas.id] })
  ok(r.status === 201 && r.data.estado === 'solicitada' && r.data.estetica?.total === 330 && r.data.horaFin === '16:15', 'Portal: pide baño de Chispa con uñas ($330, 75 min)', r.data)
  r = await tutor.post('/api/clinica/portal/citas', { mascotaId: chispa.id, servicioId: bano.id, dia, hora: '17:00', adicionales: [deslanado.id] })
  ok(r.status === 400, 'Portal: con un adicional solo de la clínica, no', r.status)
  r = await tutor.get('/portal/servicios')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('desde $250'), 'Portal → Servicios: «desde $250»', r.status)
  r = await tutor.get('/portal/citas/nueva')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes(marca), 'Pedir cita: la estética con su nombre', r.status)

  console.log('\nTablero del día y ficha (E2)')
  r = await admin.get(`/api/clinica/estetica?dia=${dia}`)
  const faltabaRoles = r.data?.faltaRoles
  r = await admin.post('/api/clinica/estetica/arranque')
  ok(r.status === 200 && Array.isArray(r.data.hecho), 'Preparar roles de estética (se puede repetir)', r.data)
  r = await admin.get(`/api/clinica/estetica?dia=${dia}`)
  ok(r.status === 200 && r.data.faltaRoles === false && (faltabaRoles === true || r.data.tarjetas), '«Preparar roles» ya no hace falta después del arranque', { antes: faltabaRoles, despues: r.data?.faltaRoles })
  const rolesE = (await admin.get('/api/roles?limit=50&depth=0')).data.docs
  const rolEst = rolesE.find((x) => x.nombre === 'Estilista')
  ok(rolEst?.clinica?.estetica && !rolEst.clinica.agenda && !rolEst.clinica.verExpediente && rolesE.find((x) => x.nombre === 'Recepción')?.clinica?.estetica, 'Rol «Estilista»: estética, sin agenda ni expediente; Recepción también tiene estética', rolEst?.clinica)
  if (!(await admin.get(`/api/users?where[email][equals]=${encodeURIComponent('estilista@ejemplo.mx')}&depth=0`)).data?.docs?.[0]) await admin.post('/api/users', { email: 'estilista@ejemplo.mx', password: PASS, name: 'Lupita Estilista', rolDeAcceso: rolEst.id })
  const estilista = new Sesion()
  ok(await estilista.login('users', 'estilista@ejemplo.mx', PASS), 'La estilista entra')
  r = await estilista.get(`/api/clinica/agenda?dia=${dia}`)
  ok(r.status === 403, 'La estilista no ve la agenda completa', r.status)
  const medico = new Sesion()
  if (await medico.login('users', 'medico@ejemplo.mx', PASS)) {
    r = await medico.get(`/api/clinica/estetica?dia=${dia}`)
    ok(r.status === 403, 'El médico (sin «Estética») no entra al tablero', r.status)
  }
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: oso.id, servicioId: bano.id, dia, hora: '16:30', confirmar: true })
  const cOso = r.data
  ok(r.status === 201 && cOso.estetica?.talla === 'grande' && cOso.horaFin === '18:30', 'Cita de Oso (grande, 120 min)', cOso?.estetica)
  r = await estilista.get(`/api/clinica/estetica?dia=${dia}`)
  const tarj = (id) => r.data?.tarjetas?.find((x) => x.cita.id === id)
  ok(r.status === 200 && r.data.marca === marca && tarj(cOso.id)?.etapa === 'por_llegar' && tarj(cBruno.id)?.etapa === 'entregada' && !r.data.tarjetas.some((x) => x.cita.servicio.nombre === 'Consulta general'), 'Tablero: solo citas de estética, por etapa', r.data?.tarjetas?.map((x) => [x.cita.mascota.nombre, x.etapa]))
  const mover = (id, a) => estilista.post(`/api/clinica/estetica/citas/${id}/mover`, { a })
  r = await mover(cOso.id, 'bano')
  ok(r.status === 400 && /recíbela/i.test(r.data.error), 'No pasa a baño sin recibirla', r.data)
  r = await mover(cOso.id, 'recibida')
  ok(r.status === 200 && r.data.etapa === 'recibida' && r.data.cita.estado === 'llegada', 'Recibir: registra la llegada', r.data?.etapa)
  r = await mover(cOso.id, 'bano')
  ok(r.status === 200 && r.data.etapa === 'bano' && r.data.cita.estado === 'atencion', 'A baño: la cita queda en atención', r.data?.etapa)
  r = await estilista.get(`/api/clinica/estetica/citas/${cOso.id}/ficha`)
  ok(r.status === 200 && r.data.opciones.hallazgos.length >= 8 && r.data.fotos.length === 0, 'Ficha vacía con sus opciones', r.data?.opciones?.hallazgos?.length)
  r = await estilista.post(`/api/clinica/estetica/citas/${cOso.id}/ficha`, { queSeHizo: ['bano', 'unas'], comportamiento: 'bozal', hallazgos: ['pulgas', 'otro'] })
  ok(r.status === 400 && /Detalle/.test(r.data.error), '«Otro» sin detalle: pide escribirlo', r.data)
  r = await estilista.post(`/api/clinica/estetica/citas/${cOso.id}/ficha`, { queSeHizo: ['bano', 'unas'], corte: 'Solo baño', comportamiento: 'bozal', hallazgos: ['pulgas', 'otro'], hallazgosNota: 'Bulto pequeño en el costado', notaTutor: 'Se portó muy bien después del bozal.', notaInterna: 'Usar bozal desde el inicio', proximaSemanas: 4 })
  ok(r.status === 200 && r.data.hallazgos.includes('pulgas') && r.data.proximaSemanas === 4 && r.data.realizadoPor === 'Lupita Estilista', 'Ficha guardada (hallazgos, notas y próximo baño)', r.data)
  r = await recepcion.get(`/api/clinica/mascotas/${oso.id}`)
  ok((r.data?.mascota?.alertasManejo ?? []).some((x) => x === `${marca}: necesitó bozal`), '«Necesitó bozal» queda como alerta de manejo', r.data?.mascota?.alertasManejo)
  const jpeg = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=', 'base64')
  const subirFoto = (momento) => {
    const fd = new FormData()
    /* De tamaño real (300 KB): el tope de texto de Payload rechazaba más de ~30 KB (17-nov-2026). */
    fd.append('archivo', new Blob([jpeg, crypto.getRandomValues(new Uint8Array(65536)), crypto.getRandomValues(new Uint8Array(65536)), crypto.getRandomValues(new Uint8Array(65536)), crypto.getRandomValues(new Uint8Array(65536)), crypto.getRandomValues(new Uint8Array(40000))], { type: 'image/jpeg' }), 'f.jpg')
    fd.append('momento', momento)
    return estilista.llamar('POST', `/api/clinica/estetica/citas/${cOso.id}/fotos`, fd)
  }
  r = await subirFoto('antes')
  ok(r.status === 201 && r.data.fotos.length === 1 && r.data.fotos[0].momento === 'antes', 'Foto de antes', r.data?.fotos)
  const foto1 = r.data.fotos[0]
  await subirFoto('antes')
  await subirFoto('antes')
  r = await subirFoto('antes')
  ok(r.status === 400 && /Quita una/.test(r.data.error), 'Máximo 3 fotos de antes', r.data)
  r = await subirFoto('despues')
  ok(r.status === 201 && r.data.fotos.filter((x) => x.momento === 'despues').length === 1, 'Foto de después', r.data?.fotos?.length)
  r = await estilista.post(`/api/clinica/estetica/fotos/${foto1.id}/quitar`)
  ok(r.status === 200 && r.data.fotos.length === 3, 'Quitar una foto', r.data?.fotos?.length)
  const fotoV = r.data.fotos[0]
  const verFoto = async (s) => {
    const x = await fetch(`${BASE}${fotoV.url}`, { headers: s?.cookie ? { cookie: s.cookie } : {} })
    return { status: x.status, tipo: x.headers.get('content-type') }
  }
  r = await verFoto(estilista)
  ok(r.status === 200 && r.tipo === 'image/jpeg', 'La estilista ve la foto', r)
  r = await verFoto(tutor)
  ok(r.status === 200, 'El tutor de la mascota también la ve', r)
  r = await verFoto(null)
  ok(r.status === 401, 'Sin sesión: 401', r)
  r = await admin.get('/api/est-fichas?depth=0')
  const r2 = await admin.get('/api/est-fotos?depth=0')
  ok(r.status === 403 && r2.status === 403, 'API genérica de fichas y fotos: 403 incluso al superadmin', [r.status, r2.status])
  r = await mover(cOso.id, 'secado')
  r = await mover(cOso.id, 'lista')
  ok(r.status === 200 && r.data.etapa === 'lista' && /^https:\/\/wa\.me\//.test(r.data.whatsappLista ?? ''), 'Lista (sin corte): ofrece WhatsApp al tutor', r.data && { e: r.data.etapa, w: r.data.whatsappLista })
  r = await mover(cOso.id, 'entregada')
  ok(r.status === 200 && r.data.etapa === 'entregada' && r.data.cita.estado === 'finalizada' && r.data.cita.cargoFinanzas, 'Entregar: finaliza y cobra lo pactado', r.data?.cita?.estado)
  r = await admin.get(`/api/finanzas/operaciones/${r.data.cita.cargoFinanzas}`)
  ok(r.data?.operacion?.totalCentavos === 45000, 'Cargo de $450 (grande)', r.data?.operacion?.totalCentavos)
  r = await recepcion.get(`/api/clinica/mascotas/${oso.id}/estetica`)
  ok(r.status === 200 && r.data.lista[0]?.hallazgos.includes('Pulgas') && r.data.lista[0].fotos.length === 3 && r.data.lista[0].comportamiento === 'Necesitó bozal', 'Expediente: la estética con observaciones y fotos', r.data?.lista?.[0])
  r = await estilista.get('/admin/clinica/estetica')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('cl-app'), 'Panel: Clínica → Estética renderiza para la estilista', r.status)

  console.log('\nHoy integra la estética (UX del panel 1)')
  r = await admin.get('/admin')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('hoy-estetica') && r.data.includes('Abrir tablero'), 'Hoy: bloque de la estética del día con «Abrir tablero»', r.status)
  {
    const resp = await fetch(BASE + '/admin', { headers: { cookie: estilista.cookie }, redirect: 'manual' })
    const destino = resp.headers.get('location') || ''
    ok([303, 307, 308].includes(resp.status) && destino.includes('/admin/clinica/estetica'), 'La estilista que abre Hoy llega a su tablero de estética', { status: resp.status, destino })
  }

  console.log('\nPuesta a punto (UX del panel 2)')
  r = await admin.get('/admin/puesta-a-punto')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('Puesta a punto') && r.data.includes('Servicios con precio por talla') && r.data.includes('Roles de estética') && /\d+ de \d+ listos|Todo listo/.test(r.data), 'Puesta a punto: el superadmin ve la lista con la sección de estética', r.status)
  ok(!/re_[A-Za-z0-9]{8}|sk-ant-|TEST-\d/.test(r.data), 'Puesta a punto: ninguna llave sale en la página (solo presencia)')
  r = await recepcion.get('/admin/puesta-a-punto')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes('la revisan los dueños') && !r.data.includes('Servicios con precio por talla'), 'Puesta a punto: Recepción no la ve', r.status)
  r = await admin.get('/admin')
  ok(typeof r.data === 'string' && r.data.includes('/admin/puesta-a-punto'), 'Hoy: liga a la puesta a punto para el superadmin', r.status)

  console.log('\nPortal: historial y «¿ya le toca su baño?» (E3)')
  r = await tutor.get(`/api/clinica/portal/mascotas/${oso.id}/estetica`)
  const eOso = r.data?.lista?.[0]
  ok(r.status === 200 && r.data.activa && eOso?.notaTutor === 'Se portó muy bien después del bozal.' && eOso.hallazgos.includes('Pulgas') && eOso.fotos.length === 3, 'El tutor ve la estética de Oso: nota, lo observado y fotos', eOso)
  ok(eOso && !('notaInterna' in eOso) && !('comportamiento' in eOso) && !JSON.stringify(r.data).includes('Usar bozal desde el inicio'), 'Sin la nota interna ni el comportamiento', eOso && Object.keys(eOso))
  ok(r.data?.proximo?.fecha && r.data.proximo.ligaCita === `/portal/citas/nueva?mascota=${oso.id}&servicio=${bano.id}`, 'Próximo baño (4 semanas) con la cita ya llenada', r.data?.proximo)
  r = await tutor.get(`/api/clinica/portal/mascotas/${chispa.id}/estetica`)
  ok(r.status === 200 && r.data.lista.length === 0, 'Sin estéticas entregadas: lista vacía', r.data?.lista?.length)
  const otroTutor = new Sesion()
  const correoO = `otro.portal${sufijo}@ejemplo.mx`
  await otroTutor.post('/api/tutores', { email: correoO, password: PASS, nombre: 'Otro (portal)' })
  await otroTutor.login('tutores', correoO, PASS)
  r = await otroTutor.get(`/api/clinica/portal/mascotas/${oso.id}/estetica`)
  ok(r.status === 404 || r.status === 403, 'Otro tutor no ve la estética de Oso', r.status)
  {
    const x = await fetch(`${BASE}${eOso.fotos[0].url}`, { headers: { cookie: otroTutor.cookie } })
    ok(x.status === 404 || x.status === 403, 'Ni sus fotos', x.status)
  }
  /* Una estética entregada hace 5 días con «próximo baño en 1 semana»: toca en 2 días. */
  const hoyMx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
  const haceCinco = (() => { const d = new Date(hoyMx + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() - 5); return d.toISOString().slice(0, 10) })()
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: bruno.id, servicioId: bano.id, dia: haceCinco, hora: '10:00', confirmar: true })
  const cPasada = r.data
  ok(r.status === 201, 'Recepción captura un baño de Bruno de hace 5 días', r.data)
  for (const e of ['recibida', 'bano', 'lista']) await mover(cPasada.id, e)
  await estilista.post(`/api/clinica/estetica/citas/${cPasada.id}/ficha`, { queSeHizo: ['bano'], notaTutor: 'Quedó listo.', proximaSemanas: 1 })
  r = await mover(cPasada.id, 'entregada')
  ok(r.data?.etapa === 'entregada', 'Entregada con «próximo baño en 1 semana»', r.data?.etapa)
  r = await tutor.get('/portal')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes(`Baño de Bruno ${sufijo}`) && r.data.includes(`/portal/citas/nueva?mascota=${bruno.id}&amp;servicio=${bano.id}`), 'Inicio del portal: el baño de Bruno en Pendientes con «Pedir cita»', r.status)
  if (ENV.CRON_SECRET) {
    const cron = () => fetch(`${BASE}/api/clinica/cron/recordatorios`, { headers: { authorization: `Bearer ${ENV.CRON_SECRET}` } }).then(async (x) => ({ status: x.status, data: await x.json() }))
    r = await cron()
    ok(r.status === 200 && r.data.estetica?.enviados >= 1, 'Cron: manda el «¿ya le toca su baño?»', r.data?.estetica)
    r = await cron()
    ok(r.status === 200 && r.data.estetica?.enviados === 0, 'Otro cron: no lo repite', r.data?.estetica)
  } else ok(false, 'Falta CRON_SECRET en .env para probar el recordatorio')
  /* Con una cita de estética por venir, ya no se recuerda. */
  r = await tutor.post('/api/clinica/portal/citas', { mascotaId: bruno.id, servicioId: bano.id, dia, hora: '13:00' })
  ok(r.status === 201, 'Tutor pide el siguiente baño de Bruno', r.data)
  r = await tutor.get('/portal')
  ok(r.status === 200 && typeof r.data === 'string' && !r.data.includes(`Baño de Bruno ${sufijo}`), 'Con su baño ya pedido, sale de Pendientes', r.status)
  r = await tutor.get(`/portal/mascotas/${oso.id}?ver=estetica`)
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes(marca) && r.data.includes('Se portó muy bien'), 'Pestaña «Estética» de la ficha de la mascota', r.status)

  console.log('\nSitio público')
  r = await new Sesion().get('/servicios')
  ok(r.status === 200 && typeof r.data === 'string' && r.data.includes(marca) && r.data.includes('desde $250'), 'Sitio → Servicios: grupo con el nombre de la estética y «desde $250»', r.status)

  console.log('\nApagar otra vez')
  await admin.post('/api/globals/instalacion-configuracion', { modulos: { ...modulos, estetica: false } })
  r = await recepcion.get(`/api/clinica/agenda/cotizar?servicio=${bano.id}&mascota=${chispa.id}`)
  ok(r.status === 400, 'Apagado: ya no cotiza por talla', r.status)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: chispa.id, servicioId: bano.id, dia, hora: '18:00', confirmar: true })
  ok(r.status === 201 && r.data.estetica === null && r.data.duracionMin === bano.duracionMin, 'Apagado: el baño se agenda como cualquier servicio', r.data?.estetica)
  await recepcion.post(`/api/clinica/agenda/citas/${r.data.id}/estado`, { estado: 'cancelada', motivo: 'Prueba' })
  await admin.post('/api/globals/instalacion-configuracion', { modulos: { ...modulos, estetica: true } })
  r = await recepcion.get(`/api/clinica/agenda/cotizar?servicio=${bano.id}&mascota=${chispa.id}`)
  ok(r.status === 200, 'Encendido de nuevo (queda encendido)', r.status)

  console.log(`\n${total - fallas}/${total} correctas${fallas ? ` · ${fallas} fallaron` : ''}\n`)
  process.exit(fallas ? 1 : 0)
}

let r
main().catch((e) => {
  console.error(e)
  process.exit(1)
})
