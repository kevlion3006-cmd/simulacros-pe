"""Genera un solo archivo HTML (simulacros-pe-completo.html) uniendo index.html, styles.css y js/*.js.
Uso:  python tools/build_single.py
"""
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "styles.css").read_text(encoding="utf-8")

scripts = re.findall(r'<script src="(js/[^"]+)"></script>', html)
js = "\n".join((root / s).read_text(encoding="utf-8") for s in scripts)

html = html.replace('<link rel="stylesheet" href="styles.css">', "<style>\n" + css + "</style>")
html = re.sub(r'(<script src="js/[^"]+"></script>\n?)+', lambda m: "<script>\n" + js + "</script>\n", html, count=1)
# En un solo archivo no hay manifiesto ni service worker
html = re.sub(r'<link rel="manifest"[^>]*>\n?', "", html)
html = re.sub(r'<link rel="apple-touch-icon"[^>]*>\n?', "", html)
html = re.sub(r'<meta name="theme-color"[^>]*>\n?', "", html)

out = root.parent / "simulacros-pe-completo.html"
out.write_text(html, encoding="utf-8")
print(f"{out.name}: {len(html.encode())} bytes")
