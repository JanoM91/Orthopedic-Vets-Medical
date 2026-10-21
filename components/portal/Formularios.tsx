'use client'

/**
 * Formularios del portal del tutor (componentes de cliente): entrar,
 * registrarse, vincular, cuenta, recuperar contraseña y aportar documento.
 * Hablan con la API de Payload de la colección «tutores» y con /api/clinica/portal.
 */
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import React, { useState } from 'react'

async function pedir<T>(url: string, cuerpo?: unknown, metodo = 'POST'): Promise<T> {
  const r = await fetch(url, {
    method: metodo,
    credentials: 'same-origin',
    headers: cuerpo instanceof FormData || cuerpo === undefined ? {} : { 'Content-Type': 'application/json' },
    body: cuerpo instanceof FormData ? cuerpo : cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  })
  let data: unknown = null
  try {
    data = await r.json()
  } catch {
    data = null
  }
  if (!r.ok) {
    const d = data as { error?: string; errors?: { message?: string }[] } | null
    throw new Error(d?.error || d?.errors?.[0]?.message || (r.status === 401 ? 'Correo o contraseña incorrectos.' : 'No se pudo completar. Intenta de nuevo.'))
  }
  return data as T
}

function Error_({ e }: { e: string | null }) {
  return e ? (
    <div className="pt-aviso pt-aviso--bad" role="alert">
      {e}
    </div>
  ) : null
}

export function FormEntrar({ siguiente }: { siguiente?: string }) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  return (
    <form
      className="pt-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setOcupado(true)
        setError(null)
        try {
          await pedir('/api/tutores/login', { email, password: pass })
          router.push(siguiente || '/portal')
          router.refresh()
        } catch (er) {
          setError(er instanceof Error ? er.message : 'No se pudo entrar.')
          setOcupado(false)
        }
      }}
    >
      <label className="pt-campo">
        <span>Correo</span>
        <input className="pt-input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label className="pt-campo">
        <span>Contraseña</span>
        <input className="pt-input" type="password" autoComplete="current-password" value={pass} onChange={(e) => setPass(e.target.value)} required />
      </label>
      <Error_ e={error} />
      <button className="pt-btn pt-btn--primario pt-btn--bloque" disabled={ocupado}>
        {ocupado ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="pt-chico" style={{ textAlign: 'center' }}>
        <Link href="/portal/olvide">Olvidé mi contraseña</Link> · ¿Primera vez? <Link href="/portal/registro">Crear cuenta</Link>
      </p>
    </form>
  )
}

export function FormRegistro() {
  const router = useRouter()
  const [d, setD] = useState({ nombre: '', telefono: '', email: '', password: '', confirmar: '' })
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const set = (k: keyof typeof d, v: string) => setD((x) => ({ ...x, [k]: v }))
  return (
    <form
      className="pt-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (d.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
        if (d.password !== d.confirmar) return setError('Las contraseñas no coinciden.')
        setOcupado(true)
        setError(null)
        try {
          await pedir('/api/tutores', { nombre: d.nombre, telefono: d.telefono, email: d.email, password: d.password })
          await pedir('/api/tutores/login', { email: d.email, password: d.password })
          router.push('/portal/vincular')
          router.refresh()
        } catch (er) {
          setError(er instanceof Error ? er.message : 'No se pudo crear la cuenta.')
          setOcupado(false)
        }
      }}
    >
      <label className="pt-campo">
        <span>Tu nombre</span>
        <input className="pt-input" autoComplete="name" value={d.nombre} onChange={(e) => set('nombre', e.target.value)} required />
      </label>
      <label className="pt-campo">
        <span>Teléfono (WhatsApp)</span>
        <input className="pt-input" inputMode="tel" autoComplete="tel" value={d.telefono} onChange={(e) => set('telefono', e.target.value)} />
      </label>
      <label className="pt-campo">
        <span>Correo</span>
        <input className="pt-input" type="email" autoComplete="email" value={d.email} onChange={(e) => set('email', e.target.value)} required />
      </label>
      <label className="pt-campo">
        <span>Contraseña (mínimo 8 caracteres)</span>
        <input className="pt-input" type="password" autoComplete="new-password" value={d.password} onChange={(e) => set('password', e.target.value)} required minLength={8} />
      </label>
      <label className="pt-campo">
        <span>Repite la contraseña</span>
        <input className="pt-input" type="password" autoComplete="new-password" value={d.confirmar} onChange={(e) => set('confirmar', e.target.value)} required />
      </label>
      <Error_ e={error} />
      <button className="pt-btn pt-btn--primario pt-btn--bloque" disabled={ocupado}>
        {ocupado ? 'Creando…' : 'Crear cuenta'}
      </button>
      <p className="pt-chico" style={{ textAlign: 'center' }}>
        ¿Ya tienes cuenta? <Link href="/portal/entrar">Entrar</Link>
      </p>
    </form>
  )
}

export function FormVincular() {
  const router = useRouter()
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  return (
    <form
      className="pt-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setOcupado(true)
        setError(null)
        try {
          await pedir('/api/clinica/portal/vincular', { codigo })
          /* La cookie trae el usuario viejo (sin ficha): se vuelve a entrar para refrescarla. */
          await fetch('/api/tutores/refresh-token', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
          router.push('/portal')
          router.refresh()
        } catch (er) {
          setError(er instanceof Error ? er.message : 'No se pudo vincular.')
          setOcupado(false)
        }
      }}
    >
      <label className="pt-campo">
        <span>Código de vinculación</span>
        <input className="pt-input pt-codigo" value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} required maxLength={8} autoComplete="one-time-code" placeholder="ABC234" autoFocus />
      </label>
      <Error_ e={error} />
      <button className="pt-btn pt-btn--primario pt-btn--bloque" disabled={ocupado || codigo.trim().length < 4}>
        {ocupado ? 'Vinculando…' : 'Vincular mi cuenta'}
      </button>
    </form>
  )
}

