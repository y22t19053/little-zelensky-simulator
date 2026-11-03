"""对导出的真实海报 PNG 做二维码解码验证（OpenCV）。
用法：python tests/poster-qr.py <poster.png>
先对整张海报解码；失败再裁出右下角页脚区域重试，并如实报告用的是哪种。"""
import sys
import cv2

EXPECT = 'https://y22t19053.github.io/little-zelensky-simulator/'
path = sys.argv[1]
img = cv2.imread(path)
if img is None:
    print('FAIL 读不到图片', path)
    sys.exit(2)
h, w = img.shape[:2]
print('image', w, 'x', h)
det = cv2.QRCodeDetector()
text, pts, _ = det.detectAndDecode(img)
mode = '整张海报'
if not text:
    crop = img[h - 330:h - 60, w - 330:w - 60]
    text, pts, _ = det.detectAndDecode(crop)
    mode = '裁剪页脚右下角'
print('mode', mode)
print('decoded', repr(text))
ok = text == EXPECT
print('QR 解码', '通过' if ok else '失败', '(期望 ' + EXPECT + ')')
sys.exit(0 if ok else 1)
