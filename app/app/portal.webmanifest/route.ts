import { NextResponse } from 'next/server'
import { manifest } from '@/lib/appInstalable'

/** /app/portal.webmanifest — ficha de instalación (portal). Ver lib/appInstalable.ts. Sin sesión: el teléfono la pide sin cookies. */
export const dynamic = 'force-static'

export function GET() {
  return NextResponse.json(manifest('portal'), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
  })
}
