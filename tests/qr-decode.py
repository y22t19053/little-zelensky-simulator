# 用 OpenCV 的 QRCodeDetector 解码 js/qr.js 生成的二维码（独立实现，用来验证编码器）。
# 用法：python tests/qr-decode.py   （需要 PYTHONPATH 指向含 cv2 的目录）
import json, subprocess, sys, os
import numpy as np
import cv2

here = os.path.dirname(os.path.abspath(__file__))
root = os.path.dirname(here)
cases = [
    'https://y22t19053.github.io/little-zelensky-simulator/',
    'https://y22t19053.github.io/little-zelensky-simulator/?from=poster',
    'https://example.com/a',
    'LZS',
    'x' * 80,
    '小泽模拟器 https://y22t19053.github.io/little-zelensky-simulator/',
]
js = "const Q=require('./js/qr.js');const out=" + json.dumps(cases) + ".map(t=>{const r=Q.encode(t);return {t,v:r.version,m:r.mask,size:r.size,rows:r.modules.map(r=>r.map(c=>c?1:0))}});console.log(JSON.stringify(out))"
raw = subprocess.check_output(['node', '-e', js], cwd=root)
data = json.loads(raw.decode('utf-8'))
det = cv2.QRCodeDetector()
ok = 0
for item in data:
    m = np.array(item['rows'], dtype=np.uint8)
    img = np.where(m == 1, 0, 255).astype(np.uint8)
    img = np.pad(img, 4, constant_values=255)
    img = np.kron(img, np.ones((8, 8), dtype=np.uint8))
    text, pts, _ = det.detectAndDecode(img)
    good = text == item['t']
    ok += 1 if good else 0
    print(('OK  ' if good else 'FAIL'), 'v%d mask%d' % (item['v'], item['m']), repr(item['t'][:50]), '->', repr(text[:50]))
print('QR 解码：%d / %d 通过' % (ok, len(data)))
sys.exit(0 if ok == len(data) else 1)
