'use client'

import { useFormFields } from '@payloadcms/ui'
import React from 'react'
import { enlaceWhatsApp } from '../../lib/whatsapp'

/**
 * Botón «Escribir por WhatsApp» en la ficha de una solicitud de cita
 * (collections/clinica/solicitudes.ts): abre el chat con el mensaje listo.
 */
export default function AccionesSolicitud() {
  const d = useFormFields(([campos]) => ({
    nombre: String(campos.nombre?.value ?? ''),
    whatsapp: String(campos.whatsapp?.value ?? ''),
    mascota: String(campos.mascota?.value ?? ''),
    servicio: String(campos.servicioNombre?.value ?? ''),
  }))
  if (!d.whatsapp) return null
  const mensaje = `Hola ${d.nombre.split(/\s+/)[0]}, te escribimos por la cita que pediste${d.mascota ? ` para ${d.mascota}` : ''}${d.servicio ? ` (${d.servicio})` : ''}. ¿Qué día y a qué hora te queda bien?`
  const liga = enlaceWhatsApp(d.whatsapp, mensaje)
  if (!liga) return null
  return (
    <div className="field-type" style={{ marginBottom: 24 }}>
      <a href={liga} target="_blank" rel="noreferrer" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 18px', borderRadius: 10, background: '#0b6b59', color: '#fff', fontWeight: 700 }}>
        Escribir por WhatsApp
      </a>
    </div>
  )
}
