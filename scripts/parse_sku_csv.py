"""
Receives JSON via stdin: { csv_b64: str }
Parses the Tienda Nube CSV and returns:
  { "12345": { "nombre": "...", "skus": [{ "sku": "...", "cantidad": 1 }] } }
Only includes orders that have at least one SKU.
"""

import sys
import json
import base64
import io
import pandas as pd

ORDER_COL   = "Número de orden"
SKU_COL     = "SKU"
CANT_COL    = "Cantidad del producto"
NOMBRE_COLS = ["Nombre para el envío", "Nombre de envío", "Nombre del envío", "Nombre"]


def parse_csv(csv_bytes: bytes) -> dict:
    df = None
    for enc in ("latin1", "utf-8", "utf-8-sig"):
        for sep in (";", ","):
            try:
                tmp = pd.read_csv(io.BytesIO(csv_bytes), encoding=enc, sep=sep)
                if ORDER_COL in tmp.columns and SKU_COL in tmp.columns:
                    df = tmp
                    break
            except Exception:
                continue
        if df is not None:
            break

    if df is None:
        return {}

    nombre_col = next((c for c in NOMBRE_COLS if c in df.columns), None)

    result = {}
    for nro, grupo in df.groupby(ORDER_COL, dropna=True):
        try:
            orden_str = str(int(nro))
        except Exception:
            orden_str = str(nro)

        nombre = ""
        if nombre_col:
            v = str(grupo.iloc[0][nombre_col]).strip()
            if v.lower() not in ("nan", "none", ""):
                nombre = v

        skus = []
        for _, row in grupo.iterrows():
            sku = str(row.get(SKU_COL, "")).strip()
            if not sku or sku.lower() in ("nan", "none"):
                continue
            try:
                cant = int(row.get(CANT_COL, 1))
            except Exception:
                cant = 1
            skus.append({"sku": sku, "cantidad": max(1, cant)})

        if skus:
            result[orden_str] = {"nombre": nombre, "skus": skus}

    return result


if __name__ == "__main__":
    data = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    csv_bytes = base64.b64decode(data["csv_b64"])
    result = parse_csv(csv_bytes)
    sys.stdout.write(json.dumps(result, ensure_ascii=False))
