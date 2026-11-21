'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import React, { useState } from 'react'
import type { PaqueteCatalogo, PaqueteVendidoVista, RenglonSaldo } from '../../../lib/clinica/paquetes'
import { api, Aviso, Ayuda, Boton, Campo, Confirmar, ErrorForm, fecha, Modal, Pastilla, useCarga, useClinica } from './comun'

/**
 * Expediente → Paquetes (nov-2026): lo que la mascota tiene comprado, con su
 * saldo, y «Vender paquete». Los usos con cita se descuentan solos al
 * finalizar la cita; aquí se registran los usos sin cita y las entregas de
 * producto. Llega con `?paquete=<id>&solicitud=<id>` desde una solicitud.
 */

type Datos = { vendidos: PaqueteVendidoVista[]; catalogo: PaqueteCatalogo[]; talla: string | null; farmacia: boolean }

const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const TONO: Record<PaqueteVendidoVista['estado'], 'ok' | 'gris' | 'aviso' | 'malo'> = { activo: 'ok', agotado: 'gris', vencido: 'aviso', cancelado: 'malo' }
const ESTADO: Record<PaqueteVendidoVista['estado'], string> = { activo: 'Activo', agotado: 'Agotado', vencido: 'Vencido', cancelado: 'Cancelado' }
const TALLAS: Record<string, string> = { chico: 'chica', mediano: 'mediana', grande: 'grande', gigante: 'gigante' }

export function PaquetesMascota({ mascotaId, mascotaNombre, activa }: { mascotaId: number; mascotaNombre: string; activa: boolean }) {
  const { base } = useClinica()
  const sp = useSearchParams()
  const pedido = Number(sp?.get('paquete')) || null
  const solicitud = Number(sp?.get('solicitud')) || null
  const { datos, error, cargando, recargar, poner } = useCarga(() => api.get<Datos>(`mascotas/${mascotaId}/paquetes`), [mascotaId])
  const [vender, setVender] = useState(Boolean(pedido))
  const [verViejos, setVerViejos] = useState(false)

  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !datos) return <p className="fz-tenue">Cargando…</p>
  const vigentes = datos.vendidos.filter((v) => v.estado === 'activo')
  const otros = datos.vendidos.filter((v) => v.estado !== 'activo')
  const reemplazar = (nuevo: PaqueteVendidoVista) => poner({ ...datos, vendidos: datos.vendidos.map((v) => (v.id === nuevo.id ? nuevo : v)) })

  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <div>
          <h2 className="fz-h2">Paquetes</h2>
          <p className="fz-chico fz-tenue">Lo que {mascotaNombre} tiene comprado y cuánto le queda.</p>
        </div>
        {activa && datos.catalogo.length > 0 && (
          <Boton tono="teal" onClick={() => setVender(true)}>
            + Vender paquete
          </Boton>
        )}
      </div>
      <Ayuda>
        Al agendar una cita de un servicio que está en su paquete, la cita aparta un uso y se descuenta al <b>finalizarla</b> (no se cobra el servicio; los adicionales de estética sí). Para un uso sin cita, usa «Registrar uso». Los productos se entregan con «Entregar»: se descuentan del inventario de la farmacia. Los paquetes se arman en Clínica → Paquetes.
      </Ayuda>
      {!datos.catalogo.length && (
        <Aviso tono="info">
          Todavía no hay paquetes en el catálogo. Créalos en <Link href="/admin/collections/paquetes">Clínica → Paquetes</Link>.
        </Aviso>
      )}
      {!vigentes.length && <p className="fz-tenue">{mascotaNombre} no tiene paquetes vigentes.</p>}
      {vigentes.map((v) => (
        <TarjetaPaquete key={v.id} v={v} farmacia={datos.farmacia} onCambio={reemplazar} />
      ))}
      {otros.length > 0 && (
        <div className="fz-stack fz-stack--chico">
          <button type="button" className="fz-link" onClick={() => setVerViejos(!verViejos)}>
            {verViejos ? 'Ocultar' : 'Ver'} paquetes agotados, vencidos o cancelados ({otros.length})
          </button>
          {verViejos && otros.map((v) => <TarjetaPaquete key={v.id} v={v} farmacia={datos.farmacia} onCambio={reemplazar} />)}
        </div>
      )}
      {vender && (
        <VenderPaquete
          catalogo={datos.catalogo}
          talla={datos.talla}
          mascotaId={mascotaId}
          mascotaNombre={mascotaNombre}
          inicial={pedido}
          solicitud={solicitud}
          onCerrar={() => setVender(false)}
          onVendido={() => {
            setVender(false)
            if (pedido) window.history.replaceState(null, '', `${base}/mascotas/${mascotaId}?ver=paquetes`)
            recargar()
          }}
        />
      )}
    </div>
  )
}

