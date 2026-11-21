import Link from 'next/link'
import React from 'react'
import type { PaqueteCatalogo } from '../../lib/clinica/paquetes'

const pesos = (n: number) => `$${n.toLocaleString('es-MX', { maximumFractionDigits: 2 })}`

/** Tarjeta de un paquete en el sitio (nov-2026): precio, contenido, vigencia y «Lo quiero» → /reservar?paquete=. */
export function TarjetaPaquete({ p, compacta }: { p: PaqueteCatalogo; compacta?: boolean }) {
  return (
    <article className="st-card st-paquete" id={`p-${p.id}`}>
      <h3>{p.nombre}</h3>
      <p className="st-paquete__precio">
        {p.preciosTalla ? (
          <>
            <span className="st-tenue">desde</span> {pesos(p.precioDesde)}
          </>
        ) : (
          pesos(p.precio)
        )}
      </p>
      {!compacta && p.descripcion && <p className="st-tenue">{p.descripcion}</p>}
      <ul className="st-paquete__lista">
        {p.contenido.map((x, i) => (
          <li key={i}>
            <b>{x.cantidad}×</b> {x.nombre}
          </li>
        ))}
      </ul>
      <p className="st-chico st-tenue">
        {p.vigenciaDias ? `Válido ${p.vigenciaDias} días desde la compra.` : 'No vence.'}
        {p.preciosTalla ? ' El precio depende de la talla de tu mascota.' : ''}
      </p>
      <Link href={`/reservar?paquete=${p.id}`} className="st-btn st-btn--acento">
        Lo quiero
      </Link>
    </article>
  )
}
