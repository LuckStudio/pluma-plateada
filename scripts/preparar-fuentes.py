"""Prepara las fuentes TTF que se incrustan en el PDF del libro (public/fonts/).

Origen: paquete npm @expo-google-fonts/cormorant-garamond (Cormorant Garamond, SIL OFL).
Las cursivas de ese paquete hacen fallar a fontkit (lee fuera del búfer al calcular los anchos
de todos los glifos); reescribirlas con fontTools normaliza las tablas y lo resuelve.

Uso: python3 scripts/preparar-fuentes.py <carpeta del paquete npm desempaquetado>
"""
import shutil
import sys
from pathlib import Path

from fontTools.ttLib import TTFont

origen = Path(sys.argv[1])
destino = Path(__file__).resolve().parent.parent / 'public' / 'fonts'
archivos = {
    '400Regular/CormorantGaramond_400Regular.ttf': 'CormorantGaramond-Regular.ttf',
    '400Regular_Italic/CormorantGaramond_400Regular_Italic.ttf': 'CormorantGaramond-Italic.ttf',
    '600SemiBold/CormorantGaramond_600SemiBold.ttf': 'CormorantGaramond-SemiBold.ttf',
}
for src, dst in archivos.items():
    if 'Italic' in src:
        TTFont(origen / src).save(destino / dst)
    else:
        shutil.copy(origen / src, destino / dst)
    print('listo', dst)
