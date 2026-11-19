'use client'

/**
 * Banner de fotos de la portada (nov-2026, pedido de Jano): las «Fotos de la
 * portada» de «Sitio público» pasan solas cada 5 s y se pueden deslizar con el
 * dedo, con flechas o con los puntos. Se detiene al pasar el cursor, al tocarlo
 * o al enfocarlo con el teclado, cuando la pestaña no se ve y siempre si la
 * persona pidió «reducir movimiento». Con una sola foto, es una foto fija.
 *
 * Usa desplazamiento con «scroll-snap» (sin librerías): el navegador hace el
 * deslizamiento y la inercia; aquí solo se lleva la cuenta de cuál se ve.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react'

type Foto = { url: string; alt: string }

const CADA_MS = 5000
const PAUSA_TRAS_TOCAR_MS = 8000

export function Carrusel({ fotos }: { fotos: Foto[] }) {
  const pista = useRef<HTMLDivElement>(null)
  const [actual, setActual] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [quieto, setQuieto] = useState(false)
  const reanudar = useRef<number | null>(null)
  const n = fotos.length

  const ir = useCallback(
    (i: number, suave = true) => {
      const el = pista.current
      if (!el || !n) return
      const destino = ((i % n) + n) % n
      el.scrollTo({ left: destino * el.clientWidth, behavior: suave && !quieto ? 'smooth' : 'auto' })
    },
    [n, quieto],
  )

  /* «Reducir movimiento»: sin avance automático ni animación. */
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fijar = () => setQuieto(mq.matches)
    fijar()
    mq.addEventListener('change', fijar)
    return () => mq.removeEventListener('change', fijar)
  }, [])

  /* Cuál foto se ve: la que ocupa el centro de la pista. */
  useEffect(() => {
    const el = pista.current
    if (!el) return
    let cuadro = 0
    const medir = () => {
      cancelAnimationFrame(cuadro)
      cuadro = requestAnimationFrame(() => setActual(Math.round(el.scrollLeft / Math.max(1, el.clientWidth))))
    }
    el.addEventListener('scroll', medir, { passive: true })
    return () => {
      el.removeEventListener('scroll', medir)
      cancelAnimationFrame(cuadro)
    }
  }, [])

  /* Avance automático. */
  useEffect(() => {
    if (n < 2 || pausado || quieto) return
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') ir(actual + 1)
    }, CADA_MS)
    return () => window.clearInterval(t)
  }, [n, pausado, quieto, actual, ir])

  const pausarUnRato = () => {
    setPausado(true)
    if (reanudar.current) window.clearTimeout(reanudar.current)
    reanudar.current = window.setTimeout(() => setPausado(false), PAUSA_TRAS_TOCAR_MS)
  }
  useEffect(() => () => void (reanudar.current && window.clearTimeout(reanudar.current)), [])

  if (!n) return null
  if (n === 1) {
    return (
      <div className="st-carrusel st-carrusel--una">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={fotos[0].url} alt={fotos[0].alt} />
      </div>
    )
  }

  return (
    <div
      className="st-carrusel"
      role="region"
      aria-roledescription="carrusel"
      aria-label="Fotos de la clínica"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      onTouchStart={pausarUnRato}
    >
      <div ref={pista} className="st-carrusel__pista" tabIndex={0} aria-live={pausado ? 'polite' : 'off'}>
        {fotos.map((f, i) => (
          <figure key={f.url} className="st-carrusel__foto" aria-roledescription="foto" aria-label={`${i + 1} de ${n}: ${f.alt}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={f.url} alt={f.alt} loading={i === 0 ? 'eager' : 'lazy'} draggable={false} />
          </figure>
        ))}
      </div>
      <button type="button" className="st-carrusel__flecha st-carrusel__flecha--izq" aria-label="Foto anterior" onClick={() => (pausarUnRato(), ir(actual - 1))}>
        ‹
      </button>
      <button type="button" className="st-carrusel__flecha st-carrusel__flecha--der" aria-label="Foto siguiente" onClick={() => (pausarUnRato(), ir(actual + 1))}>
        ›
      </button>
      <div className="st-carrusel__puntos">
        {fotos.map((f, i) => (
          <button key={f.url} type="button" className={`st-carrusel__punto${i === actual ? ' is-on' : ''}`} aria-label={`Ver foto ${i + 1} de ${n}`} aria-current={i === actual ? 'true' : undefined} onClick={() => (pausarUnRato(), ir(i))} />
        ))}
      </div>
    </div>
  )
}
