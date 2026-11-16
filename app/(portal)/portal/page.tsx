import Link from 'next/link'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import React from 'react'
import { portalCitas, proximasPorMascota } from '../../../lib/clinica/agenda'
import { portalRefuerzosPendientes, portalResumen } from '../../../lib/clinica/servicio'
import { portalBanosPendientes } from '../../../lib/clinica/esteticaPortal'
import { pedidosDelTutor } from '../../../lib/farmacia/tienda'
import { recomprasDelCliente, type RecompraVista } from '../../../lib/farmacia/recompra'
import type { PedidoVista } from '../../../lib/farmacia/tiposTienda'
import { partesLocales } from '../../../lib/localTime'
import { leerModulos } from '../../../lib/modulos'
import { ligaRefuerzo } from '../../../lib/portal/refuerzo'
import { sesionTutor } from '../../../lib/portal/sesion'
import { sesionDeTienda } from '../../../lib/portal/sesionTienda'
import { contactoClinica } from '../../../lib/sitio/contacto'
import { enlaceWhatsApp, mensajes } from '../../../lib/whatsapp'
import { InsigniaServicio } from '../../../components/IconoServicio'
import { PillCita } from '../../../components/portal/Citas'
import { ligaPedido, pedidoActivo, pesos, surtible } from '../../../components/portal/Compras'
import { Avatar, Barra, Cabecera, fecha, hoyISO, Icono, SalidaWhatsApp } from '../../../components/portal/comun'
import { diaCorto } from '../../../components/portal/Mascotas'

export const dynamic = 'force-dynamic'

/** «25 oct» (sin año). */
const corta = (d: string | null) => fecha(d).replace(/ \d{4}$/, '')

const saludo = () => {
  const h = partesLocales(new Date()).hour
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}

/** Qué le decimos al tutor de un pedido en curso, en una frase. */
function fraseDePedido(p: PedidoVista): string {
  switch (p.estado) {
    case 'pago_pendiente':
      return 'Tu pedido espera el pago'
    case 'receta_por_validar':
      return 'Estamos revisando la receta'
    case 'preparando':
      return 'Estamos preparando tu pedido'
    case 'listo_para_recoger':
      return p.entrega === 'domicilio' ? 'Tu pedido está listo para salir' : 'Tu pedido está listo para recoger'
    case 'en_ruta':
      return 'Tu pedido va en camino'
    default:
      return 'Recibimos tu pedido'
  }
}
function pagoDePedido(p: PedidoVista): string {
  if (p.pago.estado === 'pagado') return 'pagado'
  if (p.pago.forma === 'al_recibir') return `pagas ${pesos(p.total)} al recibir`
  if (p.pago.forma === 'al_recoger') return `pagas ${pesos(p.total)} al recoger`
  return `${pesos(p.total)} por pagar`
}

type Pendiente = { clave: string; tono: 'bad' | 'warn' | 'ok'; icono: string; titulo: string; detalle: string; accion: { href: string; texto: string; secundaria?: boolean } | null }

/**
 * Inicio del portal «Hoy primero» (UX del cliente, fase 2, nov-2026; lienzo
 * «OVM · Experiencia del cliente», Opción 1): la cita más cercana, los pedidos en
 * curso, lo pendiente con su botón (refuerzos, recetas por surtir), accesos y las
 * mascotas en una fila. «Tu ficha» y el contacto pasaron a Perfil.
 */
