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
import time
import zipfile
import urllib.request
import urllib.error

from reportlab.lib.pagesizes import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen import canvas

LABELARY_URL = "https://api.labelary.com/v1/printers/8dpmm/labels/4.0x6.0/0/"
LABEL_W_IN, LABEL_H_IN = 4.0, 6.0
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


def extract_sku(zpl: str) -> str:
    m = re.search(r"SKU:\s*([^\^|]+)", zpl)
    if not m:
        return ""
    raw = m.group(1).strip()
    return re.sub(r"_([0-9A-Fa-f]{2})", lambda x: chr(int(x.group(1), 16)), raw)


# El QR de cada etiqueta (^BQN...) trae, en texto plano, un JSON con los dos
# identificadores reales del envío: "id" es el shipment_id de Mercado Envíos
# (resolvible vía GET /shipments/{id} → order_id) y "carrier_data" es
# "TRACKING|TIPO_ENTREGA|CP|" — el primer campo es el tracking del correo
# real (Correo Argentino, OCA, etc., varía por envío). Se usa este JSON en
# vez de intentar inferir cuál de los dos códigos de barras de la etiqueta
# es cuál por posición/alto — mismo dato, mucho más confiable porque ya
# viene con los campos nombrados.
def extract_shipment_data(zpl: str):
    m = re.search(r"\^FDLA,(\{.*?\})\^FS", zpl)
    if not m:
        return None
    try:
        data = json.loads(m.group(1))
    except ValueError:
        return None
    shipment_id = data.get("id")
    carrier_data = data.get("carrier_data") or ""
    carrier_tracking = carrier_data.split("|")[0].strip() or None
    if not shipment_id:
        return None
    return {"shipment_id": str(shipment_id), "carrier_tracking": carrier_tracking}


def strip_troquel(zpl: str) -> str:
    idx = zpl.find("^LH0,410")
    if idx == -1:
        return zpl
    shipping = zpl[idx:].replace("^LH0,410", "^LH5,15", 1)
    return f"^XA\n^CI28\n{shipping}"


def _decodificar(texto: str) -> str:
    return re.sub(r"_([0-9A-Fa-f]{2})", lambda x: chr(int(x.group(1), 16)), texto)


# Un pedido de ML puede traer varios productos distintos. En el troquel cada
# producto son dos campos seguidos: el título ("... Negro", con "| N u." al
# final cuando son N unidades) y el detalle ("Color: Negro SKU: ABDOMEN"). El
# número grande de arriba ("2 Unidades") es el TOTAL del paquete, no la
# cantidad de un producto: no se puede aplicar a un SKU suelto.
def extract_products(zpl: str) -> list:
    head = zpl.split("^LH0,410")[0]
    campos = [m.group(1) for m in re.finditer(r"\^FD([^\^]*)\^FS", head)]
    productos = []
    for i, campo in enumerate(campos):
        m = re.search(r"SKU:\s*([^\^|]+)", campo)
        if not m:
            continue
        sku = _decodificar(m.group(1).strip())
        titulo = campos[i - 1] if i > 0 else ""
        mq = re.search(r"\|\s*(\d+)\s*u\.", titulo)
        productos.append({"sku": sku, "cantidad": int(mq.group(1)) if mq else None})

    if len(productos) == 1 and productos[0]["cantidad"] is None:
        # Un solo producto: acá sí el número grande es su cantidad.
        productos[0]["cantidad"] = extract_quantity(zpl)
    for pr in productos:
        if pr["cantidad"] is None:
            pr["cantidad"] = 1

    # Mismo SKU repetido: se suma.
    unidos = []
    for pr in productos:
        previo = next((u for u in unidos if u["sku"] == pr["sku"]), None)
        if previo:
            previo["cantidad"] += pr["cantidad"]
        else:
            unidos.append(dict(pr))
    return unidos


# La cantidad viene en la sección del troquel (el número grande arriba de
# "Unidades" y el "| N u." del título) — que strip_troquel() descarta, así que
# hay que leerla del ZPL original antes de recortarlo.
def extract_quantity(zpl: str) -> int:
    head = zpl.split("^LH0,410")[0]
    m = re.search(r"\^FD(\d+)\^FS\s*\^FO[^\n]*?\^FDUnidad", head)
    if not m:
        m = re.search(r"\|\s*(\d+)\s*u\.\s*\^FS", head)
    return int(m.group(1)) if m else 1


def _linea_producto(sku: str, cantidad: int) -> str:
    return f"{cantidad}x {sku}" if cantidad > 1 else sku


# Un producto por línea ("2x GLUTEOS" si son varias unidades, "ABDOMEN" si es
# una), así depósito ve de un vistazo qué y cuánto lleva el paquete. Hasta 4
# líneas entran entre el código de barras y la dirección; si hubiera más, las
# últimas se juntan en la cuarta.
def inject_productos(zpl: str, productos: list) -> str:
    if not productos:
        return zpl
    lineas = [_linea_producto(p["sku"], p["cantidad"]) for p in productos]
    if len(lineas) > 4:
        lineas = lineas[:3] + [" + ".join(lineas[3:])]
    paso = 40 if len(lineas) <= 3 else 36  # con 4 líneas hay que apretar para no tocar la raya de abajo
    campos = "".join(f"^FO30,{800 + paso * k}^A0N,36,36^FD{texto}^FS\n" for k, texto in enumerate(lineas))
    return zpl.replace("^XZ", campos + "^XZ", 1)


def inject_sku(zpl: str, sku: str, qty: int = 1) -> str:
    if not sku:
        return zpl
    return inject_productos(zpl, [{"sku": sku, "cantidad": qty}])


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
    envios = []
    for i, zpl in enumerate(labels):
        if i > 0:
            time.sleep(RENDER_DELAY_S)
        productos = extract_products(zpl)
        zpl_final = inject_productos(strip_troquel(zpl), productos)
        png_images.append(render_zpl_to_png(zpl_final))
        shipment = extract_shipment_data(zpl)
        if shipment:
            envios.append(shipment)

    pdf_bytes = build_pdf(png_images)
    result = {"pdf_b64": base64.b64encode(pdf_bytes).decode("utf-8"), "envios": envios}
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()
