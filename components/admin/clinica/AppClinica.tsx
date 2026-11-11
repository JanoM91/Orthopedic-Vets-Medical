'use client'

/**
 * Armazón de la clínica dentro del panel (octubre de 2026).
 *
 * Rutas (después de /admin/clinica):
 *   ''                      inicio: búsqueda y accesos
 *   clientes/nuevo          alta de cliente-tutor
 *   clientes/:id            ficha del cliente (mascotas, portal)
 *   mascotas/nueva?cliente= alta de mascota
 *   mascotas/:id            expediente de la mascota
 *   importar                importación de archivo
 *   agenda?dia=&mascota=    agenda del día; con mascota abre «nueva cita» para ella
 *   agenda?nueva=1          abre «nueva cita» sin mascota (acción rápida del tablero «Hoy»)
 *   agenda?…&hora=&recurso= «nueva cita» con hora y espacio ya puestos
 *   mascotas/nueva?volver=agenda&dia=&hora=&recurso=
 *                           alta desde «Nueva cita»: al guardar regresa a la agenda
 *                           con la mascota nueva, la misma hora y el mismo espacio
 *
 * Quien no entra al panel completo la ve sola, con encabezado y barra
 * inferior; además tiene acceso a Finanzas desde la barra si su rol lo usa.
 */
import { Carriles } from '../../Carriles'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useCallback, useState } from 'react'
import type { CatalogoClinica } from '../../../lib/clinica/tipos'
import { api, Aviso, ClinicaCtx, Icono, iniciales } from './comun'
import Agenda from './Agenda'
import { FichaCliente, FormularioCliente } from './Cliente'
import Importar from './Importar'
import Inicio from './Inicio'
import { Expediente, FormularioMascota } from './Mascota'

type Props = {
  catalogo: CatalogoClinica
  ruta: string[]
  query: Record<string, string>
  rutaAdmin: string
  marca: { wordmark: string; nombre: string }
}

export default function AppClinica({ catalogo: inicial, ruta, query, rutaAdmin, marca }: Props) {
  const base = `${rutaAdmin}/clinica`
  const router = useRouter()
  const [catalogo, setCatalogo] = useState(inicial)
  const recargarCatalogo = useCallback(() => {
    api.get<CatalogoClinica>('catalogo').then(setCatalogo, () => undefined)
  }, [])
  const p = catalogo.permisos
  const [seccion, id] = ruta
  const numero = (v: string | undefined) => (v && /^\d+$/.test(v) ? Number(v) : null)

  let pantalla: React.ReactNode
  if (!seccion) pantalla = <Inicio />
  else if (seccion === 'clientes' && id === 'nuevo') pantalla = p.editarPacientes ? <FormularioCliente /> : <Aviso>Tu rol no incluye dar de alta clientes.</Aviso>
  else if (seccion === 'clientes' && numero(id)) pantalla = <FichaCliente key={id} id={numero(id)!} />
  else if (seccion === 'mascotas' && id === 'nueva') {
    /* Desde «Nueva cita» (agenda): al guardar o cancelar se regresa a la agenda con la misma hora y espacio. */
    const deAgenda = query.volver === 'agenda'
    const volverAgenda = (mascotaId?: number) => {
      const q = new URLSearchParams()
      if (query.dia) q.set('dia', query.dia)
      if (mascotaId) q.set('mascota', String(mascotaId))
      else q.set('nueva', '1')
      if (query.hora) q.set('hora', query.hora)
      if (query.recurso) q.set('recurso', query.recurso)
      router.push(`${base}/agenda?${q.toString()}`)
    }
    pantalla = p.editarPacientes ? (
      <FormularioMascota clienteInicial={numero(query.cliente)} onGuardado={deAgenda ? (m) => volverAgenda(m.id) : undefined} onCancelar={deAgenda ? () => volverAgenda() : undefined} />
    ) : (
      <Aviso>Tu rol no incluye dar de alta mascotas.</Aviso>
    )
  }
  else if (seccion === 'mascotas' && numero(id)) pantalla = <Expediente key={id} id={numero(id)!} pestana={query.ver ?? null} />
  else if (seccion === 'importar') pantalla = p.importar ? <Importar /> : <Aviso>Tu rol no incluye importar archivos.</Aviso>
  else if (seccion === 'agenda') pantalla = p.agenda ? <Agenda diaInicial={query.dia ?? null} mascotaInicial={numero(query.mascota)} nuevaInicial={query.nueva === '1'} horaInicial={query.hora ?? null} recursoInicial={numero(query.recurso)} /> : <Aviso>Tu rol no incluye la agenda.</Aviso>
  else
    pantalla = (
      <Aviso tono="aviso">
        Esa pantalla no existe. <Link href={base}>Volver al inicio</Link>
      </Aviso>
    )

  const quien = catalogo.usuario.nombre
  return (
    <ClinicaCtx.Provider value={{ catalogo, base, rutaAdmin, recargarCatalogo }}>
      <div className={`fz-app cl-app${p.panel ? '' : ' fz-app--solo'}`}>
        <Carriles />
        {p.panel ? (
          <nav className="fz-subnav" aria-label="Secciones de la clínica">
            <span className="fz-subnav__titulo">Pacientes</span>
            <Link href={base} className={!seccion ? 'is-on' : ''}>
              Buscar
            </Link>
            {p.agenda && (
              <Link href={`${base}/agenda`} className={seccion === 'agenda' ? 'is-on' : ''}>
                Agenda
              </Link>
            )}
            {p.editarPacientes && (
              <Link href={`${base}/clientes/nuevo`} className={seccion === 'clientes' && id === 'nuevo' ? 'is-on' : ''}>
                Nuevo cliente
              </Link>
            )}
            {p.editarPacientes && (
              <Link href={`${base}/mascotas/nueva`} className={seccion === 'mascotas' && id === 'nueva' ? 'is-on' : ''}>
                Nueva mascota
              </Link>
            )}
            {p.importar && (
              <Link href={`${base}/importar`} className={seccion === 'importar' ? 'is-on' : ''}>
                Importar archivo
              </Link>
            )}
          </nav>
        ) : (
          <header className="fz-cabecera">
            <Link href={base} className="fz-marca" aria-label={`${marca.nombre}: ir al inicio`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={marca.wordmark} alt={marca.nombre} />
              <span>pacientes</span>
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
            <Link href={base} className={!seccion || seccion === 'clientes' || seccion === 'mascotas' ? 'is-on' : ''}>
              <Icono n="buscar" />
              <span>Pacientes</span>
            </Link>
            {p.agenda && (
              <Link href={`${base}/agenda`} className={seccion === 'agenda' ? 'is-on' : ''}>
                <Icono n="lista" />
                <span>Agenda</span>
              </Link>
            )}
            {p.editarPacientes && (
              <Link href={`${base}/mascotas/nueva`}>
                <Icono n="mas" />
                <span>Nueva mascota</span>
              </Link>
            )}
            {p.importar && (
              <Link href={`${base}/importar`} className={seccion === 'importar' ? 'is-on' : ''}>
                <Icono n="compartir" />
                <span>Importar</span>
              </Link>
            )}
            <a href={`${rutaAdmin}/finanzas`}>
              <Icono n="cartera" />
              <span>Finanzas</span>
            </a>
          </nav>
        )}
      </div>
    </ClinicaCtx.Provider>
  )
}