export function FormCuenta({ tutor }: { tutor: { id: number; nombre: string; telefono: string | null } }) {
  const router = useRouter()
  const [nombre, setNombre] = useState(tutor.nombre)
  const [telefono, setTelefono] = useState(tutor.telefono ?? '')
  const [pass, setPass] = useState('')
  const [msg, setMsg] = useState<{ ok?: string; error?: string }>({})
  return (
    <form
      className="pt-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setMsg({})
        try {
          await pedir(`/api/tutores/${tutor.id}`, { nombre, telefono, ...(pass ? { password: pass } : {}) }, 'PATCH')
          setPass('')
          setMsg({ ok: 'Guardado.' })
          router.refresh()
        } catch (er) {
          setMsg({ error: er instanceof Error ? er.message : 'No se pudo guardar.' })
        }
      }}
    >
      <label className="pt-campo">
        <span>Nombre</span>
        <input className="pt-input" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
      </label>
      <label className="pt-campo">
        <span>Teléfono</span>
        <input className="pt-input" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
      </label>
      <label className="pt-campo">
        <span>Nueva contraseña (déjala vacía para no cambiarla)</span>
        <input className="pt-input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} minLength={8} />
      </label>
      {msg.ok && <div className="pt-aviso pt-aviso--ok">{msg.ok}</div>}
      <Error_ e={msg.error ?? null} />
      <button className="pt-btn pt-btn--primario">Guardar</button>
    </form>
  )
}

export function BotonSalir() {
  const router = useRouter()
  return (
    <button
      type="button"
      className="pt-btn"
      onClick={async () => {
        await fetch('/api/tutores/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined)
        router.push('/portal/entrar')
        router.refresh()
      }}
    >
      Cerrar sesión
    </button>
  )
}

export function FormOlvide() {
  const [email, setEmail] = useState('')
  const [listo, setListo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (listo) return <div className="pt-aviso pt-aviso--ok">Si ese correo tiene cuenta, te llegará una liga para crear una contraseña nueva. Revisa también el correo no deseado.</div>
  return (
    <form
      className="pt-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await pedir('/api/tutores/forgot-password', { email })
          setListo(true)
        } catch (er) {
          setError(er instanceof Error ? er.message : 'No se pudo enviar.')
        }
      }}
    >
      <label className="pt-campo">
        <span>Correo de tu cuenta</span>
        <input className="pt-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <Error_ e={error} />
      <button className="pt-btn pt-btn--primario pt-btn--bloque">Enviar liga</button>
    </form>
  )
}

export function FormRestablecer({ token }: { token: string }) {
  const router = useRouter()
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <form
      className="pt-form"
      onSubmit={async (e) => {
        e.preventDefault()
        setError(null)
        try {
          await pedir('/api/tutores/reset-password', { token, password: pass })
          router.push('/portal')
          router.refresh()
        } catch (er) {
          setError(er instanceof Error ? er.message : 'La liga ya no sirve. Pide otra.')
        }
      }}
    >
      <label className="pt-campo">
        <span>Contraseña nueva (mínimo 8 caracteres)</span>
        <input className="pt-input" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} required minLength={8} />
      </label>
      <Error_ e={error} />
      <button className="pt-btn pt-btn--primario pt-btn--bloque">Guardar y entrar</button>
    </form>
  )
}

export function FormAportar({ mascotaId, habilitado }: { mascotaId: number; habilitado: boolean }) {
  const router = useRouter()
  const [archivo, setArchivo] = useState<File | null>(null)
  const [titulo, setTitulo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [abierto, setAbierto] = useState(false)
  if (!abierto)
    return (
      <button type="button" className="pt-btn" onClick={() => setAbierto(true)}>
        Aportar antecedente o estudio
      </button>
    )
  return (
    <form
      className="pt-card pt-form"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!archivo) return
        setOcupado(true)
        setError(null)
        try {
          const fd = new FormData()
          fd.append('archivo', archivo)
          fd.append('titulo', titulo || archivo.name)
          await pedir(`/api/clinica/portal/mascotas/${mascotaId}/documentos`, fd)
          setAbierto(false)
          router.refresh()
        } catch (er) {
          setError(er instanceof Error ? er.message : 'No se pudo subir.')
        }
        setOcupado(false)
      }}
    >
      <h3>Aportar antecedente o estudio</h3>
      <p className="pt-chico pt-tenue">Foto o PDF (cartilla anterior, estudios de otra clínica). Queda marcado como pendiente de revisión por el médico; no modifica registros firmados.</p>
      {!habilitado && <div className="pt-aviso pt-aviso--warn">La clínica aún no tiene habilitada la carga de archivos.</div>}
      <label className="pt-campo">
        <span>Archivo</span>
        <input className="pt-input" type="file" accept="image/*,application/pdf" onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} required />
      </label>
      <label className="pt-campo">
        <span>¿Qué es?</span>
        <input className="pt-input" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej. Cartilla anterior, radiografía de 2024" />
      </label>
      <Error_ e={error} />
      <div className="pt-acciones">
        <button className="pt-btn pt-btn--primario" disabled={!archivo || ocupado || !habilitado}>
          {ocupado ? 'Subiendo…' : 'Subir'}
        </button>
        <button type="button" className="pt-btn" onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
