import type { Payload, Where } from 'payload'

import type { Modulos } from './modulos'

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Puesta a punto (UX del panel 2, nov-2026)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La lista de `docs/ARRANQUE.md` revisada contra lo que de verdad hay en la
 * base: qué falta para operar con datos reales y a qué pantalla ir. Solo LEE
 * (conteos y globales); nunca escribe ni crea nada.
 *
 * Las variables de entorno se revisan solo por presencia (sí / no): ningún
 * valor sale de aquí. Lo ve quien administra usuarios (dueño o superadmin).
 *
 * Estados:
 *   - listo     ya está;
 *   - falta     sin esto algo no funciona o se ve incompleto ante el cliente;
 *   - revisa    está, pero conviene corregirlo (p. ej. el pago de prueba);
 *   - opcional  mejora la operación; no cuenta como pendiente.
 */

export type EstadoPaso = 'listo' | 'falta' | 'revisa' | 'opcional'
export type PasoPuesta = { clave: string; titulo: string; detalle: string; estado: EstadoPaso; href: string | null; accion: string | null }
export type SeccionPuesta = { clave: string; titulo: string; pasos: PasoPuesta[] }
export type PuestaAPunto = { secciones: SeccionPuesta[]; total: number; listos: number; pendientes: number }

const hay = (v: unknown) => (typeof v === 'string' ? v.trim().length > 0 : Boolean(v))
const env = (n: string) => hay(process.env[n])
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

/** Cuenta documentos sin lanzar: si una colección no existe o falla, cuenta 0. */
async function contar(payload: Payload, collection: string, where?: Where): Promise<number> {
  try {
    return (await payload.count({ collection: collection as never, overrideAccess: true, where })).totalDocs
  } catch {
    return 0
  }
}

async function global<T>(payload: Payload, slug: string): Promise<Partial<T> & { updatedAt?: string | null }> {
  try {
    return (await payload.findGlobal({ slug: slug as never, depth: 0, overrideAccess: true })) as Partial<T> & { updatedAt?: string | null }
  } catch {
    return {}
  }
}

function paso(clave: string, titulo: string, ok: boolean, detalle: { ok: string; no: string }, href: string | null, accion: string | null, siNo: EstadoPaso = 'falta'): PasoPuesta {
  return { clave, titulo, detalle: ok ? detalle.ok : detalle.no, estado: ok ? 'listo' : siNo, href, accion }
}

type Global = Record<string, unknown>

