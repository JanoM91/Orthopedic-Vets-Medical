/**
 * Prueba de integración de la RUTA ORTOPÉDICA (nov-2026): presupuesto de cirugía
 * y consentimiento (fase 1), hoja quirúrgica (2), hospitalización (3) y
 * rehabilitación (4), contra la app corriendo con una base
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

  console.log('\nHoja quirúrgica (fase 2)')
  r = await recepcion.post('/api/clinica/hojas', { citaId: cir.id })
  ok(r.status === 403, 'Recepción no abre la hoja (pide «Escribir expediente»)', r.status)
  r = await medico.post('/api/clinica/hojas', { citaId: cir.id })
  const hq = r.data
  ok(r.status === 201 && hq.procedimiento.endsWith('con placa') && hq.cirujano?.nombre && hq.presupuesto?.consentimiento?.folio && hq.pesoKg === 30 && hq.urgencia === false, 'El médico abre la hoja desde la cita: procedimiento, cirujano, consentimiento y peso del expediente', hq && { p: hq.procedimiento, c: hq.cirujano, con: hq.presupuesto?.consentimiento, peso: hq.pesoKg })
  r = await medico.post('/api/clinica/hojas', { citaId: cir.id })
  ok(r.data?.id === hq.id, 'Abrirla otra vez regresa la misma hoja', r.data?.id)
  r = await medico.post(`/api/clinica/hojas/${hq.id}`, { asa: 'II', ayunoHoras: 10, valoracion: 'Paciente estable.', tiempos: { entrada: '08:50', inicioAnestesia: '09:00', inicioCirugia: '09:15' } })
  ok(r.status === 200 && r.data.asa === 'II' && r.data.tiempos.inicioCirugia === '09:15' && r.data.tiempos.entrada === '08:50', 'Guarda ASA, ayuno, valoración y tiempos', r.data && { asa: r.data.asa, t: r.data.tiempos })
  r = await medico.post(`/api/clinica/hojas/${hq.id}`, { tiempos: { finCirugia: '25:00' } })
  ok(r.status === 400, 'Hora inválida rechazada', r.status)
  r = await medico.post(`/api/clinica/hojas/${hq.id}`, { otroCampo: 1 })
  ok(r.status === 400, 'Campos desconocidos rechazados', r.status)
  r = await medico.post(`/api/clinica/hojas/${hq.id}/farmacos`, { momento: 'premedicacion', medicamento: 'Medicamento A', dosis: '', hora: '09:00' })
  ok(r.status === 400 && /dosis/.test(r.data.error), 'El fármaco pide la dosis tal como la indicó el médico', r.data)
  r = await medico.post(`/api/clinica/hojas/${hq.id}/farmacos`, { momento: 'premedicacion', medicamento: 'Medicamento A', dosis: 'la indicada por el médico', via: 'IV', hora: '09:00' })
  ok(r.status === 200 && r.data.farmacos.length === 1 && r.data.farmacos[0].por && r.data.farmacos[0].dosis === 'la indicada por el médico', 'Registra el fármaco tal cual, con quién lo capturó', r.data?.farmacos)
  r = await medico.post(`/api/clinica/hojas/${hq.id}/signos`, { hora: '09:20', spo2: 150 })
  ok(r.status === 400 && /SPO2/.test(r.data.error), 'Un SpO₂ de 150 se rechaza como error de captura', r.data)
  r = await medico.post(`/api/clinica/hojas/${hq.id}/signos`, { hora: '09:20' })
  ok(r.status === 400, 'Una toma vacía se rechaza', r.status)
  for (const [h, fc] of [['09:30', 92], ['09:20', 88], ['09:40', 95]]) r = await medico.post(`/api/clinica/hojas/${hq.id}/signos`, { hora: h, fc, fr: 14, spo2: 98, temp: 37.8, pas: 110, pad: 70 })
  ok(r.status === 200 && r.data.signos.map((x) => x.hora).join(',') === '09:20,09:30,09:40', 'Tres tomas, ordenadas por hora', r.data?.signos?.map((x) => x.hora))
  r = await medico.post(`/api/clinica/hojas/${hq.id}/quitar`, { lista: 'signos', indice: 1 })
  ok(r.status === 200 && r.data.signos.length === 2 && !r.data.signos.some((x) => x.hora === '09:30'), 'Quitar una toma capturada por error', r.data?.signos?.map((x) => x.hora))
  r = await medico.post(`/api/clinica/hojas/${hq.id}/cerrar`)
  ok(r.status === 400 && /realizado/.test(r.data.error) && /fin de la cirugía/.test(r.data.error), 'No se cierra sin lo realizado y el fin de la cirugía', r.data)
  await medico.post(`/api/clinica/hojas/${hq.id}`, { realizado: 'Reducción abierta y fijación con placa.', implantes: 'Placa de 8 orificios.', tiempos: { finCirugia: '10:30' } })
  r = await medico.post(`/api/clinica/hojas/${hq.id}/cerrar`)
  ok(r.status === 200 && r.data.estado === 'cerrada' && r.data.cerradaPor, 'Se cierra', r.data?.estado)
  r = await medico.post(`/api/clinica/hojas/${hq.id}/signos`, { hora: '10:40', fc: 90 })
  ok(r.status === 400 && /cerrada/.test(r.data.error), 'Cerrada ya no acepta cambios', r.data)
  r = await admin.patch(`/api/cir-hojas/${hq.id}`, { realizado: 'otro' })
  ok(r.status === 403, 'Tampoco por la API genérica', r.status)
  r = await medico.get(`/api/clinica/hojas/${hq.id}/imprimir`)
  ok(r.status === 200 && String(r.data).includes('Medicamento A') && String(r.data).includes('<svg') && String(r.data).includes('Placa de 8 orificios'), 'Imprimible con fármacos, gráficas e implantes')
  r = await medico.post('/api/clinica/hojas', { mascotaId: otra.id, procedimiento: 'Cierre de herida por mordedura' })
  ok(r.status === 201 && r.data.urgencia === true && r.data.cita === null, 'Hoja de urgencia sin cita', r.data && { u: r.data.urgencia, c: r.data.cita })
  r = await medico.get(`/api/clinica/mascotas/${max.id}/hojas`)
  ok(r.status === 200 && r.data.some((x) => x.id === hq.id && x.estado === 'cerrada'), 'La hoja aparece en el expediente', r.data)
  r = await recepcion.get(`/api/clinica/hojas/${hq.id}`)
  ok(r.status === 403, 'Sin «Ver expediente» no se lee la hoja', r.status)

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

  console.log('\nHospitalización (fase 3)')
  r = await recepcion.post('/api/clinica/hospital', { mascotaId: max.id, motivo: 'Postoperatorio' })
  ok(r.status === 403, 'Recepción no interna (pide «Escribir expediente»)', r.status)
  r = await medico.post('/api/clinica/hospital', { mascotaId: max.id, motivo: 'Postoperatorio de osteosíntesis', espacio: 'Jaula 2', hojaId: hq.id })
  const hos = r.data
  ok(r.status === 201 && hos.estado === 'internado' && hos.hoja?.id === hq.id && hos.presupuesto?.id === p1.id && /\/hospital\/\d+\/[a-f0-9]{48}$/.test(hos.liga ?? ''), 'El médico interna desde la hoja: liga para el tutor', hos && { e: hos.estado, h: hos.hoja, l: hos.liga })
  r = await medico.post('/api/clinica/hospital', { mascotaId: max.id, motivo: 'Otra vez' })
  ok(r.status === 400 && /ya está internada/.test(r.data.error), 'No se interna dos veces', r.data)
  r = await medico.post(`/api/clinica/hospital/${hos.id}/indicaciones`, { tratamiento: 'Medicamento A', dosis: 'la indicada', horas: '8am' })
  ok(r.status === 400 && /HH:MM/.test(r.data.error), 'Horas mal escritas se rechazan', r.data)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/indicaciones`, { tratamiento: 'Medicamento A', horas: '23:58' })
  ok(r.status === 403, 'Recepción no indica', r.status)
  r = await medico.post(`/api/clinica/hospital/${hos.id}/indicaciones`, { tratamiento: 'Medicamento A', dosis: 'la indicada', via: 'IV', frecuencia: 'cada 8 h', horas: '23:58, 23:59' })
  const indA = r.data?.indicaciones?.[0]
  ok(r.status === 200 && indA?.horas?.join(',') === '23:58,23:59' && r.data.tomas.length === 2 && r.data.tomas.every((x) => x.estado === 'pendiente'), 'Indicación con horas: dos tomas pendientes hoy', r.data?.tomas)
  r = await medico.post(`/api/clinica/hospital/${hos.id}/indicaciones`, { tratamiento: 'Analgesia de rescate', dosis: 'la indicada', frecuencia: 'si hay dolor' })
  const indB = r.data?.indicaciones?.[1]
  ok(r.status === 200 && indB?.horas?.length === 0, 'Indicación «según necesidad» (sin horas)', indB)
  const hoyMx = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date())
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/aplicaciones`, { clave: indA.clave, programada: `${hoyMx} 23:58`, estado: 'aplicada' })
  ok(r.status === 200 && r.data.tomas.find((x) => x.hora === '23:58')?.estado === 'aplicada' && r.data.tomas.find((x) => x.hora === '23:58').por, 'Recepción registra la toma de las 23:58', r.data?.tomas)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/aplicaciones`, { clave: indA.clave, programada: `${hoyMx} 23:58`, estado: 'aplicada' })
  ok(r.status === 400 && /ya está registrada/.test(r.data.error), 'La misma toma no se registra dos veces', r.data)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/aplicaciones`, { clave: indA.clave, programada: `${hoyMx} 10:00`, estado: 'aplicada' })
  ok(r.status === 400 && /no está en la indicación/.test(r.data.error), 'Una hora que no indicó el médico se rechaza', r.data)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/aplicaciones`, { clave: indA.clave, programada: `${hoyMx} 23:59`, estado: 'omitida' })
  ok(r.status === 400 && /por qué/.test(r.data.error), 'Omitir pide el motivo', r.data)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/aplicaciones`, { clave: indA.clave, programada: `${hoyMx} 23:59`, estado: 'omitida', motivo: 'vomitó' })
  ok(r.status === 200 && r.data.tomas.find((x) => x.hora === '23:59')?.estado === 'omitida', 'Toma omitida con motivo', r.data?.tomas)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/aplicaciones`, { clave: indB.clave, estado: 'aplicada' })
  ok(r.status === 200 && r.data.porNecesidad.length === 1, 'Aplicación «según necesidad»', r.data?.porNecesidad)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/aplicaciones`, { clave: indB.clave, programada: `${hoyMx} 08:00`, estado: 'aplicada' })
  ok(r.status === 400, 'Sin horas fijas no se registra una toma programada', r.status)
  r = await medico.post(`/api/clinica/hospital/${hos.id}/indicaciones/suspender`, { clave: indB.clave })
  ok(r.status === 200 && r.data.indicaciones.find((x) => x.clave === indB.clave)?.activa === false, 'Suspender una indicación', r.data?.indicaciones)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/aplicaciones`, { clave: indB.clave, estado: 'aplicada' })
  ok(r.status === 400 && /suspendida/.test(r.data.error), 'Suspendida ya no se aplica', r.data)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/observaciones`, { temp: 50 })
  ok(r.status === 400, 'Temperatura de 50 °C: error de captura', r.status)
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/observaciones`, { temp: 38.25, fc: 96, dolor: 3, apetito: 'parcial', orina: true, notas: 'Tranquilo' })
  ok(r.status === 200 && r.data.observaciones[0].temp === 38.3 && r.data.observaciones[0].apetito === 'parcial', 'Observación registrada (temperatura a un decimal)', r.data?.observaciones?.[0])
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/cargos`, { concepto: 'Día de hospitalización', cantidad: 2, precioUnitario: 650 })
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/cargos`, { concepto: 'Radiografía de control', cantidad: 1, precioUnitario: 450 })
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/cargos`, { concepto: 'Capturado por error', cantidad: 1, precioUnitario: 99 })
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/cargos/quitar`, { indice: 2 })
  ok(r.status === 200 && r.data.totalCargos === 1750 && r.data.cargos.length === 2, 'Cargos capturados: $1,750 (tras quitar uno)', r.data && { t: r.data.totalCargos })
  r = await medico.post(`/api/clinica/hospital/${hos.id}/partes`, { texto: 'Bien' })
  ok(r.status === 400, 'El parte pide al menos una frase', r.status)
  const FOTO = 'data:image/jpeg;base64,' + Buffer.alloc(900, 5).toString('base64')
  r = await medico.post(`/api/clinica/hospital/${hos.id}/partes`, { texto: 'Pasó buena noche y ya apoya un poco la pata.', foto: FOTO })
  ok(r.status === 200 && r.data.partes[0].texto.startsWith('Pasó buena noche') && r.data.partes[0].foto === FOTO && typeof r.data.correo === 'boolean', 'Parte publicado con foto', r.data?.partes?.[0]?.texto)
  const rutaHos = new URL(hos.liga).pathname
  h = await (await fetch(`${BASE}${rutaHos}`)).text()
  ok(h.includes('Pasó buena noche') && !h.includes('Medicamento A') && !h.includes('Radiografía de control') && !h.includes('vomitó'), 'La liga del tutor muestra el parte, sin medicamentos, cargos ni notas internas')
  r = await tutor.get('/portal')
  ok(String(r.data).includes('está internada') && String(r.data).includes(rutaHos), 'En la app del tutor aparece en Pendientes con su liga')
  r = await tutor.get('/api/hos-internamientos')
  ok(r.status === 403 || (r.data?.docs ?? []).length === 0, 'El tutor no lee internamientos por la API genérica', r.status)
  r = await admin.patch(`/api/hos-internamientos/${hos.id}`, { motivo: 'x' })
  ok(r.status === 403, 'Nadie edita por la API genérica', r.status)
  r = await medico.post(`/api/clinica/hospital/${hos.id}/alta`, { indicacionesAlta: '' })
  ok(r.status === 400, 'El alta pide indicaciones para casa', r.status)
  r = await medico.post(`/api/clinica/hospital/${hos.id}/alta`, { resumen: 'Evolución favorable.', indicacionesAlta: 'Reposo 2 semanas, revisión en 10 días.' })
  ok(r.status === 200 && r.data.estado === 'alta' && r.data.cargoFinanzas, 'Alta con cargo en Finanzas', r.data && { e: r.data.estado, c: r.data.cargoFinanzas })
  const opH = (await admin.get(`/api/finanzas/operaciones/${r.data.cargoFinanzas}`)).data?.operacion
  ok(opH?.totalCentavos === 175000 && /Hospitalización/.test(opH.concepto), 'Finanzas: $1,750 de hospitalización por cobrar', opH && { t: opH.totalCentavos, c: opH.concepto })
  r = await recepcion.post(`/api/clinica/hospital/${hos.id}/observaciones`, { temp: 38 })
  ok(r.status === 400 && /alta/.test(r.data.error), 'Dado de alta ya no se cambia', r.data)
  h = await (await fetch(`${BASE}${rutaHos}`)).text()
  ok(h.includes('Indicaciones para casa') && h.includes('Reposo 2 semanas') && !h.includes('Evolución favorable'), 'El tutor ve las indicaciones para casa (no el resumen interno)')
  r = await medico.get('/api/clinica/hospital')
  ok(r.status === 200 && r.data.altasRecientes.some((x) => x.id === hos.id), 'Aparece en «Altas recientes» del tablero', r.data?.altasRecientes?.length)

  console.log('\nRehabilitación (fase 4)')
  const FOTOJ = 'data:image/jpeg;base64,' + Buffer.alloc(1200, 9).toString('base64')
  r = await recepcion.post('/api/reh-ejercicios', { nombre: `Sentarse y pararse ${sufijo}`, comoSeHace: 'x' })
  ok(r.status === 403, 'Recepción no edita el catálogo de ejercicios (pide «Escribir expediente»)', r.status)
  r = await medico.post('/api/reh-ejercicios', { nombre: `Caminata corta ${sufijo}`, comoSeHace: 'Diez minutos con correa corta.', video: 'http://inseguro.mx/v' })
  ok(r.status === 400, 'Un video sin https se rechaza', r.status)
  r = await medico.post('/api/reh-ejercicios', { nombre: `Sentarse y pararse ${sufijo}`, comoSeHace: 'Pídele que se siente y se pare despacio, con premio.', foto: FOTOJ, video: 'https://www.youtube.com/watch?v=abc' })
  const ej1 = r.data?.doc
  const ej2 = (await medico.post('/api/reh-ejercicios', { nombre: `Caminata corta ${sufijo}`, comoSeHace: 'Diez minutos con correa corta.' })).data?.doc
  ok(ej1?.id && ej2?.id, 'El médico agrega ejercicios al catálogo (con foto y video)')
  r = await recepcion.post('/api/clinica/rehabilitacion', { mascotaId: max.id, motivo: 'Rehabilitación' })
  ok(r.status === 403, 'Recepción no crea planes', r.status)
  r = await medico.post('/api/clinica/rehabilitacion', { mascotaId: max.id, motivo: 'Rehabilitación postoperatoria de fémur', objetivo: 'Que apoye la pata y camine 20 minutos', servicioId: servicio.id, sesionesPrevistas: 3, frecuencia: '2 por semana', hojaId: hq.id })
  const plan = r.data
  ok(r.status === 201 && plan.estado === 'activo' && plan.servicio?.id === servicio.id && plan.hoja?.id === hq.id && plan.paquete === null, 'Plan creado desde la hoja, con el servicio de la sesión', plan && { e: plan.estado, s: plan.servicio, h: plan.hoja })
  r = await medico.post('/api/clinica/rehabilitacion', { mascotaId: max.id, motivo: 'Otro plan' })
  ok(r.status === 400 && /ya tiene un plan activo/.test(r.data.error), 'Un plan activo por mascota', r.data)
  const rp = `/api/clinica/rehabilitacion/${plan.id}`
  r = await medico.post(`${rp}/ejercicios`, { ejercicioId: ej1.id, vecesAlDia: 9 })
  ok(r.status === 400, 'Veces al día: de 1 a 6', r.status)
  r = await medico.post(`${rp}/ejercicios`, { ejercicioId: ej1.id, repeticiones: '10, dos series', vecesAlDia: 2, nota: 'Después de comer' })
  ok(r.status === 200 && r.data.ejercicios.length === 1 && /\/ejercicios\/\d+\/foto\?v=/.test(r.data.ejercicios[0].foto ?? '') && r.data.ejercicios[0].video, 'Ejercicio asignado con repeticiones, veces al día, foto y video', r.data?.ejercicios?.[0])
  r = await medico.post(`${rp}/ejercicios`, { ejercicioId: ej1.id, vecesAlDia: 1 })
  ok(r.status === 400 && /ya está en el plan/.test(r.data.error), 'El mismo ejercicio no se asigna dos veces', r.data)
  r = await medico.post(`${rp}/ejercicios`, { ejercicioId: ej2.id, vecesAlDia: 1 })
  const [e1, e2] = r.data.ejercicios

  /* Cobro: paquetes y por sesión (lo hace la agenda). */
  const paqR = (await admin.post('/api/paquetes', { nombre: `Rehabilitación ${sufijo}`, contenido: [{ tipo: 'servicio', servicio: servicio.id, cantidad: 2 }], precio: 700, vigenciaDias: 60 })).data?.doc
  await recepcion.post(`/api/clinica/mascotas/${max.id}/paquetes`, { paqueteId: paqR.id })
  r = await medico.get(rp)
  ok(r.data?.paquete?.quedan === 2 && r.data.paquete.total === 2, 'El plan muestra el saldo del paquete de ese servicio', r.data?.paquete)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: max.id, servicioId: servicio.id, dia, hora: '11:00', confirmar: true })
  const s1 = r.data
  ok(r.status === 201 && s1.paquete?.id, 'La sesión agendada se liga sola al paquete', s1?.paquete ?? r.data)
  for (const e of ['llegada', 'atencion']) await recepcion.post(`/api/clinica/agenda/citas/${s1.id}/estado`, { estado: e })
  r = await medico.get(`/api/clinica/rehabilitacion/cita/${s1.id}`)
  ok(r.data?.planId === plan.id && r.data.sesionId === null, 'Desde la cita se encuentra el plan de la mascota', r.data)
  r = await recepcion.post(`${rp}/sesiones`, { dolor: 3 })
  ok(r.status === 403, 'Recepción no registra sesiones', r.status)
  r = await medico.post(`${rp}/sesiones`, { citaId: s1.id, dolor: 11 })
  ok(r.status === 400 && /0 a 10/.test(r.data.error), 'Dolor fuera de 0–10: error de captura', r.data)
  r = await medico.post(`${rp}/sesiones`, { citaId: s1.id, mediciones: [{ articulacion: 'rodilla', lado: 'der', movimiento: 'flexion', grados: 250 }] })
  ok(r.status === 400 && /error de captura/.test(r.data.error), 'Un ángulo de 250° se rechaza', r.data)
  r = await medico.post(`${rp}/sesiones`, { citaId: s1.id })
  ok(r.status === 400 && /al menos/.test(r.data.error), 'Una sesión vacía no se guarda', r.data)
  r = await medico.post(`${rp}/sesiones`, { citaId: (await recepcion.post('/api/clinica/agenda/citas', { mascotaId: otra.id, servicioId: servicio.id, dia, hora: '15:00', confirmar: true })).data.id, dolor: 5 })
  ok(r.status === 400 && /no es de esta mascota/.test(r.data.error), 'No se liga la cita de otra mascota', r.data)
  r = await medico.post(`${rp}/sesiones`, { citaId: s1.id, dolor: 6, cojera: 4, mediciones: [{ articulacion: 'rodilla', lado: 'der', movimiento: 'flexion', grados: 85 }], perimetroDer: 31.25, terapias: 'Hidroterapia 15 min', notaInterna: 'Edema leve en rodilla', notaTutor: 'Buen inicio; sigan con los ejercicios.' })
  const ses1 = r.data?.sesionesLista?.[0]
  ok(r.status === 201 && r.data.sesiones === 1 && ses1?.numero === 1 && ses1.perimetroDer === 31.3 && ses1.cita?.id === s1.id && ses1.mediciones[0].grados === 85, 'Sesión 1 ligada a su cita: dolor, cojera, goniometría y perímetro', ses1)
  r = await medico.post(`${rp}/sesiones`, { citaId: s1.id, dolor: 5 })
  ok(r.status === 400 && /ya tiene su sesión/.test(r.data.error), 'Una sesión por cita', r.data)
  r = await recepcion.post(`/api/clinica/agenda/citas/${s1.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 200 && r.data.cargoFinanzas === null, 'Al finalizar la sesión se descuenta del paquete (sin cargo)', r.data && { c: r.data.cargoFinanzas })
  r = await medico.get(`/api/clinica/rehabilitacion/cita/${s1.id}`)
  ok(r.data?.sesionId === ses1.id, 'La cita ya muestra su sesión', r.data)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: max.id, servicioId: servicio.id, dia, hora: '12:00', confirmar: true, usarPaquete: false })
  const s2 = r.data
  for (const e of ['llegada', 'atencion']) await recepcion.post(`/api/clinica/agenda/citas/${s2.id}/estado`, { estado: e })
  r = await medico.post(`${rp}/sesiones`, { citaId: s2.id, dolor: 3, cojera: 2, mediciones: [{ articulacion: 'rodilla', lado: 'der', movimiento: 'flexion', grados: 100 }], notaTutor: 'Ya apoya mejor la pata.' })
  ok(r.status === 201 && r.data.sesiones === 2 && r.data.sesionesLista[0].numero === 2, 'Sesión 2', r.data?.sesiones)
  r = await recepcion.post(`/api/clinica/agenda/citas/${s2.id}/estado`, { estado: 'finalizada' })
  const opR = r.data?.cargoFinanzas ? (await admin.get(`/api/finanzas/operaciones/${r.data.cargoFinanzas}`)).data?.operacion : null
  ok(opR?.totalCentavos === 40000, 'Una sesión fuera del paquete se cobra como cita ($400)', opR && { t: opR.totalCentavos })
  r = await medico.post(`${rp}/sesiones`, { dolor: 2, notaInterna: 'capturada por error' })
  ok(r.status === 201 && r.data.sesiones === 3 && r.data.sesionesLista[0].cita === null && r.data.sesionesLista[0].quitable, 'Sesión sin cita (no cobra)', r.data?.sesionesLista?.[0])
  r = await medico.post(`${rp}/sesiones/quitar`, { sesionId: r.data.sesionesLista[0].id })
  ok(r.status === 200 && r.data.sesiones === 2, 'Una sesión capturada por error se quita el mismo día', r.data?.sesiones)

  /* Tutor */
  r = await tutor.get(`/api/clinica/portal/rehabilitacion/${plan.id}`)
  const pt = r.data
  const texto = JSON.stringify(pt ?? {})
  ok(r.status === 200 && pt.ejercicios.length === 2 && pt.avance.length === 2 && pt.avance[0].dolor === 6 && pt.avance[1].notaTutor === 'Ya apoya mejor la pata.', 'El tutor ve sus ejercicios y el avance de dolor y cojera', pt && { e: pt.ejercicios?.length, a: pt.avance })
  ok(!texto.includes('Edema') && !texto.includes('flexion') && !texto.includes('Hidroterapia'), 'El tutor no recibe la nota interna, la goniometría ni lo que se hizo')
  const casa = (cuerpo) => tutor.post(`/api/clinica/portal/rehabilitacion/${plan.id}/casa`, cuerpo)
  r = await casa({ clave: e1.clave, dia: hoyMx, accion: 'sumar' })
  r = await casa({ clave: e1.clave, dia: hoyMx, accion: 'sumar' })
  ok(r.status === 200 && r.data.ejercicios.find((x) => x.clave === e1.clave).hoy === 2, 'El tutor marca las dos veces de hoy', r.data?.ejercicios)
  r = await casa({ clave: e1.clave, dia: hoyMx, accion: 'sumar' })
  ok(r.status === 400 && /Ya marcaste/.test(r.data.error), 'No pasa de las veces indicadas', r.data)
  r = await casa({ clave: e1.clave, dia: hoyMx, accion: 'restar' })
  ok(r.status === 200 && r.data.ejercicios.find((x) => x.clave === e1.clave).hoy === 1 && r.data.semana.at(-1).hechas === 1 && r.data.semana.at(-1).esperadas === 3, 'Desmarca una vez; la semana cuenta 1 de 3 hoy', r.data?.semana?.at(-1))
  const ayerMx = new Date(Date.parse(hoyMx + 'T12:00:00Z') - 86400000).toISOString().slice(0, 10)
  r = await casa({ clave: e1.clave, dia: ayerMx, accion: 'sumar' })
  ok(r.status === 400 && /no está en el plan/.test(r.data.error), 'Ayer aún no tenía ese ejercicio', r.data)
  r = await casa({ clave: e1.clave, dia: '2020-01-01', accion: 'sumar' })
  ok(r.status === 400 && /hoy o lo de ayer/.test(r.data.error), 'Solo se marca hoy o ayer', r.data)
  r = await visitante.post(`/api/clinica/portal/rehabilitacion/${plan.id}/casa`, { clave: e1.clave, dia: hoyMx, accion: 'sumar' })
  ok(r.status === 401, 'Sin sesión no se marca', r.status)
  r = await tutor.get(`/portal/rehabilitacion/${plan.id}`)
  h = String(r.data)
  ok(r.status === 200 && h.includes('Ejercicios para casa') && h.includes(`Sentarse y pararse ${sufijo}`) && h.includes('Buen inicio') && h.includes('Cómo va') && !h.includes('Edema'), 'Página del plan en la app del tutor')
  r = await tutor.get('/portal')
  ok(String(r.data).includes('Ejercicios de hoy de') && String(r.data).includes(`/portal/rehabilitacion/${plan.id}`), 'En Pendientes: los ejercicios de hoy')
  r = await tutor.get(`/portal/mascotas/${max.id}`)
  ok(String(r.data).includes(`/portal/rehabilitacion/${plan.id}`), 'La ficha de la mascota enlaza su plan')
  const urlFoto = pt.ejercicios.find((x) => x.clave === e1.clave).foto
  r = await visitante.get(urlFoto)
  ok(r.status === 401, 'La foto del ejercicio pide sesión', r.status)
  r = await fetch(BASE + urlFoto, { headers: { cookie: tutor.cookie } })
  ok(r.status === 200 && r.headers.get('content-type') === 'image/jpeg', 'El tutor ve la foto del ejercicio', r.status)
  r = await tutor.get('/api/reh-planes')
  ok(r.status === 403 || (r.data?.docs ?? []).length === 0, 'El tutor no lee planes por la API genérica', r.status)
  r = await admin.patch(`/api/reh-planes/${plan.id}`, { motivo: 'x' })
  ok(r.status === 403, 'Nadie edita planes por la API genérica', r.status)
  r = await admin.post('/api/reh-sesiones', { plan: plan.id, mascota: max.id, fecha: new Date().toISOString() })
  ok(r.status === 403, 'Nadie crea sesiones por la API genérica', r.status)

  /* Equipo: lo que marcó el tutor, tablero y fin del plan */
  r = await medico.get(rp)
  const filaE1 = r.data?.casa?.filas?.find((x) => x.clave === e1.clave)
  ok(filaE1?.hechas.at(-1) === 1 && filaE1.hechas.at(-2) === null && typeof r.data.cumplimiento7 === 'number', 'El equipo ve lo que marcó el tutor (14 días) y el % de la semana', filaE1 && { h: filaE1.hechas.slice(-2), c: r.data.cumplimiento7 })
  r = await medico.post(`${rp}/ejercicios/quitar`, { clave: e2.clave })
  ok(r.status === 200 && r.data.ejercicios.find((x) => x.clave === e2.clave)?.activo === false, 'Quitar un ejercicio', r.status)
  r = await tutor.get(`/api/clinica/portal/rehabilitacion/${plan.id}`)
  ok(r.data?.ejercicios?.length === 1, 'El ejercicio quitado ya no le aparece al tutor', r.data?.ejercicios?.length)
  r = await medico.post(rp, { motivo: 'Rehabilitación postoperatoria de fémur derecho', objetivo: 'Que camine 20 minutos', servicioId: servicio.id, sesionesPrevistas: 4, frecuencia: '2 por semana' })
  ok(r.status === 200 && r.data.sesionesPrevistas === 4 && r.data.motivo.endsWith('derecho'), 'Editar el plan', r.data?.sesionesPrevistas)
  r = await medico.get('/api/clinica/rehabilitacion')
  ok(r.status === 200 && r.data.activos.some((x) => x.id === plan.id && x.sesiones === 2), 'Aparece en el tablero de Rehabilitación', r.data?.activos?.length)
  r = await medico.get(`/api/clinica/mascotas/${max.id}/rehabilitacion`)
  ok(r.data?.[0]?.id === plan.id, 'Y en el expediente de la mascota', r.data?.length)
  r = await medico.post(`${rp}/terminar`, { resumenFinal: 'Bien' })
  ok(r.status === 400, 'Terminar pide un resumen para el tutor', r.status)
  r = await medico.post(`${rp}/terminar`, { resumenFinal: 'Terminó bien: ya apoya y camina 20 minutos. Sigan con caminatas diarias.' })
  ok(r.status === 200 && r.data.estado === 'terminado' && r.data.fin, 'Plan terminado', r.data?.estado)
  r = await medico.post(`${rp}/sesiones`, { dolor: 1 })
  ok(r.status === 400 && /terminó/.test(r.data.error), 'Terminado ya no cambia', r.data)
  r = await casa({ clave: e1.clave, dia: hoyMx, accion: 'sumar' })
  ok(r.status === 400, 'El tutor ya no marca en un plan terminado', r.status)
  r = await tutor.get(`/portal/rehabilitacion/${plan.id}`)
  ok(String(r.data).includes('Resumen del equipo') && String(r.data).includes('camina 20 minutos'), 'El tutor ve el resumen final')
  r = await tutor.get('/portal')
  ok(String(r.data).includes('terminó su rehabilitación'), 'En Pendientes: «terminó su rehabilitación»')

  console.log(`\n${total - fallas}/${total} correctas`)
  process.exit(fallas ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
