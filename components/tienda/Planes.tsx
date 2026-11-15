'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'

import type { OfertaPlan, PlanVista } from '../../lib/farmacia/planes'
import type { SesionTienda } from '../../lib/farmacia/tiposTienda'
import { ESTADO_PEDIDO_LABEL, type EstadoPedido } from '../../lib/farmacia/tiposTienda'
import { Icono } from '../portal/comun'
import { api, type PerfilGuardado, pesos } from './estado'

/* ═══════════════════════════════════════════════════════════════════════════
   Planes de compra (Farmacia, fase 6b): la oferta en la ficha del producto y
   la página del plan (liga con token). Precio, receta y compatibilidad los
   decide el servidor; aquí solo se muestran.
   ═══════════════════════════════════════════════════════════════════════════ */

export const ESTADO_PLAN: Record<PlanVista['estado'], { t: string; tono: 'ok' | 'warn' | 'bad' | 'info' | 'gris' }> = {
  por_pagar: { t: 'Falta el pago', tono: 'warn' },
  activo: { t: 'Activo', tono: 'ok' },
  detenido: { t: 'En pausa', tono: 'warn' },
  cancelado: { t: 'Cancelado', tono: 'gris' },
  terminado: { t: 'Terminado', tono: 'gris' },
}

const fechaCorta = (d: string) => new Date(d + 'T12:00:00Z').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** «Recíbelo cada N días» en la ficha: solo con sesión, mascota elegida y planes encendidos. */
export function OfertaPlanes({ presentacionId, cantidad, conReceta, sesion, perfil }: { presentacionId: number; cantidad: number; conReceta: boolean; sesion: SesionTienda; perfil: PerfilGuardado }) {
  const mascotaId = perfil && 'mascotaId' in perfil ? perfil.mascotaId : null
  const activo = sesion.planes.activo && Boolean(mascotaId)
  const clave = `${presentacionId}:${mascotaId}:${cantidad}`
  const [o, setO] = useState<{ clave: string; v: OfertaPlan } | null>(null)
  const [modalidad, setModalidad] = useState<'recurrente' | 'anual'>('recurrente')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!activo) return
    let vivo = true
    api<OfertaPlan>(`plan-oferta?presentacion=${presentacionId}&mascota=${mascotaId}&cantidad=${cantidad}`)
      .then((v) => vivo && setO({ clave, v }))
      .catch(() => vivo && setO({ clave, v: { disponible: false, motivo: null, cadaDias: null, recurrente: null, anual: null } }))
    return () => {
      vivo = false
    }
  }, [activo, presentacionId, mascotaId, cantidad, clave])
  if (!activo || !o || o.clave !== clave || !o.v.disponible || !o.v.recurrente) return null
  const v = o.v
  const rec = o.v.recurrente
  const anual = v.anual && v.anual.entregas > 1 ? v.anual : null
  const contratar = async () => {
    setEnviando(true)
    setError(null)
    try {
      const r = await api<{ url: string }>('planes', { method: 'POST', body: JSON.stringify({ modalidad, presentacionId, mascotaId, cantidad }) })
      window.location.assign(r.url)
    } catch (e) {
      setError((e as Error).message)
      setEnviando(false)
    }
  }
  return (
    <section className="pt-card ti-plan">
      <div className="ti-plan__cab">
        <span className="ti-fila-i">
          <Icono n="repetir" />
        </span>
        <div>
          <b>Recíbelo cada {v.cadaDias} días</b>
          <p className="pt-chico pt-tenue">Para {perfil?.etiqueta}. Lo preparamos y te avisamos cuando esté listo para recoger.</p>
        </div>
      </div>
      <div className="ti-plan__opciones" role="radiogroup" aria-label="Tipo de plan">
        <button type="button" role="radio" aria-checked={modalidad === 'recurrente'} className={`ti-pres${modalidad === 'recurrente' ? ' is-on' : ''}`} onClick={() => setModalidad('recurrente')}>
          <span>Pago en cada entrega</span>
          <b>{pesos(rec.precioEntrega)}</b>
          <small>Se cobra solo · cancela cuando quieras</small>
        </button>
        {anual && (
          <button type="button" role="radio" aria-checked={modalidad === 'anual'} className={`ti-pres${modalidad === 'anual' ? ' is-on' : ''}`} onClick={() => setModalidad('anual')}>
            <span>
              {anual.entregas} entregas pagadas{anual.descuentoPorciento > 0 ? ` · ${anual.descuentoPorciento}% menos` : ''}
            </span>
            <b>{pesos(anual.total)}</b>
            <small>Un solo pago · {pesos(anual.precioEntrega)} por entrega</small>
          </button>
        )}
      </div>
      {error && <div className="pt-aviso pt-aviso--bad">{error}</div>}
      <button type="button" className="pt-btn pt-btn--primario pt-btn--bloque" disabled={enviando} onClick={contratar}>
        <Icono n="repetir" /> {modalidad === 'anual' ? 'Pagar el plan' : 'Activar el plan'}
      </button>
      <p className="pt-chico pt-tenue">Antes de cada entrega revisamos que le siga correspondiendo{conReceta ? ' y que su receta siga vigente' : ''}. Si algo cambió, pausamos el plan y te avisamos.</p>
    </section>
  )
}

