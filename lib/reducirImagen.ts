/**
 * Reduce una foto en el navegador antes de subirla (nov-2026): lado mayor de
 * `lado` px, recorte cuadrado opcional al centro y JPEG. Así una foto de 4 MB
 * del celular llega como ~60–120 KB. Solo para el navegador (usa canvas).
 *
 * El iPhone entrega HEIC como JPEG cuando el campo pide `accept="image/*"`; si
 * el navegador no puede decodificar el archivo, se avisa con un mensaje claro.
 */
export async function reducirImagen(archivo: File, opciones: { lado?: number; cuadrada?: boolean; calidad?: number } = {}): Promise<Blob> {
  const lado = opciones.lado ?? 640
  const calidad = opciones.calidad ?? 0.85
  if (!archivo.type.startsWith('image/')) throw new Error('Elige una imagen (foto del celular, JPG o PNG).')
  let fuente: ImageBitmap | HTMLImageElement
  try {
    fuente = await createImageBitmap(archivo, { imageOrientation: 'from-image' } as ImageBitmapOptions)
  } catch {
    fuente = await new Promise<HTMLImageElement>((ok, mal) => {
      const img = new Image()
      img.onload = () => ok(img)
      img.onerror = () => mal(new Error('No pudimos leer esa imagen. Prueba con otra foto (JPG o PNG).'))
      img.src = URL.createObjectURL(archivo)
    })
  }
  const w = 'naturalWidth' in fuente ? fuente.naturalWidth : fuente.width
  const h = 'naturalHeight' in fuente ? fuente.naturalHeight : fuente.height
  let sx = 0, sy = 0, sw = w, sh = h
  if (opciones.cuadrada) {
    const m = Math.min(w, h)
    sx = (w - m) / 2
    sy = (h - m) / 2
    sw = sh = m
  }
  const escala = Math.min(1, lado / Math.max(sw, sh))
  const cw = Math.max(1, Math.round(sw * escala)), ch = Math.max(1, Math.round(sh * escala))
  const canvas = document.createElement('canvas')
  canvas.width = cw
  canvas.height = ch
  const g = canvas.getContext('2d')
  if (!g) throw new Error('Tu navegador no pudo preparar la foto.')
  g.fillStyle = '#fff'
  g.fillRect(0, 0, cw, ch)
  g.imageSmoothingQuality = 'high'
  g.drawImage(fuente as CanvasImageSource, sx, sy, sw, sh, 0, 0, cw, ch)
  if ('close' in fuente && typeof fuente.close === 'function') fuente.close()
  return await new Promise<Blob>((ok, mal) => canvas.toBlob((b) => (b ? ok(b) : mal(new Error('No se pudo preparar la foto.'))), 'image/jpeg', calidad))
}
