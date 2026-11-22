'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import type { PresupuestoVista, RenglonPresupuesto } from '../../../lib/clinica/cirugia'
import type { ServicioVista } from '../../../lib/clinica/tipos'
import { FirmaLienzo } from '../../FirmaLienzo'
import { api, Aviso, Ayuda, Boton, BotonWhatsApp, Campo, Confirmar, ErrorForm, fecha, Modal, momento, Pastilla, useCarga, useClinica } from './comun'

/**
 * Expediente → Cirugía (ruta ortopédica, fase 1, nov-2026): presupuestos de
 * cirugía con su consentimiento informado. El médico arma el presupuesto, lo
 * envía (liga por correo y WhatsApp) y el tutor lo firma con el dedo en su
 * celular; o se firma aquí mismo en una tableta. Aceptado, se agenda la cirugía.
 */

type Lista = { presupuestos: PresupuestoVista[]; vigenciaDias: number; puedeEditar: boolean; puedeFirmar: boolean }
type Detalle = PresupuestoVista & { texto: string }

const pesos = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n)
const ESTADO: Record<PresupuestoVista['estado'], [string, 'ok' | 'gris' | 'aviso' | 'malo' | 'info']> = {
  borrador: ['Borrador', 'gris'],
  enviado: ['Enviado: espera firma', 'info'],
  aceptado: ['Aceptado y firmado', 'ok'],
  rechazado: ['Rechazado', 'malo'],
  cancelado: ['Cancelado', 'gris'],
  vencido: ['Vencido', 'aviso'],
}

export function CirugiaMascota({ mascotaId, mascotaNombre, activa }: { mascotaId: number; mascotaNombre: string; activa: boolean }) {
  const { base, catalogo } = useClinica()
  const { datos, error, cargando, recargar } = useCarga(() => api.get<Lista>(`mascotas/${mascotaId}/presupuestos`), [mascotaId])
  const [editar, setEditar] = useState<PresupuestoVista | 'nuevo' | null>(null)
  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !datos) return <p className="fz-tenue">Cargando…</p>
  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <div>
          <h2 className="fz-h2">Cirugía</h2>
          <p className="fz-chico fz-tenue">Presupuestos y consentimientos de {mascotaNombre}.</p>
        </div>
        {datos.puedeEditar && activa && (
          <Boton tono="teal" onClick={() => setEditar('nuevo')}>
            + Nuevo presupuesto
          </Boton>
        )}
      </div>
      <Ayuda>
        Arma el presupuesto (borrador) y toca <b>Enviar al tutor</b>: le llega una liga por correo y la puedes mandar por WhatsApp. El tutor revisa, lee el consentimiento y firma con el dedo desde su celular (sin crear cuenta). Si está en la clínica, usa <b>Firmar aquí</b> en una tableta. Ya aceptado, <b>Agendar cirugía</b>: al finalizar esa cita se cobra el total del presupuesto. El texto del consentimiento se edita en Clínica → Cirugía: presupuestos y consentimiento. Vigencia: {datos.vigenciaDias} días.
      </Ayuda>
      {!datos.presupuestos.length && <p className="fz-tenue">Sin presupuestos todavía.</p>}
      {datos.presupuestos.map((p) => (
        <TarjetaPresupuesto key={p.id} p={p} puedeEditar={datos.puedeEditar} puedeFirmar={datos.puedeFirmar} hrefAgendar={`${base}/agenda?mascota=${mascotaId}&nueva=1&presupuesto=${p.id}`} onEditar={() => setEditar(p)} onCambio={recargar} />
      ))}
      {editar && <EditorPresupuesto mascotaId={mascotaId} existente={editar === 'nuevo' ? null : editar} equipo={catalogo.equipo} usuarioId={catalogo.usuario.id} onCerrar={() => setEditar(null)} onGuardado={() => (setEditar(null), recargar())} />}
    </div>
  )
}

