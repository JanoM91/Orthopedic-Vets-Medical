/**
 * Prueba de integración de la clínica (pacientes, expediente, importación y
 * portal) contra una app corriendo en local con una base Postgres LOCAL y
 * vacía (nunca la de producción).
 *
 *   npm run dev          (en otra terminal, con DATABASE_URL local)
 *   node scripts/probarClinica.mjs [http://localhost:3000]
 *
 * Crea el primer usuario (superadmin), los roles sugeridos, una cuenta de
 * Recepción y una de Médico, y recorre los flujos. Idempotente a medias: si la
 * base ya tiene primer usuario, usa las credenciales de abajo.
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
    console.log(`  ✗ ${texto}${extra ? ' → ' + JSON.stringify(extra).slice(0, 300) : ''}`)
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
    const data = tipo.includes('json') ? await r.json().catch(() => null) : await r.text().catch(() => null)
    return { status: r.status, data, headers: r.headers }
  }
  get(ruta) {
    return this.llamar('GET', ruta)
  }
  post(ruta, cuerpo) {
    return this.llamar('POST', ruta, cuerpo)
  }
  async login(coleccion, email, password) {
    const r = await this.post(`/api/${coleccion}/login`, { email, password })
    return r.status === 200
  }
}

async function main() {
  console.log(`\nClínica · pruebas contra ${BASE}`)
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
  r = await admin.get('/api/clinica/catalogo')
  ok(r.status === 200 && r.data.permisos.superadmin && r.data.permisos.importar, 'Superadmin: catálogo con todos los permisos de clínica', r.data)
  r = await admin.get('/api/finanzas/catalogo')
  const hayRoles = r.status === 200 && r.data.roles?.length
  if (!hayRoles) {
    r = await admin.post('/api/finanzas/arranque', { que: 'catalogos' })
    r = await admin.post('/api/finanzas/arranque', { que: 'roles' })
    ok(r.status === 200, 'Roles sugeridos creados (incluyen permisos de clínica)', r.data)
  }
  const roles = (await admin.get('/api/roles?limit=50&depth=0')).data.docs
  const rolRec = roles.find((x) => x.nombre === 'Recepción')
  const rolMed = roles.find((x) => x.nombre === 'Médico veterinario')
  ok(rolRec?.clinica?.verPacientes && rolRec?.clinica?.editarPacientes && !rolRec?.clinica?.verExpediente, 'Recepción: ve y edita pacientes, no lee expediente', rolRec?.clinica)
  ok(rolMed?.clinica?.escribirExpediente && !rolMed?.clinica?.importar, 'Médico: escribe expediente, no importa', rolMed?.clinica)

  const crearUsuario = async (email, name, rol) => {
    const existe = (await admin.get(`/api/users?where[email][equals]=${encodeURIComponent(email)}&depth=0`)).data.docs?.[0]
    if (existe) return existe
    const x = await admin.post('/api/users', { email, password: PASS, name, rolDeAcceso: rol.id })
    return x.data.doc
  }
  await crearUsuario('recepcion@ejemplo.mx', 'Sofía Recepción', rolRec)
  await crearUsuario('medico@ejemplo.mx', 'Dra. Paula Herrera', rolMed)
  const recepcion = new Sesion()
  ok(await recepcion.login('users', 'recepcion@ejemplo.mx', PASS), 'Recepción entra')
  const medico = new Sesion()
  ok(await medico.login('users', 'medico@ejemplo.mx', PASS), 'Médico entra')

  /* ── clientes y mascotas ── */
  console.log('\nClientes y mascotas (Recepción)')
  const sufijo = Date.now().toString().slice(-6)
  r = await recepcion.post('/api/clinica/clientes', { nombre: 'Mariana', apellidos: `Ruiz ${sufijo}`, telefono: `228 ${sufijo.slice(0, 3)} ${sufijo.slice(3)}1`, email: `mariana${sufijo}@ejemplo.mx` })
  ok(r.status === 201 && r.data.cliente?.folio?.startsWith('CLI-'), 'Crea cliente con folio CLI-', r.data)
  const cliente = r.data.cliente
  ok(cliente.telefono === `228${sufijo}1`, 'Teléfono normalizado a 10 dígitos', cliente.telefono)
  r = await recepcion.post('/api/clinica/clientes', { nombre: 'Mariana Dup', telefono: cliente.telefono })
  ok(r.status === 200 && r.data.cliente === null && r.data.duplicados?.length === 1, 'Mismo teléfono: avisa posible duplicado y no crea', r.data)
  r = await recepcion.post('/api/clinica/clientes', { nombre: 'Carlos', apellidos: `Ruiz ${sufijo}`, telefono: cliente.telefono, forzar: true })
  ok(r.status === 201, 'Con «forzar» sí crea (segundo tutor de la casa)', r.data)
  const cliente2 = r.data.cliente

  r = await recepcion.post('/api/clinica/mascotas', {
    nombre: 'Toby', especie: 'perro', raza: 'Labrador', sexo: 'macho', esterilizado: 'si', fechaNacimiento: '2020-03-15', nacimientoEstimado: true,
    alertasManejo: ['Postoperatorio de rodilla: evitar saltos'], tutores: [{ clienteId: cliente.id, principal: true }, { clienteId: cliente2.id }], pesoKg: 31.4,
  })
  ok(r.status === 201 && r.data.folio?.startsWith('MAS-') && r.data.tutores.length === 2, 'Crea mascota con dos tutores y folio MAS-', r.data)
  const toby = r.data
  ok(/año/.test(toby.edad || ''), 'Calcula la edad', toby.edad)
  r = await recepcion.post('/api/clinica/mascotas', { nombre: 'Luna', especie: 'gato', sexo: 'hembra', alergias: 'Penicilinas', tutores: [{ clienteId: cliente.id }] })
  const luna = r.data
  r = await recepcion.post('/api/clinica/mascotas', { nombre: 'Sin tutor', especie: 'perro', tutores: [] })
  ok(r.status === 400, 'Mascota sin tutor se rechaza', r.data)
  r = await recepcion.post('/api/clinica/mascotas', { nombre: 'Futuro', especie: 'perro', fechaNacimiento: '2099-01-01', tutores: [{ clienteId: cliente.id }] })
  ok(r.status === 400, 'Fecha de nacimiento futura se rechaza', r.data)

  r = await recepcion.get(`/api/clinica/clientes/${cliente.id}`)
  ok(r.status === 200 && r.data.mascotas.length === 2 && r.data.mascotas.find((m) => m.id === toby.id)?.ultimoPeso?.kg === 31.4, 'Ficha del cliente: 2 mascotas con último peso', r.data.mascotas?.map((m) => [m.nombre, m.ultimoPeso]))
  r = await recepcion.get(`/api/clinica/buscar?q=${encodeURIComponent('Toby')}`)
  ok(r.status === 200 && r.data.mascotas.some((m) => m.id === toby.id), 'Búsqueda por nombre de mascota')
  r = await recepcion.get(`/api/clinica/buscar?q=${cliente.telefono.slice(0, 7)}`)
  ok(r.data.clientes.some((c) => c.id === cliente.id), 'Búsqueda por teléfono parcial')
  r = await recepcion.get(`/api/clinica/buscar?q=${toby.folio}`)
  ok(r.data.mascotas.some((m) => m.id === toby.id) && !r.data.clientes.length, 'Búsqueda por folio MAS- da la mascota, no clientes')
  r = await recepcion.get(`/api/clinica/buscar?q=${encodeURIComponent('Ruiz ' + sufijo)}`)
  ok(r.data.clientes.length === 2 && r.data.mascotas.length >= 2, 'Búsqueda por apellido: tutores y sus mascotas', [r.data.clientes.length, r.data.mascotas.length])

  /* ── cartilla y pesos ── */
  console.log('\nCartilla y pesos (Recepción)')
  r = await recepcion.post(`/api/clinica/mascotas/${toby.id}/cartilla`, { tipo: 'vacuna', producto: 'Múltiple canina', fechaAplicacion: '2026-03-14', proximaFecha: '2027-03-14', lote: 'L2231' })
  ok(r.status === 201 && r.data.aplicadoPor === 'Sofía Recepción', 'Registra vacuna; «aplicó» = quien captura si no se indica otro', r.data)
  const vac = r.data
  r = await recepcion.post(`/api/clinica/mascotas/${toby.id}/cartilla`, { producto: 'Antirrábica', fechaAplicacion: '2099-01-01' })
  ok(r.status === 400, 'Vacuna con fecha futura se rechaza')
  r = await recepcion.post(`/api/clinica/cartilla/${vac.id}`, { tipo: 'vacuna', producto: 'Múltiple canina (corregida)', fechaAplicacion: '2026-03-14', proximaFecha: '2027-03-14', aplicadoPorTexto: 'Otra clínica' })
  ok(r.status === 200 && r.data.aplicadoPor === 'Otra clínica', 'Corrige registro de cartilla')
  r = await recepcion.post(`/api/clinica/mascotas/${toby.id}/pesos`, { kg: 31.1, fecha: '2026-10-10' })
  ok(r.status === 201, 'Agrega peso')
  r = await recepcion.post(`/api/clinica/mascotas/${toby.id}/pesos`, { kg: -2 })
  ok(r.status === 400, 'Peso negativo se rechaza')

  /* ── expediente ── */
  console.log('\nExpediente clínico')
  r = await recepcion.get(`/api/clinica/mascotas/${toby.id}`)
  ok(r.status === 200 && r.data.notas === null && r.data.cartilla.length === 1 && r.data.pesos.length === 2, 'Recepción abre el expediente SIN notas (null), con cartilla y pesos', { notas: r.data.notas, c: r.data.cartilla?.length, p: r.data.pesos?.length })
  r = await recepcion.post(`/api/clinica/mascotas/${toby.id}/notas`, { titulo: 'Intento', tipo: 'consulta' })
  ok(r.status === 403, 'Recepción no puede escribir notas')
  r = await medico.post(`/api/clinica/mascotas/${toby.id}/notas`, { titulo: 'Revisión postquirúrgica', tipo: 'control', subjetivo: 'Buen apetito', objetivo: 'Pendiente' })
  ok(r.status === 201 && r.data.estado === 'borrador' && r.data.autor?.nombre === 'Dra. Paula Herrera', 'Médico crea nota en borrador', r.data)
  const nota = r.data
  r = await medico.post(`/api/clinica/notas/${nota.id}`, { titulo: 'Revisión postquirúrgica', tipo: 'control', subjetivo: 'Buen apetito', objetivo: 'Herida limpia', analisis: 'Evolución favorable', plan: 'Reposo 2 semanas' })
  ok(r.status === 200 && r.data.objetivo === 'Herida limpia', 'Edita el borrador')
  r = await medico.post(`/api/clinica/notas/${nota.id}/adendas`, { motivo: 'x', texto: 'y' })
  ok(r.status === 400, 'No admite adenda en borrador')
  r = await medico.post(`/api/clinica/notas/${nota.id}/firma`)
  ok(r.status === 200 && r.data.estado === 'firmada' && r.data.firmadaEn && r.data.firmadaPor === 'Dra. Paula Herrera', 'Firma la nota (sella fecha y firmante)', r.data)
  r = await medico.post(`/api/clinica/notas/${nota.id}`, { titulo: 'Cambiada', tipo: 'control' })
  ok(r.status === 400, 'Nota firmada: no se edita por la API de la clínica')
  r = await medico.llamar('PATCH', `/api/mas-notas/${nota.id}`, { plan: 'Cambiado por la API genérica' })
  ok(r.status === 400 || r.status === 403, 'Nota firmada: tampoco por la API genérica de Payload (hook)', { status: r.status })
  r = await medico.post(`/api/clinica/notas/${nota.id}/adendas`, { motivo: 'Aclaración', texto: 'El reposo es de 3 semanas.' })
  ok(r.status === 200 && r.data.adendas.length === 1 && r.data.adendas[0].autor === 'Dra. Paula Herrera', 'Agrega adenda con autor y fecha', r.data.adendas)
  r = await medico.post(`/api/clinica/notas/${nota.id}/borrar`)
  ok(r.status === 400, 'Nota firmada no se borra')
  r = await medico.get(`/api/clinica/mascotas/${toby.id}`)
  ok(r.data.notas?.length === 1 && r.data.notas[0].estado === 'firmada', 'Médico ve las notas en el expediente')
  r = await medico.post(`/api/clinica/mascotas/${toby.id}/notas`, { titulo: 'Borrador para borrar' })
  const borrador = r.data
  r = await medico.post(`/api/clinica/notas/${borrador.id}/borrar`)
  ok(r.status === 200, 'Un borrador sí se borra')

  /* ── documentos sin almacén ── */
  r = await medico.get(`/api/clinica/catalogo`)
  if (!r.data.documentosHabilitados) {
    const fd = new FormData()
    fd.append('archivo', new File([new Uint8Array([1, 2, 3])], 'receta.pdf', { type: 'application/pdf' }))
    fd.append('titulo', 'Receta')
    r = await medico.post(`/api/clinica/mascotas/${toby.id}/documentos`, fd)
    ok(r.status === 503, 'Sin almacén privado configurado, subir documento responde 503 claro', r.data)
  }

  /* ── vinculación y portal ── */
  console.log('\nPortal del tutor')
  r = await recepcion.post(`/api/clinica/clientes/${cliente.id}/codigo`)
  ok(r.status === 201 && /^[A-Z2-9]{6}$/.test(r.data.codigo), 'Recepción genera código de vinculación de 6 caracteres', r.data)
  const codigo = r.data.codigo
  const tutor = new Sesion()
  const emailTutor = `tutor${sufijo}@ejemplo.mx`
  r = await tutor.post('/api/tutores', { email: emailTutor, password: PASS, nombre: 'Mariana (portal)', cliente: cliente.id })
  ok(r.status === 201, 'El tutor se registra solo', r.data)
  ok(!r.data.doc?.cliente, 'El registro ignora el campo «cliente» aunque lo manden', r.data.doc?.cliente)
  ok(await tutor.login('tutores', emailTutor, PASS), 'El tutor entra al portal')
  r = await tutor.get('/api/clinica/portal/resumen')
  ok(r.status === 200 && r.data.cliente === null && r.data.mascotas.length === 0, 'Sin vincular: no ve ficha ni mascotas', r.data)
  r = await tutor.get('/api/clinica/catalogo')
  ok(r.status === 401, 'Un tutor no entra a la API del equipo (401)')
  r = await tutor.get('/api/finanzas/catalogo')
  ok(r.status === 401, 'Un tutor no entra a Finanzas (401)')
  r = await tutor.get('/api/users?depth=0')
  ok(r.status === 403 || (r.status === 200 && r.data.docs.length === 0), 'Un tutor no lee usuarios del equipo', { status: r.status, n: r.data?.docs?.length })
  r = await tutor.get('/api/roles?depth=0')
  ok(r.status === 403 || (r.status === 200 && r.data.docs.length === 0), 'Un tutor no lee roles', { status: r.status })
  r = await tutor.get(`/api/mascotas?depth=0`)
  ok(r.status === 403 || (r.status === 200 && r.data.docs.length === 0), 'API genérica: sin vincular, ninguna mascota', { status: r.status })
  r = await tutor.post('/api/clinica/portal/vincular', { codigo: 'XXXXXX' })
  ok(r.status === 400, 'Código inválido se rechaza')
  r = await tutor.post('/api/clinica/portal/vincular', { codigo: codigo.toLowerCase() })
  ok(r.status === 200 && r.data.cliente?.id === cliente.id, 'Vincula con el código (insensible a mayúsculas)', r.data)
  r = await tutor.post('/api/clinica/portal/vincular', { codigo })
  ok(r.status === 400, 'El código no sirve dos veces')
  await tutor.login('tutores', emailTutor, PASS) // refresca el usuario en la cookie
  r = await tutor.get('/api/clinica/portal/resumen')
  ok(r.status === 200 && r.data.cliente?.id === cliente.id && r.data.mascotas.length === 2, 'Vinculado: ve su ficha y sus 2 mascotas', { c: r.data.cliente?.id, n: r.data.mascotas?.length })
  ok(r.data.mascotas.find((m) => m.id === toby.id)?.proximaCartilla?.producto?.includes('Múltiple'), 'Resumen trae la próxima fecha de cartilla', r.data.mascotas?.map((m) => m.proximaCartilla))
  r = await tutor.get(`/api/clinica/portal/mascotas/${toby.id}`)
  ok(r.status === 200 && r.data.cartilla.length === 1 && r.data.pesos.length === 2 && !('notas' in r.data), 'Ficha de Toby: cartilla y pesos, sin notas', Object.keys(r.data))
  ok(r.data.mascota.notasInternas === null || r.data.mascota.notasInternas === undefined, 'El tutor no recibe notas internas')
  r = await tutor.get(`/api/mas-notas?depth=0`)
  ok(r.status === 403 || (r.status === 200 && r.data.docs.length === 0), 'API genérica: el tutor no lee notas clínicas', { status: r.status })
  r = await tutor.get(`/api/clientes?depth=0`)
  ok(r.status === 200 && r.data.docs.length === 1 && r.data.docs[0].id === cliente.id && r.data.docs[0].notasInternas === undefined, 'API genérica: solo su ficha, sin notas internas', r.data.docs?.map((d) => Object.keys(d)))

  // otra mascota de otro cliente: no la ve
  r = await recepcion.post('/api/clinica/clientes', { nombre: 'Jorge', apellidos: `Méndez ${sufijo}`, forzar: true })
  const otro = r.data.cliente
  r = await recepcion.post('/api/clinica/mascotas', { nombre: 'Max', especie: 'perro', tutores: [{ clienteId: otro.id }] })
  const max = r.data
  r = await tutor.get(`/api/clinica/portal/mascotas/${max.id}`)
  ok(r.status === 404, 'No abre la mascota de otro cliente (404)')
  r = await tutor.get(`/api/mascotas/${max.id}?depth=0`)
  ok(r.status === 403 || r.status === 404, 'Ni por la API genérica', { status: r.status })
  r = await tutor.llamar('PATCH', `/api/tutores/${(await tutor.get('/api/tutores/me')).data.user.id}`, { cliente: otro.id, nombre: 'Mariana cambiada' })
  r = await tutor.get('/api/tutores/me')
  ok(r.data.user.nombre === 'Mariana cambiada' && (r.data.user.cliente?.id ?? r.data.user.cliente) === cliente.id, 'El tutor edita su nombre pero no puede cambiarse de ficha', r.data.user)

  // el equipo ve la cuenta vinculada y puede desvincular
  r = await recepcion.get(`/api/clinica/clientes/${cliente.id}`)
  ok(r.data.cuentasPortal.length === 1 && r.data.codigosVigentes.length === 0, 'Ficha: muestra la cuenta vinculada; el código usado ya no está vigente', { c: r.data.cuentasPortal, k: r.data.codigosVigentes })
  const cuentaId = r.data.cuentasPortal[0].id
  r = await recepcion.post(`/api/clinica/cuentas/${cuentaId}/desvincular`)
  ok(r.status === 200, 'Recepción desvincula la cuenta')
  await tutor.login('tutores', emailTutor, PASS)
  r = await tutor.get('/api/clinica/portal/resumen')
  ok(r.data.mascotas.length === 0, 'Desvinculado: vuelve a no ver mascotas')

  /* ── importación ── */
  console.log('\nImportación')
  r = await recepcion.get('/api/clinica/importaciones/plantilla')
  ok(r.status === 403, 'Recepción no importa (403)')
  r = await admin.llamar('GET', '/api/clinica/importaciones/plantilla')
  ok(r.status === 200 && (r.headers.get('content-type') || '').includes('spreadsheetml'), 'Plantilla .xlsx descargable')
  const csv = [
    'Dueño;Teléfono;Mascota;Especie;Raza;Sexo;Nacimiento;Vacuna;Fecha vacuna;Próxima',
    `Ana Torres ${sufijo};228-555-${sufijo.slice(0, 4)};Firulais;Perro;Criollo;M;15/02/2019;Múltiple canina;10/01/2026;10/01/2027`,
    `Ana Torres ${sufijo};228 555 ${sufijo.slice(0, 4)};Firulais;Perro;;;;Antirrábica;10/01/2026;`,
    `Ana Torres ${sufijo};228555${sufijo.slice(0, 4)};Michi;Gato;;Hembra;3 años;;;`,
    `Mariana Ruiz ${sufijo};${cliente.telefono};Toby;Perro;Labrador;Macho;;Antirrábica;2026-03-14;2027-03-14`,
    `Mariana Ruiz ${sufijo};${cliente.telefono};Toby;Perro;;;;Múltiple canina (corregida);2026-03-14;`,
    `Sin mascota ${sufijo};2280000000;;Perro;;;;;;`,
  ].join('\n')
  let fd = new FormData()
  fd.append('archivo', new File([csv], 'pacientes.csv', { type: 'text/csv' }))
  r = await admin.post('/api/clinica/importaciones', fd)
  ok(r.status === 201 && r.data.columnas.length === 10 && r.data.totalFilas === 6, 'Carga CSV con «;»: 10 columnas, 6 filas', r.data)
  const imp = r.data
  ok(imp.mapeoSugerido['Dueño'] === 'tutor_nombre' && imp.mapeoSugerido['Mascota'] === 'mascota_nombre' && imp.mapeoSugerido['Vacuna'] === 'cartilla_producto' && imp.mapeoSugerido['Fecha vacuna'] === 'cartilla_fecha', 'Sugiere el mapeo por encabezados en español', imp.mapeoSugerido)
  const mapeo = { ...imp.mapeoSugerido, Nacimiento: 'fecha_nacimiento', Próxima: 'cartilla_proxima', Teléfono: 'tutor_telefono' }
  r = await admin.post(`/api/clinica/importaciones/${imp.id}/plan`, { mapeo })
  ok(r.status === 200, 'Plan calculado', r.data)
  const plan = r.data
  ok(plan.errores.length === 1 && plan.errores[0].fila === 7, 'Fila sin mascota marcada como error (fila 7)', plan.errores)
  ok(plan.tutores.nuevos === 1 && plan.tutores.existentes === 1, 'Tutores: 1 nuevo (Ana), 1 existente (Mariana por teléfono)', plan.tutores)
  ok(plan.mascotas.nuevas === 2 && plan.mascotas.existentes === 1, 'Mascotas: Firulais y Michi nuevas; Toby existente', plan.mascotas)
  ok(plan.cartilla === 4, '4 registros de cartilla leídos (2 Firulais + 2 Toby)', plan.cartilla)
  r = await admin.post(`/api/clinica/importaciones/${imp.id}/aplicar`, { mapeo })
  ok(r.status === 400, 'Con errores, no aplica')
  // quitamos la fila con error y volvemos a cargar
  fd = new FormData()
  fd.append('archivo', new File([csv.split('\n').slice(0, 6).join('\n')], 'pacientes.csv', { type: 'text/csv' }))
  r = await admin.post('/api/clinica/importaciones', fd)
  const imp2 = r.data
  r = await admin.post(`/api/clinica/importaciones/${imp2.id}/aplicar`, { mapeo })
  ok(r.status === 200 && r.data.clientesCreados === 1 && r.data.mascotasCreadas === 2, 'Aplica: 1 cliente y 2 mascotas creadas', r.data)
  r = await admin.post(`/api/clinica/importaciones/${imp2.id}/aplicar`, { mapeo })
  ok(r.status === 400, 'La misma importación no se aplica dos veces')
  r = await admin.get(`/api/clinica/buscar?q=Firulais`)
  const firulais = r.data.mascotas.find((m) => m.nombre === 'Firulais' && m.tutores.some((t) => t.nombre.includes(sufijo)))
  ok(firulais?.especie === 'perro' && firulais?.sexo === 'macho' && firulais?.fechaNacimiento === '2019-02-15', 'Firulais: especie, sexo «M» y fecha DD/MM/AAAA interpretados', firulais)
  r = await admin.get(`/api/clinica/mascotas/${firulais.id}`)
  ok(r.data.cartilla.length === 2 && r.data.cartilla.every((c) => c.aplicadoPor === null), 'Firulais con 2 vacunas importadas', r.data.cartilla)
  const michi = (await admin.get(`/api/clinica/buscar?q=Michi`)).data.mascotas.find((m) => m.tutores.some((t) => t.nombre.includes(sufijo)))
  ok(michi?.especie === 'gato' && michi?.nacimientoEstimado === true && /^20(23)-/.test(michi?.fechaNacimiento || ''), 'Michi: «3 años» → fecha estimada', michi)
  r = await admin.get(`/api/clinica/mascotas/${toby.id}`)
  ok(r.data.cartilla.length === 2 && r.data.cartilla.some((c) => c.producto === 'Antirrábica'), 'Toby existente: se agregó solo la vacuna que no tenía (Antirrábica), sin duplicar la Múltiple', r.data.cartilla?.map((c) => c.producto))
  r = await admin.get('/api/clinica/importaciones')
  ok(r.status === 200 && r.data.some((i) => i.id === imp2.id && i.estado === 'aplicada'), 'Historial de importaciones')

  /* ── agenda ── */
  console.log('\nAgenda y citas')
  r = await recepcion.post('/api/clinica/agenda/arranque')
  ok(r.status === 403, 'Recepción no crea los catálogos de la agenda (403)')
  r = await admin.get('/api/clinica/agenda/catalogo')
  if (!r.data.recursos.length) {
    r = await admin.post('/api/clinica/agenda/arranque')
    ok(r.status === 200, 'Catálogos sugeridos de agenda creados', r.data)
  }
  const cat = (await recepcion.get('/api/clinica/agenda/catalogo')).data
  ok(cat.recursos.length === 4 && cat.servicios.length >= 9 && cat.configuracion.intervaloMin === 30, 'Catálogo: 4 recursos, 9 servicios, intervalo 30', { r: cat.recursos.length, s: cat.servicios.length })
  const consulta = cat.servicios.find((s) => s.nombre === 'Consulta general')
  const bano = cat.servicios.find((s) => s.nombre === 'Baño')
  const cirugia = cat.servicios.find((s) => s.nombre === 'Cirugía ortopédica')
  // precio a la consulta (superadmin configura)
  r = await admin.llamar('PATCH', `/api/servicios/${consulta.id}`, { precio: 650 })
  ok(r.status === 200, 'Superadmin pone precio a Consulta general')
  r = await recepcion.llamar('PATCH', `/api/servicios/${consulta.id}`, { precio: 1 })
  ok(r.status === 403, 'Recepción no edita servicios (403)')
  // un martes futuro (abierto) y un domingo (cerrado)
  const prox = (dow) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + 7); while (d.getUTCDay() !== dow) d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) }
  const martes = prox(2), domingo = prox(0)
  r = await recepcion.get(`/api/clinica/agenda/disponibilidad?servicio=${consulta.id}&dia=${martes}`)
  ok(r.status === 200 && r.data.abierto && r.data.huecos[0].hora === '09:00' && r.data.huecos.every((h) => h.disponible), 'Martes: huecos desde 09:00 todos libres', r.data.huecos?.slice(0, 2))
  const nHuecos = r.data.huecos.length
  r = await recepcion.get(`/api/clinica/agenda/disponibilidad?servicio=${consulta.id}&dia=${domingo}`)
  ok(r.status === 200 && !r.data.abierto, 'Domingo: cerrado')
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: toby.id, servicioId: consulta.id, dia: martes, hora: '10:00', confirmar: true })
  ok(r.status === 201 && r.data.estado === 'confirmada' && r.data.folio.startsWith('CIT-') && r.data.horaFin === '10:30' && r.data.recurso.nombre === 'Consultorio 1', 'Recepción agenda a Toby el martes 10:00 (confirmada)', r.data)
  const c1 = r.data
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: luna.id, servicioId: consulta.id, dia: martes, hora: '10:00' })
  ok(r.status === 409, 'Mismo consultorio y hora: choque (409)', r.data)
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: luna.id, servicioId: consulta.id, dia: martes, hora: '10:00', recursoId: cat.recursos.find((x) => x.nombre === 'Consultorio 2').id })
  ok(r.status === 201 && r.data.recurso.nombre === 'Consultorio 2', 'Misma hora en otro consultorio sí se puede')
  const c2 = r.data
  r = await recepcion.get(`/api/clinica/agenda/disponibilidad?servicio=${consulta.id}&dia=${martes}`)
  ok(r.data.huecos.find((h) => h.hora === '10:00').disponible === false && r.data.huecos.filter((h) => h.disponible).length === nHuecos - 1, 'Disponibilidad refleja el hueco ocupado')
  r = await recepcion.post('/api/clinica/agenda/citas', { mascotaId: toby.id, servicioId: consulta.id, dia: martes, hora: '25:00' })
  ok(r.status === 400, 'Hora inválida se rechaza')
  r = await recepcion.get(`/api/clinica/agenda?dia=${martes}`)
  ok(r.status === 200 && r.data.citas.length === 2 && r.data.abierto && r.data.de === '09:00', 'Agenda del martes: 2 citas', { n: r.data.citas?.length, de: r.data.de })
  // estados
  r = await recepcion.post(`/api/clinica/agenda/citas/${c1.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 400, 'Confirmada → finalizada no es transición válida')
  r = await recepcion.post(`/api/clinica/agenda/citas/${c1.id}/estado`, { estado: 'llegada' })
  ok(r.status === 200 && r.data.estado === 'llegada' && r.data.historial.length === 2, 'Confirmada → llegada (historial con 2 pasos)')
  r = await recepcion.post(`/api/clinica/agenda/citas/${c1.id}/estado`, { estado: 'atencion' })
  r = await recepcion.post(`/api/clinica/agenda/citas/${c1.id}/estado`, { estado: 'finalizada' })
  ok(r.status === 200 && r.data.estado === 'finalizada' && r.data.cargoFinanzas, 'Finalizada: genera cargo en Finanzas (servicio con precio)', r.data)
  r = await admin.get(`/api/finanzas/operaciones/${r.data.cargoFinanzas}`)
  ok(r.status === 200 && r.data.operacion?.totalCentavos === 65000 && r.data.operacion?.tipo === 'entrada' && r.data.operacion?.estadoPago === 'pendiente' && r.data.operacion?.contraparte.includes('Mariana'), 'Cargo: entrada de $650 pendiente de cobro a nombre del tutor', r.data.operacion && { t: r.data.operacion.tipo, i: r.data.operacion.totalCentavos, e: r.data.operacion.estadoPago, c: r.data.operacion.concepto })
  r = await recepcion.post(`/api/clinica/agenda/citas/${c2.id}/estado`, { estado: 'cancelada' })
  ok(r.status === 400, 'Cancelar sin motivo se rechaza')
  r = await recepcion.post(`/api/clinica/agenda/citas/${c2.id}/estado`, { estado: 'cancelada', motivo: 'El tutor llamó' })
  ok(r.status === 200 && r.data.estado === 'cancelada', 'Cancelada con motivo')
  r = await recepcion.get(`/api/clinica/agenda/disponibilidad?servicio=${consulta.id}&dia=${martes}&recurso=${c2.recurso.id}`)
  ok(r.data.huecos.find((h) => h.hora === '10:00').disponible === true, 'Cancelada libera el hueco')
  r = await recepcion.get(`/api/clinica/mascotas/${toby.id}/citas`)
  ok(r.status === 200 && r.data.length === 1 && r.data[0].estado === 'finalizada', 'Citas de la mascota')
  // portal
  r = await recepcion.post(`/api/clinica/clientes/${cliente.id}/codigo`)
  await tutor.post('/api/clinica/portal/vincular', { codigo: r.data.codigo })
  await tutor.login('tutores', emailTutor, PASS)
  r = await tutor.get('/api/clinica/portal/citas')
  ok(r.status === 200 && r.data.servicios.every((s) => s.reservaEnLinea !== 'no') && r.data.mascotas.length === 2 && r.data.pasadas.length === 2, 'Portal: servicios en línea, 2 mascotas, 2 citas cerradas (finalizada y cancelada)', { s: r.data.servicios?.length, m: r.data.mascotas?.length, p: r.data.pasadas?.length })
  r = await tutor.get(`/api/clinica/portal/citas/disponibilidad?servicio=${bano.id}&dia=${martes}`)
  ok(r.status === 200 && r.data.abierto && r.data.huecos.length > 0, 'Portal: disponibilidad de baño')
  r = await tutor.get(`/api/clinica/portal/citas/disponibilidad?servicio=${bano.id}&dia=2020-01-01`)
  ok(r.status === 200 && !r.data.abierto, 'Portal: día pasado no disponible')
  r = await tutor.post('/api/clinica/portal/citas', { mascotaId: max.id, servicioId: bano.id, dia: martes, hora: '11:00' })
  ok(r.status === 404, 'Portal: no agenda una mascota ajena')
  r = await tutor.post('/api/clinica/portal/citas', { mascotaId: luna.id, servicioId: bano.id, dia: martes, hora: '08:00' })
  ok(r.status === 400, 'Portal: fuera de horario se rechaza')
  r = await tutor.post('/api/clinica/portal/citas', { mascotaId: luna.id, servicioId: bano.id, dia: martes, hora: '11:00', notasTutor: 'Tiene la piel sensible' })
  ok(r.status === 201 && r.data.estado === 'solicitada' && r.data.origen === 'portal' && r.data.horaFin === '12:00', 'Portal: pide baño para Luna (solicitada)', r.data)
  const c3 = r.data
  r = await tutor.post('/api/clinica/portal/citas', { mascotaId: toby.id, servicioId: bano.id, dia: martes, hora: '11:30' })
  ok(r.status === 409, 'Portal: hueco ocupado (el baño dura 60 min) → 409')
  r = await tutor.post('/api/clinica/portal/citas', { mascotaId: toby.id, servicioId: cirugia.id, dia: martes, hora: '12:00' })
  ok(r.status === 201 && r.data.estado === 'solicitada', 'Portal: servicio «con valoración» se solicita y la clínica decide')
  r = await recepcion.get(`/api/clinica/agenda?dia=${martes}`)
  ok(r.data.porConfirmar.some((x) => x.id === c3.id) && r.data.citas.find((x) => x.id === c3.id)?.notasTutor === 'Tiene la piel sensible', 'Panel ve la solicitud del portal con las notas del tutor')
  r = await tutor.post(`/api/clinica/portal/citas/${c3.id}/reprogramar`, { dia: martes, hora: '13:00' })
  ok(r.status === 200 && r.data.horaInicio === '13:00' && r.data.estado === 'solicitada', 'Portal: reprograma a las 13:00')
  r = await recepcion.post(`/api/clinica/agenda/citas/${c3.id}/estado`, { estado: 'confirmada' })
  ok(r.status === 200, 'Recepción confirma')
  r = await tutor.post(`/api/clinica/portal/citas/${c3.id}/cancelar`, { motivo: 'Cambio de planes' })
  ok(r.status === 200 && r.data.estado === 'cancelada', 'Portal: cancela con anticipación')
  r = await tutor.post(`/api/clinica/portal/citas/${c1.id}/cancelar`, {})
  ok(r.status === 400, 'Portal: no cancela una cita finalizada')
  r = await tutor.get('/api/citas?depth=0')
  ok(r.status === 200 && r.data.docs.every((x) => x.notasInternas === undefined && (x.historial === undefined || x.historial.length === 0)), 'API genérica: el tutor no ve notas internas ni historial de citas', r.data.docs?.[0] && Object.keys(r.data.docs[0]))

  console.log(`\n${total - fallas}/${total} correctas${fallas ? ` · ${fallas} fallaron` : ''}\n`)
  process.exit(fallas ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
