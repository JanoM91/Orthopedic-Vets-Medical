import type { MetadataRoute } from 'next'
import { site } from '../lib/site'

/** Solo el sitio público se indexa; panel, portal y API no. */
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: '*', allow: ['/', '/servicios', '/aviso-de-privacidad'], disallow: ['/admin', '/portal', '/api', '/finanzas'] }], sitemap: `${site.url}/sitemap.xml` }
}
