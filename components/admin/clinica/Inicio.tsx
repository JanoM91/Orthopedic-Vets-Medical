'use client'

import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import type { ResultadoBusqueda } from '../../../lib/clinica/tipos'
import { api, Avatar, Aviso, ESPECIE_LABEL, Icono, Pastilla, telefonoBonito, useClinica } from './comun'

/**
 * Inicio: una sola caja de búsqueda (nombre del tutor, teléfono, correo,
 * nombre de la mascota, microchip o folio) con resultados en dos columnas.
 * Sin texto, muestra los últimos registros para que la pantalla no quede vacía.
 */
export default function Inicio() {
  const { catalogo, base } = useClinica()
  const p = catalogo.permisos
  const [q, setQ] = useState('')
  const [res, setRes] = useState<ResultadoBusqueda | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => {
      setCargando(true)
      api.get<ResultadoBusqueda>('buscar', { q }).then(
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
  }, [q])

  return (
    <div className="fz-stack fz-stack--grande">
      <div className="fz-entre">
        <div>
          <p className="fz-eyebrow">Clínica</p>
          <h1 className="fz-h1">Pacientes</h1>
          <p className="fz-tenue fz-chico" style={{ marginTop: 4 }}>
            {catalogo.totales.clientes} clientes · {catalogo.totales.mascotas} mascotas
          </p>
        </div>
        {p.editarPacientes && (
          <div className="fz-acciones-fin">
            <Link href={`${base}/clientes/nuevo`} className="fz-btn fz-btn--claro">
              <Icono n="socio" chico /> Nuevo cliente
            </Link>
            <Link href={`${base}/mascotas/nueva`} className="fz-btn fz-btn--navy">
              <Icono n="mas" chico /> Nueva mascota
            </Link>
          </div>
        )}
      </div>

      <div className="fz-buscar">
        <Icono n="buscar" />
        <label className="cl-sr" htmlFor="cl-q">
          Buscar
        </label>
        <input id="cl-q" className="fz-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre del tutor, teléfono, mascota, microchip o folio (CLI-12, MAS-34)" autoComplete="off" autoFocus />
      </div>

      {error && <Aviso tono="malo">{error}</Aviso>}
      {res && (
        <div className="cl-dos">
          <section className="fz-stack fz-stack--chico">
            <h2 className="fz-h2">
              Clientes <span className="fz-tenue fz-chico">({res.clientes.length}{res.clientes.length === 20 ? '+' : ''})</span>
            </h2>
            <div className={`fz-tarjeta fz-lista${cargando ? ' cl-cargando' : ''}`}>
              {res.clientes.length === 0 && <p className="fz-tenue" style={{ padding: 14 }}>{q ? 'Ningún cliente coincide.' : 'Todavía no hay clientes.'}</p>}
              {res.clientes.map((c) => (
                <Link key={c.id} href={`${base}/clientes/${c.id}`} className="fz-fila">
                  <Avatar nombre={c.nombreCompleto} />
                  <span className="fz-fila__main">
                    <span className="fz-fila__t1">
                      {c.nombreCompleto} {!c.activo && <Pastilla tono="gris">inactivo</Pastilla>}
                    </span>
                    <span className="fz-fila__t2">
                      {c.folio} · {telefonoBonito(c.telefono)}
                      {c.email ? ` · ${c.email}` : ''}
                    </span>
                    <span className="fz-fila__t2">{c.mascotas.length ? c.mascotas.map((m) => `${m.nombre} (${ESPECIE_LABEL[m.especie] ?? m.especie})`).join(', ') : 'Sin mascotas registradas'}</span>
                  </span>
                  <Icono n="flecha" chico />
                </Link>
              ))}
            </div>
          </section>
          <section className="fz-stack fz-stack--chico">
            <h2 className="fz-h2">
              Mascotas <span className="fz-tenue fz-chico">({res.mascotas.length}{res.mascotas.length === 20 ? '+' : ''})</span>
            </h2>
            <div className={`fz-tarjeta fz-lista${cargando ? ' cl-cargando' : ''}`}>
              {res.mascotas.length === 0 && <p className="fz-tenue" style={{ padding: 14 }}>{q ? 'Ninguna mascota coincide.' : 'Todavía no hay mascotas.'}</p>}
              {res.mascotas.map((m) => (
                <Link key={m.id} href={`${base}/mascotas/${m.id}`} className="fz-fila">
                  <Avatar nombre={m.nombre} especie={m.especie} />
                  <span className="fz-fila__main">
                    <span className="fz-fila__t1">
                      {m.nombre} {m.estado !== 'activo' && <Pastilla tono="gris">{m.estado}</Pastilla>}
                      {m.alertasManejo.length > 0 && <Pastilla tono="malo">⚑ alerta</Pastilla>}
                      {m.alergias && <Pastilla tono="aviso">alergia</Pastilla>}
                    </span>
                    <span className="fz-fila__t2">
                      {m.folio} · {ESPECIE_LABEL[m.especie] ?? m.especie}
                      {m.raza ? `, ${m.raza}` : ''}
                      {m.edad ? ` · ${m.edad}` : ''}
                    </span>
                    <span className="fz-fila__t2">Tutor: {m.tutores.map((t) => t.nombre).join(', ') || '—'}</span>
                  </span>
                  <Icono n="flecha" chico />
                </Link>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  )
}
