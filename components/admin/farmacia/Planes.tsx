'use client'

import React, { useEffect, useState } from 'react'
import type { PlanVista, ResumenPlanes } from '../../../lib/farmacia/planes'
import { api, Aviso, Boton, Campo, dinero, fecha, Modal, momento, Pastilla, useFarmacia } from './comun'

/**
 * Farmacia → Planes (fase 6b): planes de compra de los tutores. Cada entrega
 * aparece como un pedido normal en «Pedidos» (con la pastilla del plan). Aquí:
 * ver el estado, reanudar uno detenido (si ya se resolvió la receta o el
 * peso), cancelar, y registrar en Finanzas el anticipo de un plan anual.
 */

type Grupo = keyof ResumenPlanes['conteo']
const GRUPOS: [Grupo, string][] = [
  ['activos', 'Activos'],
  ['detenidos', 'En pausa'],
  ['por_pagar', 'Sin pagar'],
  ['cerrados', 'Cerrados'],
]
const TONO: Record<PlanVista['estado'], 'ok' | 'aviso' | 'malo' | 'info' | 'gris'> = { por_pagar: 'aviso', activo: 'ok', detenido: 'aviso', cancelado: 'gris', terminado: 'gris' }
const ESTADO: Record<PlanVista['estado'], string> = { por_pagar: 'Sin pagar', activo: 'Activo', detenido: 'En pausa', cancelado: 'Cancelado', terminado: 'Terminado' }

export function Planes({ grupo: grupoInicial }: { grupo: string | null }) {
  const { base, catalogo } = useFarmacia()
  const [grupo, setGrupo] = useState<Grupo>((GRUPOS.find(([g]) => g === grupoInicial)?.[0] as Grupo) ?? 'activos')
  const [datos, setDatos] = useState<{ g: Grupo; r: ResumenPlanes } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [abierto, setAbierto] = useState<PlanVista | null>(null)
  useEffect(() => {
    let vivo = true
    api.get<ResumenPlanes>('planes', { grupo }).then(
      (r) => vivo && setDatos({ g: grupo, r }),
      (e) => vivo && setError(e instanceof Error ? e.message : 'No se pudo cargar.'),
    )
    const u = new URL(window.location.href)
    u.searchParams.set('grupo', grupo)
    window.history.replaceState(null, '', u.toString())
    return () => {
      vivo = false
    }
  }, [grupo, vuelta])
  const r = datos?.r
  const cfg = catalogo.configuracion.planes
  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia · tienda en línea</p>
          <h1 className="fz-h1">Planes de compra</h1>
          <p className="fz-tenue">Cada entrega llega a Pedidos ya pagada. {cfg.activo ? `Se genera ${cfg.diasAntes} días antes de la fecha.` : 'Los planes están apagados para nuevos tutores (Configuración → Tienda).'}</p>
        </div>
      </div>
      {r && (r.anticipos.cobrado > 0 || r.anticipos.porReconocer > 0) && (
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <b>Anticipos de planes anuales</b>
          <p className="fz-tenue">
            Cobrado {dinero(r.anticipos.cobrado, true)} · entregado {dinero(r.anticipos.reconocido, true)} · por entregar <b>{dinero(r.anticipos.porReconocer, true)}</b>
          </p>
        </div>
      )}
      <div className="fz-seg" style={{ maxWidth: 560 }} role="radiogroup" aria-label="Planes">
        {GRUPOS.map(([g, l]) => (
          <button key={g} type="button" className={grupo === g ? 'is-on' : ''} onClick={() => setGrupo(g)} aria-pressed={grupo === g}>
            {l}
            {r && g !== 'cerrados' && r.conteo[g] > 0 ? ` (${r.conteo[g]})` : ''}
          </button>
        ))}
      </div>
      {error && <Aviso tono="malo">{error}</Aviso>}
      {!r && !error && <p className="fz-tenue">Cargando…</p>}
      {r && datos?.g === grupo && r.planes.length === 0 && <Aviso tono="ok">Nada aquí.</Aviso>}
      {r && r.planes.length > 0 && (
        <div className="fz-tarjeta fz-lista">
          {r.planes.map((p) => (
            <button key={p.id} type="button" className="fz-fila" onClick={() => setAbierto(p)}>
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  {p.folio} <Pastilla tono={TONO[p.estado]}>{ESTADO[p.estado]}</Pastilla> <Pastilla tono="info">{p.modalidad === 'anual' ? 'Anual' : 'Cada entrega'}</Pastilla>
                  {p.anticipo && p.pago.pagadoEn && !p.anticipo.registrado && <Pastilla tono="aviso">Anticipo sin Finanzas</Pastilla>}
                </span>
                <span className="fz-fila__t2">
                  {p.tutor?.nombre ?? 'Tutor'} · {p.mascota.nombre} · {p.producto.nombre} ({p.cantidad} × {p.presentacion.nombre}) · cada {p.cadaDias} días
                  {p.estado === 'activo' && p.proximaEntrega ? ` · próxima ${fecha(p.proximaEntrega)}` : ''}
                  {p.modalidad === 'anual' ? ` · ${p.entregasHechas}/${p.entregasTotales ?? '?'}` : ''}
                  {p.motivo && p.estado !== 'activo' ? ` · ${p.motivo}` : ''}
                </span>
              </span>
              <b className="fz-num">{p.modalidad === 'anual' ? dinero(p.total ?? 0, true) : `${dinero(p.precioEntrega, true)}/entrega`}</b>
            </button>
          ))}
        </div>
      )}
      {abierto && (
        <FichaPlan
          p={abierto}
          base={base}
          puedeAprobar={catalogo.permisos.aprobar}
          onCerrar={() => setAbierto(null)}
          onCambio={(n) => {
            setAbierto(n)
            setVuelta((v) => v + 1)
          }}
        />
      )}
    </div>
  )
}

