"""
Receives via stdin: JSON { file_b64: str, filename: str }
file_b64 is a ZIP (containing a .txt with ZPL) or a raw .txt with ZPL,
exported from Mercado Libre ("Etiqueta de envio.txt").

Splits the ZPL into individual labels, strips the "troquel" (die-cut)
header section if present, extracts the product SKU and injects it as
a visible text field in the blank area of the shipping label, then
renders each label at 4x6in via the Labelary API and assembles a
single PDF (one label per page).

Returns base64-encoded PDF via stdout.
"""

import sys
import json
import base64
import re
import io
import zipfile
import urllib.request

from reportlab.lib.pagesizes import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

LABELARY_URL = "http://api.labelary.com/v1/printers/8dpmm/labels/4.0x6.0/0/"
LABEL_W_IN, LABEL_H_IN = 4.0, 6.0


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


def extract_sku(zpl: str) -> str:
    m = re.search(r"SKU:\s*([^\^|]+)", zpl)
    if not m:
        return ""
    raw = m.group(1).strip()
    return re.sub(r"_([0-9A-Fa-f]{2})", lambda x: chr(int(x.group(1), 16)), raw)


def strip_troquel(zpl: str) -> str:
    idx = zpl.find("^LH0,410")
    if idx == -1:
        return zpl
    shipping = zpl[idx:].replace("^LH0,410", "^LH5,15", 1)
    return f"^XA\n^CI28\n{shipping}"


def inject_sku(zpl: str, sku: str) -> str:
    if not sku:
        return zpl
    sku_field = f"^FO30,800^A0N,30,30^FDSKU: {sku}^FS\n"
    return zpl.replace("^XZ", sku_field + "^XZ", 1)


def render_zpl_to_png(zpl: str) -> bytes:
    req = urllib.request.Request(
        LABELARY_URL,
        data=zpl.encode("utf-8"),
        headers={"Accept": "image/png", "Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def build_pdf(png_images: list) -> bytes:
    page_w, page_h = LABEL_W_IN * inch, LABEL_H_IN * inch
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))
    for png_bytes in png_images:
        c.drawImage(ImageReader(io.BytesIO(png_bytes)), 0, 0, width=page_w, height=page_h)
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

    png_images = []
    for zpl in labels:
        sku = extract_sku(zpl)
        zpl_final = inject_sku(strip_troquel(zpl), sku)
        png_images.append(render_zpl_to_png(zpl_final))

    pdf_bytes = build_pdf(png_images)
    sys.stdout.write(base64.b64encode(pdf_bytes).decode("utf-8"))


if __name__ == "__main__":
    main()
