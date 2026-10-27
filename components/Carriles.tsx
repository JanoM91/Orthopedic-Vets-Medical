'use client'

import { useEffect } from 'react'

/**
 * Carriles desplazables (pestañas y menús horizontales en el teléfono).
 *
 * En pantallas angostas las pestañas no caben y se desplazan de lado. Sin
 * pista visual parecen cortadas («Nu…», «Dc»). Este componente, montado una
 * vez por pantalla, marca cada carril con `data-izq` / `data-der` cuando hay
 * contenido escondido a ese lado (el CSS pinta un desvanecido) y lleva la
 * pestaña activa a la vista. No dibuja nada.
 */
const SELECTOR = '.fz-subnav, .fz-pestanas, .fz-chips--scroll, .pt-tabs'

function marcar(el: HTMLElement) {
  const fin = el.scrollWidth - el.clientWidth
  el.toggleAttribute('data-izq', el.scrollLeft > 4)
  el.toggleAttribute('data-der', fin - el.scrollLeft > 4)
}

export function Carriles() {
  useEffect(() => {
    const vistos = new WeakSet<HTMLElement>()
    const preparar = () => {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
        if (!vistos.has(el)) {
          vistos.add(el)
          el.addEventListener('scroll', () => marcar(el), { passive: true })
          const activo = el.querySelector<HTMLElement>('.is-on, [aria-selected="true"]')
          if (activo && el.scrollWidth > el.clientWidth) {
            const izq = activo.offsetLeft - el.offsetLeft - (el.clientWidth - activo.offsetWidth) / 2
            el.scrollLeft = Math.max(0, izq)
          }
        }
        marcar(el)
      })
    }
    preparar()
    const obs = new MutationObserver(() => preparar())
    obs.observe(document.body, { childList: true, subtree: true })
    window.addEventListener('resize', preparar)
    return () => {
      obs.disconnect()
      window.removeEventListener('resize', preparar)
    }
  }, [])
  return null
}
