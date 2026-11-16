import type { AdminViewServerProps, PayloadRequest } from 'payload'
import { Gutter } from '@payloadcms/ui'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'

import { agendaDelDia } from '../../lib/clinica/agenda'
import { contextoDesdeReq as contextoClinica } from '../../lib/clinica/servicio'
import { tableroEstetica, type TarjetaEstetica } from '../../lib/clinica/esteticaDia'
import type { CitaVista } from '../../lib/clinica/tipos'
import { catalogo as catalogoFarmacia, contextoDesdeReq as contextoFarmacia } from '../../lib/farmacia/servicio'
import type { CatalogoFarmacia } from '../../lib/farmacia/tipos'
import { formatoMXN } from '../../lib/finanzas/reglas'
import { contextoDesdeReq as contextoFinanzas, pendientes as pendientesFinanzas } from '../../lib/finanzas/servicio'
import type { OperacionVista } from '../../lib/finanzas/tipos'
import { diaLocal, partesLocales } from '../../lib/localTime'
import { leerModulos } from '../../lib/modulos'
import { esSoloCaptura, permisosDe, usaClinica, usaFarmacia, usaFinanzas } from '../../lib/permisos'
import { fechaLarga } from '../../lib/whatsapp'
import { AgendaDeHoy, type FilaAgenda } from './TableroAgenda'

/**
 * Tablero «Hoy» (Versión A, fase 2, nov-2026). Reemplaza el tablero de fábrica
 * de Payload (`admin.components.views.dashboard.Component`) y a la antigua
 * Bienvenida, que vivía en `beforeDashboard` (al reemplazar el tablero esa
 * franja deja de pintarse; sus dos redirecciones se conservan aquí).
 *
 * Todo sale de lo que ya existe, sin consultas nuevas:
 *   - Clínica: `agendaDelDia()` (lo mismo que GET /api/clinica/agenda?dia=).
 *   - Farmacia: `catalogo().hoy` (las cifras del inicio de Farmacia).
 *   - Finanzas: `pendientes()` (por cobrar = entradas con saldo pendiente).
 *   - Estética (nov-2026, UX del panel 1): `tableroEstetica()` del día, en un
 *     bloque por etapa con «Lista para recoger» y su WhatsApp.
 *   - Tienda: `pedidosTienda` del resumen de Farmacia y los planes detenidos.
 * Cada bloque aparece solo si el módulo está encendido y el rol lo puede ver;
 * si una fuente falla, ese bloque avisa y lo demás se pinta igual.
 */

type Cifra = { valor: string; etiqueta: string; href: string; aviso?: boolean }
type Pendiente = { clave: string; tipo: string; tono: 'cobro' | 'farmacia' | 'aviso' | 'estetica'; texto: string; href: string }

const EN_PROCESO: TarjetaEstetica['etapa'][] = ['recibida', 'bano', 'secado', 'corte']
const NOMBRE_ETAPA: Record<TarjetaEstetica['etapa'], string> = { por_llegar: 'Por llegar', recibida: 'Recibida', bano: 'Baño', secado: 'Secado', corte: 'Corte', lista: 'Lista', entregada: 'Entregada' }

