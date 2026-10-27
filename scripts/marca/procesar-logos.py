"""
Logotipos de la instalación a partir de los originales que entrega la clínica
(JPG con fondo blanco). Genera PNG con fondo transparente en public/:

  logo-mark.png        isotipo (círculo, rodilla y cruz), para fondos claros
  logo-mark-white.png  el mismo isotipo con los trazos negros en blanco, para
                       fondos oscuros (cabecera del portal, panel, iconos)
  logo-ovm.png         logotipo completo con el nombre (pantalla de acceso)
  marcas/peluqueadogs.png  submarca de la estética (fondo transparente)

Cómo quita el fondo: en el logotipo de OVM todo el blanco se vuelve
transparente salvo el de la cruz (las siluetas del perro y el gato); en
Peluqueadogs solo el blanco conectado con el borde (las letras se conservan). En
el contorno del dibujo «des-multiplica» el blanco para que el borde suavizado no
deje halo sobre fondos oscuros.

Uso (solo si cambian los originales):
  python3 scripts/marca/procesar-logos.py <logo-ovm.jpg> <logo-peluqueadogs.jpg>
"""
import os
import sys
from collections import deque

from PIL import Image, ImageFilter

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
UMBRAL_BLANCO = 232  # canal mínimo para considerar un pixel «blanco de fondo»


def fondo_conectado(im):
    """Máscara (L) con 255 donde el pixel es blanco y está conectado al borde."""
    w, h = im.size
    px = im.load()
    visto = bytearray(w * h)
    cola = deque()

    def blanco(x, y):
        r, g, b = px[x, y][:3]
        return min(r, g, b) >= UMBRAL_BLANCO

    for x in range(w):
        for y in (0, h - 1):
            if blanco(x, y) and not visto[y * w + x]:
                visto[y * w + x] = 1
                cola.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if blanco(x, y) and not visto[y * w + x]:
                visto[y * w + x] = 1
                cola.append((x, y))
    while cola:
        x, y = cola.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not visto[ny * w + nx] and blanco(nx, ny):
                visto[ny * w + nx] = 1
                cola.append((nx, ny))
    m = Image.new('L', (w, h), 0)
    m.putdata([255 if v else 0 for v in visto])
    return m


def sin_fondo(im, conservar=None):
    """conservar: cajas (x0, y0, x1, y1) donde el blanco se queda opaco (las dos
    barras de la cruz, con las siluetas). Sin cajas, solo se quita el blanco
    conectado con el borde."""
    im = im.convert('RGB')
    if conservar:
        # Todo el blanco es fondo, salvo el que está dentro de la caja.
        fondo = Image.new('L', im.size, 0)
        src0 = im.load()
        fpx = fondo.load()
        def dentro(x, y):
            return any(x0 <= x < x1 and y0 <= y < y1 for x0, y0, x1, y1 in conservar)

        for y in range(im.size[1]):
            for x in range(im.size[0]):
                if min(src0[x, y]) >= UMBRAL_BLANCO and not dentro(x, y):
                    fpx[x, y] = 255
    else:
        fondo = fondo_conectado(im)
    borde = fondo.filter(ImageFilter.MaxFilter(5))  # fondo + 2 px alrededor
    w, h = im.size
    src = im.load()
    f = fondo.load()
    b = borde.load()
    out = Image.new('RGBA', (w, h))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            r, g, bl = src[x, y]
            if f[x, y]:
                dst[x, y] = (255, 255, 255, 0)
            elif b[x, y]:
                # des-multiplicar el blanco: c = a*color + (1-a)*255
                a = max(255 - r, 255 - g, 255 - bl) / 255
                if a <= 0.02:
                    dst[x, y] = (255, 255, 255, 0)
                else:
                    c = [round(min(255, max(0, (v - 255 * (1 - a)) / a))) for v in (r, g, bl)]
                    dst[x, y] = (c[0], c[1], c[2], round(a * 255))
            else:
                dst[x, y] = (r, g, bl, 255)
    return out


def recortar(im, margen=0.04):
    caja = im.getbbox()
    im = im.crop(caja)
    w, h = im.size
    lado = max(w, h)
    lado = int(lado * (1 + 2 * margen))
    lienzo = Image.new('RGBA', (lado, lado), (255, 255, 255, 0))
    lienzo.alpha_composite(im, ((lado - w) // 2, (lado - h) // 2))
    return lienzo


def trazos_a_blanco(im):
    """Negro/gris oscuro neutro → blanco; el color de marca y lo blanco quedan igual."""
    out = im.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a and max(r, g, b) - min(r, g, b) < 40 and max(r, g, b) < 140:
                px[x, y] = (255, 255, 255, a)
    return out


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    ovm = Image.open(sys.argv[1]).convert('RGB')
    pelu = Image.open(sys.argv[2]).convert('RGB')

    # La cruz con las siluetas del perro y el gato (esquina superior derecha).
    # Medidas en el original de 1195 × 1434: barra vertical x 772–858, y 218–422;
    # barra horizontal x 712–917, y 278–368. Se guardan como fracciones.
    W, H = ovm.size
    cruz = [
        (int(W * 772 / 1195), int(H * 218 / 1434), int(W * 859 / 1195), int(H * 423 / 1434)),
        (int(W * 712 / 1195), int(H * 278 / 1434), int(W * 918 / 1195), int(H * 369 / 1434)),
    ]
    completo = sin_fondo(ovm, conservar=cruz)
    # El isotipo es la parte de arriba (círculo y cruz); el texto empieza ~63 % de la altura.
    w, h = completo.size
    isotipo = completo.crop((0, 0, w, int(h * 0.62)))

    mark = recortar(isotipo).resize((512, 512), Image.LANCZOS)
    mark.save(os.path.join(RAIZ, 'public/logo-mark.png'), optimize=True)
    trazos_a_blanco(mark).save(os.path.join(RAIZ, 'public/logo-mark-white.png'), optimize=True)
    recortar(completo, 0.03).resize((800, 800), Image.LANCZOS).save(os.path.join(RAIZ, 'public/logo-ovm.png'), optimize=True)

    os.makedirs(os.path.join(RAIZ, 'public/marcas'), exist_ok=True)
    p = sin_fondo(pelu)
    p = p.crop(p.getbbox())
    p.thumbnail((800, 800), Image.LANCZOS)
    p.save(os.path.join(RAIZ, 'public/marcas/peluqueadogs.png'), optimize=True)
    print('Listo: public/logo-mark.png, logo-mark-white.png, logo-ovm.png, marcas/peluqueadogs.png')


if __name__ == '__main__':
    main()
