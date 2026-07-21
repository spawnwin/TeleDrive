#!/usr/bin/env python3
"""Generate Expo + Android launcher icons for Рубеж."""
from PIL import Image, ImageEnhance
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC_ICON = Path('/opt/cursor/artifacts/assets/rubezh-app-icon.png')
SRC_BG = Path('/opt/cursor/artifacts/assets/rubezh-icon-bg.png')
# fallbacks inside repo
if not SRC_ICON.exists():
    SRC_ICON = ROOT / 'landing/assets/rubezh-icon.png'
if not SRC_BG.exists():
    SRC_BG = ROOT / 'client/assets/android-icon-background.png'

assets = ROOT / 'client/assets'
res = ROOT / 'client/android/app/src/main/res'
landing = ROOT / 'landing/assets'

icon = Image.open(SRC_ICON).convert('RGBA')
bg = Image.open(SRC_BG).convert('RGBA')

def fit_square(im, size):
    im = im.copy()
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas

def make_foreground(size=1024, safe=0.66):
    base = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    content_size = int(size * safe)
    content = ImageEnhance.Sharpness(fit_square(icon, content_size)).enhance(1.15)
    base.paste(content, ((size - content_size) // 2, (size - content_size) // 2), content)
    return base

def make_background(size=1024):
    return bg.resize((size, size), Image.Resampling.LANCZOS).convert('RGBA')

def make_full_icon(size=1024):
    return Image.alpha_composite(make_background(size), make_foreground(size, safe=0.78))

def make_monochrome(size=1024):
    fg = make_foreground(size, safe=0.7).convert('L')
    bw = fg.point(lambda p: 255 if p > 40 else 0)
    mono = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    mono.paste(Image.new('RGBA', (size, size), (255, 255, 255, 255)), (0, 0), bw)
    return mono

assets.mkdir(parents=True, exist_ok=True)
make_full_icon(1024).save(assets / 'icon.png')
make_foreground(1024, 0.68).save(assets / 'android-icon-foreground.png')
make_background(1024).save(assets / 'android-icon-background.png')
make_monochrome(1024).save(assets / 'android-icon-monochrome.png')
fit_square(make_full_icon(1024), 512).save(assets / 'splash-icon.png')
fit_square(make_full_icon(1024), 192).save(assets / 'favicon.png')
landing.mkdir(parents=True, exist_ok=True)
make_full_icon(1024).save(landing / 'rubezh-icon.png')

if res.exists():
    densities = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
    adaptive = {'mdpi': 108, 'hdpi': 162, 'xhdpi': 216, 'xxhdpi': 324, 'xxxhdpi': 432}
    for name, size in densities.items():
        folder = res / f'mipmap-{name}'
        folder.mkdir(exist_ok=True)
        make_full_icon(size).save(folder / 'ic_launcher.webp', 'WEBP', quality=92)
        make_full_icon(size).save(folder / 'ic_launcher_round.webp', 'WEBP', quality=92)
        a = adaptive[name]
        make_foreground(a, 0.68).save(folder / 'ic_launcher_foreground.webp', 'WEBP', quality=92)
        make_background(a).save(folder / 'ic_launcher_background.webp', 'WEBP', quality=92)
        make_monochrome(a).save(folder / 'ic_launcher_monochrome.webp', 'WEBP', quality=92)
print('icons updated')
