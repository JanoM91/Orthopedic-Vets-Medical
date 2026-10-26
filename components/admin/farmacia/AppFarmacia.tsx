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
 *   importar                importación con plantilla
 *   configuracion           parámetros, proveedores, almacenes
 *
 * Quien no entra al panel completo la ve sola, con encabezado y barra inferior.
 */
import Link from 'next/link'
import React, { useCallback, useState } from 'react'
import type { CatalogoFarmacia } from '../../../lib/farmacia/tipos'
import { api, Aviso, FarmaciaCtx, Icono, iniciales } from './comun'
import Configuracion from './Configuracion'
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
  return (
    <FarmaciaCtx.Provider value={{ catalogo, base, rutaAdmin, recargarCatalogo }}>
      <div className={`fz-app cl-app fa-app${p.panel ? '' : ' fz-app--solo'}`}>
        {p.panel ? (
          <nav className="fz-subnav" aria-label="Secciones de la farmacia">
            <span className="fz-subnav__titulo">Farmacia</span>
            <Link href={base} className={!seccion ? 'is-on' : ''}>
              Inicio
            </Link>
            <Link href={`${base}/productos`} className={esProductos ? 'is-on' : ''}>
              Productos
            </Link>
            <Link href={`${base}/inventario`} className={seccion === 'inventario' ? 'is-on' : ''}>
              Inventario
            </Link>
            {p.catalogo && (
              <Link href={`${base}/importar`} className={seccion === 'importar' ? 'is-on' : ''}>
                Importar catálogo
              </Link>
            )}
            {p.configurar && (
              <Link href={`${base}/configuracion`} className={seccion === 'configuracion' ? 'is-on' : ''}>
                Configuración
              </Link>
            )}
          </nav>
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
            <Link href={base} className={!seccion ? 'is-on' : ''}>
              <Icono n="inicio" />
              <span>Inicio</span>
            </Link>
            <Link href={`${base}/productos`} className={esProductos ? 'is-on' : ''}>
              <Icono n="buscar" />
              <span>Productos</span>
            </Link>
            <Link href={`${base}/inventario`} className={seccion === 'inventario' ? 'is-on' : ''}>
              <Icono n="bandeja" />
              <span>Inventario</span>
            </Link>
            {p.configurar && (
              <Link href={`${base}/configuracion`} className={seccion === 'configuracion' ? 'is-on' : ''}>
                <Icono n="ajustes" />
                <span>Ajustes</span>
              </Link>
            )}
            <a href={`${rutaAdmin}/finanzas`}>
              <Icono n="cartera" />
              <span>Finanzas</span>
            </a>
          </nav>
        )}
      </div>
    </FarmaciaCtx.Provider>
  )
}
