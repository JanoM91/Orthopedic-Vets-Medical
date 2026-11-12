'use client'

/**
 * Indicador de carga (nov-2026): silueta de un gato y un perro que mueven la
 * cola mientras se abre otra página. Se monta una vez en el panel (provider de
 * Payload: components/admin/ProveedorCargando.tsx), el portal y el sitio.
 *
 * Cómo sabe que hay navegación: escucha los clics en enlaces internos (Next y
 * Payload usan <a>); si la URL destino es otra, aparece a los 150 ms (las
 * navegaciones rápidas no parpadean) y se va cuando cambia la URL o a los
 * 12 s como tope. No bloquea la pantalla (pointer-events: none).
 * Con «reducir movimiento» del sistema, las colas no se mueven.
 */
import React, { useEffect, useRef, useState } from 'react'
import { site } from '../lib/site'

const CSS = `
.cg-velo{position:fixed;inset:0;z-index:2147483000;display:grid;place-items:center;pointer-events:none;background:rgba(248,250,249,.55);-webkit-backdrop-filter:blur(1.5px);backdrop-filter:blur(1.5px);opacity:0;transition:opacity .18s ease}
.cg-velo.is-on{opacity:1}
.cg-tarjeta{display:flex;flex-direction:column;align-items:center;gap:6px;padding:18px 22px 14px;border-radius:18px;background:#fff;box-shadow:0 12px 40px rgba(15,47,42,.16),0 0 0 1px rgba(15,47,42,.06)}
.cg-tarjeta p{margin:0;font:600 13px/1.2 system-ui,-apple-system,'Segoe UI',sans-serif;color:#4b5b56;letter-spacing:.01em}
.cg-sil{display:block}
.cg-cola-gato{transform-origin:24px 84px;animation:cg-gato 1.1s ease-in-out infinite}
.cg-cola-perro{transform-origin:102px 84px;animation:cg-perro .42s ease-in-out infinite alternate}
.cg-oreja{animation:cg-oreja 1.6s ease-in-out infinite}
.cg-oreja--i{transform-origin:72px 12px}
.cg-oreja--d{transform-origin:98px 12px;animation-delay:.2s}
.cg-puntos span{display:inline-block;width:4px;height:4px;margin:0 2px;border-radius:50%;background:currentColor;animation:cg-punto 1s ease-in-out infinite}
.cg-puntos span:nth-child(2){animation-delay:.15s}.cg-puntos span:nth-child(3){animation-delay:.3s}
@keyframes cg-gato{0%,100%{transform:rotate(0)}50%{transform:rotate(14deg)}}
@keyframes cg-perro{from{transform:rotate(-16deg)}to{transform:rotate(12deg)}}
@keyframes cg-oreja{0%,80%,100%{transform:rotate(0)}88%{transform:rotate(-7deg)}}
@keyframes cg-punto{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){.cg-cola-gato,.cg-cola-perro,.cg-oreja,.cg-puntos span{animation:none}}
`

/** El dibujo: gato sentado (izquierda) y perro sentado (derecha), de espaldas. */
export function SiluetasMascotas({ ancho = 132, color = site.brand.primary, animadas = true }: { ancho?: number; color?: string; animadas?: boolean }) {
  return (
    <svg className="cg-sil" width={ancho} height={(ancho * 90) / 120} viewBox="0 0 120 90" fill={color} aria-hidden="true">
      <path className={animadas ? 'cg-cola-gato' : undefined} d="M24 84C14 86 6 82 6 72c0-8 6-10 8-6 1 3-2 4-3 2" fill="none" stroke={color} strokeWidth="3.6" strokeLinecap="round" />
      <path d="M27 34l-2-14 8 8q5-1.5 10 0l8-8-2 14q3 6-2 11-9 5-18 0-5-5-2-11z" />
      <path d="M30 43q8 4 16 0 7 9 9 25 2 14-5 18H26q-7-4-5-18 2-16 9-25z" />
      <path d="M27 39l-10-2m10 4l-10 1m32-3l10-2m-10 4l10 1" fill="none" stroke={color} strokeWidth="0.7" strokeLinecap="round" />
      <path className={animadas ? 'cg-cola-perro' : undefined} d="M102 84c8 0 12-6 12-14 0-6-1-10-2-12" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
      <path d="M74 8q11-5 22 0 4 4 3 14-1 8-6 14H77q-5-6-6-14-1-10 3-14z" />
      <path className={animadas ? 'cg-oreja cg-oreja--i' : undefined} d="M74 9q-8 1-10 11-2 10 2 14 4 1 6-4 2-8 4-16z" />
      <path className={animadas ? 'cg-oreja cg-oreja--d' : undefined} d="M96 9q8 1 10 11 2 10-2 14-4 1-6-4-2-8-4-16z" />
      <path d="M77 33h16q3 9 5 19 10 6 8 22-2 10-6 12H70q-6-2-7-12-1-16 9-22 2-10 5-19z" />
    </svg>
  )
}

function esNavegacionInterna(e: MouseEvent): string | null {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null
  const a = (e.target as Element | null)?.closest?.('a')
  if (!a || !a.href) return null
  if (a.target && a.target !== '_self') return null
  if (a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return null
  let url: URL
  try {
    url = new URL(a.href, window.location.href)
  } catch {
    return null
  }
  if (url.origin !== window.location.origin) return null
  if (url.pathname.startsWith('/api/')) return null
  const actual = window.location
  if (url.pathname === actual.pathname && url.search === actual.search) return null // mismo lugar o solo #ancla
  return url.pathname + url.search
}

export function IndicadorNavegacion() {
  const [visible, setVisible] = useState(false)
  const [encendido, setEncendido] = useState(false)
  const t = useRef<{ mostrar?: ReturnType<typeof setTimeout>; tope?: ReturnType<typeof setTimeout>; vigia?: ReturnType<typeof setInterval> }>({})

  const apagar = () => {
    clearTimeout(t.current.mostrar)
    clearTimeout(t.current.tope)
    clearInterval(t.current.vigia)
    setEncendido(false)
    setTimeout(() => setVisible(false), 180)
  }

  useEffect(() => {
    const alClic = (e: MouseEvent) => {
      if (!esNavegacionInterna(e)) return
      const desde = window.location.href
      clearTimeout(t.current.mostrar)
      clearTimeout(t.current.tope)
      clearInterval(t.current.vigia)
      t.current.mostrar = setTimeout(() => {
        setVisible(true)
        requestAnimationFrame(() => setEncendido(true))
      }, 150)
      /* Cambió la URL (incluye solo ?parámetros, que no mueven `pathname`): ya llegó. */
      t.current.vigia = setInterval(() => {
        if (window.location.href !== desde) apagar()
      }, 120)
      t.current.tope = setTimeout(apagar, 12000)
    }
    const alVolver = () => apagar()
    document.addEventListener('click', alClic, true)
    window.addEventListener('pageshow', alVolver)
    window.addEventListener('popstate', alVolver)
    return () => {
      document.removeEventListener('click', alClic, true)
      window.removeEventListener('pageshow', alVolver)
      window.removeEventListener('popstate', alVolver)
      apagar()
    }
  }, [])

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      {visible && (
        <div className={`cg-velo${encendido ? ' is-on' : ''}`} role="status" aria-live="polite">
          <div className="cg-tarjeta">
            <SiluetasMascotas />
            <p>
              Cargando <span className="cg-puntos" aria-hidden="true"><span /><span /><span /></span>
            </p>
          </div>
        </div>
      )}
    </>
  )
}
