'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useState } from 'react'
import type { LoteVista, MovimientoVista, PresentacionVista, ProductoBreve, ProductoVista, ResultadoProductos } from '../../../lib/farmacia/tipos'
import {
  api,
  Aviso,
  Boton,
  Campo,
  cantidad,
  Check,
  dinero,
  ErrorForm,
  ESTADO_LOTE_LABEL,
  ESTADO_LOTE_TONO,
  fecha,
  GRUPO_LABEL,
  GrupoPastilla,
  hoyISO,
  Icono,
  InputFecha,
  LINEA_LABEL,
  Modal,
  momento,
  Pastilla,
  Select,
  useCarga,
  useFarmacia,
  Volver,
} from './comun'

/* ═══════════════════════════ lista ═══════════════════════════ */

export function Productos({ q: qInicial, filtro }: { q: string; filtro: string }) {
  const { catalogo, base } = useFarmacia()
  const p = catalogo.permisos
  const [q, setQ] = useState(qInicial)
  const [linea, setLinea] = useState('')
  const [grupo, setGrupo] = useState('')
  const [inactivos, setInactivos] = useState(false)
  const [bajoMinimo, setBajoMinimo] = useState(filtro === 'bajo_minimo')
  const [res, setRes] = useState<ResultadoProductos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setCargando(true)
      api.get<ResultadoProductos>('productos', { q, linea, grupo, inactivos, bajoMinimo }).then(
        (r) => {
          setRes(r)
          setError(null)
          setCargando(false)
        },
        (e) => {
          setError(e instanceof Error ? e.message : 'No se pudo buscar.')
          setCargando(false)
        },
      )
    }, q ? 250 : 0)
    return () => clearTimeout(t)
  }, [q, linea, grupo, inactivos, bajoMinimo])

  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Productos</h1>
          <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
            {catalogo.totales.productosActivos} activos · {catalogo.totales.publicados} en la tienda
          </p>
        </div>
        {p.catalogo && (
          <div className="fz-acciones-fin">
            <Link href={`${base}/importar`} className="fz-btn fz-btn--claro">
              <Icono n="compartir" chico /> Importar
            </Link>
            <Link href={`${base}/productos/nuevo`} className="fz-btn fz-btn--navy">
              <Icono n="mas" chico /> Nuevo producto
            </Link>
          </div>
        )}
      </div>

      <div className="fz-buscar">
        <Icono n="buscar" />
        <label className="cl-sr" htmlFor="fa-q">
          Buscar
        </label>
        <input id="fa-q" className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre, principio activo, laboratorio, código de barras o folio (PRD-12)" autoComplete="off" autoFocus />
      </div>
      <div className="fa-filtros">
        <Select valor={linea} onChange={setLinea} ancho="auto">
          <option value="">Todas las líneas</option>
          {catalogo.lineas.map((l) => (
            <option key={l.value} value={l.value}>
              {l.label}
            </option>
          ))}
        </Select>
        <Select valor={grupo} onChange={setGrupo} ancho="auto">
          <option value="">Todos los grupos</option>
          {catalogo.grupos.map((g) => (
            <option key={g.value} value={g.value}>
              {g.label}
            </option>
          ))}
        </Select>
        <Check checked={bajoMinimo} onChange={setBajoMinimo}>
          Solo bajo mínimo
        </Check>
        <Check checked={inactivos} onChange={setInactivos}>
          Incluir inactivos
        </Check>
      </div>

      {error && <Aviso tono="malo">{error}</Aviso>}
      {res && (
        <div className={`fz-tarjeta fz-lista${cargando ? ' cl-cargando' : ''}`}>
          {res.productos.length === 0 && (
            <p className="fz-tenue" style={{ padding: 14 }}>
              {q || linea || grupo || bajoMinimo ? 'Ningún producto coincide.' : 'Todavía no hay productos. Importa la plantilla o da de alta el primero.'}
            </p>
          )}
          {res.productos.map((pr) => (
            <FilaProducto key={pr.id} pr={pr} />
          ))}
          {res.productos.length >= 60 && (
            <p className="fz-tenue fz-chico" style={{ padding: 12 }}>
              Se muestran los primeros 60. Afina la búsqueda para ver otros.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function FilaProducto({ pr }: { pr: ProductoBreve }) {
  const { base } = useFarmacia()
  return (
    <Link href={`${base}/productos/${pr.id}`} className="fz-fila">
      <span className="fz-fila__main">
        <span className="fz-fila__t1">
          {pr.nombre} <GrupoPastilla grupo={pr.grupo} />
          {!pr.activo && <Pastilla tono="gris">inactivo</Pastilla>}
          {pr.bajoMinimo && <Pastilla tono="aviso">bajo mínimo</Pastilla>}
          {pr.publicadoTienda && <Pastilla tono="info">tienda</Pastilla>}
        </span>
        <span className="fz-fila__t2">
          {pr.folio} · {LINEA_LABEL[pr.linea]}
          {pr.principioActivo ? ` · ${pr.principioActivo}` : ''}
          {pr.laboratorio ? ` · ${pr.laboratorio}` : ''}
        </span>
        <span className="fz-fila__t2">
          Existencia: <b>{cantidad(pr.existencia, pr.unidadBase)}</b> · {pr.presentaciones} presentación{pr.presentaciones === 1 ? '' : 'es'}
          {pr.precioDesde != null ? ` · desde ${dinero(pr.precioDesde)}` : ''}
        </span>
      </span>
      <Icono n="flecha" chico />
    </Link>
  )
}

/* ═══════════════════════════ formulario ═══════════════════════════ */

type DatosProducto = {
  nombre: string
  principioActivo: string
  laboratorio: string
  linea: string
  grupo: string
  registroSenasica: string
  especies: string[]
  pesoMinKg: string
  pesoMaxKg: string
  edadMinMeses: string
  alergenos: string
  unidadBase: string
  refrigeracion: boolean
  duracionDias: string
  descripcion: string
  publicadoTienda: boolean
  minimoInventario: string
  puntoReordenAceptado: string
  proveedorPreferenteId: string
  activo: boolean
  notasInternas: string
}

const VACIO: DatosProducto = {
  nombre: '', principioActivo: '', laboratorio: '', linea: 'medicamento', grupo: 'III', registroSenasica: '', especies: [], pesoMinKg: '', pesoMaxKg: '', edadMinMeses: '',
  alergenos: '', unidadBase: 'pieza', refrigeracion: false, duracionDias: '', descripcion: '', publicadoTienda: false, minimoInventario: '0', puntoReordenAceptado: '', proveedorPreferenteId: '', activo: true, notasInternas: '',
}

function desdeVista(v: ProductoVista): DatosProducto {
  const s = (x: number | string | null | undefined) => (x == null ? '' : String(x))
  return {
    nombre: v.nombre, principioActivo: v.principioActivo ?? '', laboratorio: v.laboratorio ?? '', linea: v.linea, grupo: v.grupo, registroSenasica: v.registroSenasica ?? '',
    especies: v.especies, pesoMinKg: s(v.pesoMinKg), pesoMaxKg: s(v.pesoMaxKg), edadMinMeses: s(v.edadMinMeses), alergenos: v.alergenos ?? '', unidadBase: v.unidadBase, refrigeracion: v.refrigeracion,
    duracionDias: s(v.duracionDias), descripcion: v.descripcion ?? '', publicadoTienda: v.publicadoTienda, minimoInventario: s(v.minimoInventario), puntoReordenAceptado: s(v.puntoReordenAceptado),
    proveedorPreferenteId: s(v.proveedorPreferente?.id), activo: v.activo, notasInternas: v.notasInternas ?? '',
  }
}

function aCuerpo(d: DatosProducto): Record<string, unknown> {
  const num = (x: string) => (x.trim() === '' ? null : Number(x))
  return {
    nombre: d.nombre, principioActivo: d.principioActivo || null, laboratorio: d.laboratorio || null, linea: d.linea, grupo: d.grupo, registroSenasica: d.registroSenasica || null,
    especies: d.especies, pesoMinKg: num(d.pesoMinKg), pesoMaxKg: num(d.pesoMaxKg), edadMinMeses: num(d.edadMinMeses), alergenos: d.alergenos || null, unidadBase: d.unidadBase || 'pieza',
    refrigeracion: d.refrigeracion, duracionDias: num(d.duracionDias), descripcion: d.descripcion || null, publicadoTienda: d.publicadoTienda, minimoInventario: num(d.minimoInventario) ?? 0,
    puntoReordenAceptado: num(d.puntoReordenAceptado), proveedorPreferenteId: num(d.proveedorPreferenteId), activo: d.activo, notasInternas: d.notasInternas || null,
  }
}

export function FormularioProducto({ existente, alGuardar }: { existente?: ProductoVista; alGuardar?: (p: ProductoVista) => void }) {
  const { catalogo, base, recargarCatalogo } = useFarmacia()
  const router = useRouter()
  const [d, setD] = useState<DatosProducto>(existente ? desdeVista(existente) : VACIO)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const set = <K extends keyof DatosProducto>(k: K, v: DatosProducto[K]) => setD((x) => ({ ...x, [k]: v }))
  const esMedicamento = ['medicamento', 'antiparasitario', 'dieta_prescripcion', 'suplemento'].includes(d.linea)

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    try {
      const r = existente ? await api.post<ProductoVista>(`productos/${existente.id}`, aCuerpo(d)) : await api.post<ProductoVista>('productos', aCuerpo(d))
      recargarCatalogo()
      if (alGuardar) alGuardar(r)
      else router.push(`${base}/productos/${r.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
    setOcupado(false)
  }

  return (
    <form className="fz-stack" onSubmit={(e) => void guardar(e)}>
      {!existente && (
        <div>
          <Volver a={`${base}/productos`} etiqueta="Productos" />
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Nuevo producto</h1>
        </div>
      )}
      <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Identidad</h2>
        <Campo etiqueta="Nombre comercial *">
          <input className="fz-input" value={d.nombre} onChange={(e) => set('nombre', e.target.value)} required maxLength={160} />
        </Campo>
        <div className="cl-grid cl-grid--2">
          <Campo etiqueta="Principio activo">
            <input className="fz-input" value={d.principioActivo} onChange={(e) => set('principioActivo', e.target.value)} />
          </Campo>
          <Campo etiqueta="Laboratorio o marca">
            <input className="fz-input" value={d.laboratorio} onChange={(e) => set('laboratorio', e.target.value)} />
          </Campo>
        </div>
        <div className="cl-grid cl-grid--3">
          <Campo etiqueta="Línea *">
            <Select valor={d.linea} onChange={(v) => set('linea', v)}>
              {catalogo.lineas.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Grupo NOM-064 *" ayuda={esMedicamento ? 'I controlado · II con receta · III venta libre' : 'Alimento, accesorio e higiene: desregulado'}>
            <Select valor={d.grupo} onChange={(v) => set('grupo', v)}>
              {catalogo.grupos.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.label}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta={`Registro SENASICA${d.grupo === 'I' || d.grupo === 'II' ? ' *' : ''}`} ayuda="El de la etiqueta (Q-…)">
            <input className="fz-input" value={d.registroSenasica} onChange={(e) => set('registroSenasica', e.target.value)} required={d.grupo === 'I' || d.grupo === 'II'} />
          </Campo>
        </div>
      </div>

      <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Para quién es</h2>
        <fieldset className="cl-fieldset">
          <legend className="fz-etiqueta">Especies (vacío = todas)</legend>
          {catalogo.especies.map((e) => (
            <Check key={e.value} checked={d.especies.includes(e.value)} onChange={(v) => set('especies', v ? [...d.especies, e.value] : d.especies.filter((x) => x !== e.value))}>
              {e.label}
            </Check>
          ))}
        </fieldset>
        <div className="cl-grid cl-grid--3">
          <Campo etiqueta="Peso mínimo (kg)">
            <input className="fz-input" type="number" step="0.1" min={0} value={d.pesoMinKg} onChange={(e) => set('pesoMinKg', e.target.value)} />
          </Campo>
          <Campo etiqueta="Peso máximo (kg)">
            <input className="fz-input" type="number" step="0.1" min={0} value={d.pesoMaxKg} onChange={(e) => set('pesoMaxKg', e.target.value)} />
          </Campo>
          <Campo etiqueta="Edad mínima (meses)">
            <input className="fz-input" type="number" step="1" min={0} value={d.edadMinMeses} onChange={(e) => set('edadMinMeses', e.target.value)} />
          </Campo>
        </div>
        <Campo etiqueta="Alérgenos o principios a cruzar con alergias" ayuda="Separados por coma. Si la mascota tiene una alergia que coincide, la venta se bloquea en la tienda y pide autorización en mostrador.">
          <input className="fz-input" value={d.alergenos} onChange={(e) => set('alergenos', e.target.value)} />
        </Campo>
      </div>

      <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
        <h2 className="fz-h2">Inventario y tienda</h2>
        <div className="cl-grid cl-grid--3">
          <Campo etiqueta="Unidad base *" ayuda="tableta, ml, g, kg, pieza, dosis…">
            <input className="fz-input" value={d.unidadBase} onChange={(e) => set('unidadBase', e.target.value)} required />
          </Campo>
          <Campo etiqueta="Mínimo de inventario (unidades base)">
            <input className="fz-input" type="number" step="1" min={0} value={d.minimoInventario} onChange={(e) => set('minimoInventario', e.target.value)} />
          </Campo>
          <Campo etiqueta="Punto de reorden aceptado" ayuda={existente?.puntoReordenPropuesto != null ? `El sistema propone ${existente.puntoReordenPropuesto}` : 'Lo propone el sistema con 8 semanas de ventas (fase 4)'}>
            <input className="fz-input" type="number" step="1" min={0} value={d.puntoReordenAceptado} onChange={(e) => set('puntoReordenAceptado', e.target.value)} />
          </Campo>
        </div>
        <div className="cl-grid cl-grid--2">
          <Campo etiqueta="Duración por omisión (días por unidad base)" ayuda="Para el aviso de recompra cuando no hay receta (pipeta = 30).">
            <input className="fz-input" type="number" step="1" min={0} value={d.duracionDias} onChange={(e) => set('duracionDias', e.target.value)} />
          </Campo>
          <Campo etiqueta="Proveedor preferente">
            <Select valor={d.proveedorPreferenteId} onChange={(v) => set('proveedorPreferenteId', v)}>
              <option value="">Sin proveedor</option>
              {catalogo.proveedores.filter((p) => p.activo).map((p) => (
                <option key={p.id} value={String(p.id)}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </Campo>
        </div>
        <Campo etiqueta="Descripción para la tienda">
          <textarea className="fz-input" rows={3} value={d.descripcion} onChange={(e) => set('descripcion', e.target.value)} />
        </Campo>
        <div className="cl-fieldset">
          <Check checked={d.refrigeracion} onChange={(v) => set('refrigeracion', v)}>
            Requiere refrigeración
          </Check>
          <Check checked={d.publicadoTienda} onChange={(v) => set('publicadoTienda', v)}>
            Publicado en la tienda {d.grupo === 'I' && <span className="fz-tenue">(Grupo I nunca aparece en el catálogo público)</span>}
          </Check>
          <Check checked={d.activo} onChange={(v) => set('activo', v)}>
            Activo
          </Check>
        </div>
        <Campo etiqueta="Notas internas">
          <textarea className="fz-input" rows={2} value={d.notasInternas} onChange={(e) => set('notasInternas', e.target.value)} />
        </Campo>
      </div>
      <ErrorForm error={error} />
      <div className="fz-acciones-fin">
        <button type="submit" className="fz-btn fz-btn--navy" disabled={ocupado}>
          {ocupado ? 'Guardando…' : existente ? 'Guardar cambios' : 'Crear producto'}
        </button>
      </div>
    </form>
  )
}

/* ═══════════════════════════ ficha ═══════════════════════════ */

type ProductoConLotes = ProductoVista & { lotes: LoteVista[] }

export function FichaProducto({ id, pestana }: { id: number; pestana: string | null }) {
  const { catalogo, base, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const ficha = useCarga(() => api.get<ProductoConLotes>(`productos/${id}`), [id])
  const [ver, setVer] = useState<'resumen' | 'editar' | 'kardex'>(pestana === 'editar' ? 'editar' : pestana === 'kardex' ? 'kardex' : 'resumen')
  const [modalPres, setModalPres] = useState<PresentacionVista | 'nueva' | null>(null)
  const [modalAjuste, setModalAjuste] = useState<{ lote: LoteVista | null } | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  if (ficha.error) return <Aviso tono="malo">{ficha.error}</Aviso>
  if (!ficha.datos) return <p className="fz-tenue">Cargando…</p>
  const pr = ficha.datos

  const refrescar = () => {
    ficha.recargar()
    recargarCatalogo()
  }

  return (
    <div className="fz-stack fz-stack--grande">
      <div>
        <Volver a={`${base}/productos`} etiqueta="Productos" />
        <div className="fz-entre">
          <div>
            <p className="fz-eyebrow">
              {pr.folio} · {LINEA_LABEL[pr.linea]}
            </p>
            <h1 className="fz-h1">
              {pr.nombre} <GrupoPastilla grupo={pr.grupo} />
              {!pr.activo && <Pastilla tono="gris">inactivo</Pastilla>}
              {pr.publicadoTienda && <Pastilla tono="info">en tienda</Pastilla>}
              {pr.bajoMinimo && <Pastilla tono="aviso">bajo mínimo</Pastilla>}
            </h1>
            <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
              {pr.principioActivo ?? 'Sin principio activo'}
              {pr.laboratorio ? ` · ${pr.laboratorio}` : ''}
              {pr.registroSenasica ? ` · SENASICA ${pr.registroSenasica}` : ''}
            </p>
          </div>
          <div className="fz-acciones-fin">
            {p.ajustes && (
              <Boton tono="teal" onClick={() => setModalAjuste({ lote: null })}>
                <Icono n="mas" chico /> Entrada o ajuste
              </Boton>
            )}
            {p.catalogo && (
              <Boton tono={ver === 'editar' ? 'navy' : 'claro'} onClick={() => setVer(ver === 'editar' ? 'resumen' : 'editar')}>
                {ver === 'editar' ? 'Ver ficha' : 'Editar'}
              </Boton>
            )}
          </div>
        </div>
      </div>

      {msg && <Aviso tono="ok">{msg}</Aviso>}

      {ver === 'editar' && p.catalogo ? (
        <FormularioProducto
          existente={pr}
          alGuardar={() => {
            setMsg('Producto guardado.')
            setVer('resumen')
            refrescar()
          }}
        />
      ) : (
        <>
          <div className="fz-kpis fa-kpis">
            <div className="fz-kpi">
              <span className="fz-kpi__lbl">Existencia vigente</span>
              <span className="fz-kpi__val">{cantidad(pr.existencia)}</span>
              <span className="fz-chico fz-tenue">{pr.unidadBase}(s) · física {cantidad(pr.existenciaFisica)}</span>
            </div>
            <div className="fz-kpi">
              <span className="fz-kpi__lbl">Mínimo / reorden</span>
              <span className="fz-kpi__val">{pr.puntoReordenAceptado ?? pr.minimoInventario}</span>
              {pr.puntoReordenPropuesto != null && <span className="fz-chico fz-tenue">propuesto {pr.puntoReordenPropuesto}</span>}
            </div>
            <div className="fz-kpi">
              <span className="fz-kpi__lbl">Para quién</span>
              <span className="fz-chico">
                {pr.especies.length ? pr.especies.map((e) => catalogo.especies.find((x) => x.value === e)?.label ?? e).join(', ') : 'Todas las especies'}
                {pr.pesoMinKg != null || pr.pesoMaxKg != null ? ` · ${pr.pesoMinKg ?? 0}–${pr.pesoMaxKg ?? '∞'} kg` : ''}
                {pr.edadMinMeses != null ? ` · desde ${pr.edadMinMeses} meses` : ''}
              </span>
              {pr.alergenos && <span className="fz-chico fz-tenue">Cruza alergias: {pr.alergenos}</span>}
            </div>
            <div className="fz-kpi">
              <span className="fz-kpi__lbl">Grupo</span>
              <span className="fz-chico">{GRUPO_LABEL[pr.grupo]}</span>
              {pr.refrigeracion && <span className="fz-chico fz-tenue">Requiere refrigeración</span>}
              {pr.duracionDias != null && <span className="fz-chico fz-tenue">1 {pr.unidadBase} cubre {pr.duracionDias} días</span>}
            </div>
          </div>

          <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <div className="fz-entre">
              <h2 className="fz-h2">Presentaciones y precios</h2>
              {p.catalogo && (
                <Boton chico onClick={() => setModalPres('nueva')}>
                  <Icono n="mas" chico /> Agregar
                </Boton>
              )}
            </div>
            {pr.presentaciones.length === 0 && <p className="fz-tenue fz-chico">Sin presentaciones: sin ellas no se puede vender. Agrega al menos una (p. ej. «Pieza», factor 1).</p>}
            {pr.presentaciones.length > 0 && (
              <div style={{ overflowX: 'auto' }}>
                <table className="cl-tabla">
                  <thead>
                    <tr>
                      <th>Presentación</th>
                      <th>Unidades base</th>
                      <th>Precio</th>
                      <th>Código de barras</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pr.presentaciones.map((x) => (
                      <tr key={x.id} className={x.activa ? '' : 'fa-inactiva'}>
                        <td>
                          <b>{x.nombre}</b> {x.fraccionada && <Pastilla tono="info">fraccionada</Pastilla>} {!x.activa && <Pastilla tono="gris">inactiva</Pastilla>}
                        </td>
                        <td>{cantidad(x.factor, pr.unidadBase)}</td>
                        <td>{dinero(x.precio, true)}</td>
                        <td className="fz-tenue">{x.codigoBarras ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {p.catalogo && (
                            <Boton chico onClick={() => setModalPres(x)}>
                              Editar
                            </Boton>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
            <div className="fz-entre">
              <h2 className="fz-h2">Lotes</h2>
              <Boton chico onClick={() => setVer(ver === 'kardex' ? 'resumen' : 'kardex')}>
                {ver === 'kardex' ? 'Ocultar kardex' : 'Ver kardex'}
              </Boton>
            </div>
            <TablaLotes lotes={pr.lotes} unidad={pr.unidadBase} verCostos={Boolean(p.verCostos)} puedeAjustar={Boolean(p.ajustes)} alAjustar={(l) => setModalAjuste({ lote: l })} alCambiar={refrescar} />
          </section>

          {ver === 'kardex' && <Kardex productoId={pr.id} unidad={pr.unidadBase} verCostos={Boolean(p.verCostos)} />}
        </>
      )}

      {modalPres && (
        <ModalPresentacion
          productoId={pr.id}
          unidad={pr.unidadBase}
          existente={modalPres === 'nueva' ? null : modalPres}
          onCerrar={() => setModalPres(null)}
          alGuardar={() => {
            setModalPres(null)
            refrescar()
          }}
        />
      )}
      {modalAjuste && (
        <ModalAjuste
          producto={pr}
          lote={modalAjuste.lote}
          onCerrar={() => setModalAjuste(null)}
          alGuardar={(m) => {
            setModalAjuste(null)
            setMsg(m)
            refrescar()
          }}
        />
      )}
    </div>
  )
}

export function TablaLotes({ lotes, unidad, verCostos, puedeAjustar, alAjustar, alCambiar }: { lotes: LoteVista[]; unidad: string; verCostos: boolean; puedeAjustar: boolean; alAjustar: (l: LoteVista) => void; alCambiar: () => void }) {
  const [error, setError] = useState<string | null>(null)
  const bloquear = async (l: LoteVista, bloqueado: boolean) => {
    setError(null)
    try {
      await api.post(`lotes/${l.id}/bloqueo`, { bloqueado })
      alCambiar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
  }
  if (!lotes.length) return <p className="fz-tenue fz-chico">Sin lotes todavía. Entran por compras (fase 2) o con «Entrada o ajuste».</p>
  return (
    <div style={{ overflowX: 'auto' }}>
      {error && <Aviso tono="malo">{error}</Aviso>}
      <table className="cl-tabla">
        <thead>
          <tr>
            <th>Lote</th>
            <th>Caducidad</th>
            <th>Existencia</th>
            {verCostos && <th>Costo/u</th>}
            <th>Almacén</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {lotes.map((l) => (
            <tr key={l.id} className={l.existencia <= 0 ? 'fa-inactiva' : ''}>
              <td>
                <b>{l.numeroLote}</b> <span className="fz-tenue fz-chico">{l.folio}</span>
              </td>
              <td>
                {fecha(l.caducidad)} <Pastilla tono={ESTADO_LOTE_TONO[l.estado]}>{ESTADO_LOTE_LABEL[l.estado]}</Pastilla>
                {l.estado !== 'agotado' && (
                  <span className="fz-chico fz-tenue"> {l.diasParaCaducar < 0 ? `hace ${-l.diasParaCaducar} d` : `en ${l.diasParaCaducar} d`}</span>
                )}
              </td>
              <td>
                <b>{cantidad(l.existencia)}</b> <span className="fz-tenue fz-chico">{unidad} · recibidas {cantidad(l.cantidadRecibida)}</span>
              </td>
              {verCostos && <td>{dinero(l.costoUnidad ?? null, true)}</td>}
              <td className="fz-tenue">{l.almacen.nombre}</td>
              <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                {puedeAjustar && l.existencia > 0 && (
                  <Boton chico onClick={() => alAjustar(l)}>
                    Ajustar
                  </Boton>
                )}{' '}
                {puedeAjustar && l.estado !== 'vencido' && l.existencia > 0 && (
                  <Boton chico onClick={() => void bloquear(l, !l.bloqueado)}>
                    {l.bloqueado ? 'Desbloquear' : 'Bloquear'}
                  </Boton>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Kardex({ productoId, loteId, unidad, verCostos }: { productoId?: number; loteId?: number; unidad?: string; verCostos: boolean }) {
  const k = useCarga(() => api.get<{ movimientos: MovimientoVista[]; total: number }>('kardex', { producto: productoId, lote: loteId, limite: 200 }), [productoId, loteId])
  if (k.error) return <Aviso tono="malo">{k.error}</Aviso>
  if (!k.datos) return <p className="fz-tenue">Cargando kardex…</p>
  const TIPO: Record<string, string> = { compra: 'Compra', venta: 'Venta', ajuste: 'Ajuste', merma: 'Merma', traspaso: 'Traspaso', devolucion: 'Devolución' }
  return (
    <section className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
      <h2 className="fz-h2">
        Kardex <span className="fz-tenue fz-chico">({k.datos.total} movimientos · inmutable)</span>
      </h2>
      {k.datos.movimientos.length === 0 && <p className="fz-tenue fz-chico">Sin movimientos.</p>}
      {k.datos.movimientos.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="cl-tabla">
            <thead>
              <tr>
                <th>Cuándo</th>
                <th>Tipo</th>
                {!productoId && <th>Producto</th>}
                <th>Lote</th>
                <th>Cantidad</th>
                <th>Queda</th>
                {verCostos && <th>Costo/u</th>}
                <th>Motivo / referencia</th>
                <th>Quién</th>
              </tr>
            </thead>
            <tbody>
              {k.datos.movimientos.map((m) => (
                <tr key={m.id}>
                  <td className="fz-tenue">{momento(m.creadoEn)}</td>
                  <td>{TIPO[m.tipo] ?? m.tipo}</td>
                  {!productoId && <td>{m.productoNombre}</td>}
                  <td>{m.numeroLote || m.loteFolio}</td>
                  <td className={m.cantidad > 0 ? 'fa-entra' : 'fa-sale'}>
                    {m.cantidad > 0 ? '+' : ''}
                    {cantidad(m.cantidad)} {unidad ?? ''}
                  </td>
                  <td>{cantidad(m.existenciaDespues)}</td>
                  {verCostos && <td>{dinero(m.costoUnidad ?? null, true)}</td>}
                  <td className="fz-chico">
                    {m.motivo ?? ''}
                    {m.referencia ? <span className="fz-tenue"> · {m.referencia}</span> : null}
                  </td>
                  <td className="fz-tenue fz-chico">{m.usuario?.nombre ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/* ═══════════════════════════ modales ═══════════════════════════ */

function ModalPresentacion({ productoId, unidad, existente, onCerrar, alGuardar }: { productoId: number; unidad: string; existente: PresentacionVista | null; onCerrar: () => void; alGuardar: () => void }) {
  const [nombre, setNombre] = useState(existente?.nombre ?? '')
  const [factor, setFactor] = useState(existente ? String(existente.factor) : '1')
  const [precio, setPrecio] = useState(existente ? String(existente.precio) : '')
  const [codigo, setCodigo] = useState(existente?.codigoBarras ?? '')
  const [fraccionada, setFraccionada] = useState(existente?.fraccionada ?? false)
  const [activa, setActiva] = useState(existente?.activa ?? true)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    const cuerpo = { nombre, factor: Number(factor), precio: Number(precio), codigoBarras: codigo || null, fraccionada, activa }
    try {
      if (existente) await api.post(`presentaciones/${existente.id}`, cuerpo)
      else await api.post(`productos/${productoId}/presentaciones`, cuerpo)
      alGuardar()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
    }
    setOcupado(false)
  }
  return (
    <Modal titulo={existente ? 'Editar presentación' : 'Nueva presentación'} onCerrar={onCerrar}>
      <form className="fz-stack fz-stack--chico" onSubmit={(e) => void guardar(e)}>
        <Campo etiqueta="Nombre *" ayuda="«Caja 30 tabletas», «Tableta suelta», «Bolsa 2 kg»">
          <input className="fz-input" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoFocus />
        </Campo>
        <div className="cl-grid cl-grid--2">
          <Campo etiqueta={`Unidades base que contiene (${unidad}) *`}>
            <input className="fz-input" type="number" step="0.001" min={0.001} value={factor} onChange={(e) => setFactor(e.target.value)} required />
          </Campo>
          <Campo etiqueta="Precio de venta (MXN) *">
            <input className="fz-input" type="number" step="0.01" min={0} value={precio} onChange={(e) => setPrecio(e.target.value)} required />
          </Campo>
        </div>
        <Campo etiqueta="Código de barras" ayuda="Escanéalo aquí con el lector USB: escribe el código y da Enter.">
          <input className="fz-input" value={codigo} onChange={(e) => setCodigo(e.target.value)} inputMode="numeric" />
        </Campo>
        <div className="cl-fieldset">
          <Check checked={fraccionada} onChange={setFraccionada}>
            Es venta fraccionada (unidad suelta)
          </Check>
          <Check checked={activa} onChange={setActiva}>
            Activa
          </Check>
        </div>
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

export function ModalAjuste({ producto, lote, onCerrar, alGuardar }: { producto: ProductoConLotes | ProductoVista; lote: LoteVista | null; onCerrar: () => void; alGuardar: (msg: string) => void }) {
  const { catalogo } = useFarmacia()
  const lotes = 'lotes' in producto ? producto.lotes.filter((l) => l.existencia > 0) : []
  const [modo, setModo] = useState<'entrada' | 'salida' | 'merma'>(lote ? 'salida' : 'entrada')
  const [loteId, setLoteId] = useState<string>(lote ? String(lote.id) : lotes[0] ? String(lotes[0].id) : 'nuevo')
  const [numeroLote, setNumeroLote] = useState('')
  const [caducidad, setCaducidad] = useState('')
  const [costo, setCosto] = useState('')
  const [almacenId, setAlmacenId] = useState(String(catalogo.configuracion.almacenPorOmisionId ?? catalogo.almacenes[0]?.id ?? ''))
  const [cant, setCant] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const nuevo = modo === 'entrada' && loteId === 'nuevo'

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault()
    setOcupado(true)
    setError(null)
    const n = Number(cant)
    const cuerpo: Record<string, unknown> = {
      productoId: producto.id,
      tipo: modo === 'merma' ? 'merma' : 'ajuste',
      cantidad: modo === 'entrada' ? Math.abs(n) : -Math.abs(n),
      motivo,
    }
    if (nuevo) cuerpo.lote = { numeroLote, caducidad, costoUnidad: costo === '' ? null : Number(costo), almacenId: almacenId ? Number(almacenId) : undefined }
    else cuerpo.loteId = Number(loteId)
    try {
      const r = await api.post<{ lote: LoteVista; movimiento: MovimientoVista }>('ajustes', cuerpo)
      alGuardar(`Movimiento registrado: lote ${r.lote.numeroLote} queda en ${cantidad(r.lote.existencia, producto.unidadBase)}.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo registrar.')
    }
    setOcupado(false)
  }

  return (
    <Modal titulo={`Entrada, ajuste o merma · ${producto.nombre}`} onCerrar={onCerrar}>
      <form className="fz-stack fz-stack--chico" onSubmit={(e) => void guardar(e)}>
        <div className="fz-seg" role="radiogroup" aria-label="Tipo de movimiento">
          {(
            [
              ['entrada', 'Entrada'],
              ['salida', 'Salida (ajuste)'],
              ['merma', 'Merma'],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" className={modo === v ? 'is-on' : ''} onClick={() => setModo(v)} aria-pressed={modo === v}>
              {l}
            </button>
          ))}
        </div>
        <p className="fz-chico fz-tenue">
          {modo === 'entrada' ? 'Inventario inicial, muestra médica, corrección positiva. Las compras con factura entran por «Compras» (fase 2).' : modo === 'merma' ? 'Producto roto, vencido retirado, derrame. Sale del lote y queda en el kardex con tu nombre.' : 'Corrección negativa por conteo o error de captura. Queda en el kardex con motivo.'}
        </p>
        <Campo etiqueta="Lote *">
          <Select valor={loteId} onChange={setLoteId}>
            {modo === 'entrada' && <option value="nuevo">Lote nuevo…</option>}
            {lotes.map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.numeroLote} · cad. {l.caducidad} · {cantidad(l.existencia)} {producto.unidadBase}
              </option>
            ))}
          </Select>
        </Campo>
        {modo !== 'entrada' && !lotes.length && <Aviso tono="aviso">Este producto no tiene lotes con existencia: no hay de dónde sacar.</Aviso>}
        {nuevo && (
          <>
            <div className="cl-grid cl-grid--2">
              <Campo etiqueta="Número de lote *">
                <input className="fz-input" value={numeroLote} onChange={(e) => setNumeroLote(e.target.value)} required />
              </Campo>
              <Campo etiqueta="Caducidad *">
                <InputFecha valor={caducidad} onChange={setCaducidad} requerido />
              </Campo>
            </div>
            <div className="cl-grid cl-grid--2">
              {catalogo.permisos.verCostos && (
                <Campo etiqueta={`Costo por ${producto.unidadBase} (MXN)`} ayuda="Sin IVA o con IVA según lleve la farmacia sus costos; sé consistente.">
                  <input className="fz-input" type="number" step="0.01" min={0} value={costo} onChange={(e) => setCosto(e.target.value)} />
                </Campo>
              )}
              <Campo etiqueta="Almacén">
                <Select valor={almacenId} onChange={setAlmacenId}>
                  {catalogo.almacenes.filter((a) => a.activo).map((a) => (
                    <option key={a.id} value={String(a.id)}>
                      {a.nombre}
                    </option>
                  ))}
                  {!catalogo.almacenes.length && <option value="">Se creará «Farmacia»</option>}
                </Select>
              </Campo>
            </div>
            {caducidad && caducidad < hoyISO() && <Aviso tono="aviso">Esa caducidad ya pasó: el lote entra bloqueado para venta.</Aviso>}
          </>
        )}
        <div className="cl-grid cl-grid--2">
          <Campo etiqueta={`Cantidad (${producto.unidadBase}) *`}>
            <input className="fz-input" type="number" step="0.001" min={0.001} value={cant} onChange={(e) => setCant(e.target.value)} required autoFocus={!nuevo} />
          </Campo>
          <Campo etiqueta="Motivo *">
            <input className="fz-input" value={motivo} onChange={(e) => setMotivo(e.target.value)} required minLength={3} placeholder={modo === 'entrada' ? 'Inventario inicial' : modo === 'merma' ? 'Frasco roto' : 'Conteo físico'} />
          </Campo>
        </div>
        <ErrorForm error={error} />
        <div className="fz-acciones-fin">
          <Boton onClick={onCerrar}>Cancelar</Boton>
          <button type="submit" className="fz-btn fz-btn--navy" disabled={ocupado || (modo !== 'entrada' && !lotes.length)}>
            {ocupado ? 'Registrando…' : 'Registrar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
