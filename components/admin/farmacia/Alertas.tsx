'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import type { AlertaVista, GrupoReabasto, PromocionVista, ResultadoRecalculo } from '../../../lib/farmacia/alertas'
import { api, Aviso, Ayuda, Boton, Campo, cantidad, ErrorForm, fecha, Modal, momento, Pastilla, useFarmacia } from './comun'

/**
 * Fase 4: alertas (caducidad, desabasto, reorden, sin rotación, recetas),
 * lista de reabasto por proveedor y promociones por caducidad. Todo lo genera
 * el servidor (cron diario 08:00 o «Recalcular ahora»); aquí se atiende,
 * descarta, acepta o aprueba.
 */

const TIPO: Record<AlertaVista['tipo'], string> = {
  caducidad: 'Caducidad',
  desabasto: 'Desabasto',
  reorden_sugerido: 'Punto de reorden',
  sin_rotacion: 'Sin rotación',
  receta_por_validar: 'Receta por validar',
  original_pendiente: 'Original pendiente',
  plan_por_renovar: 'Plan por renovar',
}
const SEV: Record<AlertaVista['severidad'], { l: string; t: 'malo' | 'aviso' | 'info' }> = { critica: { l: 'Crítica', t: 'malo' }, urgente: { l: 'Urgente', t: 'aviso' }, aviso: { l: 'Aviso', t: 'info' } }

