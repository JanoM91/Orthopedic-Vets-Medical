'use client'

import { useField } from '@payloadcms/ui'
import type { TextareaFieldClientComponent } from 'payload'
import React, { useRef, useState } from 'react'

/**
 * Campo «Foto» de «Fotos del sitio» (home versión B, nov-2026). El valor es un
 * `data:image/jpeg;base64,…`: la foto se reduce en el navegador
 * (lib/reducirImagen.ts, lado mayor 1400 px, tope 550 KB) y viaja dentro del
 * formulario de Payload, sin almacén de archivos. El visitante la recibe por
 * `GET /api/sitio/fotos/:id`.
 */
const CampoFoto: TextareaFieldClientComponent = ({ path, field }) => {
  const { value, setValue, showError, errorMessage } = useField<string>({ path })
  const entrada = useRef<HTMLInputElement>(null)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function elegir(e: React.ChangeEvent<HTMLInputElement>) {
    const archivo = e.target.files?.[0]
    e.target.value = ''
    if (!archivo) return
    setOcupado(true)
    setError(null)
    try {
      const { reducirImagen } = await import('../../lib/reducirImagen')
      const blob = await reducirImagen(archivo, { lado: 1400, calidad: 0.82 })
      const datos = await new Promise<string>((ok, mal) => {
        const lector = new FileReader()
        lector.onload = () => ok(String(lector.result))
        lector.onerror = () => mal(new Error('lectura'))
        lector.readAsDataURL(blob)
      })
      setValue(datos)
    } catch (x) {
      setError(x instanceof Error && x.message && x.message !== 'lectura' ? x.message : 'No se pudo preparar la foto. Prueba con otra.')
    } finally {
      setOcupado(false)
    }
  }

  const etiqueta = typeof field?.label === 'string' ? field.label : 'Foto'
  const id = `campo-foto-${path.replace(/\W+/g, '-')}`
  return (
    <div className="field-type" style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
      <label className="field-label" htmlFor={id}>
        {etiqueta}
        {field?.required ? <span className="required"> *</span> : null}
      </label>
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={value} alt="Vista previa de la foto" style={{ maxWidth: 360, width: '100%', height: 'auto', borderRadius: 12, border: '1px solid #dce5e2', display: 'block' }} />
      ) : (
        <p style={{ margin: 0, color: '#56655f' }}>Todavía no hay foto.</p>
      )}
      <input ref={entrada} id={id} type="file" accept="image/*" onChange={elegir} disabled={ocupado} style={{ fontSize: 16, minHeight: 44 }} />
      <p style={{ margin: 0, fontSize: 13, color: '#56655f' }}>{ocupado ? 'Preparando la foto…' : 'La foto se reduce sola antes de guardarse. Horizontal para la portada; vertical para el retrato.'}</p>
      {(error || (showError && errorMessage)) && (
        <p role="alert" style={{ margin: 0, color: '#ad2a20', fontWeight: 600 }}>
          {error || errorMessage}
        </p>
      )}
    </div>
  )
}

export default CampoFoto
