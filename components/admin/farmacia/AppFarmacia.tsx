'use client'

/**
 * Armazón de la farmacia dentro del panel (25-oct-2026).
 *
 * Rutas (después de /admin/farmacia):
 *   ''                      inicio: cifras y accesos
 *   productos               catálogo (búsqueda, filtros)
 *   productos/nuevo         alta de producto
 *   productos/:id           ficha: datos, presentaciones, lotes, kardex, ajustes
 *   inventario              existencias por producto y lote; kardex
 *   compras                 historial de compras (fase 2)
 *   compras/nueva           desde XML CFDI o a mano
 *   compras/:id             recepción: presentación, lote y caducidad por renglón
 *   conteo                  conteo físico → ajustes (fase 2)
 *   vender                  venta de mostrador (fase 3)
 *   ventas · ventas/:id     historial del día · detalle con ticket y transferencias
 *   recetas · recetas/nueva · recetas/:id   bandeja, receta externa, ficha (libro de control en ?ver=libro)
 *   cierre                  cierre del día
 *   alertas · reabasto · promociones   fase 4
 *   importar                importación con plantilla
 *   configuracion           parámetros, proveedores, almacenes
 *
 * Quien no entra al panel completo la ve sola, con encabezado y barra inferior.
 */
import { Carriles } from '../../Carriles'
import { MenuMas } from '../MenuMas'
import Link from 'next/link'
import React, { useCallback, useState } from 'react'
import type { CatalogoFarmacia } from '../../../lib/farmacia/tipos'
import { api, Aviso, FarmaciaCtx, Icono, iniciales } from './comun'
import { Compras, FichaCompra, NuevaCompra } from './Compras'
import Configuracion from './Configuracion'
import Conteo from './Conteo'
import Cierre from './Cierre'
import { Alertas, Promociones, Reabasto } from './Alertas'
import { FichaReceta, NuevaRecetaExterna, Recetas } from './Recetas'
import Vender from './Vender'
import { FichaVenta, Ventas } from './Ventas'
import Importar from './Importar'
import Inicio from './Inicio'
import Inventario from './Inventario'
import { FichaProducto, FormularioProducto, Productos } from './Productos'

type Props = {
  catalogo: CatalogoFarmacia
  ruta: string[]
  query: Record<string, string>
  rutaAdmin: string
  marca: { wordmark: string; nombre: string }
}

