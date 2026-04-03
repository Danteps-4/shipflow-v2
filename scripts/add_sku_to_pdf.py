"""
Receives via stdin: JSON { csv_content: str, pdf_b64: str }
Parses the Tienda Nube CSV to build a map: N° Orden → "SKU1 x2 | SKU2"
Then overlays "SKU: ..." text at the bottom-left of each Andreani PDF page,
matching by N° Interno (= Tienda Nube order number).
Returns base64-encoded modified PDF via stdout.

Method mirrors web_app/services/pdf_processing.py:
  - CSV: pandas, latin1, sep=";"
  - PDF: PyPDF2 + reportlab overlay
  - Position: x=8, y=8 (bottom-left corner of page)
  - Font: Helvetica 6pt
"""

import sys
import json
import base64
import re
import io
import pandas as pd
import PyPDF2
from reportlab.pdfgen import canvas

FONT_NAME      = "Helvetica"
FONT_SIZE      = 6
MARGEN_X       = 8
MARGEN_Y       = 8
MAX_ANCHO_TEXTO = 180

ORDER_COL = "Número de orden"
SKU_COL   = "SKU"
CANT_COL  = "Cantidad del producto"


def construir_mapa_skus(csv_bytes: bytes) -> dict:
    # Tienda Nube exports with latin1 encoding and semicolon separator
    # Try latin1+semicolon first (most common), then fallback combinations
    for enc in ("latin1", "utf-8", "utf-8-sig"):
        for sep in (";", ","):
            try:
                ventas = pd.read_csv(io.BytesIO(csv_bytes), encoding=enc, sep=sep)
                if ORDER_COL in ventas.columns and SKU_COL in ventas.columns:
                    break
            except Exception:
                continue
        else:
            continue
        break
    else:
        return {}

    if ORDER_COL not in ventas.columns or SKU_COL not in ventas.columns:
        return {}

    grupos = ventas.groupby(ORDER_COL, dropna=True)
    mapa = {}
    for nro_orden, df in grupos:
        items = []
        for _, row in df.iterrows():
            sku = str(row.get(SKU_COL, "")).strip()
            if not sku or sku.lower() == "nan":
                continue
            cant = row.get(CANT_COL, 1)
            try:
                cant_int = int(cant)
            except Exception:
                cant_int = 1
            if cant_int > 1:
                items.append(f"{sku} x{cant_int}")
            else:
                items.append(sku)
        if not items:
            continue
        mapa[str(int(nro_orden))] = " | ".join(items)
    return mapa


def extraer_nro_interno(texto_pagina: str):
    if not isinstance(texto_pagina, str):
        return None
    t = texto_pagina.replace("NÂ°", "N°").replace("Nº", "N°")
    t = t.replace("\n", " ")
    m = re.search(r"Interno\s*:\s*#?\s*([0-9]+)", t, flags=re.IGNORECASE)
    if m:
        return m.group(1)
    return None


def wrap_text(texto: str, max_width: float, font_name: str, font_size: int, canvas_obj) -> list:
    if not texto:
        return []
    palabras = texto.split(" ")
    lineas = []
    linea_actual = ""
    for palabra in palabras:
        candidata = (linea_actual + " " + palabra).strip()
        w = canvas_obj.stringWidth(candidata, font_name, font_size)
        if w <= max_width:
            linea_actual = candidata
        else:
            if linea_actual:
                lineas.append(linea_actual)
            linea_actual = palabra
    if linea_actual:
        lineas.append(linea_actual)
    return lineas


def process_pdf_labels(pdf_bytes: bytes, skus_map: dict) -> bytes:
    reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
    writer = PyPDF2.PdfWriter()

    for page in reader.pages:
        texto = page.extract_text()
        nro_interno = extraer_nro_interno(texto)

        if nro_interno:
            skus_texto = skus_map.get(str(int(nro_interno)))
            if skus_texto:
                packet = io.BytesIO()
                width  = float(page.mediabox.width)
                height = float(page.mediabox.height)
                c = canvas.Canvas(packet, pagesize=(width, height))
                c.setFont(FONT_NAME, FONT_SIZE)

                texto_mostrar = f"SKU: {skus_texto}"
                lineas = wrap_text(texto_mostrar, MAX_ANCHO_TEXTO, FONT_NAME, FONT_SIZE, c)

                y = MARGEN_Y
                for linea in lineas:
                    c.drawString(MARGEN_X, y, linea)
                    y += FONT_SIZE + 1

                c.save()
                packet.seek(0)
                overlay_pdf = PyPDF2.PdfReader(packet)
                page.merge_page(overlay_pdf.pages[0])

        writer.add_page(page)

    output = io.BytesIO()
    writer.write(output)
    output.seek(0)
    return output.read()


if __name__ == "__main__":
    raw  = sys.stdin.buffer.read()
    data = json.loads(raw.decode("utf-8"))

    csv_bytes = base64.b64decode(data["csv_b64"])
    pdf_bytes = base64.b64decode(data["pdf_b64"])

    sku_map    = construir_mapa_skus(csv_bytes)
    result_pdf = process_pdf_labels(pdf_bytes, sku_map)

    sys.stdout.write(base64.b64encode(result_pdf).decode("utf-8"))
