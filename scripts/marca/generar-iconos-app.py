"""
Iconos de la plataforma (panel, portal y sitio) para la pestaña del navegador
y la pantalla de inicio del celular (nov-2026).

Parte del isotipo oficial (public/logo-mark.png: trazos negros, círculo y cruz
en menta, fondo transparente) y lo pone sobre blanco, sin texto: el nombre lo
escribe el teléfono debajo del icono (manifest `short_name`). Finanzas conserva
sus propios iconos (public/finanzas/, scripts/iconos-finanzas/).

Genera en public/app/:

  icon-192.png / icon-512.png                    Android (manifest, purpose "any")
  icon-maskable-192.png / icon-maskable-512.png  Android con máscara (dibujo en el 64 % central)
  apple-icon.png (180×180, sin transparencia)    iPhone (apple-touch-icon)
  favicon-32.png / favicon-64.png                pestaña del navegador

Uso (solo si cambia el logotipo):  python3 scripts/marca/generar-iconos-app.py
Otra clínica: reemplaza public/logo-mark.png y vuelve a correrlo (--fondo "#ffffff").
"""
import argparse
import os
from PIL import Image, ImageDraw

RAIZ = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))


def color(hexa):
    h = hexa.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)) + (255,)


def recortar(im):
    caja = im.getbbox()
    return im.crop(caja) if caja else im


def lienzo(tam, marca, proporcion, fondo):
    base = Image.new('RGBA', (tam, tam), fondo)
    lado = int(tam * proporcion)
    m = marca.copy()
    m.thumbnail((lado, lado), Image.LANCZOS)
    base.alpha_composite(m, ((tam - m.width) // 2, (tam - m.height) // 2))
    return base


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fondo', default='#ffffff')
    ap.add_argument('--origen', default=os.path.join(RAIZ, 'public', 'logo-mark.png'))
    a = ap.parse_args()
    fondo = color(a.fondo)
    marca = recortar(Image.open(a.origen).convert('RGBA'))
    salida = os.path.join(RAIZ, 'public', 'app')
    os.makedirs(salida, exist_ok=True)
    for tam in (192, 512):
        lienzo(tam, marca, 0.80, fondo).save(os.path.join(salida, f'icon-{tam}.png'), optimize=True)
        lienzo(tam, marca, 0.64, fondo).save(os.path.join(salida, f'icon-maskable-{tam}.png'), optimize=True)
    lienzo(180, marca, 0.78, fondo).convert('RGB').save(os.path.join(salida, 'apple-icon.png'), optimize=True)
    for tam in (32, 64):
        # Círculo blanco detrás: los trazos negros se leen también en pestañas oscuras.
        x = 4
        grande = Image.new('RGBA', (tam * x, tam * x), (0, 0, 0, 0))
        ImageDraw.Draw(grande).ellipse((0, 0, tam * x - 1, tam * x - 1), fill=fondo)
        grande.alpha_composite(lienzo(tam * x, marca, 0.84, (0, 0, 0, 0)))
        grande.resize((tam, tam), Image.LANCZOS).save(os.path.join(salida, f'favicon-{tam}.png'), optimize=True)
    print('Listo:', ', '.join(sorted(os.listdir(salida))))


if __name__ == '__main__':
    main()