/** Página del plan (liga del correo o de «Mis pedidos»). */
export function PaginaPlan({ id, token, referencia, volvioDelPago }: { id: number; token: string; referencia: string | null; volvioDelPago: boolean }) {
  const [r, setR] = useState<{ v: (PlanVista & { pagoPrueba: boolean; referencia: string | null }) | null; error: string | null } | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const cargar = React.useCallback(() => {
    api<PlanVista & { pagoPrueba: boolean; referencia: string | null }>(`plan/${id}?t=${encodeURIComponent(token)}`)
      .then((v) => setR({ v, error: null }))
      .catch((e: Error) => setR({ v: null, error: e.message }))
  }, [id, token])
  useEffect(() => {
    cargar()
  }, [cargar])
  /* Al volver de la pasarela, el aviso puede tardar unos segundos. */
  useEffect(() => {
    if (!volvioDelPago || r?.v?.estado !== 'por_pagar') return
    const h = window.setTimeout(cargar, 4000)
    return () => window.clearTimeout(h)
  }, [volvioDelPago, r?.v?.estado, cargar])

  if (r?.error) return <div className="pt-aviso pt-aviso--bad">{r.error}</div>
  if (!r?.v) return <div className="pt-card ti-esqueleto" aria-busy="true" />
  const v = r.v
  const est = ESTADO_PLAN[v.estado]
  const ref = referencia || v.referencia
  const accion = async (ruta: string, cuerpo: Record<string, unknown>, despues?: (d: { url?: string }) => void) => {
    setEnviando(true)
    setAviso(null)
    try {
      const d = await api<{ url?: string }>(ruta, { method: 'POST', body: JSON.stringify({ t: token, ...cuerpo }) })
      if (despues) despues(d)
      else cargar()
    } catch (e) {
      setAviso((e as Error).message)
    }
    setEnviando(false)
  }
  return (
    <div className="ti-plan-pag">
      {v.estado === 'por_pagar' && v.pagoPrueba && <div className="ti-prueba__banda">MODO PRUEBA · no se cobra dinero real</div>}
      <section className="pt-card ti-plan">
        <p className="pt-chico pt-tenue">
          Plan {v.folio} · {v.mascota.nombre}
        </p>
        <h1>{v.producto.nombre}</h1>
        <p className="pt-chico">
          {v.cantidad} × {v.presentacion.nombre} cada {v.cadaDias} días · para recoger en la farmacia
        </p>
        <div className="ti-plan__cifras">
          <span className={`pt-pill pt-pill--${est.tono}`}>{est.t}</span>
          <b>{v.modalidad === 'anual' ? `${pesos(v.total ?? 0)} por ${v.entregasTotales} entregas` : `${pesos(v.precioEntrega)} por entrega`}</b>
        </div>
        {v.motivo && (v.estado === 'detenido' || v.estado === 'cancelado') && <div className={`pt-aviso ${v.estado === 'detenido' ? 'pt-aviso--warn' : 'pt-aviso--info'}`}>{v.motivo}</div>}
        {v.estado === 'detenido' && (
          <Link href="/portal/citas/nueva" className="pt-btn pt-btn--acento">
            Agendar una cita
          </Link>
        )}
        {v.estado === 'activo' && v.proximaEntrega && (
          <p className="pt-chico">
            <Icono n="cal" /> Próxima entrega: alrededor del {fechaCorta(v.proximaEntrega)}
            {v.modalidad === 'anual' && v.entregasTotales ? ` · van ${v.entregasHechas} de ${v.entregasTotales}` : ''}
          </p>
        )}
        {v.estado === 'por_pagar' && volvioDelPago && !v.pagoPrueba && <div className="pt-aviso pt-aviso--info">Estamos confirmando tu pago con la pasarela. Esta página se actualiza sola.</div>}
        {aviso && <div className="pt-aviso pt-aviso--bad">{aviso}</div>}

        {v.estado === 'por_pagar' &&
          (v.pagoPrueba && ref ? (
            <>
              <button type="button" className="pt-btn pt-btn--acento pt-btn--bloque" disabled={enviando} onClick={() => accion(`pago-prueba-plan/${id}`, { ref, resultado: 'aprobado' })}>
                {v.modalidad === 'anual' ? `Aprobar pago de ${pesos(v.total ?? 0)}` : 'Autorizar la suscripción'}
              </button>
              <button type="button" className="pt-btn pt-btn--bloque" disabled={enviando} onClick={() => accion(`pago-prueba-plan/${id}`, { ref, resultado: 'rechazado' })}>
                Rechazar pago
              </button>
            </>
          ) : (
            <button type="button" className="pt-btn pt-btn--acento pt-btn--bloque" disabled={enviando} onClick={() => accion(`plan/${id}/pagar`, {}, (d) => d.url && window.location.assign(d.url))}>
              {v.modalidad === 'anual' ? 'Pagar el plan' : 'Autorizar el cobro'}
            </button>
          ))}
      </section>

      {v.pedidos.length > 0 && (
        <section className="pt-seccion">
          <h2>Entregas</h2>
          <div className="pt-card pt-lista">
            {v.pedidos.map((p) => (
              <Link key={p.folio} href={`/tienda/pedido/${p.folio}?t=${encodeURIComponent(p.token ?? '')}`} className="pt-fila">
                <span className="ti-fila-i">
                  <Icono n="bolsa" />
                </span>
                <span className="pt-fila__main">
                  <span className="pt-fila__t1">
                    Entrega {p.ciclo ?? ''} · {p.folio}
                  </span>
                </span>
                <span className="pt-pill">{ESTADO_PEDIDO_LABEL[p.estado as EstadoPedido] ?? p.estado}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {(v.estado === 'por_pagar' || ((v.estado === 'activo' || v.estado === 'detenido') && v.modalidad === 'recurrente')) &&
        (confirmarCancelar ? (
          <section className="pt-card">
            <b>¿Cancelar el plan?</b>
            <p className="pt-chico pt-tenue">{v.modalidad === 'recurrente' && v.estado !== 'por_pagar' ? 'Ya no se cobrará ni se preparará otra entrega. Lo que ya está pagado se entrega normal.' : 'El plan se cancela sin cobro.'}</p>
            <button type="button" className="pt-btn pt-btn--bloque" disabled={enviando} onClick={() => accion(`plan/${id}/cancelar`, {})}>
              Sí, cancelar
            </button>
            <button type="button" className="pt-enlace" onClick={() => setConfirmarCancelar(false)}>
              No, déjalo así
            </button>
          </section>
        ) : (
          <button type="button" className="pt-enlace pt-chico" onClick={() => setConfirmarCancelar(true)}>
            Cancelar el plan
          </button>
        ))}
      {v.modalidad === 'anual' && v.estado === 'activo' && <p className="pt-chico pt-tenue">¿Necesitas cambiar o cancelar tu plan anual? Escríbenos o llámanos y lo revisamos contigo.</p>}
      <Link href="/portal/farmacia" className="pt-enlace pt-chico">
        Mis pedidos
      </Link>
    </div>
  )
}