function FichaPlan({ p, base, puedeAprobar, onCerrar, onCambio }: { p: PlanVista; base: string; puedeAprobar: boolean; onCerrar: () => void; onCambio: (p: PlanVista) => void }) {
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelar, setCancelar] = useState(false)
  const [motivo, setMotivo] = useState('')
  const accion = async (accion: 'cancelar' | 'reanudar' | 'anticipo', m?: string) => {
    setOcupado(true)
    setError(null)
    try {
      onCambio(await api.post<PlanVista>(`planes/${p.id}/accion`, { accion, motivo: m ?? null }))
      setCancelar(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
    setOcupado(false)
  }
  const vigente = p.estado === 'por_pagar' || p.estado === 'activo' || p.estado === 'detenido'
  const anualPagado = p.modalidad === 'anual' && Boolean(p.pago.pagadoEn)
  return (
    <Modal titulo={`Plan ${p.folio}`} onCerrar={onCerrar} ancho="ancho">
      <div className="fz-stack fz-stack--chico">
        <p>
          <Pastilla tono={TONO[p.estado]}>{ESTADO[p.estado]}</Pastilla> {p.modalidad === 'anual' ? `Anual: ${dinero(p.total ?? 0, true)} por ${p.entregasTotales} entregas${p.descuentoPorciento ? ` (−${p.descuentoPorciento}%)` : ''}` : `Cada entrega: ${dinero(p.precioEntrega, true)} (suscripción ${p.pago.proveedor ?? ''})`}
        </p>
        <p className="fz-tenue">
          {p.tutor?.nombre} · {p.tutor?.correo}
          {p.tutor?.telefono ? ` · ${p.tutor.telefono}` : ''}
        </p>
        <p>
          {p.mascota.nombre} · {p.producto.nombre} · {p.cantidad} × {p.presentacion.nombre} cada {p.cadaDias} días
        </p>
        {p.motivo && <Aviso tono={p.estado === 'detenido' ? 'aviso' : 'info'}>{p.motivo}</Aviso>}
        {p.anticipo && anualPagado && (
          <p className="fz-tenue">
            Anticipo: {p.anticipo.registrado ? 'en Finanzas' : 'todavía no está en Finanzas'} · entregado {dinero(p.anticipo.reconocido, true)} · por entregar {dinero(p.anticipo.porReconocer, true)}
          </p>
        )}
        {p.pedidos.length > 0 && (
          <div className="fz-stack fz-stack--chico">
            <b>Entregas</b>
            {p.pedidos.map((x) => (
              <a key={x.folio} href={`${base}/pedidos/${Number(x.folio.replace(/\D/g, ''))}`} className="fz-link">
                Entrega {x.ciclo} · {x.folio} · {x.estado.replace(/_/g, ' ')}
              </a>
            ))}
          </div>
        )}
        <details>
          <summary className="fz-tenue">Historial</summary>
          <ul className="fz-tenue">
            {p.historial
              .slice()
              .reverse()
              .map((h, i) => (
                <li key={i}>
                  {momento(h.fecha)} · {h.evento}
                  {h.por ? ` · ${h.por}` : ''}
                </li>
              ))}
          </ul>
        </details>
        {error && <Aviso tono="malo">{error}</Aviso>}
        {cancelar ? (
          <form
            className="fz-stack fz-stack--chico"
            onSubmit={(e) => {
              e.preventDefault()
              void accion('cancelar', motivo.trim())
            }}
          >
            {anualPagado && <Aviso tono="aviso">El plan anual ya está pagado: el reembolso de lo no entregado ({dinero(p.anticipo?.porReconocer ?? 0, true)}) se decide con la política de la farmacia y se hace fuera del sistema.</Aviso>}
            <Campo etiqueta="Motivo (lo recibe el tutor por correo)">
              <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} autoFocus />
            </Campo>
            <div className="fz-acciones-fin">
              <Boton onClick={() => setCancelar(false)}>Todavía no</Boton>
              <button type="submit" className="fz-btn fz-btn--peligro" disabled={ocupado || motivo.trim().length < 3}>
                Cancelar plan
              </button>
            </div>
          </form>
        ) : (
          <div className="fz-acciones-fin">
            {p.estado === 'detenido' && (
              <Boton tono="teal" disabled={ocupado} onClick={() => accion('reanudar')}>
                Reanudar
              </Boton>
            )}
            {anualPagado && p.anticipo && !p.anticipo.registrado && (
              <Boton disabled={ocupado} onClick={() => accion('anticipo')}>
                Registrar anticipo en Finanzas
              </Boton>
            )}
            {vigente && (!anualPagado || puedeAprobar) && (
              <Boton tono="peligro" disabled={ocupado} onClick={() => setCancelar(true)}>
                Cancelar plan
              </Boton>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
