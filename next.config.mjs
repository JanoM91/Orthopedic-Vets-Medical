import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  /* La raíz es el sitio público (app/(sitio)). /finanzas sigue siendo el atajo del equipo al módulo de Finanzas. */
  async redirects() {
    return [{ source: '/finanzas', destination: '/admin/finanzas', permanent: false }]
  },
}

export default withPayload(nextConfig)
