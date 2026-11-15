import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import React from 'react'
import { leerModulos } from '../../../../lib/modulos'
import { pedidosDelTutor } from '../../../../lib/farmacia/tienda'
import { planesDelTutor } from '../../../../lib/farmacia/planes'
import { sesionTutor } from '../../../../lib/portal/sesion'
import { sesionDeTienda } from '../../../../lib/portal/sesionTienda'
import { Barra, Cabecera, Icono } from '../../../../components/portal/comun'
import { FilaPedido, FilaPlan, FilaReceta, pedidoActivo } from '../../../../components/portal/Compras'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Mis pedidos' }

/** Portal → Farmacia (fase 5a): pedidos de la tienda, recetas vigentes para surtir y la entrada a la tienda. */
export default async function Farmacia() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/farmacia')
  const m = await leerModulos(c.payload)
  if (!m.farmacia || !m.tienda) notFound()
  const [pedidos, sesion, planes] = await Promise.all([pedidosDelTutor(c.payload, c.tutor.id), sesionDeTienda(), planesDelTutor(c.payload, c.tutor.id)])
  const planesVivos = planes.filter((p) => p.estado !== 'cancelado' && p.estado !== 'terminado')
  const activos = pedidos.filter(pedidoActivo)
  const pasados = pedidos.filter((p) => !activos.includes(p)).slice(0, 10)
  const fila = (p: (typeof pedidos)[number]) => <FilaPedido key={p.id} p={p} />
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <div className="pt-seccion__cab">
          <div>
            <h1>Mis pedidos</h1>
            <p className="pt-tenue pt-chico">Pedidos de la tienda y recetas para surtir.</p>
          </div>
          <Link href="/tienda" className="pt-btn pt-btn--acento pt-btn--chico">
            <Icono n="bolsa" /> Tienda
          </Link>
        </div>

        <section className="pt-seccion">
          <h2>En curso</h2>
          {activos.length ? <div className="pt-card pt-lista">{activos.map(fila)}</div> : <p className="pt-tenue pt-chico">No tienes pedidos en curso.</p>}
        </section>

        {planesVivos.length > 0 && (
          <section className="pt-seccion">
            <h2>Mis planes</h2>
            <div className="pt-card pt-lista">
              {planesVivos.map((p) => (
                <FilaPlan key={p.id} p={p} />
              ))}
            </div>
          </section>
        )}

        <section className="pt-seccion">
          <h2>Recetas vigentes</h2>
          {sesion.recetas.length ? (
            <div className="pt-card pt-lista">
              {sesion.recetas.map((r) => (
                <FilaReceta key={r.id} r={r} />
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
      <Barra activa="farmacia" avisoTienda={activos.length} />
    </>
  )
}
