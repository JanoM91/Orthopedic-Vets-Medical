import React from 'react'

import { site } from '../../lib/site'

/**
 * Marca en la parte alta del menú lateral del panel.
 *
 * El menú de fábrica de Payload no muestra ninguna marca: empieza directo con
 * la lista de colecciones. Este bloque va antes de esa lista (se registra en
 * payload.config.ts como `admin.components.beforeNavLinks`) y pone el isotipo
 * (versión oscura, para fondo claro) con el nombre de la clínica. El menú del
 * tema clínico es blanco: con el isotipo blanco no se veía.
 *
 * Los estilos base viven en app/(payload)/custom.css (clases `mx-marca*`) y el
 * color de tinta en app/(payload)/tema-clinico.css (sección 2.2).
 */
export default function MarcaDelPanel() {
  return (
    <div className="mx-marca">
      <span className="mx-marca__fila">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="" aria-hidden="true" className="mx-marca__emblema" src="/logo-mark.png" />
        <span className="mx-marca__nombre">{site.brand.name}</span>
      </span>
      <span className="mx-marca__sub">Panel de la clínica</span>
    </div>
  )
}
