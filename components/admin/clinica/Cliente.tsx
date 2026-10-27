'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'
import type { ClienteVista, CodigoVista, FichaCliente as Ficha } from '../../../lib/clinica/tipos'
import { api, Avatar, Aviso, Boton, BotonWhatsApp, Campo, ErrorForm, ESPECIE_LABEL, fecha, Icono, momento, Pastilla, telefonoBonito, useCarga, useClinica } from './comun'
import { site } from '../../../lib/site'
import { mensajes } from '../../../lib/whatsapp'

/* ───────────────────────────── formulario ───────────────────────────── */

type Datos = {
  nombre: string
  apellidos: string
  telefono: string
  telefonoAlterno: string
  email: string
  direccion: string
  contactoEmergencia: { nombre: string; telefono: string }
  comunicacion: { avisos: boolean; promociones: boolean; whatsapp: boolean; correo: boolean }
  notasInternas: string
  activo: boolean
}
const vacio = (): Datos => ({
  nombre: '', apellidos: '', telefono: '', telefonoAlterno: '', email: '', direccion: '',
  contactoEmergencia: { nombre: '', telefono: '' }, comunicacion: { avisos: true, promociones: false, whatsapp: true, correo: true }, notasInternas: '', activo: true,
})
const desde = (c: ClienteVista): Datos => ({
  nombre: c.nombre, apellidos: c.apellidos, telefono: c.telefono ?? '', telefonoAlterno: c.telefonoAlterno ?? '', email: c.email ?? '', direccion: c.direccion ?? '',
  contactoEmergencia: { nombre: c.contactoEmergencia.nombre ?? '', telefono: c.contactoEmergencia.telefono ?? '' }, comunicacion: { ...c.comunicacion }, notasInternas: c.notasInternas ?? '', activo: c.activo,
})

/**
 * Alta y edición de cliente-tutor. Al crear, si el teléfono o el correo ya
 * existen, el servidor devuelve los posibles duplicados y la pantalla pide
 * confirmar antes de crear otro (una pareja con el mismo teléfono es legítima).
 */
