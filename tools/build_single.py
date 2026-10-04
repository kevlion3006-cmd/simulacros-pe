"""Genera un solo archivo HTML (simulacros-pe-completo.html) uniendo index.html, styles.css y js/*.js.
Uso:  python tools/build_single.py
"""
import base64
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "styles.css").read_text(encoding="utf-8")

scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
js = "\n".join((root / s).read_text(encoding="utf-8") for s in scripts)

# Las mascotas se cargan desde "mascotas/xxx.webp", carpeta que no existe junto al
# archivo único: se incrustan como data URI para que el HTML se vea igual al abrirlo
# sin carpetas. En la web normal MASCOTAS_INLINE no existe y se usa la ruta de siempre.
mascotas = sorted((root / "mascotas").glob("*.webp"))
if mascotas:
    datos = {
        m.name: "data:image/webp;base64," + base64.b64encode(m.read_bytes()).decode("ascii")
        for m in mascotas
    }
    js = (
        "const MASCOTAS_INLINE = {"
        + ",".join(f'"{k}": "{v}"' for k, v in datos.items())
        + "};\n"
        + js
    )
    # La ruta se resuelve primero en el mapa incrustado y si no, en la carpeta.
    js = js.replace(
        "const ruta = 'mascotas/' + m.archivo;",
        "const ruta = MASCOTAS_INLINE[m.archivo] || ('mascotas/' + m.archivo);",
    )

html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "</style>")
html = re.sub(r'(<script src="js/[^"]+"></script>\n?)+', lambda m: "<script>\n" + js + "</script>\n", html, count=1)
# En un solo archivo no hay manifiesto ni service worker
html = re.sub(r'<link rel="manifest"[^>]*>\n?', "", html)
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n?', "", html)
html = re.sub(r'<meta name="theme-color"[^>]*>\n?', "", html)

out = root.parent / "simulacros-pe-completo.html"
out.write_text(html, encoding="utf-8")
print(f"{out.name}: {len(html.encode())} bytes")
print(f"mascotas incrustadas: {len(mascotas)}")
