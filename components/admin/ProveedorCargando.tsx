'use client'

import React from 'react'
import { IndicadorNavegacion } from '../Cargando'

/** Provider del panel (payload.config.ts → admin.components.providers): monta el indicador de carga del perro y el gato. */
export default function ProveedorCargando({ children }: { children?: React.ReactNode }) {
  return (
    <>
      {children}
      <IndicadorNavegacion />
    </>
  )
}
