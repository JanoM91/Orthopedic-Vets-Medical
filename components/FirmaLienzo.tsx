'use client'

import React, { useEffect, useRef, useState } from 'react'

/**
 * Lienzo para firmar con el dedo, el lápiz o el mouse (nov-2026, consentimiento
 * de cirugía). Devuelve la firma como PNG en `data:` (o null si está vacía o se
 * borró). Funciona igual en la app del tutor y en una tableta de la clínica.
 * Sin librerías: Pointer Events y un <canvas> escalado a la densidad de la pantalla.
 */
export function FirmaLienzo({ onCambio, etiqueta = 'Firma aquí con el dedo', claro = false }: { onCambio: (png: string | null) => void; etiqueta?: string; claro?: boolean }) {
  const lienzo = useRef<HTMLCanvasElement>(null)
  const trazando = useRef(false)
  const ultimo = useRef<{ x: number; y: number } | null>(null)
  const recorrido = useRef(0)
  const [vacia, setVacia] = useState(true)

  /* Ajusta el lienzo a su ancho real (y al girar el teléfono); al cambiar de tamaño se borra. */
  useEffect(() => {
    const c = lienzo.current
    if (!c) return
    const ajustar = () => {
      const r = c.getBoundingClientRect()
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1))
      c.width = Math.round(r.width * dpr)
      c.height = Math.round(r.height * dpr)
      const g = c.getContext('2d')
      if (!g) return
      g.setTransform(dpr, 0, 0, dpr, 0, 0)
      g.lineCap = 'round'
      g.lineJoin = 'round'
      g.lineWidth = 2.4
      g.strokeStyle = '#0f172a'
      recorrido.current = 0
      setVacia(true)
      onCambio(null)
    }
    ajustar()
    const ro = new ResizeObserver(() => ajustar())
    ro.observe(c)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const punto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const empezar = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    trazando.current = true
    ultimo.current = punto(e)
  }
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!trazando.current || !ultimo.current) return
    const g = e.currentTarget.getContext('2d')
    if (!g) return
    const p = punto(e)
    g.beginPath()
    g.moveTo(ultimo.current.x, ultimo.current.y)
    g.lineTo(p.x, p.y)
    g.stroke()
    recorrido.current += Math.hypot(p.x - ultimo.current.x, p.y - ultimo.current.y)
    ultimo.current = p
  }
  const terminar = () => {
    if (!trazando.current) return
    trazando.current = false
    ultimo.current = null
    /* Un punto o una rayita no son una firma. */
    const ok = recorrido.current > 60
    setVacia(!ok)
    onCambio(ok && lienzo.current ? lienzo.current.toDataURL('image/png') : null)
  }
  const borrar = () => {
    const c = lienzo.current
    const g = c?.getContext('2d')
    if (!c || !g) return
    g.save()
    g.setTransform(1, 0, 0, 1, 0, 0)
    g.clearRect(0, 0, c.width, c.height)
    g.restore()
    recorrido.current = 0
    setVacia(true)
    onCambio(null)
  }

  return (
    <div className={`firma-lienzo${claro ? ' firma-lienzo--claro' : ''}`}>
      <canvas
        ref={lienzo}
        className="firma-lienzo__canvas"
        aria-label={etiqueta}
        role="img"
        onPointerDown={empezar}
        onPointerMove={mover}
        onPointerUp={terminar}
        onPointerCancel={terminar}
        onPointerLeave={terminar}
      />
      {vacia && <span className="firma-lienzo__guia" aria-hidden="true">{etiqueta}</span>}
      <button type="button" className="firma-lienzo__borrar" onClick={borrar}>
        Borrar
      </button>
      <style>{`
.firma-lienzo{position:relative;border:1.5px dashed #94a3b8;border-radius:12px;background:#fff;height:190px}
.firma-lienzo__canvas{display:block;width:100%;height:100%;touch-action:none;cursor:crosshair;border-radius:12px}
.firma-lienzo__guia{position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);text-align:center;color:#94a3b8;font-size:15px;pointer-events:none}
.firma-lienzo__borrar{position:absolute;right:6px;top:6px;min-height:40px;min-width:64px;padding:0 12px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;color:#0f172a;font:inherit;font-size:14px;cursor:pointer}
.firma-lienzo::after{content:'';position:absolute;left:16px;right:16px;bottom:38px;border-bottom:1px solid #cbd5e1;pointer-events:none}
`}</style>
    </div>
  )
}