function TarjetaPresupuesto({ p, puedeEditar, puedeFirmar, hrefAgendar, onEditar, onCambio }: { p: PresupuestoVista; puedeEditar: boolean; puedeFirmar: boolean; hrefAgendar: string; onEditar: () => void; onCambio: () => void }) {
  const [accion, setAccion] = useState<'enviar' | 'firmar' | 'cancelar' | 'borrador' | null>(null)
  const [enviado, setEnviado] = useState<{ correo: boolean; whatsapp: string | null } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [estado, tono] = ESTADO[p.estado]
  const hacer = async (ruta: string, cuerpo?: unknown) => {
    setOcupado(true)
    setError(null)
    try {
      const r = await api.post<PresupuestoVista & { correo?: boolean; whatsapp?: string | null }>(`presupuestos/${p.id}/${ruta}`, cuerpo ?? {})
      if (ruta === 'enviar') setEnviado({ correo: Boolean(r.correo), whatsapp: r.whatsapp ?? null })
      setAccion(null)
      onCambio()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar.')
    } finally {
      setOcupado(false)
    }
  }
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico" aria-label={`Presupuesto ${p.folio}`}>
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">
            {p.folio} · <Pastilla tono={tono}>{estado}</Pastilla>
          </p>
          <h3 className="cl-paq-titulo">{p.procedimiento}</h3>
          <p className="fz-chico fz-tenue">
            {pesos(p.total)}
            {p.anticipo ? ` · anticipo ${pesos(p.anticipo)}` : ''}
            {p.medico ? ` · ${p.medico.nombre}` : ''}
            {p.vence && (p.estado === 'enviado' || p.estado === 'vencido') ? ` · vigente hasta ${fecha(p.vence)}` : ''}
          </p>
          {p.consentimiento && (
            <p className="fz-chico">
              Firmó <b>{p.consentimiento.nombreFirmante}</b> el {momento(p.consentimiento.firmadoEn)} ({p.consentimiento.via === 'portal' ? 'desde su celular' : 'en la clínica'}) · {p.consentimiento.folio}
            </p>
          )}
          {p.estado === 'rechazado' && p.motivoRechazo && <p className="fz-chico">Motivo: {p.motivoRechazo}</p>}
          {p.cita && (
            <p className="fz-chico">
              Cirugía en la agenda: {fecha(p.cita.dia)} {p.cita.hora} · {p.cita.folio} ({p.cita.estado})
            </p>
          )}
        </div>
      </div>
      <ul className="fz-chico cl-paq-contenido">
        {p.renglones.map((r, i) => (
          <li key={i}>
            {r.concepto}
            {r.cantidad !== 1 ? ` × ${r.cantidad}` : ''} · {pesos(r.importe)}
          </li>
        ))}
      </ul>
      <div className="cl-pre-acciones">
        {p.estado === 'borrador' && puedeEditar && <Boton onClick={onEditar}>Editar</Boton>}
        {(p.estado === 'borrador' || p.estado === 'vencido') && puedeEditar && (
          <Boton tono="teal" onClick={() => setAccion('enviar')}>
            Enviar al tutor
          </Boton>
        )}
        {(p.estado === 'borrador' || p.estado === 'enviado') && puedeFirmar && <Boton onClick={() => setAccion('firmar')}>Firmar aquí</Boton>}
        {p.estado === 'enviado' && p.liga && <BotonWhatsApp telefono={p.cliente?.telefono} mensaje={`Hola ${(p.cliente?.nombre ?? '').split(/\s+/)[0]}, te compartimos el presupuesto de ${p.procedimiento} para ${p.mascota.nombre}. Ahí mismo lo puedes revisar y firmar: ${p.liga}`} etiqueta="Mandar liga" />}
        {p.estado === 'aceptado' && !p.cita && (
          <Link href={hrefAgendar} className="fz-btn fz-btn--teal">
            Agendar cirugía
          </Link>
        )}
        <a href={`/api/clinica/presupuestos/${p.id}/imprimir`} target="_blank" rel="noreferrer" className="fz-btn fz-btn--claro">
          Imprimir
        </a>
        {(p.estado === 'enviado' || p.estado === 'rechazado') && puedeEditar && <Boton onClick={() => setAccion('borrador')}>Regresar a borrador</Boton>}
        {['borrador', 'enviado', 'vencido', 'aceptado'].includes(p.estado) && !p.cita && puedeEditar && (
          <Boton tono="peligro" onClick={() => setAccion('cancelar')}>
            Cancelar
          </Boton>
        )}
      </div>
      {enviado && (
        <Aviso tono="ok">
          Enviado. {enviado.correo ? 'Le llegó un correo con la liga.' : 'No tiene correo con avisos activos: mándale la liga por WhatsApp.'}{' '}
          {enviado.whatsapp && (
            <a href={enviado.whatsapp} target="_blank" rel="noreferrer">
              Abrir WhatsApp con la liga
            </a>
          )}
        </Aviso>
      )}
      {error && !accion && <ErrorForm error={error} />}
      {accion === 'enviar' && (
        <Confirmar titulo="Enviar al tutor" etiquetaSi={ocupado ? 'Enviando…' : 'Sí, enviarlo'} ocupado={ocupado} onNo={() => setAccion(null)} onSi={() => hacer('enviar')}>
          <p>
            Se manda <b>{p.procedimiento}</b> ({pesos(p.total)}) a {p.cliente?.nombre ?? 'su tutor'}. Ya no se podrá editar a menos que lo regreses a borrador (y entonces la liga anterior deja de servir).
          </p>
          <ErrorForm error={error} />
        </Confirmar>
      )}
      {accion === 'borrador' && (
        <Confirmar titulo="Regresar a borrador" etiquetaSi={ocupado ? 'Guardando…' : 'Sí, regresarlo'} ocupado={ocupado} onNo={() => setAccion(null)} onSi={() => hacer('borrador')}>
          <p>La liga que tiene el tutor deja de servir. Al volver a enviarlo, le llega una nueva.</p>
          <ErrorForm error={error} />
        </Confirmar>
      )}
      {accion === 'cancelar' && <CancelarPresupuesto ocupado={ocupado} error={error} onNo={() => setAccion(null)} onSi={(motivo) => hacer('cancelar', { motivo })} />}
      {accion === 'firmar' && <FirmarAqui p={p} onCerrar={() => setAccion(null)} onFirmado={() => (setAccion(null), onCambio())} />}
    </section>
  )
}