export function Alertas({ tipo: tipoInicial }: { tipo: string | null }) {
  const { base, catalogo, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const puedeCerrar = p.aprobar || p.ajustes || p.recetas
  const [tipo, setTipo] = useState(tipoInicial ?? '')
  const [estado, setEstado] = useState<'abierta' | 'atendida' | 'descartada'>('abierta')
  const [datos, setDatos] = useState<{ alertas: AlertaVista[]; porTipo: Record<string, number> } | null>(null)
  const [n, setN] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [reorden, setReorden] = useState<AlertaVista | null>(null)
  useEffect(() => {
    api.get<{ alertas: AlertaVista[]; porTipo: Record<string, number> }>('alertas', { estado, tipo }).then(setDatos, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [estado, tipo, n])
  const recargar = () => {
    setN((x) => x + 1)
    recargarCatalogo()
  }
  const recalcular = async () => {
    setOcupado(true)
    setError(null)
    try {
      const r = await api.post<ResultadoRecalculo>('alertas/recalcular')
      setMsg(`Listo: ${r.abiertas} abiertas (${r.nuevas} nuevas, ${r.cerradas} resueltas solas). Promociones: ${r.promociones.nuevas} nuevas.`)
      recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo recalcular.')
    }
    setOcupado(false)
  }
  const cerrar = async (a: AlertaVista, como: 'atender' | 'descartar') => {
    setError(null)
    try {
      await api.post(`alertas/${a.id}/${como}`, {})
      recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
  }
  const ir = (a: AlertaVista): string | null => {
    if (a.tipo === 'receta_por_validar' || a.tipo === 'original_pendiente') return a.recetaId ? `${base}/recetas/${a.recetaId}` : null
    if (a.productoId) return `${base}/productos/${a.productoId}`
    return null
  }
  const total = Object.values(datos?.porTipo ?? {}).reduce((x, y) => x + y, 0)
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Alertas</h1>
          <Ayuda>Se recalculan cada día a las 8:00 y llega un resumen por correo a quien tiene «Reportes». Una sola alerta abierta por objeto; las que ya no aplican se cierran solas.</Ayuda>
        </div>
        {(p.aprobar || p.ajustes) && (
          <div className="fz-acciones-fin">
            <Boton onClick={() => void recalcular()} disabled={ocupado}>
              {ocupado ? 'Recalculando…' : 'Recalcular ahora'}
            </Boton>
          </div>
        )}
      </div>
      {msg && <Aviso tono="ok">{msg}</Aviso>}
      <ErrorForm error={error} />
      <div className="fz-chips fz-chips--scroll" role="tablist" aria-label="Tipo de alerta">
        <button type="button" className={`fz-chip${tipo === '' ? ' is-on' : ''}`} onClick={() => setTipo('')}>
          Todas {estado === 'abierta' ? `(${total})` : ''}
        </button>
        {(Object.keys(TIPO) as AlertaVista['tipo'][])
          .filter((k) => k !== 'plan_por_renovar')
          .map((k) => (
            <button key={k} type="button" className={`fz-chip${tipo === k ? ' is-on' : ''}`} onClick={() => setTipo(k)}>
              {TIPO[k]} {datos?.porTipo[k] ? `(${datos.porTipo[k]})` : ''}
            </button>
          ))}
      </div>
      <div className="fz-seg" style={{ maxWidth: 420 }} role="radiogroup" aria-label="Estado">
        {(['abierta', 'atendida', 'descartada'] as const).map((e) => (
          <button key={e} type="button" className={estado === e ? 'is-on' : ''} onClick={() => setEstado(e)} aria-pressed={estado === e}>
            {e === 'abierta' ? 'Abiertas' : e === 'atendida' ? 'Atendidas' : 'Descartadas'}
          </button>
        ))}
      </div>
      {!datos && !error && <p className="fz-tenue">Cargando…</p>}
      {datos && datos.alertas.length === 0 && <Aviso tono="ok">{estado === 'abierta' ? 'Sin alertas abiertas.' : 'Nada aquí.'}</Aviso>}
      {datos && datos.alertas.length > 0 && (
        <div className="fz-tarjeta fz-lista">
          {datos.alertas.map((a) => {
            const destino = ir(a)
            return (
              <div key={a.id} className={`fz-fila fa-alerta fa-alerta--${a.severidad}`}>
                <span className="fz-fila__main">
                  <span className="fz-fila__t1">
                    <Pastilla tono={SEV[a.severidad].t}>{SEV[a.severidad].l}</Pastilla> <span className="fz-chico fz-tenue">{TIPO[a.tipo]}</span>
                  </span>
                  <span className="fa-alerta__msg">{a.mensaje}</span>
                  <span className="fz-fila__t2">
                    {estado === 'abierta' ? `Desde ${momento(a.abiertaEn)}` : `${a.cierreAutomatico ? 'Se resolvió sola' : `Cerró ${a.cerradaPor?.nombre ?? ''}`} · ${momento(a.cerradaEn)}${a.nota ? ` · ${a.nota}` : ''}`}
                  </span>
                </span>
                <span className="fa-alerta__acciones">
                  {destino && (
                    <Link href={destino} className="fz-btn fz-btn--claro fz-btn--chico">
                      Ver
                    </Link>
                  )}
                  {estado === 'abierta' && a.tipo === 'reorden_sugerido' && p.aprobar && (
                    <Boton chico tono="teal" onClick={() => setReorden(a)}>
                      Aceptar
                    </Boton>
                  )}
                  {estado === 'abierta' && puedeCerrar && a.tipo !== 'reorden_sugerido' && (
                    <Boton chico onClick={() => void cerrar(a, 'atender')}>
                      Atendida
                    </Boton>
                  )}
                  {estado === 'abierta' && puedeCerrar && (
                    <button type="button" className="fz-link" onClick={() => void cerrar(a, 'descartar')} title="No se repite mientras no cambie">
                      {a.tipo === 'reorden_sugerido' ? 'Ignorar' : 'Descartar'}
                    </button>
                  )}
                </span>
              </div>
            )
          })}
        </div>
      )}
      {reorden && (
        <ModalReorden
          alerta={reorden}
          onCerrar={() => setReorden(null)}
          alListo={(m) => {
            setReorden(null)
            setMsg(m)
            recargar()
          }}
        />
      )}
    </div>
  )
}

function ModalReorden({ alerta, onCerrar, alListo }: { alerta: AlertaVista; onCerrar: () => void; alListo: (m: string) => void }) {
  const [valor, setValor] = useState(alerta.valor != null ? String(alerta.valor) : '')
  const [error, setError] = useState<string | null>(null)
  const aceptar = async () => {
    try {
      const r = await api.post<{ puntoReordenAceptado: number }>(`reorden/${alerta.productoId}/aceptar`, { valor: valor === '' ? null : Number(valor) })
      alListo(`Punto de reorden aceptado: ${r.puntoReordenAceptado}. Desde hoy el desabasto y el reabasto usan ese valor.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
  }
  return (
    <Modal titulo="Aceptar punto de reorden" onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        <p className="fz-chico">{alerta.mensaje}</p>
        <Campo etiqueta="Punto de reorden (unidades base)" ayuda="Puedes corregirlo antes de aceptar. Ignorarlo no cambia nada.">
          <input className="fz-input" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} autoFocus />
        </Campo>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <Boton tono="navy" onClick={() => void aceptar()} disabled={valor === '' || Number(valor) < 0}>
            Aceptar
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

/* ═══════════════════════════ reabasto ═══════════════════════════ */

export function Reabasto() {
  const { base } = useFarmacia()
  const [datos, setDatos] = useState<{ grupos: GrupoReabasto[]; diasCobertura: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiado, setCopiado] = useState<number | null>(null)
  useEffect(() => {
    api.get<{ grupos: GrupoReabasto[]; diasCobertura: number }>('reabasto').then(setDatos, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [])
  const copiar = async (g: GrupoReabasto, i: number) => {
    try {
      await navigator.clipboard.writeText(g.texto)
      setCopiado(i)
      setTimeout(() => setCopiado(null), 2000)
    } catch {
      setError('El navegador no dejó copiar. Selecciona el texto a mano.')
    }
  }
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Reabasto sugerido</h1>
          {datos && (
            <>
              <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>Lo que hay que pedir, por proveedor.</p>
              <Ayuda>Productos en o bajo su punto de reorden. Cantidad = punto de reorden + demanda diaria × {datos.diasCobertura} días − disponible, redondeada a la presentación de compra.</Ayuda>
            </>
          )}
        </div>
        <div className="fz-acciones-fin">
          {/* Descarga de archivo (API), no navegación: <Link> no aplica. */}
          <a href="/api/farmacia/reabasto/csv" download className="fz-btn fz-btn--claro fz-btn--chico">
            Descargar CSV
          </a>
          <Link href={`${base}/compras/nueva`} className="fz-btn fz-btn--navy fz-btn--chico">
            Registrar compra
          </Link>
        </div>
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!datos && !error && <p className="fz-tenue">Cargando…</p>}
      {datos && datos.grupos.length === 0 && <Aviso tono="ok">Nada que pedir: todo está arriba de su punto de reorden.</Aviso>}
      {datos?.grupos.map((g, i) => {
        const tel = g.proveedor?.telefono?.replace(/\D/g, '')
        return (
          <section key={g.proveedor?.id ?? 'sin'} className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <div className="fz-entre">
              <div>
                <h2 className="fz-h2">{g.proveedor?.nombre ?? 'Sin proveedor preferente'}</h2>
                {g.proveedor && <p className="fz-chico fz-tenue">Entrega en {g.proveedor.diasEntrega} días{g.proveedor.telefono ? ` · ${g.proveedor.telefono}` : ''}</p>}
              </div>
              <div className="fz-acciones-fin">
                <Boton chico onClick={() => void copiar(g, i)}>
                  {copiado === i ? 'Copiado' : 'Copiar pedido'}
                </Boton>
                {tel && (
                  <a className="fz-btn fz-btn--teal fz-btn--chico" href={`https://wa.me/${tel.length === 10 ? '52' + tel : tel}?text=${encodeURIComponent(g.texto)}`} target="_blank" rel="noreferrer">
                    WhatsApp
                  </a>
                )}
              </div>
            </div>
            <div className="fz-lista">
              {g.renglones.map((r) => (
                <Link key={r.productoId} href={`${base}/productos/${r.productoId}`} className="fz-fila">
                  <span className="fz-fila__main">
                    <span className="fz-fila__t1">{r.producto}</span>
                    <span className="fz-fila__t2">
                      Disponible {cantidad(r.disponible, r.unidadBase)} · punto de reorden {r.puntoReorden} · {r.demandaDiaria ? `vende ≈${r.demandaDiaria}/día` : 'sin historial de ventas'}
                    </span>
                  </span>
                  <b className="fz-num">{r.presentacion && r.paquetes ? `${r.paquetes} × ${r.presentacion.nombre}` : cantidad(r.cantidadUnidades, r.unidadBase)}</b>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ═══════════════════════════ promociones ═══════════════════════════ */

export function Promociones() {
  const { catalogo, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const [estado, setEstado] = useState<'propuesta' | 'aprobada' | 'rechazada' | 'vencida'>('propuesta')
  const [lista, setLista] = useState<PromocionVista[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [n, setN] = useState(0)
  const [rechazar, setRechazar] = useState<PromocionVista | null>(null)
  const [motivo, setMotivo] = useState('')
  const [ajuste, setAjuste] = useState<Record<number, string>>({})
  useEffect(() => {
    api.get<PromocionVista[]>('promociones', { estado }).then(setLista, (e) => setError(e instanceof Error ? e.message : 'No se pudo cargar.'))
  }, [estado, n])
  const decidir = async (x: PromocionVista, decision: 'aprobada' | 'rechazada', m?: string) => {
    setError(null)
    try {
      await api.post(`promociones/${x.id}/decidir`, { decision, descuentoPorciento: ajuste[x.id] ? Number(ajuste[x.id]) : undefined, motivo: m ?? null })
      setRechazar(null)
      setMotivo('')
      setN((k) => k + 1)
      recargarCatalogo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
  }
  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">Farmacia</p>
        <h1 className="fz-h1">Promociones por caducidad</h1>
        <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>Descuentos propuestos para lotes por caducar.</p>
        <Ayuda>Solo lotes de Grupo III y desregulados (nunca receta ni controlados). Un encargado aprueba; la promoción aplica solo a ese lote y vence un día antes de caducar.</Ayuda>
      </div>
      <div className="fz-seg" style={{ maxWidth: 520 }} role="radiogroup" aria-label="Estado">
        {(['propuesta', 'aprobada', 'rechazada', 'vencida'] as const).map((e) => (
          <button key={e} type="button" className={estado === e ? 'is-on' : ''} onClick={() => setEstado(e)} aria-pressed={estado === e}>
            {e === 'propuesta' ? 'Propuestas' : e === 'aprobada' ? 'Aprobadas' : e === 'rechazada' ? 'Rechazadas' : 'Vencidas'}
          </button>
        ))}
      </div>
      <ErrorForm error={error} />
      {lista && lista.length === 0 && <Aviso>Nada aquí.</Aviso>}
      {lista && lista.length > 0 && (
        <div className="fz-tarjeta fz-lista">
          {lista.map((x) => (
            <div key={x.id} className="fz-fila fa-alerta">
              <span className="fz-fila__main">
                <span className="fz-fila__t1">{x.titulo}</span>
                <span className="fz-fila__t2">
                  Lote {x.numeroLote} · caduca {x.caducidad ? fecha(x.caducidad) : '—'}
                  {x.diasParaCaducar != null ? ` (${x.diasParaCaducar} días)` : ''} · vigente {fecha(x.vigenteDesde)} a {fecha(x.vigenteHasta)}
                  {x.decididaPor ? ` · ${x.estado} por ${x.decididaPor.nombre}` : ''}
                  {x.motivo ? ` · ${x.motivo}` : ''}
                </span>
              </span>
              <span className="fa-alerta__acciones">
                {x.estado === 'propuesta' && p.aprobar ? (
                  <>
                    <input className="fz-input fz-input--compacto fa-promo-pct" inputMode="numeric" value={ajuste[x.id] ?? String(x.descuentoPorciento)} onChange={(e) => setAjuste({ ...ajuste, [x.id]: e.target.value })} aria-label="Descuento %" />
                    <span className="fz-chico">%</span>
                    <Boton chico tono="teal" onClick={() => void decidir(x, 'aprobada')}>
                      Aprobar
                    </Boton>
                    <button type="button" className="fz-link" onClick={() => setRechazar(x)}>
                      Rechazar
                    </button>
                  </>
                ) : (
                  <b className="fz-num">−{x.descuentoPorciento}%</b>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
      {rechazar && (
        <Modal titulo="Rechazar promoción" onCerrar={() => setRechazar(null)}>
          <div className="fz-stack fz-stack--chico">
            <p className="fz-chico">{rechazar.titulo}. No se volverá a proponer con el mismo descuento.</p>
            <Campo etiqueta="Motivo (opcional)">
              <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </Campo>
            <div className="fz-acciones-fin">
              <Boton onClick={() => setRechazar(null)}>Cancelar</Boton>
              <Boton tono="peligro" onClick={() => void decidir(rechazar, 'rechazada', motivo)}>
                Rechazar
              </Boton>
            </div>
          </div>
        </Modal>
      )}
      {!p.aprobar && <p className="fz-chico fz-tenue">Aprobar o rechazar lo hace el encargado o el dueño.</p>}
    </div>
  )
}