function TarjetaPaquete({ v, farmacia, onCambio }: { v: PaqueteVendidoVista; farmacia: boolean; onCambio: (v: PaqueteVendidoVista) => void }) {
  const [accion, setAccion] = useState<{ tipo: 'uso' | 'entrega'; r: RenglonSaldo } | null>(null)
  const [cancelar, setCancelar] = useState(false)
  const activo = v.estado === 'activo'
  const sinUsos = !(v.usos ?? []).length && v.renglones.every((r) => r.apartados === 0)
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-label={`Paquete ${v.nombre}`}>
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">
            {v.folio} · <Pastilla tono={TONO[v.estado]}>{ESTADO[v.estado]}</Pastilla>
          </p>
          <h3 className="cl-paq-titulo">{v.nombre}</h3>
          <p className="fz-chico fz-tenue">
            Vendido el {fecha(v.fecha)} · {pesos(v.precio)}
            {v.talla ? ` (talla ${v.talla.toLowerCase()})` : ''} · {v.vence ? `vence el ${fecha(v.vence)}` : 'no vence'}
          </p>
        </div>
        {activo && sinUsos && (
          <Boton chico tono="peligro" onClick={() => setCancelar(true)}>
            Cancelar
          </Boton>
        )}
      </div>
      <div className="fz-lista">
        {v.renglones.map((r) => (
          <div key={r.indice} className="fz-fila cl-paq-fila">
            <span className="fz-fila__main">
              <span className="fz-fila__t1">{r.nombre}</span>
              <span className="fz-fila__t2">
                Quedan <b>{r.quedan}</b> de {r.total}
                {r.apartados ? ` · ${r.apartados} apartado${r.apartados > 1 ? 's' : ''} por citas` : ''}
                {r.usados ? ` · ${r.usados} ${r.tipo === 'producto' ? 'entregado' : 'usado'}${r.usados > 1 ? 's' : ''}` : ''}
              </span>
              <span className="cl-paq-barra" aria-hidden="true">
                <span style={{ width: `${Math.round((r.usados / r.total) * 100)}%` }} />
                <span className="is-apartado" style={{ width: `${Math.round((r.apartados / r.total) * 100)}%` }} />
              </span>
            </span>
            {activo && r.quedan > 0 && (r.tipo === 'servicio' || farmacia) && (
              <Boton chico onClick={() => setAccion({ tipo: r.tipo === 'servicio' ? 'uso' : 'entrega', r })}>
                {r.tipo === 'servicio' ? 'Registrar uso' : 'Entregar'}
              </Boton>
            )}
          </div>
        ))}
      </div>
      {(v.usos ?? []).length > 0 && (
        <details className="cl-paq-usos">
          <summary className="fz-chico">Usos ({(v.usos ?? []).length})</summary>
          <ul className="fz-chico">
            {(v.usos ?? []).map((u) => (
              <li key={u.id}>
                {fecha(u.fecha)} · {u.nombre}
                {u.cantidad > 1 ? ` ×${u.cantidad}` : ''} · {u.origen === 'cita' ? `cita ${u.cita ?? ''}` : u.origen === 'entrega' ? `entrega${u.venta ? ` (venta ${u.venta})` : ''}` : 'a mano'}
                {u.por ? ` · ${u.por}` : ''}
                {u.nota ? ` · «${u.nota}»` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
      {accion && <UsoPaquete v={v} accion={accion} onCerrar={() => setAccion(null)} onListo={(nuevo) => (setAccion(null), onCambio(nuevo))} />}
      {cancelar && <CancelarPaquete v={v} onCerrar={() => setCancelar(false)} onListo={(nuevo) => (setCancelar(false), onCambio(nuevo))} />}
    </section>
  )
}

function UsoPaquete({ v, accion, onCerrar, onListo }: { v: PaqueteVendidoVista; accion: { tipo: 'uso' | 'entrega'; r: RenglonSaldo }; onCerrar: () => void; onListo: (v: PaqueteVendidoVista) => void }) {
  const [nota, setNota] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const esUso = accion.tipo === 'uso'
  async function confirmar() {
    setOcupado(true)
    setError(null)
    try {
      onListo(await api.post<PaqueteVendidoVista>(`paquetes/${v.id}/${esUso ? 'uso' : 'entrega'}`, esUso ? { renglon: accion.r.indice, nota } : { renglon: accion.r.indice, cantidad }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo registrar.')
      setOcupado(false)
    }
  }
  return (
    <Modal titulo={esUso ? 'Registrar uso' : 'Entregar producto'} onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        <p>
          <b>{accion.r.nombre}</b> del paquete {v.nombre} ({v.mascota.nombre}). Quedan {accion.r.quedan} de {accion.r.total}.
        </p>
        {esUso ? (
          <>
            <p className="fz-chico fz-tenue">Úsalo cuando el servicio se dio sin cita en la agenda. Las citas ligadas al paquete se descuentan solas al finalizarlas.</p>
            <Campo etiqueta="Nota (opcional)">
              <input className="fz-input" value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} placeholder="Ej. sesión de la mañana, sin cita" />
            </Campo>
          </>
        ) : (
          <>
            <p className="fz-chico fz-tenue">Se registra una venta de mostrador en cero (ya se pagó con el paquete) y se descuenta del inventario el lote que caduca primero.</p>
            <Campo etiqueta="Piezas" ancho="corto">
              <input className="fz-input" type="number" min={1} max={accion.r.quedan} value={cantidad} onChange={(e) => setCantidad(Math.max(1, Math.min(accion.r.quedan, Number(e.target.value) || 1)))} />
            </Campo>
          </>
        )}
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Todavía no</Boton>
          <Boton tono="navy" disabled={ocupado} onClick={confirmar}>
            {ocupado ? 'Guardando…' : esUso ? 'Registrar 1 uso' : `Entregar ${cantidad}`}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

function CancelarPaquete({ v, onCerrar, onListo }: { v: PaqueteVendidoVista; onCerrar: () => void; onListo: (v: PaqueteVendidoVista) => void }) {
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  return (
    <Confirmar
      titulo="Cancelar paquete"
      etiquetaSi={ocupado ? 'Cancelando…' : 'Sí, cancelarlo'}
      tono="peligro"
      ocupado={ocupado || motivo.trim().length < 5}
      onNo={onCerrar}
      onSi={async () => {
        setOcupado(true)
        setError(null)
        try {
          onListo(await api.post<PaqueteVendidoVista>(`paquetes/${v.id}/cancelar`, { motivo }))
        } catch (e) {
          setError(e instanceof Error ? e.message : 'No se pudo cancelar.')
          setOcupado(false)
        }
      }}
    >
      <p>
        Se cancela <b>{v.nombre}</b> ({v.folio}) y se anula su entrada por cobrar en Finanzas. Solo se puede si todavía no tiene usos.
      </p>
      <Campo etiqueta="Motivo *">
        <input className="fz-input" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej. el cliente cambió de opinión" />
      </Campo>
      <ErrorForm error={error} />
    </Confirmar>
  )
}

function VenderPaquete({ catalogo, talla, mascotaId, mascotaNombre, inicial, solicitud, onCerrar, onVendido }: { catalogo: PaqueteCatalogo[]; talla: string | null; mascotaId: number; mascotaNombre: string; inicial: number | null; solicitud: number | null; onCerrar: () => void; onVendido: () => void }) {
  const [elegido, setElegido] = useState<number | ''>(catalogo.some((p) => p.id === inicial) ? inicial! : catalogo.length === 1 ? catalogo[0].id : '')
  const [notas, setNotas] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const paq = catalogo.find((p) => p.id === elegido) ?? null
  const precio = paq ? (paq.preciosTalla ? (talla ? (paq.preciosTalla[talla as keyof typeof paq.preciosTalla] ?? null) : null) : paq.precio) : null
  return (
    <Modal titulo={`Vender paquete a ${mascotaNombre}`} onCerrar={onCerrar}>
      <div className="fz-stack fz-stack--chico">
        {solicitud && <Aviso tono="info">Viene de la solicitud SOL-{String(solicitud).padStart(5, '0')}: al vender, queda como «Paquete vendido».</Aviso>}
        <Campo etiqueta="Paquete *">
          <select className="fz-input" value={elegido} onChange={(e) => setElegido(e.target.value ? Number(e.target.value) : '')}>
            <option value="">—</option>
            {catalogo.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre} · {p.preciosTalla ? `por talla, desde ${pesos(p.precioDesde)}` : pesos(p.precio)}
              </option>
            ))}
          </select>
        </Campo>
        {paq && (
          <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <ul className="fz-chico cl-paq-contenido">
              {paq.contenido.map((c, i) => (
                <li key={i}>
                  <b>{c.cantidad}×</b> {c.nombre}
                  {c.tipo === 'producto' ? ' (producto)' : ''}
                </li>
              ))}
            </ul>
            <p className="fz-chico fz-tenue">{paq.vigenciaDias ? `Vigencia: ${paq.vigenciaDias} días desde hoy.` : 'No vence.'}</p>
            {paq.preciosTalla && <p className="fz-chico">{talla ? `Talla de ${mascotaNombre}: ${TALLAS[talla] ?? talla}.` : `${mascotaNombre} no tiene talla: registra su peso o fija su talla para vender este paquete.`}</p>}
            {precio != null ? (
              <p>
                Total: <b>{pesos(precio)}</b>
              </p>
            ) : paq.preciosTalla && talla ? (
              <p className="fz-chico">El paquete no tiene precio para esa talla: captúralo en Clínica → Paquetes.</p>
            ) : null}
          </div>
        )}
        <Campo etiqueta="Notas (opcional)">
          <input className="fz-input" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} />
        </Campo>
        <p className="fz-chico fz-tenue">Al vender se registra una entrada por cobrar en Finanzas, como el cargo de una cita.</p>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Todavía no</Boton>
          <Boton
            tono="teal"
            disabled={!paq || precio == null || ocupado}
            onClick={async () => {
              if (!paq) return
              setOcupado(true)
              setError(null)
              try {
                await api.post(`mascotas/${mascotaId}/paquetes`, { paqueteId: paq.id, solicitudId: solicitud, notas })
                onVendido()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'No se pudo vender.')
                setOcupado(false)
              }
            }}
          >
            {ocupado ? 'Vendiendo…' : precio != null ? `Vender por ${pesos(precio)}` : 'Vender'}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}
