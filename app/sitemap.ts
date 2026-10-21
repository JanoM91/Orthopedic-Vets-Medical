import type { MetadataRoute } from 'next'
import { site } from '../lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: `${site.url}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${site.url}/servicios`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${site.url}/aviso-de-privacidad`, changeFrequency: 'yearly', priority: 0.2 },
  ]
}