export async function puestaAPunto(payload: Payload, modulos: Modulos, rutaAdmin: string): Promise<PuestaAPunto> {
  const a = rutaAdmin.replace(/\/+$/, '')
  const secciones: SeccionPuesta[] = []
  const vercel = 'En Vercel → Settings → Environment Variables (y volver a desplegar).'

  /* ───────── 1 · Servidor (solo presencia de variables) ───────── */
  const urlPublica = process.env.NEXT_PUBLIC_SITE_URL ?? ''
  secciones.push({
    clave: 'servidor',
    titulo: 'Servidor',
    pasos: [
      paso('url', 'Dirección pública', /^https:\/\//.test(urlPublica) && !/localhost|127\.0\.0\.1/.test(urlPublica), { ok: 'Las ligas de los correos llevan el dominio.', no: `Falta NEXT_PUBLIC_SITE_URL con https. ${vercel}` }, null, null),
      paso('correos', 'Correos', env('RESEND_API_KEY') && env('LEADS_FROM_EMAIL'), { ok: 'Salen los correos de citas, avisos y contraseñas.', no: `Sin RESEND_API_KEY y LEADS_FROM_EMAIL no sale ningún correo. ${vercel}` }, null, null),
      paso('cron', 'Tareas diarias', env('CRON_SECRET'), { ok: 'Recordatorios de citas y resúmenes diarios activos.', no: `Sin CRON_SECRET no hay recordatorio de la víspera ni resumen de farmacia. ${vercel}` }, null, null),
      paso('blob', 'Archivos', env('FINANZAS_BLOB_READ_WRITE_TOKEN'), { ok: 'Comprobantes y documentos se guardan en el almacén privado.', no: `Falta FINANZAS_BLOB_READ_WRITE_TOKEN: no se pueden subir comprobantes ni documentos. ${vercel}` }, null, null),
      paso('voz', 'Nota de voz', env('ANTHROPIC_API_KEY'), { ok: 'La nota de voz de Finanzas está disponible.', no: 'Opcional: con ANTHROPIC_API_KEY se capturan gastos dictando.' }, null, null, 'opcional'),
    ],
  })

  /* ───────── 2 · Instalación y Finanzas ───────── */
  const [instalacion, finCfg, nCategorias, nCuentas, nRoles, nUsuarios] = await Promise.all([
    global<Global>(payload, 'instalacion-configuracion'),
    global<{ fechaCorte: string | null }>(payload, 'fin-configuracion'),
    contar(payload, 'fin-categorias'),
    contar(payload, 'fin-cuentas'),
    contar(payload, 'roles'),
    contar(payload, 'users'),
  ])
  const encendidos = [modulos.clinica && 'Clínica', modulos.estetica && 'Estética', modulos.farmacia && 'Farmacia', modulos.tienda && 'Tienda'].filter(Boolean).join(', ') || 'solo Finanzas'
  secciones.push({
    clave: 'base',
    titulo: 'Módulos y Finanzas',
    pasos: [
      paso('modulos', 'Módulos', hay(instalacion.updatedAt), { ok: `Encendidos: ${encendidos}.`, no: `Revisa qué usa la clínica. Hoy: ${encendidos}.` }, `${a}/globals/instalacion-configuracion`, 'Elegir módulos'),
      paso('categorias', 'Categorías y áreas', nCategorias > 0, { ok: plural(nCategorias, 'categoría', 'categorías') + '.', no: 'Crea las sugeridas (Consulta, Cirugía, Farmacia…) y edítalas después.' }, `${a}/finanzas/configuracion`, 'Ir a Configuración'),
      paso('cuentas', 'Cuentas y cajas', nCuentas > 0, { ok: plural(nCuentas, 'cuenta', 'cuentas') + '.', no: 'Una por cada lugar donde vive el dinero (banco, caja de recepción, caja de farmacia).' }, `${a}/finanzas/configuracion`, 'Ir a Configuración'),
      paso('corte', 'Fecha de corte', hay(finCfg.fechaCorte), { ok: `Finanzas cuenta desde ${finCfg.fechaCorte}.`, no: 'Desde cuándo cuenta Finanzas; nada anterior se registra.' }, `${a}/finanzas/configuracion`, 'Ir a Configuración'),
    ],
  })

  /* ───────── 3 · Equipo ───────── */
  const pasosEquipo: PasoPuesta[] = [
    paso('roles', 'Roles', nRoles > 0, { ok: plural(nRoles, 'rol', 'roles') + '.', no: 'Crea los sugeridos (Dueño, Administración, Médico, Recepción…).' }, `${a}/finanzas/configuracion`, 'Crear los sugeridos'),
    paso('usuarios', 'Personas del equipo', nUsuarios > 1, { ok: plural(nUsuarios, 'persona', 'personas') + ' con acceso.', no: 'Da de alta a cada persona con su rol (nadie comparte cuenta).' }, `${a}/collections/users/create`, 'Dar de alta'),
  ]
  if (modulos.clinica) {
    let sinCedula = 0
    try {
      const rolesMedicos = await payload.find({ collection: 'roles', depth: 0, pagination: false, overrideAccess: true, where: { 'clinica.escribirExpediente': { equals: true } }, select: { nombre: true } })
      const ids = rolesMedicos.docs.map((r) => r.id)
      if (ids.length) sinCedula = await contar(payload, 'users', { and: [{ rolDeAcceso: { in: ids } }, { or: [{ cedulaProfesional: { exists: false } }, { cedulaProfesional: { equals: '' } }] }] })
    } catch {
      sinCedula = 0
    }
    pasosEquipo.push(paso('cedulas', 'Cédulas de los médicos', sinCedula === 0, { ok: 'Quien escribe en el expediente tiene su cédula (la piden las recetas).', no: `${plural(sinCedula, 'persona', 'personas')} que escribe${sinCedula === 1 ? '' : 'n'} en el expediente sin cédula profesional.` }, `${a}/collections/users`, 'Ver usuarios', 'revisa'))
  }
  secciones.push({ clave: 'equipo', titulo: 'Equipo', pasos: pasosEquipo })

  /* ───────── 4 · Clínica y sitio ───────── */
  if (modulos.clinica) {
    const [agenda, sitio, nRecursos, nServicios, nSinPrecio, nClientes] = await Promise.all([
      global<{ horario: unknown[]; correoAvisos: string | null }>(payload, 'agenda-configuracion'),
      global<{ publicado: boolean; lema: string; avisoPrivacidad: string; contacto: { telefono?: string | null; whatsapp?: string | null; direccion?: string | null; mapaUrl?: string | null } }>(payload, 'sitio-configuracion'),
      contar(payload, 'recursos', { activo: { equals: true } }),
      contar(payload, 'servicios', { activo: { equals: true } }),
      /* Sin precio general y sin ser de estética (la estética se revisa por talla abajo). */
      contar(payload, 'servicios', { and: [{ activo: { equals: true } }, { or: [{ precio: { exists: false } }, { precio: { equals: 0 } }] }, { estetica: { not_equals: true } }] }),
      contar(payload, 'clientes'),
    ])
    const contacto = sitio.contacto ?? {}
    secciones.push({
      clave: 'clinica',
      titulo: 'Clínica y sitio',
      pasos: [
        paso('horario', 'Horario de la agenda', Array.isArray(agenda.horario) && agenda.horario.length > 0, { ok: 'Horario por día capturado.', no: 'Hoy usa el horario por omisión (L–V 9–19, sáb 9–14).' }, `${a}/globals/agenda-configuracion`, 'Capturar horario'),
        paso('servicios', 'Consultorios y servicios', nRecursos > 0 && nServicios > 0, { ok: `${plural(nRecursos, 'espacio', 'espacios')} y ${plural(nServicios, 'servicio', 'servicios')}.`, no: 'Crea los sugeridos desde la agenda y ajústalos.' }, `${a}/clinica/agenda`, 'Ir a la agenda'),
        paso('precios', 'Precios de los servicios', nServicios > 0 && nSinPrecio === 0, { ok: 'Cada servicio genera su cargo en Finanzas al finalizar.', no: nServicios ? `${plural(nSinPrecio, 'servicio activo', 'servicios activos')} sin precio: al finalizar no generan cargo.` : 'Primero crea los servicios.' }, `${a}/collections/servicios`, 'Ver servicios', 'revisa'),
        paso('avisos', 'Correo de la clínica para avisos', hay(agenda.correoAvisos), { ok: 'Le avisamos cuando un tutor pide, cambia o cancela.', no: 'Opcional: quién recibe las citas pedidas en el portal.' }, `${a}/globals/agenda-configuracion`, 'Capturar correo', 'opcional'),
        paso('contacto', 'Teléfono y WhatsApp', hay(contacto.whatsapp) || hay(contacto.telefono), { ok: 'Salen en el sitio, el portal, los correos y la cartilla.', no: 'Sin ellos no hay botón de WhatsApp ni «Llamar».' }, `${a}/globals/sitio-configuracion`, 'Ir a Sitio público'),
        paso('direccion', 'Dirección y mapa', hay(contacto.direccion) && hay(contacto.mapaUrl), { ok: 'El sitio y el portal muestran «Cómo llegar».', no: 'Dirección y liga de Google Maps (Compartir → Copiar vínculo).' }, `${a}/globals/sitio-configuracion`, 'Ir a Sitio público'),
        paso('privacidad', 'Aviso de privacidad', hay(sitio.avisoPrivacidad), { ok: 'Publicado en /aviso-de-privacidad.', no: 'El sitio y el portal recaban datos personales: hace falta el texto del aviso.' }, `${a}/globals/sitio-configuracion`, 'Ir a Sitio público'),
        paso('publicado', 'Sitio publicado', Boolean(sitio.publicado), { ok: 'La raíz del dominio muestra el sitio completo.', no: 'Apagado: la raíz solo muestra el nombre y los accesos. Enciéndelo cuando el contenido esté listo.' }, `${a}/globals/sitio-configuracion`, 'Ir a Sitio público'),
        paso('pacientes', 'Pacientes', nClientes > 0, { ok: plural(nClientes, 'cliente', 'clientes') + ' capturados.', no: 'Importa con la plantilla o da de alta cliente por cliente.' }, `${a}/clinica/importar`, 'Importar'),
      ],
    })
  }

  /* ───────── 5 · Estética ───────── */
  if (modulos.clinica && modulos.estetica) {
    const [est, nServEst, nServEstSinPrecio, nAdicionales] = await Promise.all([
      global<{ nombreMarca: string | null }>(payload, 'estetica-configuracion'),
      contar(payload, 'servicios', { and: [{ activo: { equals: true } }, { estetica: { equals: true } }] }),
      contar(payload, 'servicios', {
        and: [
          { activo: { equals: true } },
          { estetica: { equals: true } },
          { or: [{ precio: { exists: false } }, { precio: { equals: 0 } }] },
          { 'preciosTalla.chico': { exists: false } },
          { 'preciosTalla.mediano': { exists: false } },
          { 'preciosTalla.grande': { exists: false } },
          { 'preciosTalla.gigante': { exists: false } },
        ],
      }),
      contar(payload, 'est-adicionales', { activo: { equals: true } }),
    ])
    let faltanRoles = 0
    try {
      const { rolesPendientes } = await import('./clinica/esteticaDia')
      faltanRoles = (await rolesPendientes(payload)).length
    } catch {
      faltanRoles = 0
    }
    secciones.push({
      clave: 'estetica',
      titulo: 'Estética',
      pasos: [
        paso('marca', 'Nombre de la estética', hay(est.nombreMarca), { ok: `El tutor la ve como «${est.nombreMarca}».`, no: 'Vacío: el tutor ve «Estética».' }, `${a}/globals/estetica-configuracion`, 'Marca y tallas'),
        paso('servicios', 'Servicios con precio por talla', nServEst > 0 && nServEstSinPrecio === 0, { ok: plural(nServEst, 'servicio de estética', 'servicios de estética') + ' con precio.', no: nServEst ? `${plural(nServEstSinPrecio, 'servicio', 'servicios')} de estética sin precio.` : 'Marca tus baños y cortes como «Servicio de estética» y captura sus precios.' }, `${a}/collections/servicios`, 'Ver servicios'),
        paso('adicionales', 'Adicionales', nAdicionales > 0, { ok: plural(nAdicionales, 'adicional activo', 'adicionales activos') + '.', no: 'Opcional: uñas, deslanado… con su precio.' }, `${a}/collections/est-adicionales`, 'Ver adicionales', 'opcional'),
        paso('roles', 'Roles de estética', faltanRoles === 0, { ok: 'Existe «Estilista» y los roles base tienen la estética.', no: 'Toca «Preparar roles» en el tablero de estética.' }, `${a}/clinica/estetica`, 'Ir al tablero'),
      ],
    })
  }

  /* ───────── 6 · Farmacia ───────── */
  if (modulos.farmacia) {
    const [far, nAlmacenes, nProveedores, nProductos, nLotes] = await Promise.all([
      global<{ metodosPago: { clave: string; cuenta?: unknown; activo?: boolean | null }[]; finanzas: { area?: unknown; categoriaVentas?: unknown; categoriaCompras?: unknown }; pasarelaActiva: string; tienda: { correosPedidos?: string | null; domicilioActivo?: boolean | null; zonas?: unknown[] | null } }>(payload, 'farmacia-configuracion'),
      contar(payload, 'far-almacenes'),
      contar(payload, 'far-proveedores'),
      contar(payload, 'far-productos', { activo: { equals: true } }),
      contar(payload, 'far-lotes', { existencia: { greater_than: 0 } }),
    ])
    const metodos = (far.metodosPago ?? []).filter((m) => m.activo !== false)
    const sinCuenta = metodos.filter((m) => !m.cuenta).length
    const fin = far.finanzas ?? {}
    secciones.push({
      clave: 'farmacia',
      titulo: 'Farmacia',
      pasos: [
        paso('almacen', 'Almacén', nAlmacenes > 0, { ok: plural(nAlmacenes, 'almacén', 'almacenes') + '.', no: 'Crea el almacén «Farmacia» desde el inicio de Farmacia.' }, `${a}/farmacia`, 'Ir a Farmacia'),
        paso('metodos', 'Métodos de pago con cuenta', metodos.length > 0 && sinCuenta === 0, { ok: plural(metodos.length, 'método', 'métodos') + ', cada uno con su cuenta.', no: metodos.length ? `${plural(sinCuenta, 'método', 'métodos')} sin cuenta de Finanzas: el mostrador no cobra con ellos.` : 'Sin métodos de pago el mostrador no cobra.' }, `${a}/farmacia/configuracion`, 'Ir a Configuración'),
        paso('finanzas', 'Área y categorías de Finanzas', hay(fin.area) && hay(fin.categoriaVentas) && hay(fin.categoriaCompras), { ok: 'Ventas y compras entran a Finanzas en su lugar.', no: 'Elige el área y las categorías de ventas y compras.' }, `${a}/farmacia/configuracion`, 'Ir a Configuración'),
        paso('proveedores', 'Proveedores', nProveedores > 0, { ok: plural(nProveedores, 'proveedor', 'proveedores') + '.', no: 'Con días de entrega, para el reabasto sugerido.' }, `${a}/farmacia/configuracion`, 'Ir a Configuración'),
        paso('catalogo', 'Catálogo', nProductos > 0, { ok: plural(nProductos, 'producto activo', 'productos activos') + '.', no: 'Importa con la plantilla (borra antes los productos de ejemplo de la hoja).' }, `${a}/farmacia/importar`, 'Importar catálogo'),
        paso('inventario', 'Inventario inicial', nLotes > 0, { ok: plural(nLotes, 'lote con existencia', 'lotes con existencia') + '.', no: 'Con la primera compra (XML) o con ajustes por lote y caducidad.' }, `${a}/farmacia/compras/nueva`, 'Recibir compra'),
      ],
    })

    /* ───────── 7 · Tienda ───────── */
    if (modulos.tienda) {
      const nPublicados = await contar(payload, 'far-productos', { and: [{ activo: { equals: true } }, { publicadoTienda: { equals: true } }] })
      const tienda = far.tienda ?? {}
      const pasarela = far.pasarelaActiva
      const mp = env('MERCADOPAGO_ACCESS_TOKEN') && env('MERCADOPAGO_WEBHOOK_SECRET')
      const pagoEnLinea: PasoPuesta =
        pasarela === 'mercadopago'
          ? paso('pasarela', 'Pago en línea', mp, { ok: 'Mercado Pago con sus dos variables.', no: `Mercado Pago elegido sin MERCADOPAGO_ACCESS_TOKEN y MERCADOPAGO_WEBHOOK_SECRET. ${vercel}` }, `${a}/farmacia/configuracion`, 'Ir a Configuración')
          : pasarela === 'prueba'
            ? { clave: 'pasarela', titulo: 'Pago en línea', detalle: 'Pago de prueba (simulado): solo para ensayar, nunca con clientes reales.', estado: 'revisa', href: `${a}/farmacia/configuracion`, accion: 'Ir a Configuración' }
            : { clave: 'pasarela', titulo: 'Pago en línea', detalle: 'Sin pasarela: los pedidos se pagan al recoger.', estado: 'opcional', href: `${a}/farmacia/configuracion`, accion: 'Ir a Configuración' }
      const pasos: PasoPuesta[] = [
        paso('publicados', 'Productos en la tienda', nPublicados > 0, { ok: plural(nPublicados, 'producto publicado', 'productos publicados') + '.', no: 'Marca «Publicado en la tienda» en lo que se vende en línea.' }, `${a}/farmacia/productos`, 'Ver productos'),
        pagoEnLinea,
        paso('correosPedidos', 'Correos de pedidos', hay(tienda.correosPedidos), { ok: 'Los pedidos nuevos llegan por correo.', no: 'Opcional: quién recibe los pedidos nuevos.' }, `${a}/farmacia/configuracion`, 'Ir a Configuración', 'opcional'),
      ]
      if (tienda.domicilioActivo) pasos.push(paso('zonas', 'Zonas de entrega', (tienda.zonas ?? []).length > 0, { ok: plural((tienda.zonas ?? []).length, 'zona', 'zonas') + ' a domicilio.', no: 'Domicilio encendido sin zonas: nadie puede pedir a domicilio.' }, `${a}/farmacia/configuracion`, 'Ir a Configuración'))
      if (env('PAGOS_PRUEBA_SECRETO')) pasos.push({ clave: 'secretoPrueba', titulo: 'Variable de pago de prueba', detalle: `PAGOS_PRUEBA_SECRETO sigue puesta: quítala antes de abrir la tienda al público. ${vercel}`, estado: 'revisa', href: null, accion: null })
      secciones.push({ clave: 'tienda', titulo: 'Tienda en línea', pasos })
    }
  }

  const todos = secciones.flatMap((s) => s.pasos).filter((p) => p.estado !== 'opcional')
  const listos = todos.filter((p) => p.estado === 'listo').length
  return { secciones, total: todos.length, listos, pendientes: todos.length - listos }
}
