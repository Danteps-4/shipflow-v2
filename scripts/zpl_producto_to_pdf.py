"""
Receives via stdin: JSON { file_b64: str, filename: str }
file_b64 is a ZIP (containing a .txt with ZPL) or a raw .txt with ZPL,
exported from Mercado Libre ("Etiquetas de producto.txt") — códigos de
barra + SKU para identificar el producto en depósito, sin relación con
la etiqueta de envío (ver scripts/zpl_to_pdf.py).

Cada bloque ^XA...^XZ trae 2 etiquetas ya armadas lado a lado (una
"fila"), pero solo ocupa una franja chica del rollo de 4x6": renderizar
un bloque por página desperdiciaría casi todo el rollo. En cambio,
cada bloque se renderiza y se recorta a su alto real de contenido, y
se apilan ROWS_PER_PAGE filas (10 etiquetas) por página física —igual
a como lo arma Mercado Libre en su propio preview de impresión.

Returns base64-encoded PDF via stdout.
"""

import sys
import json
import base64
import re
import io
import time
import zipfile
import urllib.request
import urllib.error

from PIL import Image
from reportlab.lib.pagesizes import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

# Mismo rollo (100x150mm ≈ 4x6") que usa la etiqueta de envío.
LABELARY_URL = "https://api.labelary.com/v1/printers/8dpmm/labels/4.0x6.0/0/"
LABEL_W_IN, LABEL_H_IN = 4.0, 6.0
DPI = 203.2  # 8 dots/mm, la densidad que pide LABELARY_URL
PT_PER_DOT = 72.0 / DPI

# Alto real del contenido de una fila (2 etiquetas), medido sobre un
# render de referencia (contenido hasta ~184px, se deja margen). El
# ancho se usa completo (el label ya sale renderizado a los 4" de ancho).
ROW_H_DOTS = 200
ROWS_PER_PAGE = 5
ROW_GAP_PT = 14  # separación entre filas — con menos quedaban casi pegadas

RENDER_DELAY_S = 0.3       # pausa entre etiquetas para no superar el rate limit
MAX_RETRIES = 5


def extract_zpl(file_bytes: bytes, filename: str) -> str:
    if filename.lower().endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(file_bytes)) as zf:
            txt_names = [n for n in zf.namelist() if n.lower().endswith(".txt")]
            if not txt_names:
                raise ValueError("El ZIP no contiene ningún archivo .txt con ZPL.")
            with zf.open(txt_names[0]) as f:
                return f.read().decode("utf-8", errors="replace")
    return file_bytes.decode("utf-8", errors="replace")


def split_labels(zpl_text: str) -> list:
    labels = re.findall(r"\^XA.*?\^XZ", zpl_text, re.DOTALL)
    return [l for l in labels if len(l) > 20 and "^FO" in l]


def render_zpl_to_png(zpl: str) -> bytes:
    req = urllib.request.Request(
        LABELARY_URL,
        data=zpl.encode("utf-8"),
        headers={"Accept": "image/png", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    delay = 1.0
    for attempt in range(MAX_RETRIES):
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                return resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < MAX_RETRIES - 1:
                time.sleep(delay)
                delay *= 2
                continue
            raise


# Recorta el render (una página 4x6" casi vacía) a la franja de arriba
# donde está la fila de 2 etiquetas, para poder apilar varias por página.
def crop_row(png_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(png_bytes)).convert("RGB")
    h = min(ROW_H_DOTS, img.height)
    return img.crop((0, 0, img.width, h))


def build_pdf(row_images: list) -> bytes:
    page_w_pt, page_h_pt = LABEL_W_IN * inch, LABEL_H_IN * inch
    row_w_pt = row_images[0].width * PT_PER_DOT
    row_h_pt = row_images[0].height * PT_PER_DOT
    content_h_pt = ROWS_PER_PAGE * row_h_pt + (ROWS_PER_PAGE - 1) * ROW_GAP_PT
    top_margin_pt = max((page_h_pt - content_h_pt) / 2, 0)
    left_margin_pt = max((page_w_pt - row_w_pt) / 2, 0)

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w_pt, page_h_pt))

    for i, img in enumerate(row_images):
        pos = i % ROWS_PER_PAGE
        x = left_margin_pt
        y = page_h_pt - top_margin_pt - (pos + 1) * row_h_pt - pos * ROW_GAP_PT

        c.drawImage(ImageReader(img), x, y, width=row_w_pt, height=row_h_pt)
        c.setLineWidth(0.75)
        c.rect(x, y, row_w_pt, row_h_pt)
        c.line(x + row_w_pt / 2, y, x + row_w_pt / 2, y + row_h_pt)

        if pos == ROWS_PER_PAGE - 1:
            c.showPage()

    if len(row_images) % ROWS_PER_PAGE != 0:
        c.showPage()

    c.save()
    buf.seek(0)
    return buf.read()


def main():
    raw = sys.stdin.buffer.read()
    data = json.loads(raw.decode("utf-8"))

    file_bytes = base64.b64decode(data["file_b64"])
    filename = data.get("filename", "")

    zpl_text = extract_zpl(file_bytes, filename)
    labels = split_labels(zpl_text)

    if not labels:
        print("No se encontraron etiquetas ZPL en el archivo.", file=sys.stderr)
        sys.exit(1)

    row_images = []
    for i, zpl in enumerate(labels):
        if i > 0:
            time.sleep(RENDER_DELAY_S)
        png_bytes = render_zpl_to_png(zpl)
        row_images.append(crop_row(png_bytes))

    pdf_bytes = build_pdf(row_images)
    sys.stdout.write(base64.b64encode(pdf_bytes).decode("utf-8"))


if __name__ == "__main__":
    main()