export function FormularioCliente({ existente, onGuardado, onCancelar, compacto }: { existente?: ClienteVista; onGuardado?: (c: ClienteVista) => void; onCancelar?: () => void; compacto?: boolean }) {
  const { base, recargarCatalogo } = useClinica()
  const router = useRouter()
  const [d, setD] = useState<Datos>(existente ? desde(existente) : vacio())
  const [error, setError] = useState<string | null>(null)
  const [dup, setDup] = useState<ClienteVista[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const set = <K extends keyof Datos>(k: K, v: Datos[K]) => setD((x) => ({ ...x, [k]: v }))

  const guardar = async (forzar = false) => {
    setGuardando(true)
    setError(null)
    try {
      if (existente) {
        const c = await api.post<ClienteVista>(`clientes/${existente.id}`, d)
        onGuardado?.(c)
      } else {
        const r = await api.post<{ cliente: ClienteVista | null; duplicados: ClienteVista[] }>('clientes', { ...d, forzar })
        if (!r.cliente) {
          setDup(r.duplicados)
          setGuardando(false)
          return
        }
        recargarCatalogo()
        if (onGuardado) onGuardado(r.cliente)
        else router.push(`${base}/clientes/${r.cliente.id}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar.')
    }
    setGuardando(false)
  }

  return (
    <form
      className="fz-stack"
      onSubmit={(e) => {
        e.preventDefault()
        void guardar(false)
      }}
    >
      {!compacto && (
        <div>
          <p className="fz-eyebrow">Clientes</p>
          <h1 className="fz-h1">{existente ? `Editar a ${existente.nombreCompleto}` : 'Nuevo cliente (tutor)'}</h1>
        </div>
      )}
      <div className="cl-grid">
        <Campo etiqueta="Nombre(s) *">
          <input className="fz-input" value={d.nombre} onChange={(e) => set('nombre', e.target.value)} required autoFocus />
        </Campo>
        <Campo etiqueta="Apellidos">
          <input className="fz-input" value={d.apellidos} onChange={(e) => set('apellidos', e.target.value)} />
        </Campo>
        <Campo etiqueta="Teléfono (WhatsApp)" ayuda="10 dígitos con lada.">
          <input className="fz-input" inputMode="tel" value={d.telefono} onChange={(e) => set('telefono', e.target.value)} />
        </Campo>
        <Campo etiqueta="Otro teléfono">
          <input className="fz-input" inputMode="tel" value={d.telefonoAlterno} onChange={(e) => set('telefonoAlterno', e.target.value)} />
        </Campo>
        <Campo etiqueta="Correo">
          <input className="fz-input" type="email" value={d.email} onChange={(e) => set('email', e.target.value)} />
        </Campo>
        <Campo etiqueta="Dirección">
          <input className="fz-input" value={d.direccion} onChange={(e) => set('direccion', e.target.value)} />
        </Campo>
        <Campo etiqueta="Contacto de emergencia: nombre">
          <input className="fz-input" value={d.contactoEmergencia.nombre} onChange={(e) => set('contactoEmergencia', { ...d.contactoEmergencia, nombre: e.target.value })} />
        </Campo>
        <Campo etiqueta="Contacto de emergencia: teléfono">
          <input className="fz-input" inputMode="tel" value={d.contactoEmergencia.telefono} onChange={(e) => set('contactoEmergencia', { ...d.contactoEmergencia, telefono: e.target.value })} />
        </Campo>
      </div>
      {!compacto && (
        <>
          <fieldset className="cl-fieldset">
            <legend className="fz-etiqueta">Comunicación</legend>
            {(
              [
                ['avisos', 'Avisos de citas, resultados y cartilla'],
                ['promociones', 'Promociones y novedades'],
                ['whatsapp', 'Por WhatsApp'],
                ['correo', 'Por correo'],
              ] as [keyof Datos['comunicacion'], string][]
            ).map(([k, l]) => (
              <label key={k} className="cl-check">
                <input type="checkbox" checked={d.comunicacion[k]} onChange={(e) => set('comunicacion', { ...d.comunicacion, [k]: e.target.checked })} /> {l}
              </label>
            ))}
          </fieldset>
          <Campo etiqueta="Notas internas" ayuda="El cliente no las ve en el portal.">
            <textarea className="fz-input" rows={2} value={d.notasInternas} onChange={(e) => set('notasInternas', e.target.value)} />
          </Campo>
          {existente && (
            <label className="cl-check">
              <input type="checkbox" checked={d.activo} onChange={(e) => set('activo', e.target.checked)} /> Cliente activo
            </label>
          )}
        </>
      )}
      <ErrorForm error={error} />
      {dup && (
        <div className="fz-aviso fz-aviso--aviso">
          <div className="fz-stack fz-stack--chico">
            <b>Ya hay {dup.length === 1 ? 'un cliente' : 'clientes'} con ese teléfono o correo:</b>
            {dup.map((c) => (
              <Link key={c.id} href={`${base}/clientes/${c.id}`}>
                {c.folio} · {c.nombreCompleto} · {telefonoBonito(c.telefono)}
              </Link>
            ))}
            <span>Si es otra persona de la misma casa, puedes crear el registro de todos modos.</span>
            <div className="fz-acciones-fin">
              <Boton tono="navy" chico disabled={guardando} onClick={() => void guardar(true)}>
                Crear de todos modos
              </Boton>
              <Boton chico onClick={() => setDup(null)}>
                Corregir datos
              </Boton>
            </div>
          </div>
        </div>
      )}
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--navy" disabled={guardando || Boolean(dup)}>
          {guardando ? 'Guardando…' : existente ? 'Guardar cambios' : 'Crear cliente'}
        </button>
        {onCancelar ? (
          <Boton onClick={onCancelar}>Cancelar</Boton>
        ) : (
          <Link href={base} className="fz-btn fz-btn--claro">
            Cancelar
          </Link>
        )}
      </div>
    </form>
  )
}

/* ───────────────────────────── ficha ───────────────────────────── */

export function FichaCliente({ id }: { id: number }) {
  const { base, catalogo } = useClinica()
  const p = catalogo.permisos
  const { datos, error, cargando, recargar, poner } = useCarga(() => api.get<Ficha>(`clientes/${id}`), [id])
  const [editando, setEditando] = useState(false)
  const [codigo, setCodigo] = useState<CodigoVista | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  if (error) return <Aviso tono="malo">{error}</Aviso>
  if (cargando || !datos) return <p className="fz-tenue">Cargando…</p>
  const c = datos.cliente

  const generar = async () => {
    setMsg(null)
    try {
      const k = await api.post<CodigoVista>(`clientes/${id}/codigo`)
      setCodigo(k)
      recargar()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo generar.')
    }
  }
  const desvincular = async (cuentaId: number) => {
    if (!confirm('¿Quitar la ficha a esta cuenta del portal? Dejará de ver las mascotas hasta vincularse con otro código.')) return
    try {
      await api.post(`cuentas/${cuentaId}/desvincular`)
      recargar()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'No se pudo desvincular.')
    }
  }

  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div className="cl-cabecera-ficha">
          <Avatar nombre={c.nombreCompleto} grande />
          <div>
            <p className="fz-eyebrow">
              Cliente · {c.folio} {!c.activo && <Pastilla tono="gris">inactivo</Pastilla>}
            </p>
            <h1 className="fz-h1">{c.nombreCompleto}</h1>
            <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
              {telefonoBonito(c.telefono)}
              {c.telefonoAlterno ? ` · ${telefonoBonito(c.telefonoAlterno)}` : ''}
              {c.email ? ` · ${c.email}` : ''}
            </p>
            {c.comunicacion.whatsapp && (
              <div style={{ marginTop: 6 }}>
                <BotonWhatsApp telefono={c.telefono} mensaje={mensajes.saludo(c.nombre, site.brand.name)} />
              </div>
            )}
          </div>
        </div>
        <div className="fz-acciones-fin">
          {p.editarPacientes && !editando && <Boton onClick={() => setEditando(true)}>Editar datos</Boton>}
          {p.editarPacientes && (
            <Link href={`${base}/mascotas/nueva?cliente=${c.id}`} className="fz-btn fz-btn--navy">
              <Icono n="mas" chico /> Nueva mascota
            </Link>
          )}
        </div>
      </div>

      {editando ? (
        <div className="fz-tarjeta cl-caja">
          <FormularioCliente
            existente={c}
            onGuardado={(nuevo) => {
              poner({ ...datos, cliente: nuevo })
              setEditando(false)
            }}
            onCancelar={() => setEditando(false)}
          />
        </div>
      ) : (
        <div className="cl-dos">
          <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <h2 className="fz-h2">Datos de contacto</h2>
            <dl className="cl-dl">
              <dt>Dirección</dt>
              <dd>{c.direccion ?? '—'}</dd>
              <dt>Emergencia</dt>
              <dd>
                {c.contactoEmergencia.nombre ?? '—'}
                {c.contactoEmergencia.telefono ? ` · ${telefonoBonito(c.contactoEmergencia.telefono)}` : ''}
              </dd>
              <dt>Comunicación</dt>
              <dd>
                Avisos: {c.comunicacion.avisos ? 'sí' : 'no'} · Promociones: {c.comunicacion.promociones ? 'sí' : 'no'} · {[c.comunicacion.whatsapp && 'WhatsApp', c.comunicacion.correo && 'correo'].filter(Boolean).join(', ') || 'sin canal'}
              </dd>
              <dt>Origen</dt>
              <dd>
                {c.origen === 'importacion' ? 'Importación de archivo' : c.origen === 'portal' ? 'Portal del tutor' : 'Captura manual'} · alta {fecha(c.creadoEn)}
              </dd>
            </dl>
            {c.notasInternas && (
              <div className="fz-aviso fz-aviso--gris">
                <div>
                  <b>Nota interna</b> (el cliente no la ve): {c.notasInternas}
                </div>
              </div>
            )}
          </div>

          <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <h2 className="fz-h2">Portal del tutor</h2>
            <p className="fz-chico fz-tenue">El tutor crea su cuenta en el portal y la vincula a esta ficha con un código. Nadie ve un expediente por coincidir en nombre o teléfono.</p>
            {datos.cuentasPortal.length > 0 ? (
              datos.cuentasPortal.map((u) => (
                <div key={u.id} className="fz-entre">
                  <span>
                    <Pastilla tono="ok">vinculada</Pastilla> {u.email} <span className="fz-tenue fz-chico">· {u.nombre} · desde {fecha(u.vinculadoEn)}</span>
                  </span>
                  {p.editarPacientes && (
                    <Boton chico tono="peligro" onClick={() => void desvincular(u.id)}>
                      Desvincular
                    </Boton>
                  )}
                </div>
              ))
            ) : (
              <p className="fz-chico">
                <Pastilla tono="gris">sin cuenta vinculada</Pastilla>
              </p>
            )}
            {(codigo || datos.codigosVigentes.length > 0) && (
              <div className="cl-codigo">
                <span className="fz-eyebrow">Código de vinculación vigente</span>
                <b>{(codigo ?? datos.codigosVigentes[0]).codigo}</b>
                <span className="fz-chico fz-tenue">Vence {momento((codigo ?? datos.codigosVigentes[0]).expira)} · sirve una sola vez</span>
              </div>
            )}
            {p.editarPacientes && (
              <div>
                <Boton chico onClick={() => void generar()}>
                  Generar código de vinculación
                </Boton>
              </div>
            )}
            {msg && <Aviso tono="malo">{msg}</Aviso>}
          </div>
        </div>
      )}

      <section className="fz-stack fz-stack--chico">
        <h2 className="fz-h2">Mascotas ({datos.mascotas.length})</h2>
        <div className="fz-tarjeta fz-lista">
          {datos.mascotas.length === 0 && <p className="fz-tenue" style={{ padding: 14 }}>Sin mascotas registradas.</p>}
          {datos.mascotas.map((m) => (
            <Link key={m.id} href={`${base}/mascotas/${m.id}`} className="fz-fila">
              <Avatar nombre={m.nombre} especie={m.especie} />
              <span className="fz-fila__main">
                <span className="fz-fila__t1">
                  {m.nombre} <span className="fz-tenue fz-chico">{m.folio}</span> {m.estado !== 'activo' && <Pastilla tono="gris">{m.estado}</Pastilla>}
                  {m.tutores.find((t) => t.clienteId === c.id)?.principal === false && <Pastilla tono="info">tutor secundario</Pastilla>}
                </span>
                <span className="fz-fila__t2">
                  {ESPECIE_LABEL[m.especie] ?? m.especie}
                  {m.raza ? `, ${m.raza}` : ''}
                  {m.edad ? ` · ${m.edad}` : ''}
                  {m.ultimoPeso ? ` · ${m.ultimoPeso.kg} kg` : ''}
                </span>
                {(m.alertasManejo.length > 0 || m.alergias) && <span className="fz-fila__t2 fz-rojo">⚑ {[...m.alertasManejo, m.alergias ? `Alergia: ${m.alergias}` : ''].filter(Boolean).join(' · ')}</span>}
              </span>
              <Icono n="flecha" chico />
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