export default async function PortalInicio() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar')
  const [r, contacto, modulos] = await Promise.all([portalResumen(c), contactoClinica(c.payload), leerModulos(c.payload)])
  const nombre = r.tutor.nombre.split(' ')[0]
  const wa = enlaceWhatsApp(contacto.whatsapp, mensajes.aLaClinica(null))

  if (!r.cliente) {
    return (
      <>
        <Cabecera nombre={r.tutor.nombre} />
        <main className="pt-main">
          <div className="pt-saludo">
            <p className="pt-tenue pt-chico">{saludo()}</p>
            <h1>{nombre}</h1>
          </div>
          <div className="pt-card">
            <h2>Vincula tu cuenta</h2>
            <p className="pt-chico">Para ver a tus mascotas, pide en la clínica tu <b>código de vinculación</b> y escríbelo aquí. Así nadie ve un expediente por coincidir en nombre o teléfono.</p>
            <Link href="/portal/vincular" className="pt-btn pt-btn--primario">
              <Icono n="link" /> Tengo un código
            </Link>
          </div>
          <SalidaWhatsApp whatsapp={contacto.whatsapp} motivo="codigo" />
          <Link href="/portal/servicios" className="pt-accion pt-accion--menta pt-accion--ancha">
            <span className="pt-accion__icono">
              <Icono n="servicios" />
            </span>
            <span className="pt-accion__texto">
              <b>Servicios</b>
              <span>Conoce lo que ofrecemos</span>
            </span>
            <Icono n="next" />
          </Link>
        </main>
        <Barra activa="inicio" />
      </>
    )
  }

  const tienda = Boolean(modulos.farmacia && modulos.tienda)
  const vivas = r.mascotas.filter((m) => m.estado !== 'fallecido')
  const ids = vivas.map((m) => m.id)
  const cabeceras = await headers()
  const [proximas, refuerzos, citas, pedidos, sesion, recompras, banos] = await Promise.all([
    proximasPorMascota(c, ids),
    portalRefuerzosPendientes(c, ids),
    portalCitas(c),
    tienda ? pedidosDelTutor(c.payload, c.tutor.id) : Promise.resolve([] as PedidoVista[]),
    tienda ? sesionDeTienda() : Promise.resolve(null),
    tienda ? recomprasDelCliente(c.payload, cabeceras, r.cliente.id).catch(() => [] as RecompraVista[]) : Promise.resolve([] as RecompraVista[]),
    portalBanosPendientes(c, ids).catch(() => []),
  ])
  const hoy = hoyISO()
  const siguiente = [...proximas.values()].sort((a, b) => (a.dia + a.horaInicio).localeCompare(b.dia + b.horaInicio))[0] ?? null
  const activos = pedidos.filter(pedidoActivo)
  const nombreDe = new Map(r.mascotas.map((m) => [m.id, m.nombre]))

  const pendientes: Pendiente[] = []
  for (const x of refuerzos) {
    const mascota = nombreDe.get(x.mascotaId) ?? ''
    pendientes.push({
      clave: `ref-${x.item.id}`,
      tono: x.estado === 'vencida' ? 'bad' : 'warn',
      icono: 'shield',
      titulo: x.estado === 'vencida' ? `${x.item.producto} de ${mascota}: vencida` : `${x.item.producto} de ${mascota}`,
      detalle: x.estado === 'vencida' ? `Desde el ${corta(x.item.proximaFecha)}` : `Toca el ${corta(x.item.proximaFecha)}`,
      accion: { href: ligaRefuerzo(x.mascotaId, x.item, citas.servicios), texto: 'Pedir refuerzo', secundaria: x.estado !== 'vencida' },
    })
  }
  for (const rc of (sesion?.recetas ?? []).filter(surtible)) {
    const productos = rc.productos.filter((p) => p.surtidosRestantes > 0 && p.enTienda)
    pendientes.push({
      clave: `rec-${rc.id}`,
      tono: 'ok',
      icono: 'receta',
      titulo: 'Receta lista para surtir',
      detalle: `${rc.mascota ?? ''}${rc.mascota ? ' · ' : ''}${productos.map((p) => p.nombre).join(', ')}`,
      accion: { href: `/tienda?para=${rc.mascotaId}`, texto: 'Surtir', secundaria: true },
    })
  }
  /* Recompra (Farmacia 6a): lo que se acaba en los próximos días, con «Volver a pedir» en un toque. */
  /* Lo que es con receta ya sale arriba como «Receta lista para surtir». */
  for (const rc of recompras.filter((x) => !x.producto.requiereReceta)) {
    const ya = rc.fechaEstimada <= hoy
    pendientes.push({
      clave: `rcp-${rc.id}`,
      tono: ya ? 'warn' : 'ok',
      icono: 'bolsa',
      titulo: `${rc.producto.nombre}${rc.mascota ? ` de ${rc.mascota.nombre}` : ''}`,
      detalle: ya ? 'Ya se debió acabar' : `Se acaba alrededor del ${corta(rc.fechaEstimada)}`,
      accion: { href: `/tienda/recompra/${rc.id}?t=${rc.token}`, texto: 'Volver a pedir', secundaria: true },
    })
  }
  /* Estética (E3): el baño que ya toca (o toca esta semana), con la cita ya llenada. */
  for (const b of banos) {
    const ya = b.fecha <= hoy
    pendientes.push({
      clave: `ban-${b.mascotaId}`,
      tono: ya ? 'warn' : 'ok',
      icono: 'calmas',
      titulo: `${b.servicio} de ${nombreDe.get(b.mascotaId) ?? ''}`,
      detalle: ya ? `Le tocaba el ${corta(b.fecha)}` : `Le toca alrededor del ${corta(b.fecha)}`,
      accion: { href: b.ligaCita, texto: 'Pedir cita', secundaria: !ya },
    })
  }
  const visibles = pendientes.slice(0, 5)

  return (
    <>
      <Cabecera nombre={r.tutor.nombre} />
      <main className="pt-main">
        <div className="pt-saludo">
          <p className="pt-tenue pt-chico">{saludo()}</p>
          <h1>{nombre}</h1>
        </div>

        {siguiente ? (
          <section className="pt-hoy" aria-label={siguiente.dia === hoy ? 'Tu cita de hoy' : 'Tu próxima cita'}>
            <div className="pt-hoy__fila">
              <InsigniaServicio clave={siguiente.servicio.icono} />
              <div className="pt-hoy__main">
                <span className="pt-hoy__etiqueta">
                  Cita de {siguiente.mascota.nombre} · {siguiente.dia === hoy ? 'hoy' : diaCorto(siguiente.dia)}
                </span>
                <b className="pt-hoy__hora">
                  {siguiente.horaInicio} · {siguiente.servicio.nombre}
                </b>
              </div>
              {siguiente.mascota.foto && (
                // eslint-disable-next-line @next/next/no-img-element
                <img className="pt-proxima__foto" src={siguiente.mascota.foto} alt="" />
              )}
            </div>
            <div className="pt-hoy__pie">
              <PillCita estado={siguiente.estado} />
              <span>
                {siguiente.profesional?.nombre ? `${siguiente.profesional.nombre} · ` : ''}
                {siguiente.dia === hoy ? 'llega 10 min antes' : siguiente.recurso.nombre}
              </span>
            </div>
            <div className="pt-hoy__acciones">
              {contacto.mapaUrl && (
                <a href={contacto.mapaUrl} target="_blank" rel="noreferrer" className="pt-btn pt-btn--menta">
                  Cómo llegar
                </a>
              )}
              <Link href="/portal/citas" className="pt-btn pt-btn--claro">
                Ver o reprogramar
              </Link>
            </div>
          </section>
        ) : (
          <section className="pt-hoy pt-hoy--vacio" aria-label="Citas">
            <div className="pt-hoy__main">
              <span className="pt-hoy__etiqueta">Sin citas próximas</span>
              <b className="pt-hoy__hora">¿Toca revisión o vacuna?</b>
            </div>
            <div className="pt-hoy__acciones">
              <Link href="/portal/citas/nueva" className="pt-btn pt-btn--menta">
                <Icono n="calmas" /> Pedir cita
              </Link>
            </div>
          </section>
        )}

        {activos.slice(0, 2).map((p) => (
          <Link key={p.id} href={ligaPedido(p)} className="pt-card pt-pedido-hoy">
            <span className="pt-pedido-hoy__i">
              <Icono n={p.entrega === 'domicilio' ? 'camion' : 'bolsa'} />
            </span>
            <span className="pt-fila__main">
              <span className="pt-fila__t1">{fraseDePedido(p)}</span>
              <span className="pt-fila__t2">
                {p.folio} · {p.renglones.length} producto{p.renglones.length === 1 ? '' : 's'} · {pagoDePedido(p)}
              </span>
            </span>
            <Icono n="next" />
          </Link>
        ))}

        <section className="pt-seccion" aria-labelledby="t-pendientes">
          <div className="pt-seccion__cab">
            <h2 id="t-pendientes" className="pt-eyebrow">
              Pendientes
            </h2>
            {pendientes.length > visibles.length && (
              <Link href="/portal/mascotas" className="pt-enlace">
                Ver todo
              </Link>
            )}
          </div>
          {visibles.length ? (
            <div className="pt-card pt-lista">
              {visibles.map((x) => (
                <div key={x.clave} className="pt-fila pt-pendiente">
                  <span className={`pt-pendiente__i is-${x.tono}`}>
                    <Icono n={x.icono} />
                  </span>
                  <span className="pt-fila__main">
                    <span className="pt-fila__t1">{x.titulo}</span>
                    <span className="pt-fila__t2">{x.detalle}</span>
                  </span>
                  {x.accion && (
                    <Link href={x.accion.href} className={`pt-btn pt-btn--chico${x.accion.secundaria ? '' : ' pt-btn--acento'}`}>
                      {x.accion.texto}
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="pt-card pt-al-dia">
              <span className="pt-pendiente__i is-ok">
                <Icono n="check" />
              </span>
              <span>
                <b>Todo al día</b>
                <span className="pt-chico pt-tenue"> · Te avisamos aquí cuando toque un refuerzo.</span>
              </span>
            </div>
          )}
        </section>

        <div className="pt-atajos">
          <Link href="/portal/citas/nueva" className="pt-atajo">
            <Icono n="calmas" />
            Pedir cita
          </Link>
          {tienda ? (
            <Link href="/tienda" className="pt-atajo">
              <Icono n="bolsa" />
              Tienda
            </Link>
          ) : (
            <Link href="/portal/servicios" className="pt-atajo">
              <Icono n="servicios" />
              Servicios
            </Link>
          )}
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="pt-atajo">
              <Icono n="wa" />
              WhatsApp
            </a>
          ) : (
            <Link href="/portal/citas" className="pt-atajo">
              <Icono n="cal" />
              Mis citas
            </Link>
          )}
        </div>

        <section className="pt-seccion" aria-labelledby="t-mascotas">
          <div className="pt-seccion__cab">
            <h2 id="t-mascotas" className="pt-eyebrow">
              Mis mascotas
            </h2>
            {r.mascotas.length > 0 && (
              <Link href="/portal/mascotas" className="pt-enlace">
                Ver todas
              </Link>
            )}
          </div>
          {r.mascotas.length === 0 ? (
            <div className="pt-card">
              <p className="pt-tenue">Aún no hay mascotas en tu ficha. La clínica las registra en tu primera visita.</p>
            </div>
          ) : (
            <div className="pt-mini-mascotas">
              {r.mascotas.map((m) => {
                const pr = proximas.get(m.id)
                return (
                  <Link key={m.id} href={`/portal/mascotas/${m.id}`} className={`pt-mini-mascota${m.estado === 'fallecido' ? ' is-memoria' : ''}`}>
                    <Avatar nombre={m.nombre} especie={m.especie} foto={m.foto} />
                    <span className="pt-mini-mascota__t">
                      <b>{m.nombre}</b>
                      <span>{m.estado === 'fallecido' ? 'En memoria' : pr ? `Cita ${corta(pr.dia)}` : m.foto ? (m.edad ?? '') : 'Ponle foto'}</span>
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </main>
      <Barra activa="inicio" avisoTienda={activos.length} />
    </>
  )
}
