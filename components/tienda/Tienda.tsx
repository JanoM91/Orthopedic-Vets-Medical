'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useEffect, useMemo, useState } from 'react'

import type { ClaveIcono } from '../../lib/iconosServicio'
import type { CotizacionEnvio, Linea, PedidoVista, ProductoTienda, SesionTienda, SugerenciaIA } from '../../lib/farmacia/tiposTienda'
import { ESTADO_PEDIDO_LABEL, LINEAS_TIENDA } from '../../lib/farmacia/tiposTienda'
import { IconoServicio } from '../IconoServicio'
import { Avatar, Icono } from '../portal/comun'
import { api, consultaPerfil, type PerfilGuardado, perfilParaApi, pesos, tienda, useTienda } from './estado'

/* ═══════════════════════════════════════════════════════════════════════════
   Tienda en línea (Farmacia, fase 5a). Componentes de cliente: catálogo con
   «¿Para quién compras?», ficha, carrito con pedido, seguimiento y pago de
   prueba. Todo lo que importa (precio, existencia, receta, compatibilidad)
   lo vuelve a revisar el servidor.
   ═══════════════════════════════════════════════════════════════════════════ */

const LINEAS = LINEAS_TIENDA
const NOMBRE_LINEA = Object.fromEntries(LINEAS.map((l) => [l.clave, l.nombre])) as Record<Linea, string>
const ICONO_LINEA = Object.fromEntries(LINEAS.map((l) => [l.clave, l.icono])) as Record<Linea, ClaveIcono>

const ESPECIES: [string, string][] = [
  ['perro', 'Perro'],
  ['gato', 'Gato'],
  ['ave', 'Ave'],
  ['conejo', 'Conejo'],
  ['roedor', 'Roedor'],
  ['reptil', 'Reptil'],
]

/* ───────────────────────────── carrito en la cabecera ───────────────────────────── */

export function BotonCarrito() {
  const { carrito } = useTienda()
  const n = carrito.reduce((a, r) => a + (r.fraccionada ? 1 : r.cantidad), 0)
  return (
    <Link href="/tienda/carrito" className="ti-carrito-btn" aria-label={`Carrito: ${n} producto${n === 1 ? '' : 's'}`}>
      <Icono n="carrito" />
      {n > 0 && <span className="ti-carrito-btn__n">{n > 99 ? '99+' : n}</span>}
    </Link>
  )
}

/* ───────────────────────────── ¿para quién compras? ───────────────────────────── */

export function ParaQuien({ sesion }: { sesion: SesionTienda }) {
  const { perfil } = useTienda()
  const [abierto, setAbierto] = useState(false)
  const [especie, setEspecie] = useState('perro')
  const [peso, setPeso] = useState('')
  const elegir = (p: PerfilGuardado) => {
    tienda.perfil(p)
    setAbierto(false)
  }
  const esMascota = (id: number) => Boolean(perfil && 'mascotaId' in perfil && perfil.mascotaId === id)
  const rapido = perfil && !('mascotaId' in perfil)
  return (
    <section className="ti-para" aria-label="¿Para quién compras?">
      <div className="ti-para__fila">
        <span className="ti-para__lbl">Para</span>
        <div className="ti-para__chips">
          {sesion.mascotas.map((m) => (
            <button key={m.id} type="button" className={`ti-chip${esMascota(m.id) ? ' is-on' : ''}`} aria-pressed={esMascota(m.id)} onClick={() => elegir(esMascota(m.id) ? null : { mascotaId: m.id, etiqueta: m.nombre })}>
              <Avatar nombre={m.nombre} especie={m.especie} foto={m.foto} />
              {m.nombre}
              {m.pesoKg ? <small>· {m.pesoKg} kg</small> : null}
            </button>
          ))}
          <button type="button" className={`ti-chip ti-chip--otra${rapido ? ' is-on' : ''}`} aria-pressed={Boolean(rapido)} aria-expanded={abierto} onClick={() => setAbierto((x) => !x)}>
            <span className="ti-chip__i">
              <Icono n="paw" />
            </span>
            {rapido ? perfil.etiqueta : sesion.mascotas.length ? 'Otra mascota' : 'Elegir especie y peso'}
          </button>
          {perfil && (
            <button type="button" className="ti-chip ti-chip--quitar" onClick={() => elegir(null)} aria-label="Quitar: ver todo sin filtrar">
              <Icono n="x" />
            </button>
          )}
        </div>
      </div>
      {abierto && (
        <form
          className="ti-quien__form pt-card"
          onSubmit={(e) => {
            e.preventDefault()
            const kg = Number(peso.replace(',', '.'))
            const nombre = ESPECIES.find((x) => x[0] === especie)?.[1] ?? especie
            elegir({ especie, pesoKg: kg > 0 ? kg : null, etiqueta: kg > 0 ? `${nombre} · ${kg} kg` : nombre })
          }}
        >
          <label className="pt-campo">
            <span>Especie</span>
            <select className="pt-input" value={especie} onChange={(e) => setEspecie(e.target.value)}>
              {ESPECIES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="pt-campo">
            <span>Peso aproximado (kg)</span>
            <input className="pt-input" inputMode="decimal" placeholder="Ej. 12" value={peso} onChange={(e) => setPeso(e.target.value)} />
          </label>
          <button className="pt-btn pt-btn--acento" type="submit">
            Listo
          </button>
        </form>
      )}
      {!perfil && !abierto && <p className="pt-chico pt-tenue">Elige para quién y te mostramos primero lo que le queda.</p>}
    </section>
  )
}

/* ───────────────────────────── tarjeta de producto ───────────────────────────── */

function ImagenProducto({ p, grande }: { p: Pick<ProductoTienda, 'imagenUrl' | 'linea' | 'nombre'>; grande?: boolean }) {
  return (
    <div className={`ti-img${grande ? ' ti-img--grande' : ''} ti-img--${p.linea}`}>
      {p.imagenUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.imagenUrl} alt="" loading="lazy" />
      ) : (
        <IconoServicio clave={ICONO_LINEA[p.linea] ?? 'patita'} tamano={grande ? 64 : 40} />
      )}
    </div>
  )
}