export default function AppFarmacia({ catalogo: inicial, ruta, query, rutaAdmin, marca }: Props) {
  const base = `${rutaAdmin}/farmacia`
  const [catalogo, setCatalogo] = useState(inicial)
  const recargarCatalogo = useCallback(() => {
    api.get<CatalogoFarmacia>('catalogo').then(setCatalogo, () => undefined)
  }, [])
  const p = catalogo.permisos
  const [seccion, id] = ruta
  const numero = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null)

  let pantalla: React.ReactNode
  if (!seccion) pantalla = <Inicio />
  else if (seccion === 'productos' && !id) pantalla = <Productos q={query.q ?? ''} filtro={query.solo ?? ''} />
  else if (seccion === 'productos' && id === 'nuevo') pantalla = p.catalogo ? <FormularioProducto /> : <Aviso>Tu rol no incluye editar el catálogo.</Aviso>
  else if (seccion === 'productos' && numero(id)) pantalla = <FichaProducto key={id} id={numero(id)!} pestana={query.ver ?? null} />
  else if (seccion === 'inventario') pantalla = <Inventario solo={query.solo ?? null} q={query.q ?? ''} />
  else if (seccion === 'compras' && !p.recibirCompras) pantalla = <Aviso>Tu rol no incluye recibir compras.</Aviso>
  else if (seccion === 'compras' && !id) pantalla = <Compras estado={query.estado ?? null} />
  else if (seccion === 'compras' && id === 'nueva') pantalla = <NuevaCompra />
  else if (seccion === 'compras' && numero(id)) pantalla = <FichaCompra key={id} id={numero(id)!} />
  else if (seccion === 'conteo') pantalla = <Conteo />
  else if (seccion === 'vender') pantalla = <Vender />
  else if (seccion === 'ventas' && !id) pantalla = p.vender ? <Ventas dia={query.dia ?? null} estado={query.estado ?? null} /> : <Aviso>Tu rol no incluye la venta de mostrador.</Aviso>
  else if (seccion === 'ventas' && numero(id)) pantalla = <FichaVenta key={id} id={numero(id)!} />
  else if (seccion === 'recetas' && !id) pantalla = <Recetas ver={query.ver ?? null} />
  else if (seccion === 'recetas' && id === 'nueva') pantalla = <NuevaRecetaExterna mascotaInicial={numero(query.mascota)} />
  else if (seccion === 'recetas' && numero(id)) pantalla = <FichaReceta key={id} id={numero(id)!} />
  else if (seccion === 'cierre') pantalla = <Cierre />
  else if (seccion === 'alertas') pantalla = <Alertas tipo={query.tipo ?? null} />
  else if (seccion === 'reabasto') pantalla = p.recibirCompras || p.aprobar || p.reportes ? <Reabasto /> : <Aviso>La lista de reabasto es del encargado o el dueño.</Aviso>
  else if (seccion === 'promociones') pantalla = p.vender || p.aprobar ? <Promociones /> : <Aviso>Tu rol no incluye promociones.</Aviso>
  else if (seccion === 'importar') pantalla = p.catalogo ? <Importar /> : <Aviso>Tu rol no incluye importar el catálogo.</Aviso>
  else if (seccion === 'configuracion') pantalla = p.configurar ? <Configuracion /> : <Aviso>La configuración de la farmacia la cambian el dueño o el superadministrador.</Aviso>
  else
    pantalla = (
      <Aviso tono="aviso">
        Esa pantalla no existe. <Link href={base}>Volver al inicio</Link>
      </Aviso>
    )

  const quien = catalogo.usuario.nombre
  const esProductos = seccion === 'productos'
  type Opcion = { href: string; on: boolean; texto: string; extra?: React.ReactNode; ver: boolean }
  const opciones: (Opcion & { mas?: boolean })[] = [
    { ver: true, href: base, on: !seccion, texto: 'Inicio' },
    { ver: p.vender, href: `${base}/vender`, on: seccion === 'vender', texto: 'Vender' },
    { ver: p.vender, href: `${base}/ventas`, on: seccion === 'ventas', texto: 'Ventas' },
    { ver: p.vender || p.recetas, href: `${base}/recetas`, on: seccion === 'recetas', texto: 'Recetas' },
    {
      ver: true,
      href: `${base}/alertas`,
      on: seccion === 'alertas',
      texto: 'Alertas',
      extra: catalogo.hoy.alertasAbiertas ? <span className={`fa-contador${catalogo.hoy.alertasCriticas ? ' fa-contador--malo' : ''}`}>{catalogo.hoy.alertasAbiertas}</span> : null,
    },
    { ver: true, href: `${base}/productos`, on: esProductos, texto: 'Productos' },
    { ver: true, href: `${base}/inventario`, on: seccion === 'inventario', texto: 'Inventario' },
    { ver: p.recibirCompras, href: `${base}/compras`, on: seccion === 'compras', texto: 'Compras', mas: true },
    { ver: p.recibirCompras || p.aprobar || p.reportes, href: `${base}/reabasto`, on: seccion === 'reabasto', texto: 'Reabasto', mas: true },
    {
      ver: p.vender || p.aprobar,
      href: `${base}/promociones`,
      on: seccion === 'promociones',
      texto: 'Promociones',
      extra: catalogo.hoy.promocionesPropuestas && p.aprobar ? <span className="fa-contador">{catalogo.hoy.promocionesPropuestas}</span> : null,
      mas: true,
    },
    { ver: p.ajustes, href: `${base}/conteo`, on: seccion === 'conteo', texto: 'Conteo', mas: true },
    { ver: p.cierreDia && catalogo.configuracion.cierreDiaActivo, href: `${base}/cierre`, on: seccion === 'cierre', texto: 'Cierre del día', mas: true },
    { ver: p.catalogo, href: `${base}/importar`, on: seccion === 'importar', texto: 'Importar catálogo', mas: true },
    { ver: p.configurar, href: `${base}/configuracion`, on: seccion === 'configuracion', texto: 'Configuración', mas: true },
  ]
  const principales = opciones.filter((x) => x.ver && !x.mas)
  const secundarias = opciones.filter((x) => x.ver && x.mas)
  return (
    <FarmaciaCtx.Provider value={{ catalogo, base, rutaAdmin, recargarCatalogo }}>
      <div className={`fz-app cl-app fa-app${p.panel ? '' : ' fz-app--solo'}`}>
        <Carriles />
        {p.panel ? (
          <div className="fz-subnav-fila">
            <nav className="fz-subnav" aria-label="Secciones de la farmacia">
              <span className="fz-subnav__titulo">Farmacia</span>
              {principales.map((x) => (
                <Link key={x.href} href={x.href} className={x.on ? 'is-on' : ''}>
                  {x.texto}
                  {x.extra}
                </Link>
              ))}
            </nav>
            {secundarias.length > 0 && <MenuMas opciones={secundarias} />}
          </div>
        ) : (
          <header className="fz-cabecera">
            <Link href={base} className="fz-marca" aria-label={`${marca.nombre}: ir al inicio`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marca.wordmark} alt={marca.nombre} />
              <span>farmacia</span>
            </Link>
            <span className="fz-cabecera__quien">
              <span className="fz-avatar" title={quien} aria-label={quien} role="img">
                {iniciales(quien)}
              </span>
              <span className="fz-cabecera__nombre">{quien}</span>
              <a href={`${rutaAdmin}/logout`} className="fz-cabecera__salir">
                Salir
              </a>
            </span>
          </header>
        )}
        <main className="fz-contenido">{pantalla}</main>
        {!p.panel && (
          <nav className="fz-barra" aria-label="Secciones">
            {(
              [
                [true, base, !seccion, 'inicio', 'Inicio'],
                [p.vender, `${base}/vender`, seccion === 'vender', 'cartera', 'Vender'],
                [p.vender, `${base}/ventas`, seccion === 'ventas', 'lista', 'Ventas'],
                [p.vender || p.recetas, `${base}/recetas`, seccion === 'recetas', 'archivo', 'Recetas'],
                [true, `${base}/alertas`, seccion === 'alertas', 'alerta', catalogo.hoy.alertasAbiertas ? `Alertas (${catalogo.hoy.alertasAbiertas})` : 'Alertas'],
                [true, `${base}/productos`, esProductos, 'buscar', 'Productos'],
                [true, `${base}/inventario`, seccion === 'inventario', 'bandeja', 'Inventario'],
                [p.recibirCompras, `${base}/compras`, seccion === 'compras', 'archivo', 'Compras'],
                [p.configurar, `${base}/configuracion`, seccion === 'configuracion', 'ajustes', 'Ajustes'],
              ] as [boolean, string, boolean, Parameters<typeof Icono>[0]['n'], string][]
            )
              .filter(([v]) => v)
              .slice(0, 5)
              .map(([, href, on, icono, texto]) => (
                <Link key={href} href={href} className={on ? 'is-on' : ''}>
                  <Icono n={icono} />
                  <span>{texto}</span>
                </Link>
              ))}
          </nav>
        )}
      </div>
    </FarmaciaCtx.Provider>
  )
}
