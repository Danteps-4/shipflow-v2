"""
Receives via stdin: JSON { pdf_b64: str }
Extracts (nro_interno, nro_seguimiento) from each page of an Andreani PDF.
Returns JSON list via stdout: [{ "order": "1234", "tracking": "36000..." }, ...]
"""
import sys
import json
import base64
import re
import io
import PyPDF2

def extract_tracking(pdf_bytes: bytes) -> list:
    results = []
    reader = PyPDF2.PdfReader(io.BytesIO(pdf_bytes))

    for page in reader.pages:
        text = page.extract_text() or ""
        clean = text.replace("NÂ°", "N°").replace("Nº", "N°").replace("\n", " ")

        order_match = re.search(r"Interno\s*:\s*#?\s*([0-9]+)", clean, re.IGNORECASE)
        tracking_match = re.search(r"de seguimiento\s*:\s*([0-9]+)", clean, re.IGNORECASE)

        order_id  = order_match.group(1)    if order_match    else None
        tracking  = tracking_match.group(1) if tracking_match else None

        if order_id and tracking:
            results.append({"order": order_id, "tracking": tracking})

    return results

if __name__ == "__main__":
    data      = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    pdf_bytes = base64.b64decode(data["pdf_b64"])
    results   = extract_tracking(pdf_bytes)
    sys.stdout.write(json.dumps(results))