/** ¿Puede este comprador pedir este producto con receta? */
function permisoReceta(p: Pick<ProductoTienda, 'id' | 'requiereReceta'>, sesion: SesionTienda, perfil: PerfilGuardado): { ok: boolean; motivo: string | null } {
  if (!p.requiereReceta) return { ok: true, motivo: null }
  if (!sesion.tutor) return { ok: false, motivo: 'Requiere receta: entra con tu cuenta del portal.' }
  if (!sesion.vinculado) return { ok: false, motivo: 'Requiere receta: vincula tu cuenta con la clínica.' }
  if (!perfil || !('mascotaId' in perfil)) return { ok: false, motivo: 'Requiere receta: elige arriba para cuál de tus mascotas es.' }
  const cubre = sesion.recetas.some((r) => r.mascotaId === perfil.mascotaId && r.productos.some((x) => x.productoId === p.id && x.surtidosRestantes > 0))
  return cubre ? { ok: true, motivo: null } : { ok: false, motivo: `Requiere una receta vigente de ${perfil.etiqueta}. Pídela en consulta.` }
}

/** Etiqueta sobre la imagen: lo más importante para decidir (no apto, receta, aptitud, existencia). */
function EtiquetaTarjeta({ p, perfil, receta, disponibles }: { p: ProductoTienda; perfil: PerfilGuardado; receta: { ok: boolean }; disponibles: number }) {
  if (!disponibles) return <span className="pt-pill pt-pill--gris ti-prod__tag">Agotado</span>
  if (p.apto?.estado === 'no_apto') return <span className="pt-pill pt-pill--warn ti-prod__tag">No es para {perfil?.etiqueta}</span>
  if (p.requiereReceta) return <span className="pt-pill pt-pill--info ti-prod__tag">{receta.ok ? 'Tu receta' : 'Con receta'}</span>
  if (p.apto && perfil) {
    if (p.apto.estado === 'apto') return <span className="pt-pill pt-pill--ok ti-prod__tag">Le queda</span>
    if (p.apto.estado === 'confirmar_peso') return <span className="pt-pill pt-pill--warn ti-prod__tag">Confirma su peso</span>
    return <span className="pt-pill pt-pill--info ti-prod__tag">Falta su peso</span>
  }
  if (p.presentaciones.filter((x) => x.disponible).every((x) => x.pocas)) return <span className="pt-pill pt-pill--warn ti-prod__tag">Quedan pocas</span>
  return null
}

function Tarjeta({ p, sesion, perfil }: { p: ProductoTienda; sesion: SesionTienda; perfil: PerfilGuardado }) {
  const disponibles = p.presentaciones.filter((x) => x.disponible)
  const desde = Math.min(...p.presentaciones.map((x) => x.precio))
  const receta = permisoReceta(p, sesion, perfil)
  const [agregado, setAgregado] = useState(false)
  const una = p.presentaciones.length === 1 ? p.presentaciones[0] : null
  const noApto = p.apto?.estado === 'no_apto'
  const rapido = una && una.disponible && receta.ok && !noApto
  return (
    <article className={`ti-prod${noApto ? ' is-no-apto' : ''}`}>
      <Link href={`/tienda/producto/${p.id}`} className="ti-prod__liga">
        <ImagenProducto p={p} />
        <EtiquetaTarjeta p={p} perfil={perfil} receta={receta} disponibles={disponibles.length} />
        <div className="ti-prod__txt">
          <b className="ti-prod__nombre">{p.nombre}</b>
          <span className="ti-prod__pres">{una ? una.nombre : `${p.presentaciones.length} presentaciones`}</span>
        </div>
      </Link>
      <div className="ti-prod__pie">
        <b className="ti-precio">
          {una ? '' : <small>desde </small>}
          {pesos(desde)}
        </b>
        {rapido ? (
          <button
            type="button"
            className={`ti-mas${agregado ? ' is-ok' : ''}`}
            aria-label={agregado ? `${p.nombre}: agregado` : `Agregar ${p.nombre} al carrito`}
            onClick={() => {
              tienda.agregar({ presentacionId: una.id, productoId: p.id, producto: p.nombre, presentacion: una.nombre, precio: una.precio, fraccionada: una.fraccionada, requiereReceta: p.requiereReceta, imagenUrl: p.imagenUrl })
              setAgregado(true)
              window.setTimeout(() => setAgregado(false), 1600)
            }}
          >
            <Icono n={agregado ? 'check' : 'mas'} />
          </button>
        ) : (
          <Link href={`/tienda/producto/${p.id}`} className="ti-mas ti-mas--ver" aria-label={`Ver ${p.nombre}`}>
            <Icono n="next" />
          </Link>
        )}
      </div>
      {!receta.ok && <p className="ti-prod__nota">{receta.motivo}</p>}
    </article>
  )
}

/* ───────────────────────────── asistente (búsqueda con IA, fase 5b) ───────────────────────────── */

function IconoChispa() {
  return (
    <svg className="pt-i ti-chispa" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
    </svg>
  )
}

