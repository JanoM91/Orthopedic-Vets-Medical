import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'
import { leerModulos } from '../../../../lib/modulos'
import { pedidosDelTutor } from '../../../../lib/farmacia/tienda'
import { ESTADO_PEDIDO_LABEL, type EstadoPedido } from '../../../../lib/farmacia/tiposTienda'
import { sesionTutor } from '../../../../lib/portal/sesion'
import { sesionDeTienda } from '../../../../lib/portal/sesionTienda'
import { Barra, Cabecera, fecha, Icono, Pill } from '../../../../components/portal/comun'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Farmacia' }

const TONO: Record<EstadoPedido, 'ok' | 'warn' | 'bad' | 'info' | 'gris'> = {
  pago_pendiente: 'warn',
  creado: 'info',
  pagado: 'info',
  receta_por_validar: 'warn',
  preparando: 'info',
  listo_para_recoger: 'ok',
  en_ruta: 'info',
  entregado: 'gris',
  cancelado: 'bad',
  expirado: 'gris',
}
const pesos = (n: number) => `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** Portal → Farmacia (fase 5a): pedidos de la tienda, recetas vigentes para surtir y la entrada a la tienda. */
export default async function Farmacia() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/farmacia')
  const m = await leerModulos(c.payload)
  if (!m.farmacia || !m.tienda) notFound()
  const [pedidos, sesion] = await Promise.all([pedidosDelTutor(c.payload, c.tutor.id), sesionDeTienda()])
  const activos = pedidos.filter((p) => !['entregado', 'cancelado', 'expirado'].includes(p.estado))
  const pasados = pedidos.filter((p) => !activos.includes(p)).slice(0, 10)
  const fila = (p: (typeof pedidos)[number]) => (
    <Link key={p.id} href={`/tienda/pedido/${p.folio}?t=${encodeURIComponent(p.token ?? '')}`} className="pt-fila">
      <span className="ti-fila-i">
        <Icono n="bolsa" />
      </span>
      <span className="pt-fila__main">
        <span className="pt-fila__t1">
          {p.folio} · {pesos(p.total)}
        </span>
        <span className="pt-fila__t2">
          {fecha(p.creadoEn.slice(0, 10))} · {p.renglones.length} producto{p.renglones.length === 1 ? '' : 's'}
          {p.mascota ? ` · ${p.mascota.nombre}` : ''}
        </span>
      </span>
      <Pill tono={TONO[p.estado]}>{ESTADO_PEDIDO_LABEL[p.estado]}</Pill>
    </Link>
  )
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <div className="pt-seccion__cab">
          <div>
            <h1>Farmacia</h1>
            <p className="pt-tenue pt-chico">Pide en línea y recoge en la clínica.</p>
          </div>
          <Link href="/tienda" className="pt-btn pt-btn--acento pt-btn--chico">
            <Icono n="bolsa" /> Tienda
          </Link>
        </div>

        <section className="pt-seccion">
          <h2>Mis pedidos</h2>
          {activos.length ? <div className="pt-card pt-lista">{activos.map(fila)}</div> : <p className="pt-tenue pt-chico">No tienes pedidos en curso.</p>}
        </section>

        <section className="pt-seccion">
          <h2>Recetas vigentes</h2>
          {sesion.recetas.length ? (
            <div className="pt-card pt-lista">
              {sesion.recetas.map((r) => (
                <div key={r.id} className="pt-fila">
                  <span className="ti-fila-i">
                    <Icono n="receta" />
                  </span>
                  <span className="pt-fila__main">
                    <span className="pt-fila__t1">
                      {r.mascota ?? 'Receta'} · {r.folio}
                    </span>
                    <span className="pt-fila__t2">
                      {r.productos.filter((x) => x.surtidosRestantes > 0).map((x) => `${x.nombre}${x.enTienda ? '' : ' (en mostrador)'}`).join(', ')} · vence {fecha(r.vigenteHasta)}
                    </span>
                  </span>
                  {r.mascotaId && r.productos.some((x) => x.surtidosRestantes > 0 && x.enTienda) && (
                    <Link href={`/tienda?para=${r.mascotaId}`} className="pt-btn pt-btn--chico">
                      Surtir
                    </Link>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="pt-tenue pt-chico">{c.tutor.cliente ? 'Cuando tu veterinario te haga una receta, aparece aquí para surtirla.' : 'Vincula tu cuenta con la clínica para ver tus recetas.'}</p>
          )}
        </section>

        {pasados.length > 0 && (
          <section className="pt-seccion">
            <h2>Anteriores</h2>
            <div className="pt-card pt-lista">{pasados.map(fila)}</div>
          </section>
        )}
      </main>
      <Barra activa="farmacia" />
    </>
  )
}
