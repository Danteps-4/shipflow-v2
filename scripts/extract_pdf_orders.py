"""
Receives JSON via stdin: { pdf_b64: str }
Extracts order numbers from each page of a label PDF (Andreani or Envio Nube).
Returns: { "orderNumbers": ["4487", "4488", ...] }
"""

import sys
import json
import base64
import io
import re
import PyPDF2


def extraer_nro(texto: str):
    if not isinstance(texto, str):
        return None
    t = texto.replace("NÂ°", "N°").replace("Nº", "N°").replace("\n", " ")
    # Andreani: "Interno: #12345"
    m = re.search(r"Interno\s*:\s*#?\s*([0-9]+)", t, re.IGNORECASE)
    if m:
        return str(int(m.group(1)))
    # Envio Nube / E-Pick: "Para: #4487"
    m = re.search(r"Para\s*:\s*#(\d+)", t, re.IGNORECASE)
    if m:
        return str(int(m.group(1)))
    # Fallback: first bare #XXXX
    m = re.search(r"#(\d+)", t)
    if m:
        return str(int(m.group(1)))
    return None


if __name__ == "__main__":
    data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    pdf_bytes = base64.b64decode(data["pdf_b64"])
    reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))

    orders = []
    seen = set()
    for page in reader.pages:
        nro = extraer_nro(page.extract_text())
        if nro and nro not in seen:
            seen.add(nro)
            orders.append(nro)

    print(json.dumps({"orderNumbers": orders}))
