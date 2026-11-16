import config from '@payload-config'
import { getPayload } from 'payload'

/**
 * Foto del sitio público (home versión B, nov-2026). Pública: son las fotos
 * de la página principal («Fotos del sitio»). La liga lleva `?v=` con la fecha
 * de la última edición, así que se puede guardar en caché un año.
 */
export const dynamic = 'force-dynamic'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) return new Response('No encontrada', { status: 404 })
  const payload = await getPayload({ config })
  const foto = await payload.findByID({ collection: 'sitio-fotos', id, depth: 0, overrideAccess: true }).catch(() => null)
  const m = foto && /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(foto.imagen)
  if (!m) return new Response('No encontrada', { status: 404 })
  return new Response(Buffer.from(m[2], 'base64'), {
    headers: { 'Content-Type': m[1], 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' },
  })
}
