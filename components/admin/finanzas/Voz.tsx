'use client'

/**
 * Nota de voz (heredada de MacAuto Finanzas, docs/62 de ese proyecto).
 *
 * La persona toca el micrófono, dicta («pagué tres mil doscientos de una placa
 * de titanio, de la caja chica»), vuelve a tocar para terminar y recibe un
 * borrador: qué entendió el sistema y qué le faltó. Si está de acuerdo, toca
 * «Revisar y guardar»: el borrador llena el formulario de captura, donde lo
 * corrige lo que haga falta y lo guarda. NADA se guarda desde esta pantalla.
 *
 * Cómo graba: `MediaRecorder` del navegador (webm en Android/Chrome, mp4 en
 * iPhone), máximo 60 segundos. Si el teléfono no deja usar el micrófono (o
 * el navegador no sabe grabar), queda la opción de escribirlo: el mismo
 * intérprete trabaja sobre texto.
 */
import { useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import type { ResultadoVoz } from '../../../lib/finanzas/tipos'
import { type Borrador, claveBorrador, escribirBorrador } from './borrador'
import { api, Aviso, ErrorApi, fecha, fmt, Icono, useFinanzas, Volver } from './comun'

const MAX_SEGUNDOS = 60
const EJEMPLOS = ['Pagué 3,200 de una placa de titanio para cirugía, de la caja chica', 'Compré 450 de material de curación con mi dinero', 'Cobramos 18 mil de una cirugía de rodilla por transferencia al banco']

type Fase = 'listo' | 'grabando' | 'procesando' | 'resultado'

function mimePreferido(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  return ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/aac'].find((m) => MediaRecorder.isTypeSupported(m)) ?? ''
}

function puedeGrabar(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)
}

