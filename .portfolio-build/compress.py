#!/usr/bin/env python3
"""
Compress all base64 images inside the portfolio HTML + prepare new PC Studio shots.
Outputs: .portfolio-build/img_map.json  (old base64 -> new data URI metadata)
         .portfolio-build/new_shots.json (new project screenshots as data URIs)
"""
import base64, io, json, re, hashlib, os
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "upload/portfolio-mohammad-adel-alqili (4).html")
OUT_DIR = os.path.join(ROOT, ".portfolio-build")
os.makedirs(OUT_DIR, exist_ok=True)

data = open(SRC, encoding="utf-8").read()
pattern = re.compile(r"data:image/([a-z]+);base64,([A-Za-z0-9+/=]+)")

MAX_W = 1150          # max width for content screenshots
LOGO_MAX_W = 560      # max width for the big brand logo
Q_OPAQUE = 72         # webp quality for opaque photos
Q_ALPHA = 82          # webp quality for images with transparency

def encode(img, has_alpha, q):
    buf = io.BytesIO()
    if has_alpha:
        img.save(buf, "WEBP", quality=q, method=6, exact=False)
    else:
        img.save(buf, "WEBP", quality=q, method=6)
    return buf.getvalue()

img_map = {}   # key: sha1 of old b64 -> dict(new_uri, w, h, old_len, new_len, lineno)
total_old = 0
total_new = 0

for m in pattern.finditer(data):
    ext, b64 = m.group(1), m.group(2)
    lineno = data.count("\n", 0, m.start()) + 1
    raw = base64.b64decode(b64)
    key = hashlib.sha1(b64.encode()).hexdigest()[:16]
    if key in img_map:
        continue
    try:
        im = Image.open(io.BytesIO(raw))
    except Exception as e:
        print(f"!! line {lineno}: cannot open ({e}) — keeping original")
        continue
    w0, h0 = im.size
    has_alpha = im.mode in ("RGBA", "LA", "P") and (
        im.mode != "P" or "transparency" in im.info)
    is_logo = "png" == ext and (w0 >= 1000 and h0 >= 1000 and h0 == w0)
    max_w = LOGO_MAX_W if is_logo else MAX_W
    # resize if wider than allowed
    if w0 > max_w:
        nh = round(h0 * max_w / w0)
        im2 = im.resize((max_w, nh), Image.LANCZOS)
    else:
        im2 = im
    if has_alpha:
        im2 = im2.convert("RGBA")
    else:
        im2 = im2.convert("RGB")
    # try quality; if still huge, drop quality a notch
    q = Q_ALPHA if has_alpha else Q_OPAQUE
    out = encode(im2, has_alpha, q)
    if len(out) > 130_000 and not has_alpha:
        out = encode(im2, has_alpha, 62)
    new_uri = "data:image/webp;base64," + base64.b64encode(out).decode()
    total_old += len(b64)
    total_new += len(new_uri) - len("data:image/webp;base64,")
    img_map[key] = {
        "old_b64": b64,
        "new_uri": new_uri,
        "w": im2.size[0], "h": im2.size[1],
        "w0": w0, "h0": h0,
        "old_len": len(b64), "new_len": len(new_uri),
        "lineno": lineno, "alpha": has_alpha,
    }
    print(f"line {lineno:4d}: {w0}x{h0} ({len(b64)//1365} KB {ext}) -> "
          f"{im2.size[0]}x{im2.size[1]} webp {len(out)//1365} KB "
          f"{'[alpha]' if has_alpha else ''}")

json.dump(img_map, open(os.path.join(OUT_DIR, "img_map.json"), "w"))

# ---- new project screenshots ----
SHOTS = [
    ("lab",      "verify/v6-02-lab.png",          1240, 74),
    ("exploded", "verify/v5/final-exploded.png",  1240, 74),
    ("airflow",  "verify/v5/final-airflow.png",   1240, 74),
    ("mobile",   "verify/v5/mobile-lab.png",      None, 78),
]
new_shots = {}
for name, path, max_w, q in SHOTS:
    p = os.path.join(ROOT, path)
    im = Image.open(p)
    w0, h0 = im.size
    if max_w and w0 > max_w:
        im = im.resize((max_w, round(h0 * max_w / w0)), Image.LANCZOS)
    im = im.convert("RGB")
    buf = io.BytesIO()
    im.save(buf, "WEBP", quality=q, method=6)
    out = buf.getvalue()
    uri = "data:image/webp;base64," + base64.b64encode(out).decode()
    new_shots[name] = {"uri": uri, "w": im.size[0], "h": im.size[1], "kb": len(out)//1365}
    print(f"shot {name}: {w0}x{h0} -> {im.size[0]}x{im.size[1]} webp {len(out)//1365} KB")

json.dump(new_shots, open(os.path.join(OUT_DIR, "new_shots.json"), "w"))
print(f"\nTOTAL old b64: {total_old//1365} KB -> new: {total_new//1365} KB")