function saludoSegunHora(fecha: Date): string {
  const { hour: hora } = partesLocales(fecha)
  if (hora < 12) return 'Buenos días'
  if (hora < 19) return 'Buenas tardes'
  return 'Buenas noches'
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

async function intentar<T>(fn: () => Promise<T>): Promise<{ ok: true; datos: T } | { ok: false }> {
  try {
    return { ok: true, datos: await fn() }
  } catch {
    return { ok: false }
  }
}

export default async function Tablero({ initPageResult }: AdminViewServerProps) {
  const req = initPageResult.req as PayloadRequest
  const rutaAdmin = req.payload.config.routes.admin || '/admin'
  if (!req.user || (req.user as { collection?: string }).collection !== 'users') return null

  const [p, modulos] = await Promise.all([permisosDe(req), leerModulos(req.payload)])
  const conFarmacia = modulos.farmacia && usaFarmacia(p)
  /* Las dos redirecciones de la antigua Bienvenida: quien solo captura va a Finanzas;
     quien no entra al panel ni usa Finanzas pero sí la farmacia (vendedor, repartidor), a Farmacia. */
  if (esSoloCaptura(p)) redirect(`${rutaAdmin}/finanzas`)
  if (!p.panel && !usaFinanzas(p) && conFarmacia) redirect(`${rutaAdmin}/farmacia`)

  const conAgenda = modulos.clinica && p.clinica.agenda
  const conPacientes = modulos.clinica && usaClinica(p)
  const conFinanzas = usaFinanzas(p)
  const conEstetica = modulos.clinica && modulos.estetica && p.clinica.estetica
  /* La estilista (estética sin agenda, Finanzas ni farmacia) trabaja en su tablero. */
  if (conEstetica && !conAgenda && !conFinanzas && !conFarmacia) redirect(`${rutaAdmin}/clinica/estetica`)
  const conPlanes = conFarmacia && modulos.tienda && p.farmacia.vender

  const [agenda, farmacia, finanzas, estetica, planesDetenidos] = await Promise.all([
    conAgenda
      ? intentar(async () => {
          const ctx = await contextoClinica(req)
          if (!ctx) throw new Error('sin sesión')
          return agendaDelDia(ctx, ctx.hoy)
        })
      : null,
    conFarmacia
      ? intentar(async (): Promise<CatalogoFarmacia['hoy']> => {
          const ctx = await contextoFarmacia(req)
          if (!ctx) throw new Error('sin sesión')
          return (await catalogoFarmacia(ctx)).hoy
        })
      : null,
    conFinanzas
      ? intentar(async () => {
          const ctx = await contextoFinanzas(req)
          if (!ctx) throw new Error('sin sesión')
          const pend = await pendientesFinanzas(ctx)
          /* «Cobros pendientes» = entradas con saldo por cobrar (los pagos por hacer no van aquí). */
          return pend.porCobrarOPagar.filter((x) => x.tipo === 'entrada')
        })
      : null,
    conEstetica
      ? intentar(async () => {
          const ctx = await contextoClinica(req)
          if (!ctx) throw new Error('sin sesión')
          return tableroEstetica(ctx, ctx.hoy)
        })
      : null,
    conPlanes ? intentar(async () => (await req.payload.count({ collection: 'far-planes', overrideAccess: true, where: { estado: { equals: 'detenido' } } })).totalDocs) : null,
  ])

  const ahora = new Date()
  const persona = req.user as { email?: string; name?: string }
  const nombre = persona.name?.trim().split(' ')[0] || persona.email?.split('@')[0] || ''
  const base = {
    clinica: `${rutaAdmin}/clinica`,
    farmacia: `${rutaAdmin}/farmacia`,
    finanzas: `${rutaAdmin}/finanzas`,
  }

  /* ───────── cifras del día ───────── */
  const citasHoy: CitaVista[] = agenda?.ok ? agenda.datos.citas : []
  const vigentes = citasHoy.filter((c) => c.estado !== 'cancelada' && c.estado !== 'no_asistio')
  const atendidas = vigentes.filter((c) => c.estado === 'finalizada').length
  const enClinica = vigentes.filter((c) => c.estado === 'llegada' || c.estado === 'atencion').length
  const porConfirmar = agenda?.ok ? agenda.datos.porConfirmar.length : 0
  const cobros: OperacionVista[] = finanzas?.ok ? finanzas.datos : []
  const porCobrarCentavos = cobros.reduce((a, x) => a + x.pendienteCentavos, 0)

  const cifras: Cifra[] = []
  if (agenda?.ok) {
    cifras.push({ valor: String(vigentes.length), etiqueta: atendidas ? `Citas hoy · ${atendidas} ya atendidas` : 'Citas hoy', href: `${base.clinica}/agenda` })
    cifras.push({ valor: String(enClinica), etiqueta: 'En clínica ahora', href: `${base.clinica}/agenda` })
    cifras.push({ valor: String(porConfirmar), etiqueta: 'Por confirmar', href: `${base.clinica}/agenda`, aviso: porConfirmar > 0 })
  }
  if (farmacia?.ok && p.farmacia.vender) {
    cifras.push({ valor: formatoMXN(Math.round(farmacia.datos.totalHoy * 100)), etiqueta: `Ventas de mostrador hoy · ${plural(farmacia.datos.ventasHoy, 'venta', 'ventas')}`, href: `${base.farmacia}/ventas` })
  }
  if (finanzas?.ok) {
    cifras.push({ valor: String(cobros.length), etiqueta: cobros.length ? `Cobros pendientes · ${formatoMXN(porCobrarCentavos)}` : 'Cobros pendientes', href: `${base.finanzas}/pendientes?ver=por-cobrar-pagar`, aviso: cobros.length > 0 })
  }

  /* ───────── agenda de hoy ───────── */
  const idsEstetica = new Set(estetica?.ok ? estetica.datos.tarjetas.map((x) => x.cita.id) : [])
  const filas: FilaAgenda[] = citasHoy
    .filter((c) => c.estado !== 'cancelada')
    .map((c) => ({
      id: c.id,
      hora: c.horaInicio,
      mascota: c.mascota.nombre,
      mascotaId: c.mascota.id,
      tutor: c.cliente?.nombre ?? null,
      servicio: c.servicio.nombre,
      lugar: c.recurso.nombre,
      estado: c.estado,
      siguientes: c.siguientes,
      tableroEstetica: idsEstetica.has(c.id) ? `${base.clinica}/estetica` : null,
    }))

  /* ───────── acciones rápidas ───────── */
  const acciones: { texto: string; href: string; gasto?: boolean }[] = []
  if (conAgenda) acciones.push({ texto: 'Nueva cita', href: `${base.clinica}/agenda?nueva=1` })
  if (conPacientes && p.clinica.editarPacientes) acciones.push({ texto: 'Nuevo paciente', href: `${base.clinica}/mascotas/nueva` })
  if (conFarmacia && p.farmacia.vender) acciones.push({ texto: 'Mostrador', href: `${base.farmacia}/vender` })
  if (conFinanzas && p.fin.registrar) acciones.push({ texto: 'Registrar gasto', href: `${base.finanzas}/registrar?tipo=gasto`, gasto: true })

  /* ───────── pendientes ───────── */
  const pendientes: Pendiente[] = []
  for (const op of cobros.slice(0, 4)) {
    pendientes.push({ clave: `cobro-${op.id}`, tipo: 'Cobro', tono: 'cobro', texto: `${op.concepto || op.folio} · ${formatoMXN(op.pendienteCentavos)}`, href: `${base.finanzas}/operacion/${op.id}` })
  }
  if (cobros.length > 4) pendientes.push({ clave: 'cobros-mas', tipo: 'Cobro', tono: 'cobro', texto: `${plural(cobros.length - 4, 'cobro más', 'cobros más')}`, href: `${base.finanzas}/pendientes?ver=por-cobrar-pagar` })
  if (farmacia?.ok) {
    const h = farmacia.datos
    if (h.alertasAbiertas) pendientes.push({ clave: 'alertas', tipo: 'Farmacia', tono: 'farmacia', texto: `${plural(h.alertasAbiertas, 'alerta abierta', 'alertas abiertas')}${h.alertasCriticas ? ` · ${h.alertasCriticas} críticas` : ''}`, href: `${base.farmacia}/alertas` })
    if (h.recetasPorValidar) pendientes.push({ clave: 'recetas', tipo: 'Farmacia', tono: 'farmacia', texto: plural(h.recetasPorValidar, 'receta por validar', 'recetas por validar'), href: `${base.farmacia}/recetas` })
    if (h.originalesPendientes) pendientes.push({ clave: 'originales', tipo: 'Farmacia', tono: 'farmacia', texto: plural(h.originalesPendientes, 'receta original por recibir', 'recetas originales por recibir'), href: `${base.farmacia}/recetas` })
    if (h.pagosPorConfirmar) pendientes.push({ clave: 'pagos', tipo: 'Farmacia', tono: 'farmacia', texto: plural(h.pagosPorConfirmar, 'pago por confirmar', 'pagos por confirmar'), href: `${base.farmacia}/ventas?estado=por_confirmar` })
    if (h.cierrePendiente) pendientes.push({ clave: 'cierre', tipo: 'Farmacia', tono: 'farmacia', texto: 'Falta el cierre del día', href: `${base.farmacia}/cierre` })
  }
  if (farmacia?.ok && farmacia.datos.pedidosTienda) pendientes.push({ clave: 'pedidos', tipo: 'Tienda', tono: 'farmacia', texto: plural(farmacia.datos.pedidosTienda, 'pedido de la tienda por atender', 'pedidos de la tienda por atender'), href: `${base.farmacia}/pedidos` })
  if (planesDetenidos?.ok && planesDetenidos.datos) pendientes.push({ clave: 'planes', tipo: 'Tienda', tono: 'farmacia', texto: plural(planesDetenidos.datos, 'plan de compra detenido', 'planes de compra detenidos'), href: `${base.farmacia}/planes?grupo=detenidos` })
  if (agenda?.ok && porConfirmar) pendientes.push({ clave: 'por-confirmar', tipo: 'Agenda', tono: 'aviso', texto: plural(porConfirmar, 'cita por confirmar', 'citas por confirmar'), href: `${base.clinica}/agenda` })

  /* ───────── estética del día ───────── */
  const est = estetica?.ok ? estetica.datos : null
  const tarjetas = est ? est.tarjetas : []
  const cuenta = (f: (x: TarjetaEstetica) => boolean) => tarjetas.filter(f).length
  const etapasEst = [
    { clave: 'por_llegar', texto: 'Por llegar', n: cuenta((x) => x.etapa === 'por_llegar') },
    { clave: 'proceso', texto: 'En proceso', n: cuenta((x) => EN_PROCESO.includes(x.etapa)) },
    { clave: 'lista', texto: 'Lista para recoger', n: cuenta((x) => x.etapa === 'lista') },
    { clave: 'entregada', texto: 'Entregadas', n: cuenta((x) => x.etapa === 'entregada') },
  ]
  const activasEst = tarjetas.filter((x) => x.etapa !== 'entregada').sort((a, b) => (a.etapa === 'lista' ? -1 : 0) - (b.etapa === 'lista' ? -1 : 0) || a.cita.horaInicio.localeCompare(b.cita.horaInicio))
  const hrefEst = `${base.clinica}/estetica`
  for (const x of tarjetas.filter((y) => y.etapa === 'lista').slice(0, 3)) {
    pendientes.unshift({ clave: `est-${x.cita.id}`, tipo: 'Estética', tono: 'estetica', texto: `${x.cita.mascota.nombre} lista para recoger`, href: hrefEst })
  }

  const fallas = [agenda && !agenda.ok && 'la agenda', estetica && !estetica.ok && 'la estética', farmacia && !farmacia.ok && 'la farmacia', finanzas && !finanzas.ok && 'Finanzas'].filter(Boolean) as string[]
  const hayPendientesVisibles = Boolean(agenda?.ok || farmacia?.ok || finanzas?.ok || est)
  const conPrincipal = Boolean(agenda?.ok || est)
  const hoy = agenda?.ok ? agenda.datos.dia : null
  const bajada = [fechaLarga(hoy ?? diaLocal(ahora)), agenda?.ok ? plural(vigentes.length, 'cita', 'citas') : null].filter(Boolean).join(' · ')

  return (
    <Gutter>
      <div className="fz-app hoy">
        <header className="hoy__cabecera">
          <div>
            <p className="fz-eyebrow">
              {saludoSegunHora(ahora)}
              {nombre ? `, ${nombre}` : ''}
            </p>
            <h1 className="fz-h1">Hoy</h1>
            <p className="fz-tenue fz-chico hoy__bajada">{bajada.charAt(0).toUpperCase() + bajada.slice(1)}</p>
          </div>
          {(conFarmacia && p.farmacia.vender) || conAgenda ? (
            <div className="fz-acciones-fin">
              {conFarmacia && p.farmacia.vender && (
                <Link className="fz-btn fz-btn--claro" href={`${base.farmacia}/vender`}>
                  Mostrador
                </Link>
              )}
              {conAgenda && (
                <Link className="fz-btn fz-btn--navy" href={`${base.clinica}/agenda?nueva=1`}>
                  + Nueva cita
                </Link>
              )}
            </div>
          ) : null}
        </header>

        {fallas.length > 0 && (
          <div className="fz-aviso fz-aviso--malo" role="status">
            <div>No se pudo leer {fallas.join(' ni ')}. Vuelve a cargar la página en un momento.</div>
          </div>
        )}

        {cifras.length > 0 && (
          <div className="fz-kpis hoy__cifras">
            {cifras.map((c) => (
              <Link key={c.etiqueta} href={c.href} className={`fz-kpi${c.aviso ? ' hoy__cifra--aviso' : ''}`}>
                <span className="fz-kpi__val">{c.valor}</span>
                <span className="fz-kpi__lbl">{c.etiqueta}</span>
              </Link>
            ))}
          </div>
        )}

        <div className={`hoy__rejilla${conPrincipal ? '' : ' hoy__rejilla--sola'}`}>
          {conPrincipal && (
          <div className="hoy__principal">
          {agenda?.ok && (
            <section className="fz-tarjeta hoy__agenda" aria-labelledby="hoy-agenda">
              <div className="fz-entre hoy__titulo">
                <h2 className="fz-h2" id="hoy-agenda">
                  Agenda de hoy
                </h2>
                <Link className="fz-btn fz-btn--claro fz-btn--chico" href={`${base.clinica}/agenda`}>
                  Ver agenda completa
                </Link>
              </div>
              {filas.length === 0 ? (
                <p className="fz-tenue hoy__vacio">{agenda.datos.abierto ? 'No hay citas para hoy.' : 'Hoy no hay horario de atención y no hay citas.'}</p>
              ) : (
                <AgendaDeHoy filas={filas} base={base.clinica} verExpediente={p.clinica.verExpediente} />
              )}
            </section>
          )}
          {est && (
            <section className="fz-tarjeta hoy__agenda hoy__est" aria-labelledby="hoy-estetica">
              <div className="fz-entre hoy__titulo">
                <h2 className="fz-h2" id="hoy-estetica">
                  {est.marca} · hoy
                </h2>
                <Link className="fz-btn fz-btn--claro fz-btn--chico" href={hrefEst}>
                  Abrir tablero
                </Link>
              </div>
              {tarjetas.length === 0 ? (
                <p className="fz-tenue hoy__vacio">No hay citas de estética hoy.</p>
              ) : (
                <>
                  <ul className="hoy__est-etapas" aria-label="Citas de estética por etapa">
                    {etapasEst.map((e) => (
                      <li key={e.clave} className={`hoy__est-etapa hoy__est-etapa--${e.clave}${e.n ? '' : ' is-cero'}`}>
                        <b>{e.n}</b>
                        <span>{e.texto}</span>
                      </li>
                    ))}
                  </ul>
                  {activasEst.length > 0 && (
                    <ul className="hoy__citas">
                      {activasEst.slice(0, 6).map((x) => (
                        <li key={x.cita.id} className="hoy__est-fila">
                          <span className="hoy__hora">{x.cita.horaInicio}</span>
                          <span className="hoy__quien">
                            <b>{x.cita.mascota.nombre}</b>
                            <span className="fz-chico fz-tenue">
                              {x.cita.servicio.nombre}
                              {x.cita.estetica?.nombreTalla ? ` · ${x.cita.estetica.nombreTalla.toLowerCase()}` : ''}
                            </span>
                          </span>
                          <span className={`hoy__est-chip hoy__est-chip--${x.etapa}`}>{NOMBRE_ETAPA[x.etapa]}</span>
                          {x.whatsappLista ? (
                            <a className="fz-btn fz-btn--claro fz-btn--chico" href={x.whatsappLista} target="_blank" rel="noopener noreferrer">
                              WhatsApp
                            </a>
                          ) : (
                            <span />
                          )}
                        </li>
                      ))}
                      {activasEst.length > 6 && (
                        <li className="hoy__est-mas">
                          <Link href={hrefEst}>{plural(activasEst.length - 6, 'cita más', 'citas más')} en el tablero</Link>
                        </li>
                      )}
                    </ul>
                  )}
                </>
              )}
            </section>
          )}
          </div>
          )}

          <div className="hoy__lateral">
            {acciones.length > 0 && (
              <section className="fz-tarjeta hoy__caja" aria-labelledby="hoy-acciones">
                <h2 className="fz-h2" id="hoy-acciones">
                  Acciones rápidas
                </h2>
                <div className="hoy__acciones">
                  {acciones.map((a) => (
                    <Link key={a.href} href={a.href} className={`fz-btn ${a.gasto ? 'fz-btn--gasto' : 'hoy__accion'}`}>
                      {a.texto}
                    </Link>
                  ))}
                </div>
              </section>
            )}
            {hayPendientesVisibles && (
              <section className="fz-tarjeta hoy__caja" aria-labelledby="hoy-pendientes">
                <h2 className="fz-h2" id="hoy-pendientes">
                  Pendientes
                </h2>
                {pendientes.length === 0 ? (
                  <p className="fz-tenue hoy__vacio">Nada pendiente por ahora.</p>
                ) : (
                  <ul className="hoy__pendientes">
                    {pendientes.map((x) => (
                      <li key={x.clave}>
                        <Link href={x.href} className="hoy__pendiente">
                          <span className={`hoy__tipo hoy__tipo--${x.tono}`}>{x.tipo}</span>
                          <span className="hoy__pendiente-texto">{x.texto}</span>
                          <span aria-hidden="true" className="hoy__flecha">
                            ›
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
            {p.gestionarUsuarios && (
              <p className="fz-chico fz-tenue hoy__admin">
                Administración: <Link href={`${rutaAdmin}/collections/users`}>Usuarios</Link> · <Link href={`${rutaAdmin}/collections/roles`}>Roles</Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </Gutter>
  )
}
