import React from 'react'

import { site } from '../../lib/site'

/**
 * Logotipo de la pantalla de inicio de sesión del panel.
 *
 * Payload muestra su propio logotipo en /admin/login. Este componente lo
 * sustituye por el isotipo de la instalación (public/logo-ovm.png), el nombre
 * (NEXT_PUBLIC_SITE_NAME) y una línea que dice qué es esta pantalla.
 *
 * Se registra en payload.config.ts como `admin.components.graphics.Logo`.
 * Los estilos viven en app/(payload)/custom.css (clases `mx-logo-login*`).
 */
export default function Logo() {
  return (
    <div className="mx-logo-login">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt="" className="mx-logo-login__logo" src="/logo-ovm.png" />
      <span className="mx-logo-login__nombre">{site.brand.name}</span>
      <span className="mx-logo-login__sub">Panel · acceso del equipo</span>
    </div>
  )
}
