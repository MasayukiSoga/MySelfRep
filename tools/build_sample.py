"""sample/template.html にスプライトシートを data URI で埋め込み、sample/index.html を作る。"""
import base64
from pathlib import Path

root = Path(__file__).resolve().parent.parent
html = (root / "sample/template.html").read_text(encoding="utf-8")
for key, path in {"__SHEET64__": "sprites/test/sheet_64x128.png", "__SHEET96__": "sprites/test_96x128/sheet_96x128.png"}.items():
    data = base64.b64encode((root / path).read_bytes()).decode()
    html = html.replace(key, f"data:image/png;base64,{data}")
(root / "sample/index.html").write_text(html, encoding="utf-8")
print("sample/index.html", len(html), "bytes")
