'use client'

import { useDocumentInfo, useFormFields } from '@payloadcms/ui'
import React from 'react'
import { enlaceWhatsApp } from '../../lib/whatsapp'

const idDe = (v: unknown): number | null => {
  if (typeof v === 'number') return v
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v)
  if (v && typeof v === 'object' && 'id' in v) return Number((v as { id: unknown }).id) || null
  return null
}

const boton: React.CSSProperties = { textDecoration: 'none', display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: '0 18px', borderRadius: 10, fontWeight: 700 }

/**
 * Acciones en la ficha de una solicitud (collections/clinica/solicitudes.ts):
 * «Escribir por WhatsApp» con el mensaje listo y, si pidió un paquete y ya
 * tiene ficha (la pidió desde la app), «Vender el paquete» abre el expediente
 * de la mascota → Paquetes con el paquete elegido (nov-2026).
 */
export default function AccionesSolicitud() {
  const { id } = useDocumentInfo()
  const d = useFormFields(([campos]) => ({
    nombre: String(campos.nombre?.value ?? ''),
    whatsapp: String(campos.whatsapp?.value ?? ''),
    mascota: String(campos.mascota?.value ?? ''),
    servicio: String(campos.servicioNombre?.value ?? ''),
    paquete: idDe(campos.paquete?.value),
    mascotaFicha: idDe(campos.mascotaFicha?.value),
  }))
  const mensaje = d.paquete
    ? `Hola ${d.nombre.split(/\s+/)[0]}, te escribimos por el paquete «${d.servicio.replace(/^Paquete: /, '')}» que pediste${d.mascota ? ` para ${d.mascota}` : ''}.`
    : `Hola ${d.nombre.split(/\s+/)[0]}, te escribimos por la cita que pediste${d.mascota ? ` para ${d.mascota}` : ''}${d.servicio ? ` (${d.servicio})` : ''}. ¿Qué día y a qué hora te queda bien?`
  const liga = enlaceWhatsApp(d.whatsapp, mensaje)
  const vender = d.paquete && d.mascotaFicha ? `/admin/clinica/mascotas/${d.mascotaFicha}?ver=paquetes&paquete=${d.paquete}${id ? `&solicitud=${id}` : ''}` : null
  if (!liga && !vender) return null
  return (
    <div className="field-type" style={{ marginBottom: 24, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
      {liga && (
        <a href={liga} target="_blank" rel="noreferrer" style={{ ...boton, background: '#0b6b59', color: '#fff' }}>
          Escribir por WhatsApp
        </a>
      )}
      {vender && (
        <a href={vender} style={{ ...boton, background: '#fff', color: '#0f2f2a', border: '1px solid #cbd5e1' }}>
          Vender el paquete
        </a>
      )}
      {d.paquete && !d.mascotaFicha && <p style={{ margin: 0, alignSelf: 'center', fontSize: 13, color: '#475569' }}>Pidió un paquete desde el sitio: da de alta su ficha y véndelo en el expediente de la mascota → Paquetes.</p>}
    </div>
  )
}
