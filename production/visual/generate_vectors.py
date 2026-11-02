"""Create original abstract theater diagrams and archive UI components."""
from pathlib import Path
import json

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
MAPS = ROOT / 'assets' / 'visual' / 'maps'
ARCHIVE = ROOT / 'assets' / 'visual' / 'archive'
MAPS.mkdir(parents=True, exist_ok=True)
ARCHIVE.mkdir(parents=True, exist_ok=True)
BASE = '''<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-labelledby="title desc"><title id="title">{title}</title><desc id="desc">抽象战略态势，不表示实时前线、精确路线或兵力。</desc><rect width="640" height="360" fill="#181d19"/><path d="M0 72H640M0 288H640M128 0V360M512 0V360" stroke="#323a32" stroke-width="1"/><g fill="none" stroke="#b99a5d" stroke-width="5" stroke-linecap="square" stroke-linejoin="miter">{body}</g><g fill="#d7cfbb" font-family="sans-serif"><text x="24" y="34" font-size="18" letter-spacing="2">抽象态势 · 非实时地图</text><text x="24" y="334" font-size="14" fill="#9b9e90">{label}</text></g></svg>'''
items = {
'invasion': ('全面入侵 · 多方向接报', '<path d="M80 90L210 150M560 82L430 150M320 300V210"/><path d="M185 135l25 15-28 7M455 135l-25 15 28 7M305 235l15-25 15 25"/><rect x="265" y="130" width="110" height="70" fill="#303a30"/>', '方向为合成符号，不对应推进路线'),
'location': ('指挥位置 · 可见性与连续性', '<circle cx="245" cy="174" r="62"/><path d="M245 112V236M183 174H307M385 112l110 124M495 112L385 236"/><rect x="348" y="92" width="185" height="164" stroke-dasharray="10 9"/>', '两种指挥安排的概念关系'),
'hostomel': ('机场方向 · 争夺状态未独立核实', '<path d="M100 260L510 82M146 278L556 100"/><path d="M210 218l55-25M325 166l55-25M440 114l45-21" stroke-dasharray="20 12"/><rect x="90" y="84" width="130" height="76"/>', '机场空间关系，不表示实时控制区'),
'capital-night': ('首都之夜 · 防御与通行', '<path d="M72 242L150 170l76 44 76-96 84 82 78-54 104 96"/><path d="M105 270H535M180 250l-25 45m25-45 25 45M460 250l-25 45m25-45 25 45"/><circle cx="330" cy="118" r="16" fill="#b99a5d"/>', '城市防御要素，不标注真实位置'),
'two-fronts': ('多方向压力 · 有限预备资源', '<path d="M320 180L120 100M320 180l210-75M320 180v120"/><circle cx="320" cy="180" r="52"/><path d="M298 180h44M320 158v44"/><path d="M85 80h70v40H85zM460 80h70v40h-70z" fill="#303a30"/>', '三线争抢同一资源池的概念图'),
'diplomacy': ('外交渠道 · 时间差与不确定性', '<path d="M92 110H260v130H92zM380 110h168v130H380z"/><path d="M260 145h120M260 210h120" stroke-dasharray="12 9"/><path d="M110 145h120M110 178h85M410 145h95M410 178h110"/>', '渠道与文件均为合成符号'),
'seventh-night': ('第七夜 · 后勤与跨部门协调', '<path d="M80 270L280 90M160 290L360 110M280 90h210M360 110h210"/><path d="M160 220h90v55h-90zM275 175h90v55h-90zM390 130h90v55h-90z" fill="#303a30"/><circle cx="195" cy="280" r="12"/><circle cx="230" cy="280" r="12"/>', '后勤概念，不对应真实铁路或运量'),
}
records=[]
for key,(title,body,label) in items.items():
    target=MAPS/(key+'.svg')
    target.write_text(BASE.format(title=title,body=body,label=label),encoding='utf-8')
    records.append({'id':'map.'+key,'output':'assets/visual/maps/'+target.name,'license':'本项目原创 SVG；随项目使用','use':'对应回合抽象态势叠层'})
(ARCHIVE/'paper-fiber.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 180 180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency=".72" numOctaves="3" seed="24"/><feColorMatrix values="0 0 0 0 .55 0 0 0 0 .50 0 0 0 0 .38 0 0 0 .13 0"/></filter><rect width="180" height="180" filter="url(#n)" opacity=".25"/></svg>''',encoding='utf-8')
(ARCHIVE/'dossier-stamp.svg').write_text('''<svg xmlns="http://www.w3.org/2000/svg" width="240" height="100" viewBox="0 0 240 100"><rect x="4" y="4" width="232" height="92" fill="none" stroke="#b99a5d" stroke-width="3"/><path d="M12 14H228V86H12Z" fill="none" stroke="#b99a5d"/><text x="120" y="45" text-anchor="middle" fill="#b99a5d" font-family="serif" font-size="24" letter-spacing="5">危机档案</text><text x="120" y="70" text-anchor="middle" fill="#b99a5d" font-family="monospace" font-size="12" letter-spacing="2">SIMULATED RECORD</text></svg>''',encoding='utf-8')
records += [
 {'id':'archive.paper-fiber','output':'assets/visual/archive/paper-fiber.svg','license':'本项目原创程序纹理；随项目使用','use':'档案表面低对比纸纹'},
 {'id':'archive.dossier-stamp','output':'assets/visual/archive/dossier-stamp.svg','license':'本项目原创 SVG；随项目使用','use':'合成档案标识，非真实印章'},
]
(HERE/'vector-manifest.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf-8')
print('VECTOR_DONE',len(records))
