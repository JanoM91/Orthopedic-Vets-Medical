/**
 * Prueba de integración de la RUTA ORTOPÉDICA, fase 1: presupuesto de cirugía
 * y consentimiento informado (nov-2026), contra la app corriendo con una base
 * Postgres LOCAL (nunca la de producción).
 *
 *   npm run start
 *   npm run test:clinica          (deja superadmin, Médico, Recepción, agenda y sitio)
 *   node scripts/probarCirugia.mjs [http://localhost:3000]
 *
 * Crea su propio cliente, mascotas y tutor (con sufijo): se puede correr varias veces.
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

/** PNG «dibujado»: para la prueba basta un base64 largo y válido. */
const FIRMA = 'data:image/png;base64,' + Buffer.alloc(3000, 7).toString('base64')

async function main() {
  const admin = new Sesion()
  const medico = new Sesion()
  const recepcion = new Sesion()
  const visitante = new Sesion()
  console.log('\nArranque')
  ok(await admin.login('users', CORREO, PASS), 'Superadmin entra (corre antes test:clinica)')
  ok(await medico.login('users', 'medico@ejemplo.mx', PASS), 'Médico entra')
  ok(await recepcion.login('users', 'recepcion@ejemplo.mx', PASS), 'Recepción entra')
  const sufijo = Date.now().toString().slice(-6)
  const cat = (await admin.get('/api/clinica/agenda/catalogo')).data
  const servicio = cat.servicios.find((s) => s.nombre === 'Consulta general')
  await admin.patch(`/api/servicios/${servicio.id}`, { precio: 400 })

  console.log('\nTexto del consentimiento')
  let r = await admin.get('/api/globals/cirugia-configuracion')
  const textoBase = r.data?.textoConsentimiento
  ok(r.status === 200 && r.data.textoConsentimiento?.includes('{{procedimiento}}') && r.data.vigenciaDias === 15, 'Viene con un texto base con {{campos}} y 15 días de vigencia', r.data && { v: r.data.vigenciaDias })
  r = await recepcion.post('/api/globals/cirugia-configuracion', { vigenciaDias: 3 })
  ok(r.status === 403, 'Recepción no cambia el texto (pide «Configurar agenda»)', r.status)

  r = await recepcion.post('/api/clinica/clientes', { nombre: 'Carlos', apellidos: `Cirugía ${sufijo}`, telefono: `228${sufijo}6`, email: `carlos${sufijo}@ejemplo.mx` })
  const cli = r.data.cliente
  const max = (await recepcion.post('/api/clinica/mascotas', { nombre: `Max ${sufijo}`, especie: 'perro', pesoKg: 30, tutores: [{ clienteId: cli.id, principal: true }] })).data
  const otra = (await recepcion.post('/api/clinica/mascotas', { nombre: `Kira ${sufijo}`, especie: 'gato', tutores: [{ clienteId: cli.id, principal: true }] })).data
  ok(cli?.id && max?.id && otra?.id, 'Cliente y dos mascotas')

  console.log('\nArmar el presupuesto')
  const base = { procedimiento: 'Osteosíntesis de fémur derecho', explicacion: 'Fractura de fémur: se fija con placa.', riesgos: 'Infección y aflojamiento del implante.', indicaciones: 'Ayuno de 8 horas.', renglones: [{ concepto: 'Cirugía y anestesia', servicioId: servicio.id, cantidad: 1, precioUnitario: 7000 }, { concepto: 'Hospitalización (día)', cantidad: 2, precioUnitario: 650.5 }], anticipo: 3000 }
  r = await recepcion.post(`/api/clinica/mascotas/${max.id}/presupuestos`, base)
  ok(r.status === 403, 'Recepción no arma presupuestos (pide «Escribir expediente»)', r.status)
  r = await medico.post(`/api/clinica/mascotas/${max.id}/presupuestos`, { ...base, anticipo: 99999 })
  ok(r.status === 400 && /anticipo/.test(r.data.error), 'El anticipo no puede pasar del total', r.data)
  r = await medico.post(`/api/clinica/mascotas/${max.id}/presupuestos`, { ...base, renglones: [] })
  ok(r.status === 400, 'Sin renglones no se guarda', r.status)
  r = await medico.post(`/api/clinica/mascotas/${max.id}/presupuestos`, base)
  const p1 = r.data
  ok(r.status === 201 && p1.estado === 'borrador' && p1.total === 8301 && p1.renglones[1].importe === 1301 && p1.medico?.nombre, 'Médico guarda el borrador: total $8,301 (renglones calculados en el servidor)', p1)
  r = await medico.post(`/api/clinica/presupuestos/${p1.id}`, { ...base, procedimiento: 'Osteosíntesis de fémur derecho con placa' })
  ok(r.status === 200 && r.data.procedimiento.endsWith('con placa'), 'El borrador se edita', r.data?.procedimiento)
  r = await visitante.get('/api/cir-presupuestos')
  ok(r.status === 403 || (r.data?.docs ?? []).length === 0, 'Un visitante no ve presupuestos por la API genérica', r.status)
  r = await admin.post('/api/cir-presupuestos', { mascota: max.id, procedimiento: 'x', renglones: [], total: 0 })
  ok(r.status === 403, 'Nadie crea presupuestos por la API genérica', r.status)

  console.log('\nEnviar')
  r = await medico.post(`/api/clinica/presupuestos/${p1.id}/enviar`)
  const env = r.data
  ok(r.status === 200 && env.estado === 'enviado' && env.vence && /\/presupuesto\/\d+\/[a-f0-9]{48}$/.test(env.liga ?? '') && env.whatsapp?.includes('wa.me'), 'Enviado: vence en 15 días, liga con token y WhatsApp listo', env && { e: env.estado, l: env.liga, w: Boolean(env.whatsapp) })
  r = await medico.post(`/api/clinica/presupuestos/${p1.id}`, base)
  ok(r.status === 400 && /borrador/.test(r.data.error), 'Enviado ya no se edita', r.data)
  const ruta = new URL(env.liga).pathname
  const api = `/api${ruta}`
  r = await visitante.get(api)
  ok(r.status === 200 && r.data.texto.includes(max.nombre) && r.data.texto.includes('con placa') && r.data.texto.includes('8,301') && r.data.texto.includes('Infección') && !r.data.notasInternas && !r.data.liga, 'La liga abre sin cuenta: texto con mascota, procedimiento, total y riesgos (sin datos internos)', r.data && r.data.texto?.slice(0, 120))
  r = await visitante.get(`/api/presupuesto/${p1.id}/${'0'.repeat(48)}`)
  ok(r.status === 404, 'Con otro token no abre', r.status)
  r = await fetch(`${BASE}${ruta}`)
  let h = await r.text()
  ok(r.status === 200 && h.includes('Aceptar y firmar') && h.includes('Consentimiento informado'), 'La página del tutor muestra el consentimiento y la firma')

  console.log('\nFirmar')
  r = await visitante.post(api, { accion: 'firmar', nombre: 'Carlos Cirugía', firma: 'data:image/png;base64,AAA', acepto: true })
  ok(r.status === 400 && /firma/i.test(r.data.error), 'Sin firma dibujada no se acepta', r.data)
  r = await visitante.post(api, { accion: 'firmar', nombre: 'Carlos Cirugía', firma: FIRMA, acepto: false })
  ok(r.status === 400 && /acepta/.test(r.data.error), 'Hay que marcar que se acepta', r.data)
  r = await visitante.post(api, { accion: 'firmar', nombre: 'Carlos Cirugía', firma: FIRMA, acepto: true })
  ok(r.status === 200 && r.data.estado === 'aceptado' && r.data.consentimiento?.via === 'portal' && /^[a-f0-9]{64}$/.test(r.data.consentimiento.huella), 'El tutor firma desde la liga: aceptado, con huella SHA-256', r.data?.consentimiento)
  r = await visitante.post(api, { accion: 'firmar', nombre: 'Carlos Cirugía', firma: FIRMA, acepto: true })
  ok(r.status === 400 && /ya está firmado/.test(r.data.error), 'No se firma dos veces', r.data)
  r = await admin.get(`/api/cir-consentimientos?where[presupuesto][equals]=${p1.id}&depth=0`)
  const con = r.data?.docs?.[0]
  ok(con && con.texto.includes('Carlos Cirugía') && con.resumen?.total === 8301 && con.firma === FIRMA && con.ip !== undefined, 'El consentimiento guarda el texto con el nombre de quien firmó, el resumen y la firma', con && { t: con.texto.slice(0, 60), total: con.resumen?.total })
  r = await admin.patch(`/api/cir-consentimientos/${con.id}`, { nombreFirmante: 'Otro' })
  ok(r.status === 403, 'El consentimiento no se puede cambiar', r.status)
  await admin.post('/api/globals/cirugia-configuracion', { textoConsentimiento: 'Texto nuevo para {{mascota}}.', vigenciaDias: 15 })
  r = await visitante.get(api)
  ok(r.data?.texto === con.texto, 'Cambiar el texto base no cambia lo ya firmado', r.data?.texto?.slice(0, 40))
  await admin.post('/api/globals/cirugia-configuracion', { textoConsentimiento: textoBase, vigenciaDias: 15 })
  r = await fetch(`${BASE}${api}?imprimir=1`)
  h = await r.text()
  ok(r.status === 200 && h.includes('Huella SHA-256') && h.includes('Carlos Cirugía') && h.includes('Imprimir o guardar PDF'), 'Constancia imprimible con firma y huella')
  r = await medico.get(`/api/clinica/presupuestos/${p1.id}/imprimir`)
  ok(r.status === 200 && String(r.data).includes('Huella SHA-256'), 'También desde el panel')

  console.log('\nAgendar la cirugía')
  const dia = (() => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 16); while (d.getUTCDay() !== 4) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) })()
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: otra.id, servicioId: servicio.id, dia, hora: '09:00', confirmar: true, presupuestoId: p1.id })
  ok(r.status === 400 && /no es de esta mascota/.test(r.data.error), 'El presupuesto no se usa con otra mascota', r.data)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: max.id, servicioId: servicio.id, dia, hora: '09:00', confirmar: true, presupuestoId: p1.id })
  const cir = r.data
  ok(r.status === 201 && cir.presupuesto?.id === p1.id && cir.paquete === null, 'Cirugía agendada con su presupuesto', cir?.presupuesto ?? r.data)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: max.id, servicioId: servicio.id, dia, hora: '13:00', confirmar: true, presupuestoId: p1.id })
  ok(r.status === 400 && /ya tiene su cirugía/.test(r.data.error), 'Un presupuesto, una cirugía en la agenda', r.data)
  r = await medico.post(`/api/clinica/presupuestos/${p1.id}/cancelar`, { motivo: 'prueba de cancelación' })
  ok(r.status === 400 && /cancela primero la cita/.test(r.data.error), 'Con la cirugía en la agenda no se cancela el presupuesto', r.data)
  for (const e of ['llegada', 'atencion']) await recepcion.post(`/api/clinica/agenda/citas/${cir.id}/estado`, { estado: e })
  r = await recepcion.post(`/api/clinica/agenda/citas/${cir.id}/estado`, { estado: 'finalizada' })
  const op = r.data?.cargoFinanzas ? (await admin.get(`/api/finanzas/operaciones/${r.data.cargoFinanzas}`)).data?.operacion : null
  ok(r.status === 200 && op?.totalCentavos === 830100 && op.concepto.includes(p1.folio), 'Al finalizar se cobra el total del presupuesto ($8,301), no el precio del servicio', op && { t: op.totalCentavos, c: op.concepto })
  r = await medico.get(`/api/clinica/mascotas/${max.id}/presupuestos`)
  ok(r.data?.presupuestos?.find((x) => x.id === p1.id)?.cita?.estado === 'finalizada', 'El presupuesto muestra su cirugía finalizada', r.data?.presupuestos?.[0]?.cita)

  console.log('\nRechazar y regresar a borrador')
  const p2 = (await medico.post(`/api/clinica/mascotas/${otra.id}/presupuestos`, { procedimiento: 'Extracción dental', renglones: [{ concepto: 'Procedimiento', cantidad: 1, precioUnitario: 2500 }] })).data
  const env2 = (await medico.post(`/api/clinica/presupuestos/${p2.id}/enviar`)).data
  const api2 = `/api${new URL(env2.liga).pathname}`
  r = await visitante.post(api2, { accion: 'rechazar', motivo: 'Lo voy a pensar' })
  ok(r.status === 200 && r.data.estado === 'rechazado' && r.data.motivoRechazo === 'Lo voy a pensar', 'El tutor lo rechaza con su motivo', r.data?.estado)
  r = await visitante.post(api2, { accion: 'firmar', nombre: 'Carlos', firma: FIRMA, acepto: true })
  ok(r.status === 400, 'Rechazado ya no se firma por la liga', r.status)
  r = await medico.post(`/api/clinica/presupuestos/${p2.id}/borrador`)
  ok(r.status === 200 && r.data.estado === 'borrador', 'Regresa a borrador', r.data?.estado)
  r = await visitante.get(api2)
  ok(r.status === 404, 'La liga anterior deja de servir', r.status)

  console.log('\nFirmar en la clínica')
  r = await recepcion.post(`/api/clinica/presupuestos/${p2.id}/firmar`, { nombre: 'Carlos Cirugía', firma: FIRMA, acepto: true })
  ok(r.status === 200 && r.data.estado === 'aceptado' && r.data.consentimiento?.via === 'clinica', 'Recepción recoge la firma en la tableta (aun en borrador)', r.data?.consentimiento)
  const con2 = (await admin.get(`/api/cir-consentimientos?where[presupuesto][equals]=${p2.id}&depth=0`)).data?.docs?.[0]
  ok(con2?.testigo, 'Queda quién lo recibió en la clínica', con2?.testigo)

  console.log('\nCancelar')
  const p3 = (await medico.post(`/api/clinica/mascotas/${otra.id}/presupuestos`, { procedimiento: 'Limpieza dental', renglones: [{ concepto: 'Limpieza', cantidad: 1, precioUnitario: 1500 }] })).data
  const env3 = (await medico.post(`/api/clinica/presupuestos/${p3.id}/enviar`)).data
  r = await medico.post(`/api/clinica/presupuestos/${p3.id}/cancelar`, { motivo: 'no' })
  ok(r.status === 400, 'Cancelar pide motivo', r.status)
  r = await medico.post(`/api/clinica/presupuestos/${p3.id}/cancelar`, { motivo: 'el tutor decidió otra clínica' })
  ok(r.status === 200 && r.data.estado === 'cancelado', 'Cancelado', r.data?.estado)
  r = await visitante.get(`/api${new URL(env3.liga).pathname}`)
  ok(r.status === 404, 'La liga de un cancelado no abre', r.status)

  console.log('\nApp del cliente')
  const p4 = (await medico.post(`/api/clinica/mascotas/${max.id}/presupuestos`, { procedimiento: 'Retiro de placa', renglones: [{ concepto: 'Cirugía', cantidad: 1, precioUnitario: 3000 }] })).data
  await medico.post(`/api/clinica/presupuestos/${p4.id}/enviar`)
  const codigo = (await recepcion.post(`/api/clinica/clientes/${cli.id}/codigo`)).data?.codigo
  const tutor = new Sesion()
  const correoT = `carlos.portal${sufijo}@ejemplo.mx`
  await tutor.post('/api/tutores', { email: correoT, password: PASS, nombre: 'Carlos (portal)' })
  await tutor.login('tutores', correoT, PASS)
  await tutor.post('/api/clinica/portal/vincular', { codigo })
  await tutor.login('tutores', correoT, PASS)
  r = await tutor.get('/portal')
  ok(r.status === 200 && String(r.data).includes('Retiro de placa') && String(r.data).includes('Revisar y firmar') && !String(r.data).includes('Extracción dental'), 'En «Pendientes» aparece el presupuesto por firmar (solo los enviados)')
  r = await tutor.get(`/api/cir-presupuestos?depth=0&limit=50`)
  ok(r.status === 200 && r.data.docs.every((x) => x.estado !== 'borrador') && r.data.docs.every((x) => x.token === undefined), 'Por la API genérica el tutor no ve borradores ni tokens', r.data?.docs?.map((x) => x.estado))

  console.log(`\n${total - fallas}/${total} correctas`)
  process.exit(fallas ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
