'use client'

import React, { useState } from 'react'
import type { AlmacenVista, ConfiguracionVista, ProveedorVista } from '../../../lib/farmacia/tipos'
import { api, Aviso, Boton, Campo, Check, ErrorForm, Modal, Pastilla, Select, useFarmacia } from './comun'

/**
 * Configuración de la farmacia (dueño / superadmin): parámetros, ligas con
 * Finanzas, proveedores y almacenes. Las zonas de entrega llegan en la fase 5.
 */
export default function Configuracion() {
  const { catalogo, rutaAdmin, recargarCatalogo } = useFarmacia()
  const cfg = catalogo.configuracion
  const [c, setC] = useState<ConfiguracionVista>(cfg)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [modalProv, setModalProv] = useState<ProveedorVista | 'nuevo' | null>(null)
  const [modalAlm, setModalAlm] = useState<AlmacenVista | 'nuevo' | null>(null)
  const num = (v: string, min = 0) => Math.max(min, Number(v) || 0)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    setMsg(null)
    try {
      await api.post('configuracion', c)
      setMsg('Configuración guardada.')
      recargarCatalogo()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
    setOcupado(false)
  }

  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <p className="fz-eyebrow">Farmacia</p>
        <h1 className="fz-h1">Configuración</h1>
        <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
          Todo tiene un valor por omisión seguro. Lo que falte por decidir con el Dr. Joni está marcado.
        </p>
      </div>
      {msg && <Aviso tono="ok">{msg}</Aviso>}

      <form className="fz-stack" onSubmit={(e) => void guardar(e)}>
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Caducidad: días de aviso por línea</h2>
          <div className="cl-grid cl-grid--3">
            <Campo etiqueta="Medicamentos y antiparasitarios">
              <input className="fz-input" type="number" min={1} value={c.caducidad.medicamentos} onChange={(e) => setC({ ...c, caducidad: { ...c.caducidad, medicamentos: num(e.target.value, 1) } })} />
            </Campo>
            <Campo etiqueta="Alimento y dietas">
              <input className="fz-input" type="number" min={1} value={c.caducidad.alimento} onChange={(e) => setC({ ...c, caducidad: { ...c.caducidad, alimento: num(e.target.value, 1) } })} />
            </Campo>
            <Campo etiqueta="Suplementos, higiene y accesorios">
              <input className="fz-input" type="number" min={1} value={c.caducidad.otros} onChange={(e) => setC({ ...c, caducidad: { ...c.caducidad, otros: num(e.target.value, 1) } })} />
            </Campo>
          </div>
          <div className="cl-grid cl-grid--3">
            <Campo etiqueta="Urgente (días o menos)">
              <input className="fz-input" type="number" min={1} value={c.caducidad.urgente} onChange={(e) => setC({ ...c, caducidad: { ...c.caducidad, urgente: num(e.target.value, 1) } })} />
            </Campo>
            <Campo etiqueta="Horas de apartado sin pago (tienda)">
              <input className="fz-input" type="number" min={1} value={c.horasApartado} onChange={(e) => setC({ ...c, horasApartado: num(e.target.value, 1) })} />
            </Campo>
            <Campo etiqueta="Almacén por omisión">
              <Select valor={c.almacenPorOmisionId ? String(c.almacenPorOmisionId) : ''} onChange={(v) => setC({ ...c, almacenPorOmisionId: v ? Number(v) : null })}>
                <option value="">El primero activo</option>
                {catalogo.almacenes.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
        </div>

        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Reglas pendientes de confirmar</h2>
          <div className="cl-fieldset">
            <Check checked={c.cierreDiaActivo} onChange={(v) => setC({ ...c, cierreDiaActivo: v })}>
              Cierre del día activo <Pastilla tono="aviso">propuesta · confirmar con Jano</Pastilla>
            </Check>
            <Check checked={c.recetaGrupoIIDomicilio} onChange={(v) => setC({ ...c, recetaGrupoIIDomicilio: v })}>
              Grupo II (con receta) a domicilio <Pastilla tono="aviso">confirmar con el Dr. Joni</Pastilla>
            </Check>
            <Check checked={c.exigirOriginalGrupoII} onChange={(v) => setC({ ...c, exigirOriginalGrupoII: v })}>
              Exigir el original físico antes de surtir una receta externa de Grupo II <Pastilla tono="aviso">confirmar con el Dr. Joni</Pastilla>
            </Check>
          </div>
          <Campo etiqueta="Política de devoluciones" ayuda="Pendiente con el Dr. Joni. Por omisión no se aceptan medicamentos salvo error de la farmacia.">
            <textarea className="fz-input" rows={3} value={c.politicaDevoluciones ?? ''} onChange={(e) => setC({ ...c, politicaDevoluciones: e.target.value || null })} />
          </Campo>
        </div>

        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Alertas y punto de reorden que aprende</h2>
          <div className="cl-grid cl-grid--3">
            <Campo etiqueta="Semanas de ventas para proponer">
              <input className="fz-input" type="number" min={1} value={c.aprendizaje.semanasHistorial} onChange={(e) => setC({ ...c, aprendizaje: { ...c.aprendizaje, semanasHistorial: num(e.target.value, 1) } })} />
            </Campo>
            <Campo etiqueta="Días de cobertura al reabastecer">
              <input className="fz-input" type="number" min={1} value={c.aprendizaje.diasCobertura} onChange={(e) => setC({ ...c, aprendizaje: { ...c.aprendizaje, diasCobertura: num(e.target.value, 1) } })} />
            </Campo>
            <Campo etiqueta="Días de entrega si el proveedor no lo dice">
              <input className="fz-input" type="number" min={0} value={c.aprendizaje.diasEntregaPorOmision} onChange={(e) => setC({ ...c, aprendizaje: { ...c.aprendizaje, diasEntregaPorOmision: num(e.target.value) } })} />
            </Campo>
          </div>
          <div className="cl-grid cl-grid--2">
            <Campo etiqueta="Días sin venta para «sin rotación»">
              <input className="fz-input" type="number" min={7} value={c.aprendizaje.diasSinRotacion} onChange={(e) => setC({ ...c, aprendizaje: { ...c.aprendizaje, diasSinRotacion: num(e.target.value, 7) } })} />
            </Campo>
            <Campo etiqueta="Correos extra para el resumen diario (08:00)" ayuda="Separados por coma. Además lo recibe quien tiene «Reportes» en su rol.">
              <input className="fz-input" value={c.correosAlertas ?? ''} onChange={(e) => setC({ ...c, correosAlertas: e.target.value || null })} placeholder="dueno@clinica.mx" />
            </Campo>
          </div>
        </div>

        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Ligas con Finanzas (fases 2 y 3)</h2>
          <p className="fz-chico fz-tenue">Cada venta creará una entrada y cada compra un gasto con esta área y categorías. Si el área «Farmacia» no existe, créala en Finanzas → Actividades y áreas.</p>
          <div className="cl-grid cl-grid--3">
            <Campo etiqueta="Área (actividad)">
              <Select valor={c.finanzas.areaId ? String(c.finanzas.areaId) : ''} onChange={(v) => setC({ ...c, finanzas: { ...c.finanzas, areaId: v ? Number(v) : null } })}>
                <option value="">Sin asignar</option>
                {catalogo.finanzas.areas.map((a) => (
                  <option key={a.id} value={String(a.id)}>
                    {a.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Categoría de ventas (entrada)">
              <Select valor={c.finanzas.categoriaVentasId ? String(c.finanzas.categoriaVentasId) : ''} onChange={(v) => setC({ ...c, finanzas: { ...c.finanzas, categoriaVentasId: v ? Number(v) : null } })}>
                <option value="">Sin asignar</option>
                {catalogo.finanzas.categorias.filter((x) => x.tipo === 'entrada').map((x) => (
                  <option key={x.id} value={String(x.id)}>
                    {x.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo etiqueta="Categoría de compras (gasto)">
              <Select valor={c.finanzas.categoriaComprasId ? String(c.finanzas.categoriaComprasId) : ''} onChange={(v) => setC({ ...c, finanzas: { ...c.finanzas, categoriaComprasId: v ? Number(v) : null } })}>
                <option value="">Sin asignar</option>
                {catalogo.finanzas.categorias.filter((x) => x.tipo === 'gasto').map((x) => (
                  <option key={x.id} value={String(x.id)}>
                    {x.nombre}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
        </div>
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Métodos de pago del mostrador (fase 3)</h2>
          <p className="fz-chico fz-tenue">Cada cobro entra a la cuenta o caja de Finanzas de su método. La cuenta del efectivo es la caja del cierre del día. Lo «por confirmar» (transferencia) entra a Finanzas cuando el encargado lo confirma.</p>
          {c.metodosPago.map((m, i) => {
            const setM = (cambio: Partial<typeof m>) => setC({ ...c, metodosPago: c.metodosPago.map((x, k) => (k === i ? { ...x, ...cambio } : x)) })
            return (
              <div key={i} className="fa-renglon">
                <div className="cl-grid cl-grid--3">
                  <Campo etiqueta="Nombre visible">
                    <input className="fz-input" value={m.nombre} onChange={(e) => setM({ nombre: e.target.value })} />
                  </Campo>
                  <Campo etiqueta="Tipo">
                    <Select valor={m.tipo} onChange={(v) => setM({ tipo: v as typeof m.tipo, porConfirmar: v === 'transferencia' ? true : m.porConfirmar })}>
                      <option value="efectivo">Efectivo (da cambio)</option>
                      <option value="terminal">Terminal bancaria o Clip</option>
                      <option value="transferencia">Transferencia</option>
                      <option value="otro">Otro</option>
                    </Select>
                  </Campo>
                  <Campo etiqueta="Cuenta o caja de Finanzas *">
                    <Select valor={m.cuentaId ? String(m.cuentaId) : ''} onChange={(v) => setM({ cuentaId: v ? Number(v) : null })}>
                      <option value="">Elige…</option>
                      {catalogo.finanzas.cuentas.map((x) => (
                        <option key={x.id} value={String(x.id)}>
                          {x.nombre}
                        </option>
                      ))}
                    </Select>
                  </Campo>
                </div>
                <div className="fz-entre">
                  <span className="fa-filtros">
                    <Check checked={m.porConfirmar} onChange={(v) => setM({ porConfirmar: v })}>
                      Queda por confirmar
                    </Check>
                    <Check checked={m.activo} onChange={(v) => setM({ activo: v })}>
                      Activo
                    </Check>
                  </span>
                  <button type="button" className="fz-link" onClick={() => setC({ ...c, metodosPago: c.metodosPago.filter((_, k) => k !== i) })}>
                    Quitar
                  </button>
                </div>
              </div>
            )
          })}
          {catalogo.finanzas.cuentas.length === 0 && <Aviso tono="aviso">No hay cuentas activas en Finanzas. Créalas en Finanzas → Configuración → Cuentas y cajas.</Aviso>}
          <button
            type="button"
            className="fz-btn fz-btn--claro fz-btn--chico"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => {
              const nombre = 'Clip'
              let clave = nombre.toLowerCase()
              let n = 2
              while (c.metodosPago.some((x) => x.clave === clave)) clave = `otro${n++}`
              setC({ ...c, metodosPago: [...c.metodosPago, { clave, nombre, tipo: 'terminal', cuentaId: null, porConfirmar: false, activo: true }] })
            }}
          >
            Agregar método
          </button>
        </div>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          {catalogo.permisos.panel && (
            <a href={`${rutaAdmin}/globals/farmacia-configuracion`} className="fz-btn fz-btn--claro">
              Promociones por caducidad y pasarela (panel)
            </a>
          )}
          <button type="submit" className="fz-btn fz-btn--navy" disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </form>

      <div className="cl-dos">
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <div className="fz-entre">
            <h2 className="fz-h2">Proveedores</h2>
            <Boton chico onClick={() => setModalProv('nuevo')}>
              Nuevo proveedor
            </Boton>
          </div>
          {catalogo.proveedores.length === 0 && <p className="fz-tenue fz-chico">Ninguno. También se crean solos al importar el catálogo con la columna «proveedor».</p>}
          {catalogo.proveedores.map((p) => (
            <div key={p.id} className="cl-tutor-fila">
              <span style={{ flex: 1 }}>
                <b>{p.nombre}</b> {!p.activo && <Pastilla tono="gris">inactivo</Pastilla>}
                <span className="fz-chico fz-tenue">
                  {' '}
                  · {p.diasEntrega} días de entrega{p.rfc ? ` · ${p.rfc}` : ''}
                  {p.contacto.telefono ? ` · ${p.contacto.telefono}` : ''}
                </span>
              </span>
              <Boton chico onClick={() => setModalProv(p)}>
                Editar
              </Boton>
            </div>
          ))}
        </section>
        <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <div className="fz-entre">
            <h2 className="fz-h2">Almacenes</h2>
            <Boton chico onClick={() => setModalAlm('nuevo')}>
              Nuevo almacén
            </Boton>
          </div>
          {catalogo.almacenes.length === 0 && <p className="fz-tenue fz-chico">Ninguno. En Inicio → «Crear almacén Farmacia», o aquí.</p>}
          {catalogo.almacenes.map((a) => (
            <div key={a.id} className="cl-tutor-fila">
              <span style={{ flex: 1 }}>
                <b>{a.nombre}</b> <span className="fz-chico fz-tenue">· {catalogo.tiposAlmacen.find((t) => t.value === a.tipo)?.label ?? a.tipo}</span> {!a.activo && <Pastilla tono="gris">inactivo</Pastilla>}
                {c.almacenPorOmisionId === a.id && <Pastilla tono="info">por omisión</Pastilla>}
              </span>
              <Boton chico onClick={() => setModalAlm(a)}>
                Editar
              </Boton>
            </div>
          ))}
        </section>
      </div>

      {modalProv && (
        <ModalProveedor
          existente={modalProv === 'nuevo' ? null : modalProv}
          onCerrar={() => setModalProv(null)}
          alGuardar={() => {
            setModalProv(null)
            recargarCatalogo()
          }}
        />
      )}
      {modalAlm && (
        <ModalAlmacen
          existente={modalAlm === 'nuevo' ? null : modalAlm}
          onCerrar={() => setModalAlm(null)}
          alGuardar={() => {
            setModalAlm(null)
            recargarCatalogo()
          }}
        />
      )}
    </div>
  )
}

function ModalProveedor({ existente, onCerrar, alGuardar }: { existente: ProveedorVista | null; onCerrar: () => void; alGuardar: () => void }) {
  const [d, setD] = useState({
    nombre: existente?.nombre ?? '',
    rfc: existente?.rfc ?? '',
    diasEntrega: String(existente?.diasEntrega ?? 3),
    contactoNombre: existente?.contacto.nombre ?? '',
    telefono: existente?.contacto.telefono ?? '',
    correo: existente?.contacto.correo ?? '',
    notas: existente?.notas ?? '',
    activo: existente?.activo ?? true,
  })
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    const cuerpo = { nombre: d.nombre, rfc: d.rfc || null, diasEntrega: Number(d.diasEntrega), contacto: { nombre: d.contactoNombre || null, telefono: d.telefono || null, correo: d.correo || null }, notas: d.notas || null, activo: d.activo }
    try {
      if (existente) await api.post(`proveedores/${existente.id}`, cuerpo)
      else await api.post('proveedores', cuerpo)
      alGuardar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
    setOcupado(false)
  }
  return (
    <Modal titulo={existente ? 'Editar proveedor' : 'Nuevo proveedor'} onCerrar={onCerrar}>
      <form className="fz-stack fz-stack--chico" onSubmit={(e) => void guardar(e)}>
        <Campo etiqueta="Nombre *">
          <input className="fz-input" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} required autoFocus />
        </Campo>
        <div className="cl-grid cl-grid--2">
          <Campo etiqueta="RFC" ayuda="Con él, el XML de la factura reconoce al proveedor.">
            <input className="fz-input" value={d.rfc} onChange={(e) => setD({ ...d, rfc: e.target.value.toUpperCase() })} maxLength={13} />
          </Campo>
          <Campo etiqueta="Días de entrega">
            <input className="fz-input" type="number" min={0} value={d.diasEntrega} onChange={(e) => setD({ ...d, diasEntrega: e.target.value })} />
          </Campo>
        </div>
        <div className="cl-grid cl-grid--3">
          <Campo etiqueta="Contacto">
            <input className="fz-input" value={d.contactoNombre} onChange={(e) => setD({ ...d, contactoNombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Teléfono (WhatsApp)">
            <input className="fz-input" value={d.telefono} onChange={(e) => setD({ ...d, telefono: e.target.value })} inputMode="tel" />
          </Campo>
          <Campo etiqueta="Correo">
            <input className="fz-input" type="email" value={d.correo} onChange={(e) => setD({ ...d, correo: e.target.value })} />
          </Campo>
        </div>
        <Campo etiqueta="Notas">
          <textarea className="fz-input" rows={2} value={d.notas} onChange={(e) => setD({ ...d, notas: e.target.value })} />
        </Campo>
        <Check checked={d.activo} onChange={(v) => setD({ ...d, activo: v })}>
          Activo
        </Check>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <button type="submit" className="fz-btn fz-btn--navy" disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

function ModalAlmacen({ existente, onCerrar, alGuardar }: { existente: AlmacenVista | null; onCerrar: () => void; alGuardar: () => void }) {
  const { catalogo } = useFarmacia()
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [tipo, setTipo] = useState(existente?.tipo ?? 'farmacia')
  const [activo, setActivo] = useState(existente?.activo ?? true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      if (existente) await api.post(`almacenes/${existente.id}`, { nombre, tipo, activo })
      else await api.post('almacenes', { nombre, tipo, activo })
      alGuardar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
    setOcupado(false)
  }
  return (
    <Modal titulo={existente ? 'Editar almacén' : 'Nuevo almacén'} onCerrar={onCerrar}>
      <form className="fz-stack fz-stack--chico" onSubmit={(e) => void guardar(e)}>
        <Campo etiqueta="Nombre *">
          <input className="fz-input" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </Campo>
        <Campo etiqueta="Tipo">
          <Select valor={tipo} onChange={(v) => setTipo(v as AlmacenVista['tipo'])}>
            {catalogo.tiposAlmacen.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </Select>
        </Campo>
        <Check checked={activo} onChange={setActivo}>
          Activo
        </Check>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <button type="submit" className="fz-btn fz-btn--navy" disabled={ocupado}>
            {ocupado ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