function Asistente({ sesion, perfil }: { sesion: SesionTienda; perfil: PerfilGuardado }) {
  const [texto, setTexto] = useState('')
  const [res, setRes] = useState<SugerenciaIA | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const preguntar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (texto.trim().length < 3) return
    setCargando(true)
    setError(null)
    try {
      setRes(await api<SugerenciaIA>('sugerir', { method: 'POST', body: JSON.stringify({ texto, perfil: perfilParaApi(perfil) }) }))
    } catch (err) {
      setError((err as Error).message)
    }
    setCargando(false)
  }
  return (
    <section className="ti-asistente" aria-label="Asistente de la farmacia">
      <div className="ti-asistente__cab">
        <IconoChispa />
        <b>¿Qué necesita {perfil && 'mascotaId' in perfil ? perfil.etiqueta : 'tu mascota'}?</b>
      </div>
      <form className="ti-asistente__fila" onSubmit={preguntar}>
        <input className="pt-input" value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={300} placeholder="Ej. se rasca mucho las orejas" aria-label="Qué necesita tu mascota" />
        <button className="ti-asistente__ir" type="submit" disabled={cargando || texto.trim().length < 3} aria-label="Buscar sugerencias">
          {cargando ? <span className="pt-giro" aria-hidden="true" /> : <Icono n="next" />}
        </button>
      </form>
      <p>Te sugerimos productos sin receta. Si suena serio, te proponemos una cita. No sustituye a tu veterinario.</p>
      {error && <div className="pt-aviso pt-aviso--bad">{error}</div>}
      {res && (
        <div className="ti-respuesta">
          {res.veterinario && (
            <div className="pt-aviso pt-aviso--warn">
              {res.motivoVeterinario} <Link href="/portal/citas/nueva">Pedir cita</Link>
            </div>
          )}
          <p className="ti-respuesta__txt">{res.explicacion}</p>
          {res.productos.length > 0 && (
            <div className="ti-rejilla">
              {res.productos.map((p) => (
                <Tarjeta key={p.id} p={p} sesion={sesion} perfil={perfil} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/* ───────────────────────────── catálogo ───────────────────────────── */

type Resultado = { clave: string; productos: ProductoTienda[]; error: string | null }

export function Catalogo({ sesion, lineaInicial, qInicial, para }: { sesion: SesionTienda; lineaInicial: Linea | null; qInicial: string; para?: number | null }) {
  const { perfil } = useTienda()
  /* ?para=<mascota> (desde «Surtir» en el portal): esa mascota queda elegida. */
  useEffect(() => {
    const m = para ? sesion.mascotas.find((x) => x.id === para) : null
    if (m) tienda.perfil({ mascotaId: m.id, etiqueta: m.nombre })
  }, [para, sesion.mascotas])
  const [texto, setTexto] = useState(qInicial)
  const [q, setQ] = useState(qInicial)
  const [linea, setLinea] = useState<Linea | null>(lineaInicial)
  const [res, setRes] = useState<Resultado | null>(null)

  useEffect(() => {
    const h = window.setTimeout(() => setQ(texto.trim()), 300)
    return () => window.clearTimeout(h)
  }, [texto])

  const consulta = [q ? `q=${encodeURIComponent(q)}` : '', linea ? `linea=${linea}` : '', consultaPerfil(perfil)].filter(Boolean).join('&')
  useEffect(() => {
    let vivo = true
    api<{ productos: ProductoTienda[] }>(`catalogo${consulta ? `?${consulta}` : ''}`)
      .then((d) => vivo && setRes({ clave: consulta, productos: d.productos, error: null }))
      .catch((e: Error) => vivo && setRes({ clave: consulta, productos: [], error: e.message }))
    /* La URL refleja lo buscado (compartible) sin recargar. */
    const u = new URL(window.location.href)
    u.searchParams.delete('q')
    u.searchParams.delete('linea')
    u.searchParams.delete('para')
    if (q) u.searchParams.set('q', q)
    if (linea) u.searchParams.set('linea', linea)
    window.history.replaceState(null, '', u.toString())
    return () => {
      vivo = false
    }
  }, [consulta, q, linea])

  const cargando = !res || res.clave !== consulta
  const productos = res?.productos ?? []
  return (
    <div className="ti-catalogo">
      <ParaQuien sesion={sesion} />
      {sesion.busquedaIA && <Asistente sesion={sesion} perfil={perfil} />}
      <label className="ti-buscar">
        <Icono n="buscar" />
        <span className="pt-sr">Buscar</span>
        <input className="pt-input" type="search" placeholder="Busca por nombre, sustancia o marca" value={texto} onChange={(e) => setTexto(e.target.value)} enterKeyHint="search" />
      </label>
      <div className="ti-lineas" role="group" aria-label="Secciones">
        <button type="button" className={`ti-linea${!linea ? ' is-on' : ''}`} onClick={() => setLinea(null)} aria-pressed={!linea}>
          <span className="ti-linea__i">
            <IconoServicio clave="patita" tamano={22} />
          </span>
          Todo
        </button>
        {LINEAS.map((l) => (
          <button key={l.clave} type="button" className={`ti-linea${linea === l.clave ? ' is-on' : ''}`} onClick={() => setLinea(linea === l.clave ? null : l.clave)} aria-pressed={linea === l.clave}>
            <span className="ti-linea__i">
              <IconoServicio clave={l.icono} tamano={22} />
            </span>
            {l.nombre}
          </button>
        ))}
      </div>
      {res?.error && <div className="pt-aviso pt-aviso--bad">{res.error}</div>}
      <div className={`ti-rejilla${cargando ? ' is-cargando' : ''}`} aria-busy={cargando}>
        {productos.map((p) => (
          <Tarjeta key={p.id} p={p} sesion={sesion} perfil={perfil} />
        ))}
      </div>
      {!cargando && !productos.length && !res?.error && (
        <div className="pt-card ti-vacio">
          <b>{q ? `No encontramos «${q}».` : 'Por ahora no hay productos en esta sección.'}</b>
          <p className="pt-chico pt-tenue">Prueba con otra palabra o pregúntanos por WhatsApp: si lo tenemos en mostrador, te lo apartamos.</p>
        </div>
      )}
    </div>
  )
}

/* ───────────────────────────── ficha ───────────────────────────── */

export function FichaProducto({ id, sesion }: { id: number; sesion: SesionTienda }) {
  const { perfil, carrito } = useTienda()
  const consulta = consultaPerfil(perfil)
  const [res, setRes] = useState<{ clave: string; p: ProductoTienda | null; error: string | null } | null>(null)
  const [elegida, setElegida] = useState<number | null>(null)
  const [cantidad, setCantidad] = useState(1)
  const [agregado, setAgregado] = useState(false)
  useEffect(() => {
    let vivo = true
    api<ProductoTienda>(`producto/${id}${consulta ? `?${consulta}` : ''}`)
      .then((p) => vivo && setRes({ clave: consulta, p, error: null }))
      .catch((e: Error) => vivo && setRes({ clave: consulta, p: null, error: e.message }))
    return () => {
      vivo = false
    }
  }, [id, consulta])
  const p = res?.p ?? null
  if (res?.error) return <div className="pt-aviso pt-aviso--bad">{res.error}</div>
  if (!p) return <div className="pt-card ti-esqueleto" aria-busy="true" />
  const pres = p.presentaciones.find((x) => x.id === elegida) ?? p.presentaciones.find((x) => x.disponible) ?? p.presentaciones[0]
  const receta = permisoReceta(p, sesion, perfil)
  const enCarrito = carrito.find((x) => x.presentacionId === pres.id)
  const noApto = p.apto?.estado === 'no_apto'
  const quien = perfil?.etiqueta
  const disponibleAlgo = p.presentaciones.some((x) => x.disponible)
  return (
    <div className="ti-ficha">
      <ImagenProducto p={p} grande />
      <div className="ti-ficha__cab">
        <span className="ti-prod__linea">{NOMBRE_LINEA[p.linea]}</span>
        <h1>{p.nombre}</h1>
        {(p.principioActivo || p.laboratorio) && <p className="pt-chico pt-tenue">{[p.principioActivo, p.laboratorio].filter(Boolean).join(' · ')}</p>}
        <div className="ti-ficha__precio">
          <b>{pesos(pres.precio)}</b>
          <span className={`pt-pill ${!pres.disponible ? 'pt-pill--gris' : pres.pocas ? 'pt-pill--warn' : 'pt-pill--ok'}`}>{!pres.disponible ? 'Agotado' : pres.pocas ? 'Quedan pocas' : 'Disponible'}</span>
          {p.requiereReceta && <span className="pt-pill pt-pill--info">Con receta</span>}
        </div>
      </div>

      {p.apto && quien && (
        <div className={`ti-apto ti-apto--${p.apto.estado}`}>
          <Icono n={p.apto.estado === 'apto' ? 'check' : 'alerta'} />
          <span>
            <b>{p.apto.estado === 'apto' ? `Le queda a ${quien}` : p.apto.estado === 'no_apto' ? `No es para ${quien}` : p.apto.estado === 'confirmar_peso' ? 'Confirma su peso' : 'Falta su peso'}</b>
            {p.apto.motivos.length > 0 && <> · {p.apto.motivos.join(' ')}</>}
          </span>
        </div>
      )}

      {p.presentaciones.length > 1 && (
        <section className="ti-ficha__bloque">
          <b className="ti-ficha__t">Presentación</b>
          <div className="ti-presentaciones">
            {p.presentaciones.map((x) => (
              <button key={x.id} type="button" className={`ti-pres${x.id === pres.id ? ' is-on' : ''}`} disabled={!x.disponible} aria-pressed={x.id === pres.id} onClick={() => setElegida(x.id)}>
                <span>{x.nombre}</span>
                <b>{pesos(x.precio)}</b>
                <small>{x.disponible ? (x.pocas ? 'Quedan pocas' : 'Disponible') : 'Agotado'}</small>
              </button>
            ))}
          </div>
        </section>
      )}
      {p.presentaciones.length === 1 && <p className="pt-chico pt-tenue">Presentación: {pres.nombre}</p>}

      {p.descripcion && <p className="ti-texto">{p.descripcion}</p>}
      {(p.especies.length > 0 || p.rangoPeso.min != null || p.rangoPeso.max != null) && (
        <section className="pt-card">
          <b>Para quién es</b>
          {p.especies.length > 0 && <p className="pt-chico">Especies: {p.especies.map((e) => ESPECIES.find((x) => x[0] === e)?.[1] ?? e).join(', ')}</p>}
          {(p.rangoPeso.min != null || p.rangoPeso.max != null) && (
            <p className="pt-chico">
              Peso: {p.rangoPeso.max == null ? `desde ${p.rangoPeso.min} kg` : p.rangoPeso.min == null ? `hasta ${p.rangoPeso.max} kg` : `${p.rangoPeso.min} a ${p.rangoPeso.max} kg`}
            </p>
          )}
        </section>
      )}
      <p className="pt-chico pt-tenue">¿Dudas de cómo dárselo? Pregúntale a tu veterinario.</p>

      <div className="pt-resumen ti-comprar">
        {!receta.ok && <p className="pt-chico pt-rojo">{receta.motivo}</p>}
        {enCarrito && (
          <Link href="/tienda/carrito" className="pt-enlace">
            Tienes {enCarrito.cantidad} en el carrito · Ir al carrito
          </Link>
        )}
        <div className="pt-resumen__fila">
          <Cantidad valor={cantidad} onCambio={setCantidad} />
          <button
            type="button"
            className={`pt-btn ti-comprar__btn ${agregado ? 'pt-btn--primario' : 'pt-btn--acento'}`}
            disabled={!pres.disponible || !receta.ok || noApto}
            onClick={() => {
              tienda.agregar({ presentacionId: pres.id, productoId: p.id, producto: p.nombre, presentacion: pres.nombre, precio: pres.precio, fraccionada: pres.fraccionada, requiereReceta: p.requiereReceta, imagenUrl: p.imagenUrl }, cantidad)
              setAgregado(true)
              window.setTimeout(() => setAgregado(false), 1600)
            }}
          >
            <Icono n={agregado ? 'check' : 'carrito'} /> {agregado ? 'Agregado' : !disponibleAlgo ? 'Agotado' : 'Agregar'}
            {!agregado && disponibleAlgo && receta.ok && !noApto && <span className="ti-comprar__precio"> · {pesos(pres.precio * cantidad)}</span>}
          </button>
        </div>
      </div>
    </div>
  )
}

function Cantidad({ valor, onCambio, min = 1 }: { valor: number; onCambio: (n: number) => void; min?: number }) {
  return (
    <div className="ti-cantidad" role="group" aria-label="Cantidad">
      <button type="button" onClick={() => onCambio(Math.max(min - 1, valor - 1))} aria-label="Uno menos" disabled={valor <= min && min > 0}>
        <Icono n="menos" />
      </button>
      <span aria-live="polite">{valor}</span>
      <button type="button" onClick={() => onCambio(Math.min(100, valor + 1))} aria-label="Uno más">
        <Icono n="mas" />
      </button>
    </div>
  )
}

/* ───────────────────────────── carrito y pedido ───────────────────────────── */

const nuevaClave = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`)

export function Carrito({ sesion }: { sesion: SesionTienda }) {
  const router = useRouter()
  const { carrito, perfil } = useTienda()
  const [clave, setClave] = useState(nuevaClave)
  const [contacto, setContacto] = useState({ nombre: sesion.tutor?.nombre ?? '', correo: sesion.tutor?.correo ?? '', telefono: sesion.tutor?.telefono ?? '' })
  const [pago, setPago] = useState<'al_recoger' | 'en_linea' | 'al_recibir'>(sesion.pagarAlRecoger ? 'al_recoger' : 'en_linea')
  const [entrega, setEntrega] = useState<'recoger' | 'domicilio'>('recoger')
  const [dir, setDir] = useState({ calle: '', colonia: '', codigoPostal: '', referencias: '' })
  const [cot, setCot] = useState<{ cp: string; subtotal: number; c: CotizacionEnvio } | null>(null)
  const [notas, setNotas] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const subtotal = carrito.reduce((a, r) => a + Math.round(r.precio * 100 * r.cantidad), 0) / 100
  const conReceta = carrito.some((r) => r.requiereReceta)
  const domicilioPosible = sesion.domicilio.activo && (!conReceta || sesion.domicilio.grupoII)
  const aDomicilio = entrega === 'domicilio' && domicilioPosible
  /* Formas de pago según la entrega: recoger → al recoger o en línea; domicilio → al recibir o en línea. */
  const formas: ('al_recoger' | 'en_linea' | 'al_recibir')[] = [...(aDomicilio ? (sesion.domicilio.pagarAlRecibir ? ['al_recibir' as const] : []) : sesion.pagarAlRecoger ? ['al_recoger' as const] : []), ...(sesion.pagoEnLinea.disponible ? ['en_linea' as const] : [])]
  const formaPago = formas.includes(pago) ? pago : (formas[0] ?? pago)
  const sinOpcionPago = formas.length === 0
  const cp = dir.codigoPostal.replace(/\D/g, '')
  /* Cotización del envío al escribir el código postal (y si cambia el subtotal). */
  useEffect(() => {
    if (!aDomicilio || cp.length !== 5) return
    let vivo = true
    const h = window.setTimeout(() => {
      api<CotizacionEnvio>(`envio?cp=${cp}&subtotal=${subtotal}`)
        .then((c) => vivo && setCot({ cp, subtotal, c }))
        .catch(() => undefined)
    }, 250)
    return () => {
      vivo = false
      window.clearTimeout(h)
    }
  }, [aDomicilio, cp, subtotal])
  const cotVigente = aDomicilio && cot && cot.cp === cp && cot.subtotal === subtotal ? cot.c : null
  const envio = cotVigente?.cubre ? cotVigente.envio : 0
  const total = Math.round((subtotal + (aDomicilio ? envio : 0)) * 100) / 100
  const bloqueoDomicilio = aDomicilio && (!cotVigente || !cotVigente.cubre || (cotVigente.pedidoMinimo > 0 && subtotal < cotVigente.pedidoMinimo))

  const pedir = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true)
    setError(null)
    try {
      const r = await api<{ pedido: PedidoVista; urlPago: string | null }>('pedidos', {
        method: 'POST',
        body: JSON.stringify({
          clave,
          renglones: carrito.map((x) => ({ presentacionId: x.presentacionId, cantidad: x.cantidad })),
          perfil: perfilParaApi(perfil),
          contacto: { nombre: contacto.nombre, correo: contacto.correo, telefono: contacto.telefono || null },
          entrega: aDomicilio ? 'domicilio' : 'recoger',
          direccion: aDomicilio ? { calle: dir.calle, colonia: dir.colonia || null, codigoPostal: cp, referencias: dir.referencias || null } : null,
          pago: formaPago,
          notas: notas || null,
        }),
      })
      tienda.pedidoHecho({ folio: r.pedido.folio, token: r.pedido.token ?? '', fecha: r.pedido.creadoEn, total: r.pedido.total })
      if (r.urlPago) window.location.assign(r.urlPago)
      else router.push(`/tienda/pedido/${r.pedido.folio}?t=${encodeURIComponent(r.pedido.token ?? '')}&nuevo=1`)
    } catch (err) {
      setError((err as Error).message)
      /* Si el pedido no se creó, la próxima vez va con otra clave (por si cambió el carrito). */
      setClave(nuevaClave())
      setEnviando(false)
    }
  }

  if (!carrito.length)
    return (
      <div className="pt-card ti-vacio">
        <b>Tu carrito está vacío.</b>
        <p className="pt-chico pt-tenue">Agrega productos desde la tienda.</p>
        <Link href="/tienda" className="pt-btn pt-btn--acento">
          Ir a la tienda
        </Link>
      </div>
    )

  return (
    <form className="ti-checkout" onSubmit={pedir}>
      <section className="pt-card pt-lista">
        {carrito.map((r) => (
          <div key={r.presentacionId} className="ti-renglon">
            <div className="ti-renglon__txt">
              <b>{r.producto}</b>
              <span className="pt-chico pt-tenue">
                {r.presentacion} · {pesos(r.precio)}
                {r.requiereReceta ? ' · con receta' : ''}
              </span>
            </div>
            <Cantidad valor={r.cantidad} min={0} onCambio={(n) => tienda.cantidad(r.presentacionId, n)} />
            <b className="ti-renglon__imp">{pesos(r.precio * r.cantidad)}</b>
          </div>
        ))}
        {aDomicilio && (
          <div className="ti-total ti-total--envio">
            <span>Envío{cotVigente?.zona ? ` · ${cotVigente.zona}` : ''}</span>
            <b>{cotVigente?.cubre ? (envio ? pesos(envio) : 'Gratis') : '—'}</b>
          </div>
        )}
        <div className="ti-total">
          <span>Total</span>
          <b>{pesos(total)}</b>
        </div>
      </section>

      <section className="pt-card">
        <b>Para quién</b>
        <p className="pt-chico">{perfil ? perfil.etiqueta : 'Sin especificar'}</p>
        {conReceta && (!perfil || !('mascotaId' in perfil)) && <p className="pt-chico pt-rojo">Hay productos con receta: elige en la tienda para cuál de tus mascotas son.</p>}
        <Link href="/tienda" className="pt-enlace">
          Cambiar o seguir comprando
        </Link>
      </section>

      {!sesion.tutor && (
        <section className="pt-card">
          <b>Tus datos</b>
          <p className="pt-chico pt-tenue">
            Para avisarte cuando esté listo. ¿Tienes cuenta? <Link href="/portal/entrar?siguiente=/tienda/carrito">Entra</Link>.
          </p>
          <label className="pt-campo">
            <span>Nombre</span>
            <input className="pt-input" required autoComplete="name" value={contacto.nombre} onChange={(e) => setContacto({ ...contacto, nombre: e.target.value })} />
          </label>
          <label className="pt-campo">
            <span>Correo</span>
            <input className="pt-input" type="email" required autoComplete="email" value={contacto.correo} onChange={(e) => setContacto({ ...contacto, correo: e.target.value })} />
          </label>
          <label className="pt-campo">
            <span>Teléfono {aDomicilio ? '' : '(opcional)'}</span>
            <input className="pt-input" type="tel" autoComplete="tel" inputMode="tel" required={aDomicilio} value={contacto.telefono} onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })} />
          </label>
        </section>
      )}

      <section className="pt-card">
        <b>¿Cómo lo quieres?</b>
        <div className={`ti-opciones${sesion.domicilio.activo ? ' ti-opciones--dos' : ''}`}>
          <label className={`ti-opcion${!aDomicilio ? ' is-on' : ''}`}>
            <input type="radio" name="entrega" checked={!aDomicilio} onChange={() => setEntrega('recoger')} />
            <span>
              <b>Recoger</b>
              <small>En la farmacia. Te lo apartamos {sesion.horasApartado} h si pagas al recoger.</small>
            </span>
          </label>
          {sesion.domicilio.activo && (
            <label className={`ti-opcion${aDomicilio ? ' is-on' : ''}${domicilioPosible ? '' : ' is-off'}`}>
              <input type="radio" name="entrega" checked={aDomicilio} disabled={!domicilioPosible} onChange={() => setEntrega('domicilio')} />
              <span>
                <b>A domicilio</b>
                <small>{domicilioPosible ? (sesion.domicilio.horario ?? 'Te lo llevamos en la zona de entrega.') : 'Los productos con receta se recogen en la farmacia.'}</small>
              </span>
            </label>
          )}
        </div>
        {aDomicilio && (
          <div className="ti-direccion">
            <label className="pt-campo">
              <span>Calle y número</span>
              <input className="pt-input" required autoComplete="street-address" value={dir.calle} onChange={(e) => setDir({ ...dir, calle: e.target.value })} />
            </label>
            <div className="ti-direccion__fila">
              <label className="pt-campo">
                <span>Código postal</span>
                <input className="pt-input" required inputMode="numeric" autoComplete="postal-code" maxLength={5} value={dir.codigoPostal} onChange={(e) => setDir({ ...dir, codigoPostal: e.target.value.replace(/\D/g, '').slice(0, 5) })} />
              </label>
              <label className="pt-campo">
                <span>Colonia</span>
                <input className="pt-input" value={dir.colonia} onChange={(e) => setDir({ ...dir, colonia: e.target.value })} />
              </label>
            </div>
            <label className="pt-campo">
              <span>Referencias (opcional)</span>
              <input className="pt-input" value={dir.referencias} onChange={(e) => setDir({ ...dir, referencias: e.target.value })} placeholder="Ej. portón verde, entre dos calles" />
            </label>
            {cp.length === 5 && cotVigente?.mensaje && (
              <div className={`ti-zona${cotVigente.cubre && !(cotVigente.pedidoMinimo > 0 && subtotal < cotVigente.pedidoMinimo) ? '' : ' is-no'}`} role="status">
                <Icono n={cotVigente.cubre ? 'camion' : 'alerta'} />
                <span>
                  {cotVigente.zona && <b>{cotVigente.zona} · </b>}
                  {cotVigente.mensaje}
                </span>
              </div>
            )}
            {sesion.tutor && !contacto.telefono && (
              <label className="pt-campo">
                <span>Teléfono para el repartidor</span>
                <input className="pt-input" type="tel" required inputMode="tel" value={contacto.telefono} onChange={(e) => setContacto({ ...contacto, telefono: e.target.value })} />
              </label>
            )}
          </div>
        )}
      </section>

      <section className="pt-card">
        <b>¿Cómo pagas?</b>
        <div className={`ti-opciones${formas.length === 2 ? ' ti-opciones--dos' : ''}`}>
          {formas.includes('al_recibir') && (
            <label className={`ti-opcion${formaPago === 'al_recibir' ? ' is-on' : ''}`}>
              <input type="radio" name="pago" checked={formaPago === 'al_recibir'} onChange={() => setPago('al_recibir')} />
              <span>
                <b>Pagar al recibir</b>
                <small>Le pagas al repartidor.</small>
              </span>
            </label>
          )}
          {formas.includes('al_recoger') && (
            <label className={`ti-opcion${formaPago === 'al_recoger' ? ' is-on' : ''}`}>
              <input type="radio" name="pago" checked={formaPago === 'al_recoger'} onChange={() => setPago('al_recoger')} />
              <span>
                <b>Pagar al recoger</b>
                <small>Efectivo, tarjeta o transferencia en mostrador.</small>
              </span>
            </label>
          )}
          {sesion.pagoEnLinea.disponible && (
            <label className={`ti-opcion${formaPago === 'en_linea' ? ' is-on' : ''}`}>
              <input type="radio" name="pago" checked={formaPago === 'en_linea'} onChange={() => setPago('en_linea')} />
              <span>
                <b>Pagar en línea{sesion.pagoEnLinea.proveedor === 'prueba' ? ' (modo prueba)' : ''}</b>
                <small>Lo dejamos listo apenas se confirme el pago.</small>
              </span>
            </label>
          )}
          {sinOpcionPago && <p className="pt-chico pt-rojo">La tienda no tiene formas de pago activas. Llámanos o escríbenos.</p>}
        </div>
        <label className="pt-campo">
          <span>Notas (opcional)</span>
          <textarea className="pt-input" rows={2} maxLength={400} value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Ej. paso después de las 6" />
        </label>
      </section>

      {error && (
        <div className="pt-aviso pt-aviso--bad" role="alert">
          {error}
        </div>
      )}
      <div className="pt-resumen ti-resumen">
        {aDomicilio && (
          <div className="ti-resumen__lineas">
            <span>Productos</span>
            <span>{pesos(subtotal)}</span>
            <span>Envío</span>
            <span className={cotVigente?.cubre && !envio ? 'ti-gratis' : undefined}>{cotVigente?.cubre ? (envio ? pesos(envio) : 'Gratis') : '—'}</span>
          </div>
        )}
        <div className="pt-resumen__fila">
          <div className="pt-resumen__texto">
            <b>{pesos(total)}</b>
            <span>
              {formaPago === 'en_linea' ? 'Pagas en línea' : formaPago === 'al_recibir' ? 'Pagas al recibir' : 'Pagas al recoger'} · {aDomicilio ? 'a domicilio' : 'recoger en farmacia'}
            </span>
          </div>
          <button className="pt-btn pt-btn--acento" type="submit" disabled={enviando || sinOpcionPago || bloqueoDomicilio}>
            {enviando ? 'Enviando…' : formaPago === 'en_linea' ? 'Ir a pagar' : 'Hacer pedido'}
          </button>
        </div>
      </div>
    </form>
  )
}

/* ───────────────────────────── seguimiento ───────────────────────────── */

const PASOS: { estados: string[]; nombre: string }[] = [
  { estados: ['pago_pendiente', 'creado'], nombre: 'Recibido' },
  { estados: ['pagado', 'receta_por_validar'], nombre: 'Confirmado' },
  { estados: ['preparando'], nombre: 'Preparando' },
  { estados: ['listo_para_recoger', 'en_ruta'], nombre: 'Listo' },
  { estados: ['entregado'], nombre: 'Entregado' },
]
const PASOS_DOMICILIO: { estados: string[]; nombre: string }[] = [
  { estados: ['pago_pendiente', 'creado', 'pagado', 'receta_por_validar'], nombre: 'Recibido' },
  { estados: ['preparando', 'listo_para_recoger'], nombre: 'Preparando' },
  { estados: ['en_ruta'], nombre: 'En camino' },
  { estados: ['entregado'], nombre: 'Entregado' },
]

const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-MX', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

export function Seguimiento({ folio, token, recienPagado, nuevo }: { folio: string; token: string; recienPagado: boolean; nuevo: boolean }) {
  const [res, setRes] = useState<{ n: number; p: (PedidoVista & { pagoEnLinea: boolean }) | null; error: string | null } | null>(null)
  const [vuelta, setVuelta] = useState(0)
  const [accion, setAccion] = useState<'pagar' | 'cancelar' | null>(null)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    api<PedidoVista & { pagoEnLinea: boolean }>(`pedidos/${folio}?t=${encodeURIComponent(token)}`)
      .then((p) => vivo && setRes({ n: vuelta, p, error: null }))
      .catch((e: Error) => vivo && setRes({ n: vuelta, p: null, error: e.message }))
    return () => {
      vivo = false
    }
  }, [folio, token, vuelta])
  /* Al volver de pagar, el aviso de la pasarela puede tardar unos segundos: se consulta de nuevo (hasta ~30 s). */
  const p = res?.p ?? null
  const esperandoPago = recienPagado && p?.pago.forma === 'en_linea' && p.pago.estado !== 'pagado' && p.estado === 'pago_pendiente'
  useEffect(() => {
    if (!esperandoPago || vuelta >= 10) return
    const h = window.setTimeout(() => setVuelta((v) => v + 1), 3000)
    return () => window.clearTimeout(h)
  }, [esperandoPago, vuelta])

  if (res?.error) return <div className="pt-aviso pt-aviso--bad">{res.error}</div>
  if (!p) return <div className="pt-card ti-esqueleto" aria-busy="true" />
  const pasos = p.entrega === 'domicilio' ? PASOS_DOMICILIO : PASOS
  const idx = pasos.findIndex((x) => x.estados.includes(p.estado))
  const cerrado = ['cancelado', 'expirado'].includes(p.estado)
  const puedePagar = !cerrado && p.pagoEnLinea && p.pago.estado !== 'pagado' && ['pago_pendiente', 'creado'].includes(p.estado)
  const puedeCancelar = !cerrado && p.pago.estado !== 'pagado' && ['pago_pendiente', 'creado'].includes(p.estado)

  const hacer = async (que: 'pagar' | 'cancelar') => {
    setAccion(que)
    setError(null)
    try {
      if (que === 'pagar') {
        const r = await api<{ url: string }>(`pedidos/${folio}/pagar`, { method: 'POST', body: JSON.stringify({ t: token }) })
        window.location.assign(r.url)
        return
      }
      await api(`pedidos/${folio}/cancelar`, { method: 'POST', body: JSON.stringify({ t: token }) })
      setConfirmarCancelar(false)
      setVuelta((v) => v + 1)
    } catch (e) {
      setError((e as Error).message)
    }
    setAccion(null)
  }

  /* Hora de cada paso: la primera vez que el pedido entró a uno de sus estados. */
  const horaPaso = (estados: string[]) => {
    const h = p.historial.find((x) => estados.includes(x.estado))
    return h ? fechaHora(h.fecha) : null
  }
  const frase =
    p.estado === 'pago_pendiente' ? 'Falta el pago' :
    p.estado === 'receta_por_validar' ? 'Estamos revisando la receta' :
    p.estado === 'preparando' ? 'Estamos preparando tu pedido' :
    p.estado === 'listo_para_recoger' ? (p.entrega === 'domicilio' ? 'Listo para salir' : 'Listo para recoger') :
    p.estado === 'en_ruta' ? 'Va en camino' :
    p.estado === 'entregado' ? (p.entrega === 'domicilio' ? '¡Listo! Ya lo tienes' : '¡Listo! Ya lo recogiste') :
    p.estado === 'cancelado' ? 'Pedido cancelado' :
    p.estado === 'expirado' ? 'El apartado venció' :
    'Recibimos tu pedido'
  const porPagar = !cerrado && p.pago.estado !== 'pagado' && p.estado !== 'entregado'

  return (
    <div className="ti-seguimiento">
      {nuevo && p.estado === 'creado' && <div className="pt-aviso pt-aviso--ok">¡Listo! Recibimos tu pedido. Te avisamos por correo en cada paso.</div>}
      {esperandoPago && <div className="pt-aviso pt-aviso--info">Estamos confirmando tu pago…</div>}

      <section className={`ti-estado${cerrado ? ' is-cerrado' : ''}`} aria-label="Estado del pedido">
        <span className="ti-estado__pill">{ESTADO_PEDIDO_LABEL[p.estado]}</span>
        <h1>{frase}</h1>
        <p>
          Pedido {p.folio}
          {p.direccion ? ` · ${p.direccion.calle}${p.direccion.colonia ? `, ${p.direccion.colonia}` : ''}, CP ${p.direccion.codigoPostal}` : p.entrega === 'recoger' && !cerrado ? ' · recoges en la farmacia' : ''}
        </p>
        {p.estado === 'listo_para_recoger' && p.entrega !== 'domicilio' && <p>Ya puedes pasar por él. Menciona el folio {p.folio}.</p>}
        {p.estado === 'expirado' && <p>Los productos se liberaron. Puedes hacer un pedido nuevo.</p>}
        {p.estado === 'cancelado' && <p>{p.motivoCancelacion ?? 'Se canceló el pedido.'}</p>}
      </section>

      {p.repartidor && ['en_ruta', 'entregado'].includes(p.estado) && (
        <div className="pt-card ti-repartidor">
          <span className="ti-fila-i">
            <Icono n="camion" />
          </span>
          <span>
            <b>{p.estado === 'en_ruta' ? `${p.repartidor.nombre} te lo lleva` : `Lo entregó ${p.repartidor.nombre}`}</b>
            <span className="pt-chico pt-tenue">{p.entregaDomicilio?.recibio ? `Recibió: ${p.entregaDomicilio.recibio}` : 'Repartidor de la farmacia'}</span>
          </span>
        </div>
      )}

      {!cerrado && (
        <section className="pt-card ti-linea-tiempo" aria-label="Avance del pedido">
          <ol className="ti-tl">
            {pasos.map((x, i) => {
              const hora = i <= idx ? horaPaso(x.estados) : null
              return (
                <li key={x.nombre} className={i < idx || p.estado === 'entregado' ? 'is-hecho' : i === idx ? 'is-ahora' : ''} aria-current={i === idx ? 'step' : undefined}>
                  <i aria-hidden="true">{i < idx || p.estado === 'entregado' ? <Icono n="check" /> : null}</i>
                  <span>
                    <b>{x.nombre}</b>
                    {hora && <small>{hora}</small>}
                  </span>
                </li>
              )
            })}
          </ol>
        </section>
      )}

      {porPagar && (
        <div className="ti-pago-aviso">
          <Icono n="billete" />
          <span>
            <b>{p.pago.forma === 'al_recibir' ? `Pagas ${pesos(p.total)} al recibir` : p.pago.forma === 'al_recoger' ? `Pagas ${pesos(p.total)} al recoger` : `Falta pagar ${pesos(p.total)} en línea`}</b>
            {p.estado === 'pago_pendiente' && p.expiraEn && <> · Si no se completa antes del {fechaHora(p.expiraEn)}, el apartado se libera solo.</>}
            {p.estado === 'creado' && p.expiraEn && p.pago.forma === 'al_recoger' && <> · Te lo apartamos hasta el {fechaHora(p.expiraEn)}.</>}
            {p.estado === 'en_ruta' && p.pago.forma === 'al_recibir' && <> · Ten listo el pago para {p.repartidor?.nombre ?? 'el repartidor'}.</>}
          </span>
        </div>
      )}
      {p.pago.estado === 'reembolso_pendiente' && <div className="pt-aviso pt-aviso--warn">Tu pago se reembolsará por el mismo medio. Si tienes dudas, escríbenos.</div>}

      <section className="pt-card pt-lista">
        {p.renglones.map((r) => (
          <div key={r.presentacionId} className="ti-renglon">
            <div className="ti-renglon__txt">
              <b>{r.descripcion}</b>
              <span className="pt-chico pt-tenue">
                {r.cantidad} × {pesos(r.precioUnitario)}
                {r.recetaFolio ? ` · receta ${r.recetaFolio}` : ''}
              </span>
            </div>
            <b className="ti-renglon__imp">{pesos(r.importe)}</b>
          </div>
        ))}
        {p.entrega === 'domicilio' && (
          <div className="ti-total ti-total--envio">
            <span>Envío</span>
            <b>{p.envio ? pesos(p.envio) : 'Gratis'}</b>
          </div>
        )}
        <div className="ti-total">
          <span>Total {p.pago.estado === 'pagado' ? '(pagado)' : p.pago.forma === 'al_recoger' ? '(al recoger)' : p.pago.forma === 'al_recibir' ? '(al recibir)' : ''}</span>
          <b>{pesos(p.total)}</b>
        </div>
      </section>

      {p.mascota && <p className="pt-chico pt-tenue">Para {p.mascota.nombre}</p>}
      {error && <div className="pt-aviso pt-aviso--bad">{error}</div>}
      <div className="ti-acciones">
        {puedePagar && (
          <button type="button" className="pt-btn pt-btn--acento" disabled={Boolean(accion)} onClick={() => hacer('pagar')}>
            {accion === 'pagar' ? 'Abriendo el pago…' : `Pagar ${pesos(p.total)} en línea`}
          </button>
        )}
        {puedeCancelar && !confirmarCancelar && (
          <button type="button" className="pt-btn pt-btn--texto" onClick={() => setConfirmarCancelar(true)}>
            Cancelar pedido
          </button>
        )}
        {confirmarCancelar && (
          <div className="pt-aviso pt-aviso--warn ti-confirmar">
            <span>¿Cancelar el pedido? Se liberan los productos apartados.</span>
            <div>
              <button type="button" className="pt-btn pt-btn--peligro pt-btn--chico" disabled={Boolean(accion)} onClick={() => hacer('cancelar')}>
                Sí, cancelar
              </button>
              <button type="button" className="pt-btn pt-btn--chico" onClick={() => setConfirmarCancelar(false)}>
                Todavía no
              </button>
            </div>
          </div>
        )}
        <Link href="/tienda" className="pt-btn pt-btn--texto">
          Seguir comprando
        </Link>
      </div>
    </div>
  )
}

/* ───────────────────────────── pago de prueba ───────────────────────────── */

export function PagoPrueba({ folio, token, referencia }: { folio: string; token: string; referencia: string }) {
  const [p, setP] = useState<PedidoVista | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  useEffect(() => {
    let vivo = true
    api<PedidoVista>(`pedidos/${folio}?t=${encodeURIComponent(token)}`)
      .then((d) => vivo && setP(d))
      .catch((e: Error) => vivo && setError(e.message))
    return () => {
      vivo = false
    }
  }, [folio, token])
  const volver = useMemo(() => `/tienda/pedido/${folio}?t=${encodeURIComponent(token)}&pago=1`, [folio, token])
  const confirmar = async (resultado: 'aprobado' | 'rechazado') => {
    setEnviando(true)
    setError(null)
    try {
      await api(`pago-prueba/${folio}`, { method: 'POST', body: JSON.stringify({ t: token, ref: referencia, resultado }) })
      window.location.assign(volver)
    } catch (e) {
      setError((e as Error).message)
      setEnviando(false)
    }
  }
  return (
    <div className="ti-prueba">
      <div className="ti-prueba__banda">MODO PRUEBA · no se cobra dinero real</div>
      <section className="pt-card">
        <span className="pt-chico pt-tenue">Pasarela simulada</span>
        <h1>{p ? `Pagar ${pesos(p.total)}` : 'Cargando…'}</h1>
        <p className="pt-chico">Pedido {folio}. Esta pantalla imita la página de la pasarela: el pedido solo queda pagado cuando llega el aviso firmado.</p>
        {error && <div className="pt-aviso pt-aviso--bad">{error}</div>}
        <button type="button" className="pt-btn pt-btn--acento pt-btn--bloque" disabled={!p || enviando} onClick={() => confirmar('aprobado')}>
          Aprobar pago
        </button>
        <button type="button" className="pt-btn pt-btn--bloque" disabled={!p || enviando} onClick={() => confirmar('rechazado')}>
          Rechazar pago
        </button>
        <Link href={volver} className="pt-enlace">
          Volver sin pagar
        </Link>
      </section>
    </div>
  )
}
