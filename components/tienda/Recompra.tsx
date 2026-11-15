'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'

import type { RecompraVista } from '../../lib/farmacia/recompra'
import type { SesionTienda } from '../../lib/farmacia/tiposTienda'
import { Icono } from '../portal/comun'
import { api, pesos, tienda } from './estado'

/**
 * «Volver a pedir» (Farmacia, fase 6a): llega desde el correo de recompra o
 * desde Pendientes del portal. Con la liga (id + token) muestra lo que compró la
 * última vez y lo agrega al carrito en un toque; con `baja` ofrece dejar de
 * avisar. Precio, existencia y receta los vuelve a revisar el servidor al pedir.
 */
const fechaCorta = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })

export function VolverAPedir({ id, token, baja, sesion }: { id: number; token: string; baja: boolean; sesion: SesionTienda }) {
  const router = useRouter()
  const [r, setR] = useState<{ v: RecompraVista | null; error: string | null } | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [hecho, setHecho] = useState<'baja' | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    let vivo = true
    api<RecompraVista>(`recompra/${id}?t=${encodeURIComponent(token)}`)
      .then((v) => {
        if (!vivo) return
        setR({ v, error: null })
        setCantidad(Math.max(1, Math.round(v.cantidad) || 1))
      })
      .catch((e: Error) => vivo && setR({ v: null, error: e.message }))
    return () => {
      vivo = false
    }
  }, [id, token])

  if (r?.error) return <div className="pt-aviso pt-aviso--bad">{r.error}</div>
  if (!r?.v) return <div className="pt-card ti-esqueleto" aria-busy="true" />
  const v = r.v
  const pres = v.presentacion
  const suMascota = v.mascota && sesion.mascotas.some((m) => m.id === v.mascota!.id) ? v.mascota : null

  if (baja || hecho === 'baja')
    return (
      <section className="pt-card ti-recompra">
        <h1>{hecho === 'baja' || !v.activa ? 'Listo, ya no te avisamos' : '¿Dejamos de avisarte?'}</h1>
        <p className="pt-tenue">
          {v.producto.nombre}
          {v.mascota ? ` de ${v.mascota.nombre}` : ''}
        </p>
        {hecho !== 'baja' && v.activa && (
          <button
            type="button"
            className="pt-btn pt-btn--acento"
            disabled={enviando}
            onClick={async () => {
              setEnviando(true)
              try {
                await api(`recompra/${id}/baja`, { method: 'POST', body: JSON.stringify({ t: token }) })
                setHecho('baja')
              } catch (e) {
                setR({ v, error: (e as Error).message })
              }
              setEnviando(false)
            }}
          >
            No me avises más de este producto
          </button>
        )}
        <Link href="/tienda" className="pt-enlace">
          Ir a la tienda
        </Link>
      </section>
    )

  return (
    <section className="pt-card ti-recompra">
      <p className="pt-chico pt-tenue">Volver a pedir{v.mascota ? ` para ${v.mascota.nombre}` : ''}</p>
      <h1>{v.producto.nombre}</h1>
      <p className="pt-chico pt-tenue">
        Lo compraste el {fechaCorta(v.ultimaCompra)}
        {pres ? ` · ${pres.nombre}` : ''}
      </p>
      {v.producto.requiereReceta ? (
        <>
          <div className="pt-aviso pt-aviso--info">Es con receta: se surte con la receta vigente de tu mascota.</div>
          <Link href={v.mascota ? `/tienda?para=${v.mascota.id}` : '/portal/farmacia'} className="pt-btn pt-btn--acento">
            Surtir con mi receta
          </Link>
        </>
      ) : !v.producto.enTienda || !pres ? (
        <div className="pt-aviso pt-aviso--warn">Este producto ya no está en la tienda en línea. Pídelo en la farmacia o escríbenos.</div>
      ) : !pres.disponible ? (
        <div className="pt-aviso pt-aviso--warn">Por ahora está agotado. Te lo apartamos en cuanto llegue si nos escribes.</div>
      ) : (
        <div className="ti-recompra__comprar">
          <div className="ti-cantidad" role="group" aria-label="Cantidad">
            <button type="button" onClick={() => setCantidad(Math.max(1, cantidad - 1))} aria-label="Uno menos" disabled={cantidad <= 1}>
              <Icono n="menos" />
            </button>
            <span aria-live="polite">{cantidad}</span>
            <button type="button" onClick={() => setCantidad(Math.min(100, cantidad + 1))} aria-label="Uno más">
              <Icono n="mas" />
            </button>
          </div>
          <button
            type="button"
            className="pt-btn pt-btn--acento"
            onClick={() => {
              if (suMascota) tienda.perfil({ mascotaId: suMascota.id, etiqueta: suMascota.nombre })
              tienda.agregar({ presentacionId: pres.id, productoId: v.producto.id, producto: v.producto.nombre, presentacion: pres.nombre, precio: pres.precio, fraccionada: pres.fraccionada, requiereReceta: false, imagenUrl: v.producto.imagenUrl }, cantidad)
              router.push('/tienda/carrito')
            }}
          >
            <Icono n="carrito" /> Agregar y pagar · {pesos(pres.precio * cantidad)}
          </button>
        </div>
      )}
      <Link href={`/tienda/recompra/${id}?t=${encodeURIComponent(token)}&baja=1`} className="pt-enlace pt-chico">
        No me avises más de este producto
      </Link>
    </section>
  )
}
