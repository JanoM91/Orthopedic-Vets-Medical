'use client'

import Link from 'next/link'
import React, { useState } from 'react'
import { api, Aviso, Boton, dinero, Icono, useFarmacia } from './comun'

/**
 * Inicio de la farmacia: cifras de hoy y accesos. En la fase 1 son cifras del
 * catálogo y del inventario (lotes por vencer, vencidos, bajo mínimo); ventas,
 * pedidos y recetas llegan en las fases 3 a 5.
 */
export default function Inicio() {
  const { catalogo, base, rutaAdmin, recargarCatalogo } = useFarmacia()
  const p = catalogo.permisos
  const t = catalogo.totales
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const arrancar = async (que: 'almacen' | 'roles') => {
    setOcupado(true)
    setError(null)
    try {
      const r = await api.post<{ hecho: string[] }>('arranque', { que })
      setMsg(`Listo: ${r.hecho.join(', ')}.`)
      recargarCatalogo()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo.')
    }
    setOcupado(false)
  }

  const faltaAlmacen = !catalogo.arranque.almacenes && p.configurar
  const faltanRoles = !catalogo.arranque.rolesFarmacia && (p.superadmin || p.panel)
  const sinProductos = t.productos === 0

  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Farmacia</p>
          <h1 className="fz-h1">Inicio</h1>
          <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
            {t.productosActivos} productos activos · {t.publicados} publicados en la tienda · {t.lotesConExistencia} lotes con existencia
          </p>
        </div>
        {(p.catalogo || p.recibirCompras) && (
          <div className="fz-acciones-fin">
            {p.recibirCompras && (
              <Link href={`${base}/compras/nueva`} className="fz-btn fz-btn--claro">
                <Icono n="archivo" chico /> Recibir compra
              </Link>
            )}
            {p.catalogo && (
              <Link href={`${base}/importar`} className="fz-btn fz-btn--claro">
                <Icono n="compartir" chico /> Importar catálogo
              </Link>
            )}
            {p.catalogo && (
              <Link href={`${base}/productos/nuevo`} className="fz-btn fz-btn--navy">
                <Icono n="mas" chico /> Nuevo producto
              </Link>
            )}
          </div>
        )}
      </div>

      {(faltaAlmacen || faltanRoles || sinProductos) && (
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Para empezar</h2>
          {faltaAlmacen && (
            <div className="fz-entre">
              <span className="fz-chico">Todavía no hay almacén. Se crea «Farmacia» y queda por omisión.</span>
              <Boton tono="teal" chico disabled={ocupado} onClick={() => void arrancar('almacen')}>
                Crear almacén «Farmacia»
              </Boton>
            </div>
          )}
          {faltanRoles && (
            <div className="fz-entre">
              <span className="fz-chico">Faltan los roles de farmacia (Encargado, Vendedor de mostrador, Repartidor). A Dueño y Administración se les enciende la farmacia completa si aún no la tienen.</span>
              <Boton tono="teal" chico disabled={ocupado} onClick={() => void arrancar('roles')}>
                Crear los roles sugeridos
              </Boton>
            </div>
          )}
          {sinProductos && p.catalogo && (
            <div className="fz-entre">
              <span className="fz-chico">El catálogo está vacío. Descarga la plantilla, llénala y súbela en «Importar catálogo», o da de alta producto por producto.</span>
              <Link href={`${base}/importar`} className="fz-btn fz-btn--claro fz-btn--chico">
                Ir a importar
              </Link>
            </div>
          )}
          {msg && <Aviso tono="ok">{msg}</Aviso>}
          {error && <Aviso tono="malo">{error}</Aviso>}
        </div>
      )}

      <div className="fz-kpis fa-kpis">
        <Link href={`${base}/productos`} className="fz-kpi">
          <span className="fz-kpi__lbl">Productos activos</span>
          <span className="fz-kpi__val">{t.productosActivos}</span>
        </Link>
        <Link href={`${base}/inventario?solo=bajo_minimo`} className={`fz-kpi${t.productosBajoMinimo ? ' fa-kpi--aviso' : ''}`}>
          <span className="fz-kpi__lbl">Bajo mínimo</span>
          <span className="fz-kpi__val">{t.productosBajoMinimo}</span>
        </Link>
        <Link href={`${base}/inventario?solo=por_vencer`} className={`fz-kpi${t.lotesPorVencer ? ' fa-kpi--aviso' : ''}`}>
          <span className="fz-kpi__lbl">Lotes por vencer</span>
          <span className="fz-kpi__val">{t.lotesPorVencer}</span>
        </Link>
        <Link href={`${base}/inventario?solo=vencidos`} className={`fz-kpi${t.lotesVencidos ? ' fa-kpi--malo' : ''}`}>
          <span className="fz-kpi__lbl">Lotes vencidos (retirar)</span>
          <span className="fz-kpi__val">{t.lotesVencidos}</span>
        </Link>
        {t.valorInventario != null && (
          <div className="fz-kpi fz-kpi--fondo">
            <span className="fz-kpi__lbl">Valor del inventario a costo</span>
            <span className="fz-kpi__val">{dinero(t.valorInventario)}</span>
          </div>
        )}
      </div>

      <div className="cl-dos">
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Hoy</h2>
          <p className="fz-chico fz-tenue">Ventas del día, pedidos por preparar, recetas por validar y cierre del día aparecen aquí cuando estén construidas esas fases (3 a 5). Hoy la farmacia lleva catálogo e inventario por lote.</p>
        </div>
        <div className="fz-tarjeta cl-caja fz-stack fz-stack--chico">
          <h2 className="fz-h2">Accesos</h2>
          <div className="fa-accesos">
            <Link href={`${base}/productos`} className="fz-btn fz-btn--claro">Catálogo</Link>
            <Link href={`${base}/inventario`} className="fz-btn fz-btn--claro">Existencias y lotes</Link>
            {p.recibirCompras && <Link href={`${base}/compras`} className="fz-btn fz-btn--claro">Compras y recepción</Link>}
            {p.ajustes && <Link href={`${base}/conteo`} className="fz-btn fz-btn--claro">Conteo físico</Link>}
            {p.ajustes && <Link href={`${base}/inventario?solo=todos`} className="fz-btn fz-btn--claro">Ajustes y mermas</Link>}
            {p.configurar && <Link href={`${base}/configuracion`} className="fz-btn fz-btn--claro">Proveedores y almacenes</Link>}
            {p.panel && <a href={`${rutaAdmin}/globals/farmacia-configuracion`} className="fz-btn fz-btn--claro">Parámetros (panel)</a>}
          </div>
        </div>
      </div>
    </div>
  )
}
