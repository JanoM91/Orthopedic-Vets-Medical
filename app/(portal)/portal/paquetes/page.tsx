import Link from 'next/link'
import { redirect } from 'next/navigation'
import React from 'react'
import { portalPaquetes, type PaqueteCatalogo } from '../../../../lib/clinica/paquetes'
import { sesionTutor } from '../../../../lib/portal/sesion'
import { Barra, Cabecera, fecha, Icono } from '../../../../components/portal/comun'
import { PedirPaquete } from '../../../../components/portal/Paquetes'

export const dynamic = 'force-dynamic'

const pesos = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`
const precioPaquete = (p: Pick<PaqueteCatalogo, 'preciosTalla' | 'precio' | 'precioDesde'>) => (p.preciosTalla ? `desde ${pesos(p.precioDesde)} según su talla` : pesos(p.precio))

/**
 * Paquetes en la app del cliente (nov-2026): lo que sus mascotas tienen
 * comprado con su saldo, y los paquetes que ofrece la clínica con «Lo quiero»
 * (solicitud que recepción confirma; se paga en la clínica).
 */
export default async function PaquetesPortal() {
  const c = await sesionTutor()
  if (!c) redirect('/portal/entrar?siguiente=/portal/paquetes')
  const d = await portalPaquetes(c)
  const vinculado = Boolean(c.tutor.cliente)
  const mios = d.mios.filter((v) => v.estado === 'activo')
  const anteriores = d.mios.filter((v) => v.estado !== 'activo')
  return (
    <>
      <Cabecera nombre={c.tutor.nombre} />
      <main className="pt-main">
        <Link href="/portal" className="pt-volver pt-chico">
          <Icono n="back" /> Inicio
        </Link>
        <div>
          <h1>Paquetes</h1>
          <p className="pt-tenue pt-chico">Servicios y productos a precio de paquete, que vas usando con el tiempo.</p>
        </div>

        {mios.length > 0 && (
          <section className="pt-seccion" aria-labelledby="t-mios">
            <h2 id="t-mios" className="pt-eyebrow">
              Lo que te queda
            </h2>
            {mios.map((v) => (
              <article key={v.id} className="pt-card pt-paq">
                <div className="pt-paq__cab">
                  <h3>{v.nombre}</h3>
                  <span className="pt-chico pt-tenue">
                    {v.mascota.nombre} · {v.vence ? `vence el ${fecha(v.vence)}` : 'no vence'}
                  </span>
                </div>
                <ul className="pt-paq__saldo">
                  {v.renglones.map((r) => (
                    <li key={r.indice}>
                      <span>{r.nombre}</span>
                      <b>
                        {r.quedan} de {r.total}
                      </b>
                      <span className="pt-paq__barra" aria-hidden="true">
                        <span style={{ width: `${Math.round(((r.total - r.quedan) / r.total) * 100)}%` }} />
                      </span>
                      {r.apartados > 0 && <span className="pt-chico pt-tenue">{r.apartados} apartado{r.apartados > 1 ? 's' : ''} para tus próximas citas</span>}
                    </li>
                  ))}
                </ul>
                {v.renglones.some((r) => r.tipo === 'servicio' && r.quedan > 0) && (
                  <Link href={`/portal/citas/nueva?mascota=${v.mascota.id}&servicio=${v.renglones.find((r) => r.tipo === 'servicio' && r.quedan > 0)!.servicioId}`} className="pt-btn pt-btn--chico">
                    <Icono n="calmas" /> Pedir cita
                  </Link>
                )}
                {v.renglones.some((r) => r.tipo === 'producto' && r.quedan > 0) && <p className="pt-chico pt-tenue">Los productos te los entregamos en la clínica cuando vengas.</p>}
              </article>
            ))}
            <p className="pt-chico pt-tenue">Al pedir una cita de un servicio de tu paquete, se descuenta de tu saldo cuando te atendemos.</p>
          </section>
        )}

        <section className="pt-seccion" aria-labelledby="t-oferta">
          <h2 id="t-oferta" className="pt-eyebrow">
            Paquetes disponibles
          </h2>
          {d.catalogo.length === 0 && (
            <div className="pt-card">
              <p className="pt-tenue">Por ahora no hay paquetes en línea. Pregúntanos en la clínica.</p>
            </div>
          )}
          <div className="pt-servicios">
            {d.catalogo.map((p) => (
              <article key={p.id} className="pt-servicio pt-paq-oferta">
                <h3>{p.nombre}</h3>
                <p className="pt-paq-oferta__precio">{precioPaquete(p)}</p>
                {p.descripcion && <p className="pt-chico">{p.descripcion}</p>}
                <ul className="pt-chico pt-paq-oferta__lista">
                  {p.contenido.map((x, i) => (
                    <li key={i}>
                      <b>{x.cantidad}×</b> {x.nombre}
                    </li>
                  ))}
                </ul>
                <p className="pt-chico pt-tenue">{p.vigenciaDias ? `Válido ${p.vigenciaDias} días desde la compra.` : 'No vence.'} Se paga en la clínica.</p>
                {vinculado ? (
                  <PedirPaquete paqueteId={p.id} nombre={p.nombre} mascotas={d.mascotas} />
                ) : (
                  <p className="pt-chico">
                    Para pedirlo, <Link href="/portal/vincular">vincula tu cuenta</Link>.
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>

        {anteriores.length > 0 && (
          <details className="pt-card">
            <summary className="pt-chico">Paquetes anteriores ({anteriores.length})</summary>
            <ul className="pt-chico">
              {anteriores.map((v) => (
                <li key={v.id}>
                  {v.nombre} · {v.mascota.nombre} · {v.estado === 'agotado' ? 'usado completo' : 'vencido'} · {fecha(v.fecha)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </main>
      <Barra activa="inicio" />
    </>
  )
}
