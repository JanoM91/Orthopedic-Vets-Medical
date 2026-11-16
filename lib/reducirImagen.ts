/**
 * Reduce una foto en el navegador antes de subirla (nov-2026): lado mayor de
 * `lado` px, recorte cuadrado opcional al centro y JPEG. Así una foto de 4 MB
 * del celular llega como ~60–150 KB. Solo para el navegador (usa canvas).
 *
 * 17-nov-2026 (fotos que no subían):
 *   - Se acepta cualquier archivo que el navegador pueda abrir como imagen,
 *     aunque el teléfono no diga su tipo (algunos selectores de Android y
 *     Google Fotos lo mandan vacío). Solo se rechaza de entrada lo que
 *     claramente no es foto (video, PDF…).
 *   - HEIC/HEIF (iPhone): Safari lo abre solo y, al elegir desde el iPhone,
 *     el selector ya lo entrega como JPEG. Chrome y Firefox en la computadora
 *     o en Android no lo abren; entonces se avisa qué hacer.
 *   - El resultado nunca pasa de `maxBytes` (por omisión 550 KB): si una foto
 *     con mucho detalle queda más pesada, se vuelve a comprimir con menos
 *     calidad y, si hace falta, más chica.
 */

const EXT_IMAGEN = /\.(jpe?g|jfif|png|webp|gif|bmp|avif|heic|heif|tiff?)$/i
const EXT_HEIC = /\.(heic|heif)$/i
const NO_ES_FOTO = /^(video|audio|text|application\/(pdf|zip|msword|vnd\.))/i

export class ErrorFoto extends Error {}

function esHeic(archivo: File): boolean {
  return /image\/hei[cf]/i.test(archivo.type) || EXT_HEIC.test(archivo.name)
}

async function abrir(archivo: File): Promise<{ fuente: CanvasImageSource; w: number; h: number; cerrar: () => void }> {
  try {
    const b = await createImageBitmap(archivo, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    return { fuente: b, w: b.width, h: b.height, cerrar: () => b.close() }
  } catch {
    /* Safari viejo no acepta las opciones; abajo va con <img>. */
  }
  const url = URL.createObjectURL(archivo)
  try {
    const img = new Image()
    img.decoding = 'async'
    img.src = url
    await img.decode()
    if (!img.naturalWidth) throw new Error('sin tamaño')
    return { fuente: img, w: img.naturalWidth, h: img.naturalHeight, cerrar: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    if (esHeic(archivo)) throw new ErrorFoto('Esta foto está en formato HEIC (iPhone) y este navegador no la puede abrir. Súbela desde el iPhone, o desde Safari, o guárdala antes como JPG.')
    throw new ErrorFoto('No pudimos abrir esa imagen. Prueba con otra foto o tómala con la cámara.')
  }
}

function aBlob(canvas: HTMLCanvasElement, calidad: number): Promise<Blob> {
  return new Promise<Blob>((ok, mal) => {
    try {
      canvas.toBlob(
        (b) => {
          if (b) return ok(b)
          /* Algunos Safari viejos devuelven null: se arma desde el dataURL. */
          try {
            const [, b64] = canvas.toDataURL('image/jpeg', calidad).split(',')
            const bin = atob(b64)
            const bytes = new Uint8Array(bin.length)
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
            ok(new Blob([bytes], { type: 'image/jpeg' }))
          } catch {
            mal(new ErrorFoto('No se pudo preparar la foto.'))
          }
        },
        'image/jpeg',
        calidad,
      )
    } catch {
      mal(new ErrorFoto('No se pudo preparar la foto.'))
    }
  })
}

export async function reducirImagen(archivo: File, opciones: { lado?: number; cuadrada?: boolean; calidad?: number; maxBytes?: number } = {}): Promise<Blob> {
  const lado0 = opciones.lado ?? 640
  const calidad0 = opciones.calidad ?? 0.85
  const maxBytes = opciones.maxBytes ?? 550 * 1024
  if (!archivo || !archivo.size) throw new ErrorFoto('Ese archivo está vacío. Prueba con otra foto.')
  const tipo = archivo.type || ''
  if (NO_ES_FOTO.test(tipo) || (!tipo.startsWith('image/') && tipo && !EXT_IMAGEN.test(archivo.name))) throw new ErrorFoto('Elige una foto (no un video ni un documento).')

  const { fuente, w, h, cerrar } = await abrir(archivo)
  try {
    let sx = 0
    let sy = 0
    let sw = w
    let sh = h
    if (opciones.cuadrada) {
      const m = Math.min(w, h)
      sx = (w - m) / 2
      sy = (h - m) / 2
      sw = sh = m
    }
    /* Intentos: calidad pedida → menos calidad → más chica. */
    const intentos: { lado: number; calidad: number }[] = [
      { lado: lado0, calidad: calidad0 },
      { lado: lado0, calidad: Math.min(calidad0, 0.72) },
      { lado: Math.round(lado0 * 0.8), calidad: 0.68 },
      { lado: Math.round(lado0 * 0.6), calidad: 0.62 },
    ]
    let ultimo: Blob | null = null
    for (const { lado, calidad } of intentos) {
      const escala = Math.min(1, lado / Math.max(sw, sh))
      const cw = Math.max(1, Math.round(sw * escala))
      const ch = Math.max(1, Math.round(sh * escala))
      const canvas = document.createElement('canvas')
      canvas.width = cw
      canvas.height = ch
      const g = canvas.getContext('2d')
      if (!g) throw new ErrorFoto('Tu navegador no pudo preparar la foto.')
      g.fillStyle = '#fff'
      g.fillRect(0, 0, cw, ch)
      g.imageSmoothingQuality = 'high'
      g.drawImage(fuente, sx, sy, sw, sh, 0, 0, cw, ch)
      ultimo = await aBlob(canvas, calidad)
      canvas.width = canvas.height = 0
      if (ultimo.size <= maxBytes) return ultimo
    }
    if (ultimo && ultimo.size <= maxBytes) return ultimo
    throw new ErrorFoto('La foto quedó muy pesada aun reducida. Prueba con otra.')
  } finally {
    cerrar()
  }
}