export default function Voz() {
  const { catalogo, base } = useFinanzas()
  const router = useRouter()
  const [fase, setFase] = useState<Fase>('listo')
  const [segundos, setSegundos] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoVoz | null>(null)
  const [modoTexto, setModoTexto] = useState(false)
  const [texto, setTexto] = useState('')
  const [soporte, setSoporte] = useState<boolean | null>(null)
  const grabadora = useRef<MediaRecorder | null>(null)
  const pedazos = useRef<Blob[]>([])
  const flujo = useRef<MediaStream | null>(null)
  const reloj = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- depende del navegador: solo se sabe después de montar
    setSoporte(puedeGrabar())
    return () => detenerTodo()
  }, [])

  function detenerTodo() {
    if (reloj.current) clearInterval(reloj.current)
    reloj.current = null
    flujo.current?.getTracks().forEach((t) => t.stop())
    flujo.current = null
  }

  async function empezar() {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      flujo.current = stream
      const mime = mimePreferido()
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      pedazos.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) pedazos.current.push(e.data)
      }
      rec.onstop = () => {
        const tipo = rec.mimeType || mime || 'audio/webm'
        const blob = new Blob(pedazos.current, { type: tipo })
        detenerTodo()
        void enviar(blob, '')
      }
      grabadora.current = rec
      rec.start(1000)
      setSegundos(0)
      setFase('grabando')
      reloj.current = setInterval(() => {
        setSegundos((s) => {
          if (s + 1 >= MAX_SEGUNDOS) terminar()
          return s + 1
        })
      }, 1000)
    } catch (e) {
      const nombre = (e as { name?: string })?.name
      setError(nombre === 'NotAllowedError' || nombre === 'SecurityError'
        ? 'El teléfono no dio permiso para usar el micrófono. Actívalo en los ajustes del navegador para este sitio, o escríbelo abajo.'
        : nombre === 'NotFoundError' ? 'No se encontró un micrófono. Escríbelo abajo.' : 'No se pudo empezar a grabar. Escríbelo abajo.')
      setModoTexto(true)
      detenerTodo()
    }
  }

  function terminar() {
    const rec = grabadora.current
    if (rec && rec.state !== 'inactive') rec.stop()
    else detenerTodo()
    if (reloj.current) clearInterval(reloj.current)
    reloj.current = null
  }

  async function enviar(blob: Blob | null, dictado: string) {
    setFase('procesando'); setError(null); setResultado(null)
    try {
      const form = new FormData()
      if (blob) form.append('audio', new File([blob], `nota.${blob.type.includes('mp4') ? 'mp4' : blob.type.includes('ogg') ? 'ogg' : 'webm'}`, { type: blob.type }))
      else form.append('texto', dictado)
      const r = await api.formulario<ResultadoVoz>('voz', form)
      setResultado(r)
      setFase('resultado')
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'No se pudo procesar la nota. Revisa tu conexión e intenta de nuevo.')
      setFase('listo')
    }
  }

  function revisarYGuardar() {
    if (!resultado) return
    const b = resultado.borrador
    const asig = b.asig
    const borrador: Borrador = {
      v: 1, guardadoEn: Date.now(), origen: 'voz', tipo: b.tipo, importe: b.importe, estado: b.estado, cuenta: b.cuenta, medio: b.medio, concepto: b.concepto,
      categoria: b.categoria, noSe: false, asig, asigTocada: Boolean(asig), actividad: b.actividad,
      fechaReal: b.fechaReal, venceEl: '', mas: Boolean(b.contraparte || b.notas), contraparte: b.contraparte, notas: b.notas, reembolsoA: null, archivos: 0,
    }
    escribirBorrador(claveBorrador(catalogo.usuario.id, b.tipo), borrador)
    router.push(`${base}/registrar?tipo=${b.tipo}`)
  }

  function deNuevo() {
    setResultado(null); setError(null); setFase('listo'); setTexto('')
  }

  const b = resultado?.borrador
  const nombreCuenta = b?.cuenta != null ? catalogo.cuentas.find((c) => c.id === b.cuenta)?.nombre ?? null : null
  const nombreCategoria = b?.categoria != null ? catalogo.categorias.find((c) => c.id === b.categoria)?.nombre ?? null : null
  const nombreActividad = b?.actividad != null ? catalogo.actividades.find((a) => a.id === b.actividad)?.nombre ?? null : null

  return (
    <div className="fz-stack">
      <div className="fz-entre">
        <h1 className="fz-h1">Nota de voz</h1>
        <Volver a={base} etiqueta="Inicio" />
      </div>

      {fase !== 'resultado' && (
        <>
          <p className="fz-ayuda">Di <b>qué pasó, cuánto fue, de dónde salió el dinero y de qué área</b> (consulta, cirugía, rehabilitación…). El sistema arma el borrador; tú lo revisas y lo guardas.</p>
          {soporte === false && !modoTexto && <Aviso tono="info">Este navegador no puede grabar audio. Escríbelo abajo: funciona igual.</Aviso>}
          {error && <Aviso tono="malo">{error}</Aviso>}

          {soporte && !modoTexto && (
            <div className="fz-voz">
              {fase === 'grabando' ? (
                <>
                  <button type="button" className="fz-grabar is-grabando" onClick={terminar} aria-label="Terminar grabación"><Icono n="stop" /></button>
                  <div className="fz-voz__estado"><span className="fz-voz__punto" /> Grabando · {segundos}s <span className="fz-tenue">/ {MAX_SEGUNDOS}s</span></div>
                  <p className="fz-ayuda">Toca el cuadro para terminar.</p>
                </>
              ) : fase === 'procesando' ? (
                <>
                  <span className="fz-grabar is-procesando" aria-hidden="true"><Icono n="mic" /></span>
                  <div className="fz-voz__estado">Escuchando y armando el borrador…</div>
                </>
              ) : (
                <>
                  <button type="button" className="fz-grabar" onClick={empezar} aria-label="Empezar a grabar"><Icono n="mic" /></button>
                  <div className="fz-voz__estado">Toca para grabar</div>
                </>
              )}
            </div>
          )}

          {fase === 'listo' && (
            <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
              <h3>Ejemplos</h3>
              {EJEMPLOS.map((e) => <p key={e} className="fz-ayuda">«{e}»</p>)}
            </div>
          )}

          {fase === 'listo' && (modoTexto || soporte === false ? (
            <div className="fz-campo">
              <span className="fz-etiqueta">Escríbelo</span>
              <textarea className="fz-input" rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={600} placeholder="Ej. Pagué 3,200 de una placa de titanio, de la caja chica" aria-label="Nota escrita" />
              <div className="fz-acciones-fin">
                <button type="button" className="fz-btn fz-btn--navy" disabled={!texto.trim()} onClick={() => enviar(null, texto.trim())}><Icono n="enviar" chico />Interpretar</button>
                {soporte && <button type="button" className="fz-btn fz-btn--claro" onClick={() => { setModoTexto(false); setError(null) }}>Mejor grabar</button>}
              </div>
            </div>
          ) : soporte ? (
            <p className="fz-ayuda"><button type="button" className="fz-link" onClick={() => setModoTexto(true)}>Prefiero escribirlo</button></p>
          ) : null)}
        </>
      )}

      {fase === 'resultado' && resultado && b && (
        <>
          <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
            <p className="fz-eyebrow">Esto escuché</p>
            <p className="fz-voz__transcripcion">«{resultado.transcripcion}»</p>
          </div>
          <div className="fz-tarjeta fz-pad fz-stack fz-stack--chico">
            <p className="fz-eyebrow">Esto entendí</p>
            <div className={`fz-monto-grande${b.tipo === 'entrada' ? ' is-entra' : ''}`}>{b.importe ? `${b.tipo === 'entrada' ? '+' : '−'}${fmt(Math.round(Number(b.importe) * 100), true)}` : 'Sin importe'}</div>
            <dl className="fz-dl fz-dl--compacta">
              <dt>Tipo</dt><dd>{b.tipo === 'entrada' ? 'Entrada · entró dinero' : 'Gasto · salió dinero'}</dd>
              <dt>Concepto</dt><dd>{b.concepto || <span className="fz-ambar">Falta</span>}</dd>
              <dt>{b.tipo === 'entrada' ? 'Cuenta' : 'Pagado con'}</dt><dd>{b.estado === 'propio' ? 'Dinero propio · por reembolsar' : b.estado === 'pendiente' ? (b.tipo === 'entrada' ? 'Por cobrar' : 'Por pagar') : nombreCuenta ?? <span className="fz-ambar">Falta la cuenta</span>}</dd>
              <dt>Categoría</dt><dd>{nombreCategoria ?? <span className="fz-tenue">Sin clasificar (la eliges en el formulario)</span>}</dd>
              <dt>Área</dt><dd>{nombreActividad ?? <span className="fz-tenue">Sin área (la eliges en el formulario)</span>}</dd>
              <dt>Fecha</dt><dd>{fecha(b.fechaReal, true)}{b.fechaReal === catalogo.hoy ? ' (hoy)' : ''}</dd>
              {b.contraparte && (<><dt>Contraparte</dt><dd>{b.contraparte}</dd></>)}
            </dl>
          </div>
          {resultado.dudas.length > 0 && (
            <Aviso tono="aviso"><b>Revisa en el formulario:</b> {resultado.dudas.join(' ')}</Aviso>
          )}
          <div className="fz-acciones-fin">
            <button type="button" className={`fz-btn ${b.tipo === 'entrada' ? 'fz-btn--teal' : 'fz-btn--navy'}`} onClick={revisarYGuardar}>Revisar y guardar</button>
            <button type="button" className="fz-btn fz-btn--claro" onClick={deNuevo}>Grabar de nuevo</button>
          </div>
          <p className="fz-ayuda">Nada se guarda todavía: en el formulario puedes cambiar cualquier dato antes de guardar.</p>
        </>
      )}
    </div>
  )
}
