"""
Receives via stdin: JSON { pdf_b64: str, sku_map?: dict, csv_b64?: str }
Overlays "SKU: ..." text at the bottom-left of each label page.

Supports two label formats (auto-detected per page):
  - Andreani:   matches "Interno: #12345"  → font 6pt
  - Envío Nube (E-Pick): matches "Para: #4487" or "#4487" → font 9pt

Returns base64-encoded modified PDF via stdout.
"""

import sys
import json
import base64
import re
import io
import pandas as pd
import PyPDF2
from reportlab.pdfgen import canvas

FONT_NAME       = "Helvetica"
MARGEN_X        = 8
MARGEN_Y        = 8
MAX_ANCHO_TEXTO = 200

ORDER_COL = "Número de orden"
SKU_COL   = "SKU"
CANT_COL  = "Cantidad del producto"


def construir_mapa_skus(csv_bytes: bytes) -> dict:
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


# ── Extractors ────────────────────────────────────────────────────────

def extraer_nro_interno(texto: str):
    """Andreani: busca 'Interno: #12345'"""
    if not isinstance(texto, str):
        return None
    t = texto.replace("NÂ°", "N°").replace("Nº", "N°").replace("\n", " ")
    m = re.search(r"Interno\s*:\s*#?\s*([0-9]+)", t, flags=re.IGNORECASE)
    return m.group(1) if m else None


def extraer_nro_envionube(texto: str):
    """Envío Nube / E-Pick: busca 'Para: #4487' o '#4487' en el texto."""
    if not isinstance(texto, str):
        return None
    t = texto.replace("\n", " ")
    # Prefer 'Para: #XXXX' (most specific)
    m = re.search(r"Para\s*:\s*#(\d+)", t, re.IGNORECASE)
    if m:
        return m.group(1)
    # Fallback: first bare #XXXX occurrence
    m = re.search(r"#(\d+)", t)
    return m.group(1) if m else None


def detectar_orden(texto: str):
    """
    Returns (nro_orden: str | None, font_size: int).
    Tries Andreani first, then Envío Nube.
    """
    nro = extraer_nro_interno(texto)
    if nro:
        return nro, 6          # Andreani small label → 6pt

    nro = extraer_nro_envionube(texto)
    if nro:
        return nro, 9          # E-Pick full-page label → 9pt

    return None, 6


# ── E-Pick: find Y position below customer name ───────────────────────

def posicion_sku_envionube(page) -> float:
    """
    Returns Y coordinate (pts from bottom) just below the customer name
    on an E-Pick label. Falls back to 43% of page height.
    """
    height = float(page.mediabox.height)
    fallback = height * 0.43

    items = []

    def visitor(text, _cm, tm, _fd, _fs):
        s = text.strip() if isinstance(text, str) else ""
        if s:
            items.append((s, float(tm[5])))

    try:
        page.extract_text(visitor_text=visitor)
    except Exception:
        return fallback

    if not items:
        return fallback

    # Locate 'Para:' line Y
    para_ys = [y for t, y in items if re.search(r"Para\s*:", t, re.IGNORECASE)]
    if not para_ys:
        return fallback

    para_y = max(para_ys)

    # Name line is just below Para: (lower Y in PDF coordinates)
    below = [y for _, y in items if y < para_y - 3]
    if not below:
        return para_y - 20

    name_y = max(below)  # closest line below Para: = customer name
    return name_y - 18   # ~18pt below the name baseline


# ── Text wrap ─────────────────────────────────────────────────────────

def wrap_text(texto: str, max_width: float, font_name: str, font_size: int, canvas_obj) -> list:
    if not texto:
        return []
    palabras = texto.split(" ")
    lineas = []
    linea_actual = ""
    for palabra in palabras:
        candidata = (linea_actual + " " + palabra).strip()
        if canvas_obj.stringWidth(candidata, font_name, font_size) <= max_width:
            linea_actual = candidata
        else:
            if linea_actual:
                lineas.append(linea_actual)
            linea_actual = palabra
    if linea_actual:
        lineas.append(linea_actual)
    return lineas


# ── Main PDF processing ───────────────────────────────────────────────

def process_pdf_labels(pdf_bytes: bytes, skus_map: dict) -> bytes:
    reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))
    writer = PyPDF2.PdfWriter()

    for page in reader.pages:
        texto = page.extract_text()
        nro_orden, font_size = detectar_orden(texto)

        if nro_orden:
            try:
                key = str(int(nro_orden))
            except ValueError:
                key = nro_orden
            skus_texto = skus_map.get(key)

            if skus_texto:
                packet = io.BytesIO()
                width  = float(page.mediabox.width)
                height = float(page.mediabox.height)
                c = canvas.Canvas(packet, pagesize=(width, height))
                c.setFont(FONT_NAME, font_size)

                texto_mostrar = f"SKU: {skus_texto}"
                lineas = wrap_text(texto_mostrar, MAX_ANCHO_TEXTO, FONT_NAME, font_size, c)

                if font_size == 9:  # E-Pick / Envío Nube: debajo del nombre
                    y = posicion_sku_envionube(page)
                    for linea in lineas:
                        c.drawString(MARGEN_X, y, linea)
                        y -= font_size + 2  # hacia abajo
                else:              # Andreani: margen inferior
                    y = MARGEN_Y
                    for linea in lineas:
                        c.drawString(MARGEN_X, y, linea)
                        y += font_size + 1  # hacia arriba

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

    pdf_bytes = base64.b64decode(data["pdf_b64"])

    if data.get("sku_map"):
        sku_map = data["sku_map"]
    else:
        csv_bytes = base64.b64decode(data["csv_b64"])
        sku_map   = construir_mapa_skus(csv_bytes)

    result_pdf = process_pdf_labels(pdf_bytes, sku_map)
    sys.stdout.write(base64.b64encode(result_pdf).decode("utf-8"))