function CancelarPresupuesto({ ocupado, error, onNo, onSi }: { ocupado: boolean; error: string | null; onNo: () => void; onSi: (motivo: string) => void }) {
  const [motivo, setMotivo] = useState('')
  return (
    <Confirmar titulo="Cancelar presupuesto" etiquetaSi={ocupado ? 'Cancelando…' : 'Sí, cancelarlo'} tono="peligro" ocupado={ocupado || motivo.trim().length < 5} onNo={onNo} onSi={() => onSi(motivo)}>
      <p>La liga del tutor deja de servir. Si la cirugía ya está en la agenda, cancela primero la cita.</p>
      <Campo etiqueta="Motivo *">
        <input className="fz-input" value={motivo} maxLength={300} onChange={(e) => setMotivo(e.target.value)} />
      </Campo>
      <ErrorForm error={error} />
    </Confirmar>
  )
}

/** Firma en la clínica (tableta): el tutor lee, escribe su nombre y firma con el dedo. */
function FirmarAqui({ p, onCerrar, onFirmado }: { p: PresupuestoVista; onCerrar: () => void; onFirmado: () => void }) {
  const det = useCarga(() => api.get<Detalle>(`presupuestos/${p.id}`), [p.id])
  const [nombre, setNombre] = useState(p.cliente?.nombre ?? '')
  const [firma, setFirma] = useState<string | null>(null)
  const [acepto, setAcepto] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Modal titulo={`Consentimiento · ${p.procedimiento}`} onCerrar={onCerrar} ancho="ancho">
      <div className="fz-stack fz-stack--chico">
        <p className="fz-chico fz-tenue">
          {p.mascota.nombre} · {p.folio} · Total {pesos(p.total)}
          {p.anticipo ? ` · anticipo ${pesos(p.anticipo)}` : ''}. Dale la tableta al tutor para que lea y firme.
        </p>
        {det.datos ? <div className="cl-pre-consentimiento">{det.datos.texto}</div> : <p className="fz-tenue">Cargando el texto…</p>}
        <Campo etiqueta="Nombre completo de quien firma">
          <input className="fz-input" value={nombre} maxLength={120} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </Campo>
        <FirmaLienzo onCambio={setFirma} />
        <label className="cl-check">
          <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} /> Leí el presupuesto y el consentimiento, pude hacer mis preguntas y los acepto.
        </label>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Todavía no</Boton>
          <Boton
            tono="teal"
            disabled={ocupado || !firma || !acepto || nombre.trim().length < 3 || !det.datos}
            onClick={async () => {
              setOcupado(true)
              setError(null)
              try {
                await api.post(`presupuestos/${p.id}/firmar`, { nombre, firma, acepto })
                onFirmado()
              } catch (e) {
                setError(e instanceof Error ? e.message : 'No se pudo guardar la firma.')
                setOcupado(false)
              }
            }}
          >
            {ocupado ? 'Guardando…' : 'Aceptar y firmar'}
          </Boton>
        </div>
      </div>
    </Modal>
  )
}

type RenglonForm = { concepto: string; servicioId: number | null; cantidad: string; precioUnitario: string }
const vacio = (): RenglonForm => ({ concepto: '', servicioId: null, cantidad: '1', precioUnitario: '' })

function EditorPresupuesto({ mascotaId, existente, equipo, usuarioId, onCerrar, onGuardado }: { mascotaId: number; existente: PresupuestoVista | null; equipo: { id: number; nombre: string }[]; usuarioId: number; onCerrar: () => void; onGuardado: () => void }) {
  const servicios = useCarga(() => api.get<{ servicios: ServicioVista[] }>('agenda/catalogo').then((c) => c.servicios.filter((s) => s.activo)), [])
  const [procedimiento, setProcedimiento] = useState(existente?.procedimiento ?? '')
  const [medico, setMedico] = useState<number | ''>(existente?.medico?.id ?? usuarioId)
  const [explicacion, setExplicacion] = useState(existente?.explicacion ?? '')
  const [riesgos, setRiesgos] = useState(existente?.riesgos ?? '')
  const [indicaciones, setIndicaciones] = useState(existente?.indicaciones ?? '')
  const [renglones, setRenglones] = useState<RenglonForm[]>(existente?.renglones.map((r: RenglonPresupuesto) => ({ concepto: r.concepto, servicioId: r.servicioId, cantidad: String(r.cantidad), precioUnitario: String(r.precioUnitario) })) ?? [vacio()])
  const [anticipo, setAnticipo] = useState(existente?.anticipo != null ? String(existente.anticipo) : '')
  const [notas, setNotas] = useState(existente?.notasInternas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const num = (s: string) => Number(String(s).replace(/[$,\s]/g, ''))
  const total = renglones.reduce((s, r) => s + (num(r.cantidad) || 0) * (num(r.precioUnitario) || 0), 0)
  const cambiar = (i: number, cambio: Partial<RenglonForm>) => setRenglones(renglones.map((r, j) => (j === i ? { ...r, ...cambio } : r)))
  return (
    <Modal titulo={existente ? `Editar ${existente.folio}` : 'Nuevo presupuesto de cirugía'} onCerrar={onCerrar} ancho="ancho">
      <form
        className="fz-stack fz-stack--chico"
        onSubmit={async (e) => {
          e.preventDefault()
          setOcupado(true)
          setError(null)
          try {
            const cuerpo = {
              procedimiento,
              medicoId: medico || null,
              explicacion,
              riesgos,
              indicaciones,
              renglones: renglones.filter((r) => r.concepto.trim()).map((r) => ({ concepto: r.concepto, servicioId: r.servicioId, cantidad: num(r.cantidad), precioUnitario: num(r.precioUnitario) })),
              anticipo: anticipo.trim() ? num(anticipo) : null,
              notasInternas: notas,
            }
            if (existente) await api.post(`presupuestos/${existente.id}`, cuerpo)
            else await api.post(`mascotas/${mascotaId}/presupuestos`, cuerpo)
            onGuardado()
          } catch (x) {
            setError(x instanceof Error ? x.message : 'No se pudo guardar.')
            setOcupado(false)
          }
        }}
      >
        <Campo etiqueta="Procedimiento *">
          <input className="fz-input" value={procedimiento} maxLength={160} onChange={(e) => setProcedimiento(e.target.value)} placeholder="Ej. Osteosíntesis de fémur derecho con placa" required />
        </Campo>
        <Campo etiqueta="Médico a cargo">
          <select className="fz-input" value={medico} onChange={(e) => setMedico(e.target.value ? Number(e.target.value) : '')}>
            {equipo.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo etiqueta="Qué se va a hacer y por qué (lo lee el tutor)">
          <textarea className="fz-input" rows={3} maxLength={3000} value={explicacion} onChange={(e) => setExplicacion(e.target.value)} />
        </Campo>
        <Campo etiqueta="Riesgos particulares de este caso" ayuda="Entran en el texto del consentimiento.">
          <textarea className="fz-input" rows={2} maxLength={2000} value={riesgos} onChange={(e) => setRiesgos(e.target.value)} />
        </Campo>
        <Campo etiqueta="Indicaciones antes de la cirugía">
          <textarea className="fz-input" rows={2} maxLength={1500} value={indicaciones} onChange={(e) => setIndicaciones(e.target.value)} placeholder="Ej. Ayuno de 8 horas; traer estudios previos." />
        </Campo>
        <fieldset className="cl-pre-renglones">
          <legend className="fz-etiqueta">Conceptos</legend>
          {renglones.map((r, i) => (
            <div key={i} className="cl-pre-renglon">
              <select
                className="fz-input"
                aria-label="Servicio del catálogo"
                value={r.servicioId ?? ''}
                onChange={(e) => {
                  const s = (servicios.datos ?? []).find((x) => x.id === Number(e.target.value))
                  cambiar(i, s ? { servicioId: s.id, concepto: r.concepto || s.nombre, precioUnitario: r.precioUnitario || (s.precio != null ? String(s.precio) : '') } : { servicioId: null })
                }}
              >
                <option value="">Concepto libre</option>
                {(servicios.datos ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
              <input className="fz-input" aria-label="Concepto" placeholder="Concepto" value={r.concepto} maxLength={160} onChange={(e) => cambiar(i, { concepto: e.target.value })} />
              <input className="fz-input cl-pre-num" aria-label="Cantidad" inputMode="decimal" value={r.cantidad} onChange={(e) => cambiar(i, { cantidad: e.target.value })} />
              <input className="fz-input cl-pre-num" aria-label="Precio unitario" inputMode="decimal" placeholder="$" value={r.precioUnitario} onChange={(e) => cambiar(i, { precioUnitario: e.target.value })} />
              <button type="button" className="cl-cerrar" aria-label="Quitar renglón" onClick={() => setRenglones(renglones.length > 1 ? renglones.filter((_, j) => j !== i) : [vacio()])}>
                ×
              </button>
            </div>
          ))}
          <Boton chico onClick={() => setRenglones([...renglones, vacio()])}>
            + Agregar concepto
          </Boton>
        </fieldset>
        <div className="fz-entre">
          <Campo etiqueta="Anticipo (opcional)" ancho="corto">
            <input className="fz-input" inputMode="decimal" value={anticipo} onChange={(e) => setAnticipo(e.target.value)} placeholder="$" />
          </Campo>
          <p className="cl-pre-totalform">
            Total: <b>{pesos(total)}</b>
          </p>
        </div>
        <Campo etiqueta="Notas internas (no las ve el tutor)">
          <input className="fz-input" maxLength={1000} value={notas} onChange={(e) => setNotas(e.target.value)} />
        </Campo>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Todavía no</Boton>
          <button type="submit" className="fz-btn fz-btn--teal" disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Guardar borrador'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
