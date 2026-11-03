// 生成 v1.0 战役场景插画（原创抽象矢量，非照片，不含真实标识）。
// 用法：node production/visual/generate_campaign_scenes.cjs
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', '..', 'assets', 'events');
const C = { bg: '#151a13', paper: '#c8bc99', amber: '#c9a563', muted: '#969a88', olive: '#20271e', olive2: '#272d22', line: '#7e8770', blue: '#4a78b0', yellow: '#d6b84a', red: '#b9694f' };

const r = (x, y, w, h, f, o) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${f}"${o != null ? ` fill-opacity="${o}"` : ''}/>`;
const p = (d, f, o) => `<path d="${d}" fill="${f || 'none'}"${o != null ? ` fill-opacity="${o}"` : ''}/>`;
const ln = (d, c, w, dash, o) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w || 2}"${dash ? ` stroke-dasharray="${dash}"` : ''}${o != null ? ` stroke-opacity="${o}"` : ''}/>`;
const circ = (x, y, rad, f, o) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="${f}"${o != null ? ` fill-opacity="${o}"` : ''}/>`;
const ring = (x, y, rad, c, w, dash) => `<circle cx="${x}" cy="${y}" r="${rad}" fill="none" stroke="${c}" stroke-width="${w || 2}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;
const txt = (x, y, s, cls, size, extra) => `<text x="${x}" y="${y}" class="${cls}" font-size="${size}"${extra ? ' ' + extra : ''}>${s}</text>`;
const heli = (x, y, k) => `<g transform="translate(${x} ${y}) scale(${k || 1})"><ellipse cx="0" cy="0" rx="16" ry="6" fill="#0f120d"/><path d="M12 0H34" stroke="#0f120d" stroke-width="3"/><path d="M-22 -9H22" stroke="#0f120d" stroke-width="2"/></g>`;
const house = (x, y, w, h, f) => `<g>${r(x, y, w, h, f || '#11150f')}${p(`M${x - 4} ${y}L${x + w / 2} ${y - h * 0.5}L${x + w + 4} ${y}Z`, '#0e120c')}</g>`;
const tree = (x, y, s) => `<g>${circ(x, y, 14 * s, '#2f3a28')}${circ(x + 10 * s, y + 6 * s, 11 * s, '#364430')}${circ(x - 9 * s, y + 8 * s, 10 * s, '#2a3524')}</g>`;
const veh = (x, y, c) => r(x, y, 22, 9, c || '#0f120d');
const star = (x, y, c) => `<path d="M${x} ${y - 9}L${x + 9} ${y}L${x} ${y + 9}L${x - 9} ${y}Z" fill="none" stroke="${c || C.amber}" stroke-width="2"/>`;

const scenes = [
  {
    id: 'antonov-assault', tag: 'ANTONOV / AIRFIELD FILE', sub: 'APPROACH · HANGARS · CONTESTED',
    title: '安东诺夫机场：空降突击与跑道争夺',
    note: '直升机仅以剪影表示；机场被突击、双方争夺，控制权无法独立核实。不绘制兵力或精确战线。',
    body: () => r(42, 126, 1116, 457, C.olive) + r(42, 330, 1116, 253, C.olive2) +
      p('M300 560L520 330H700L930 560Z', '#313828') + ln('M610 330V560', C.paper, 3, '26 22', 0.5) +
      r(760, 262, 120, 54, '#11150f') + r(900, 262, 90, 54, '#11150f') + r(230, 270, 100, 48, '#11150f') +
      [180, 330, 480, 640, 800].map((x, i) => heli(x, 190 + (i % 2) * 40 + i * 8, 1.1)).join('') +
      ln('M130 160C320 200 480 240 610 330', C.amber, 2, '8 8', 0.7) + ln('M1100 150C900 200 740 260 640 330', C.amber, 2, '8 8', 0.7) +
      ring(610, 400, 120, C.amber, 2, '4 10') + star(610, 400) + r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'runway-denial', tag: 'RUNWAY / DENIAL FILE', sub: 'OBSTRUCTION · BLOCKED APPROACH',
    title: '跑道封堵：让降落变得不可能',
    note: '车辆与障碍物横置于跑道上，使后续运输机无法降落。图示为抽象示意，不表示实际布置。',
    body: () => r(42, 126, 1116, 457, C.olive) + r(42, 340, 1116, 243, C.olive2) +
      p('M120 560L440 320H760L1080 560Z', '#313828') + ln('M600 320V560', C.paper, 3, '26 22', 0.45) +
      [0, 1, 2, 3, 4, 5].map((i) => veh(360 + i * 78, 420 + (i % 2) * 24 + (i * 6), i % 2 ? '#0f120d' : '#1a1f16')).join('') +
      [0, 1, 2, 3].map((i) => ln(`M${430 + i * 120} 380l30 30m0 -30l-30 30`, C.red, 4, null, 0.8)).join('') +
      ln('M80 200C300 240 500 300 640 380', C.muted, 2, '3 10', 0.6) + `<path d="M980 210l-60 28l60 28" fill="none" stroke="${C.amber}" stroke-width="3"/>` +
      r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'vasylkiv', tag: 'VASYLKIV / AIR DEFENCE FILE', sub: 'AIRBASE · INTERCEPT · COVER',
    title: '瓦西里科夫：空军基地与防空',
    note: '以扫描圈、拦截弧线与防空标记表示空域防护；不表示实际装备数量或战果。',
    body: () => r(42, 126, 1116, 457, '#1b221a') + r(42, 360, 1116, 223, C.olive2) +
      p('M300 540L520 360H680L880 540Z', '#313828') + r(700, 300, 90, 40, '#11150f') + r(250, 310, 120, 36, '#11150f') +
      [160, 260, 360].map((rad) => ring(600, 470, rad, C.line, 1.5, '5 9')).join('') +
      ln('M600 470L880 250', C.amber, 3, null, 0.8) + ln('M120 520C300 260 480 200 720 160', C.yellow, 2, '10 8', 0.8) + ln('M1080 540C940 300 840 230 740 170', C.blue, 2, '10 8', 0.9) +
      [[300, 250], [900, 330], [520, 230]].map((a) => `<path d="M${a[0]} ${a[1] - 14}l15 26h-30Z" fill="none" stroke="${C.paper}" stroke-width="2"/>`).join('') +
      circ(720, 164, 6, C.amber) + r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'irpin-bridge', tag: 'IRPIN / BRIDGE FILE', sub: 'RIVER · BRIDGE · DEMOLITION',
    title: '伊尔平河：桥梁与阻滞',
    note: '河流、被破坏的桥面与沙袋线条构成抽象示意；不表示实际破坏程度或位置精度。',
    body: () => r(42, 126, 1116, 457, C.olive) + p('M42 330C300 300 520 380 760 340S1000 300 1158 330V450C1000 430 800 470 600 440S250 400 42 450Z', '#2b3f4c') +
      ln('M60 360C300 340 500 420 760 380S1000 340 1140 370', '#5f86a0', 2, '14 10', 0.6) +
      r(120, 360, 330, 30, '#11150f') + r(640, 360, 380, 30, '#11150f') + ln('M450 375L520 395M640 375L580 392', C.red, 4) +
      [0, 1, 2, 3, 4].map((i) => r(180 + i * 60, 392, 8, 36, '#11150f')).join('') + [0, 1, 2, 3].map((i) => r(760 + i * 70, 392, 8, 36, '#11150f')).join('') +
      [0, 1, 2, 3, 4, 5].map((i) => r(80 + i * 34, 250 + (i % 2) * 8, 28, 12, '#3a4430')).join('') +
      [0, 1, 2, 3, 4, 5, 6].map((i) => r(1000 - i * 22, 478 + (i % 2) * 4, 18, 8, C.amber, 0.6)).join('') +
      r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'bucha-irpin-evac', tag: 'BUCHA — IRPIN / HUMANITARIAN FILE', sub: 'CORRIDOR · ROAD · REPEATED INTERRUPTION',
    title: '布恰—伊尔平：撤离路线',
    note: '以道路、车队剪影和被打断的走廊表示撤离需要反复协商；不描绘任何个人或遇难者。',
    body: () => r(42, 126, 1116, 457, C.olive) + r(42, 400, 1116, 183, C.olive2) +
      [0, 1, 2, 3, 4, 5].map((i) => house(80 + i * 70, 300 + (i % 3) * 8, 44, 40)).join('') +
      p('M42 470C300 450 500 470 760 440S1020 410 1158 400V450C1020 460 800 490 760 500S300 520 42 520Z', '#3a4132') + ln('M42 495C300 480 520 498 760 468S1020 440 1158 430', C.paper, 2, '18 14', 0.5) +
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => veh(120 + i * 62, 466 - i * 2, i % 3 === 0 ? C.blue : '#0f120d')).join('') +
      ln('M760 440L1080 400', C.yellow, 4, '14 8') + ln('M600 360L620 530', C.red, 3, '4 6', 0.8) + circ(610, 360, 7, C.red, 0.9) +
      r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'moshchun', tag: 'MOSHCHUN / NORTH-WEST FILE', sub: 'WOODS · VILLAGE · HOLDING LINE',
    title: '莫什春：林地、村落与防线',
    note: '林地、堑壕折线与村落块面为抽象示意，不标出真实阵地或兵力。',
    body: () => r(42, 126, 1116, 457, '#1c231a') +
      [[120, 220, 2], [210, 300, 1.8], [90, 380, 1.6], [900, 220, 2], [1010, 310, 1.8], [960, 430, 1.7], [700, 190, 1.4], [320, 460, 1.5]].map((t) => tree(t[0], t[1], t[2])).join('') +
      [0, 1, 2, 3].map((i) => house(430 + i * 70, 340 + (i % 2) * 14, 46, 40)).join('') +
      ln('M300 480L360 450L420 480L480 450L540 480L600 450L660 480L720 450L780 480', C.amber, 3) +
      `<path d="M240 200l120 70" stroke="${C.red}" stroke-width="4" fill="none"/><path d="M340 258l24 14l-4 -28" fill="none" stroke="${C.red}" stroke-width="3"/>` +
      ring(540, 380, 150, C.line, 1.5, '6 10') + r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'brovary', tag: 'BROVARY / EAST ROAD FILE', sub: 'ROAD · AMBUSH · DELAY',
    title: '布罗瓦雷：东面道路的拖延',
    note: '道路、伏击标记与被拉长的纵队线条表示延滞行动；不表示真实路线或战果。',
    body: () => r(42, 126, 1116, 457, C.olive) + r(42, 420, 1116, 163, C.olive2) +
      p('M42 470L1158 410V440L42 510Z', '#3a4132') + ln('M42 490L1158 425', C.paper, 2, '20 16', 0.5) +
      [0, 1, 2, 3, 4, 5, 6].map((i) => veh(120 + i * 48, 466 - i * 5, '#0f120d')).join('') +
      [[700, 300], [780, 330], [860, 300]].map((a) => `<path d="M${a[0]} ${a[1]}l10 -18l10 18Z" fill="none" stroke="${C.red}" stroke-width="3"/>`).join('') +
      ln('M720 320L760 420M800 345L780 420M880 320L850 415', C.red, 2, '4 6', 0.8) +
      [0, 1, 2, 3, 4].map((i) => tree(260 + i * 160, 250 + (i % 2) * 40, 1.4)).join('') +
      r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'chernihiv', tag: 'CHERNIHIV / NORTH FILE', sub: 'CITY · SUPPLY LINE · PRESSURE',
    title: '切尔尼戈夫：北面压力与补给线',
    note: '城市环线、被压缩的补给虚线和北来箭头为抽象示意，不表示真实包围范围。',
    body: () => r(42, 126, 1116, 457, C.olive) + p('M42 400C300 380 520 420 760 400S1040 380 1158 400V430C1000 420 800 450 600 440S250 420 42 430Z', '#2b3f4c') +
      [0, 1, 2, 3, 4, 5, 6].map((i) => house(520 + (i % 4) * 56, 330 + Math.floor(i / 4) * 52, 40, 34)).join('') +
      ring(610, 360, 130, C.amber, 2.5) + ring(610, 360, 190, C.line, 1.5, '6 10') +
      [[400, 150], [610, 120], [820, 150]].map((a) => `<path d="M${a[0]} ${a[1]}L${a[0]} ${a[1] + 90}" stroke="${C.red}" stroke-width="4"/><path d="M${a[0] - 12} ${a[1] + 74}l12 18l12 -18" fill="none" stroke="${C.red}" stroke-width="4"/>`).join('') +
      ln('M610 500C610 530 700 550 900 565', C.yellow, 3, '10 12') + ln('M610 490C560 530 360 550 120 565', C.blue, 3, '10 12') +
      r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'aid-arrival', tag: 'AID / LOGISTICS FILE', sub: 'REQUEST · COMMITMENT · TRANSPORT · ARRIVAL · ALLOCATION',
    title: '援助抵达：从请求到真正用上',
    note: '七个节点表示援助从请求、考虑、承诺、运输、抵达、分配到见效，每一步都需要时间。',
    body: () => r(42, 126, 1116, 457, '#1c231a') + r(42, 400, 1116, 183, C.olive2) +
      ['请求', '考虑', '承诺', '运输', '抵达', '分配', '见效'].map((s, i) => {
        const x = 120 + i * 160;
        return circ(x, 300, 26, i < 5 ? C.amber : 'none', i < 5 ? 0.85 : 0) + ring(x, 300, 26, C.amber, 2) + txt(x, 306, s, 'sans paper', 15, 'text-anchor="middle"') + (i < 6 ? ln(`M${x + 28} 300H${x + 132}`, C.line, 2, '6 8') : '');
      }).join('') +
      [0, 1, 2, 3, 4, 5, 6, 7].map((i) => r(150 + i * 52, 448 - (i % 3) * 6, 38, 28, i % 2 ? '#3a4430' : '#2f3a28')).join('') +
      ln('M100 520H1100', C.paper, 2, '24 14', 0.5) + [0, 1, 2].map((i) => veh(300 + i * 90, 506, '#0f120d')).join('') +
      r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'office-waiting', tag: 'OFFICE / WAITING FILE', sub: 'DESK · PHONE · REPORTS NOT YET IN',
    title: '总统办公室：等待汇报的时间',
    note: '桌面、电话与尚未到齐的文件。总统不在场，不绘制任何真实人物。',
    body: () => r(42, 126, 1116, 457, '#1a1f17') + r(42, 126, 1116, 280, '#20271e') +
      r(450, 170, 300, 180, '#11150f') + ln('M450 260H750M600 170V350', C.line, 2, null, 0.7) + r(470, 190, 120, 150, '#22364a', 0.65) +
      ring(900, 230, 56, C.amber, 3) + ln('M900 230V190M900 230L930 245', C.amber, 3) +
      r(42, 400, 1116, 183, '#241e17') + r(200, 380, 700, 30, '#3a3024') +
      r(250, 330, 120, 50, '#11150f') + r(262, 318, 96, 12, C.paper, 0.85) + r(270, 306, 80, 12, C.paper, 0.6) +
      p('M700 380l60 -30h40v30Z', '#0f120d') + circ(790, 372, 8, C.amber, 0.9) +
      p('M520 470v50h60v-50Z', '#0f120d') + p('M520 470q30 -40 60 0', '#171b14') +
      `<path d="M410 380L380 340" stroke="${C.amber}" stroke-width="3"/><path d="M380 340l60 -26l60 26Z" fill="${C.amber}" fill-opacity=".35"/>` +
      r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'reentry', tag: 'RE-ENTRY / SECURITY FILE', sub: 'CHECKPOINT · MINES · UNCONFIRMED ROADS',
    title: '撤退之后：重新进入与安全确认',
    note: '路障、警示三角与未确认路段表示重新进入需要先排查、再通行；不描绘实际雷场位置。',
    body: () => r(42, 126, 1116, 457, C.olive) + r(42, 360, 1116, 223, C.olive2) +
      p('M120 570L520 350H700L1100 570Z', '#313828') + ln('M610 350V570', C.paper, 3, '26 22', 0.4) +
      r(470, 420, 280, 10, C.amber) + [0, 1, 2, 3, 4, 5].map((i) => r(470 + i * 48, 420, 24, 10, '#0f120d')).join('') +
      [[300, 500], [420, 470], [850, 480], [950, 520]].map((a) => `<path d="M${a[0]} ${a[1] - 18}l18 32h-36Z" fill="none" stroke="${C.red}" stroke-width="3"/><path d="M${a[0]} ${a[1] - 6}v10" stroke="${C.red}" stroke-width="3"/>`).join('') +
      [0, 1, 2, 3].map((i) => house(90 + i * 60, 300, 40, 36, '#0d110b')).join('') + [0, 1, 2].map((i) => house(900 + i * 70, 290, 44, 40, '#0d110b')).join('') +
      ln('M610 350C610 280 700 220 860 190', C.yellow, 2, '8 8') + r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  },
  {
    id: 'wrap-repair', tag: 'RECOVERY / REPAIR FILE', sub: 'BRIDGE · POWER · RETURN OF RESIDENTS',
    title: '残局：修桥、通电与居民返回',
    note: '脚手架、吊臂与重新亮起的窗口表示战后修复需要时间；不表示实际清理进度或数量。',
    body: () => r(42, 126, 1116, 457, '#1a2018') + r(42, 430, 1116, 153, C.olive2) +
      p('M42 380C300 360 520 410 760 380S1000 350 1158 380V440C1000 430 800 460 600 450S250 430 42 440Z', '#2b3f4c') +
      r(120, 360, 300, 22, '#11150f') + r(640, 360, 380, 22, '#11150f') + r(420, 360, 220, 22, '#3a3024') +
      ln('M440 360V300M520 360V300M600 360V300M440 300H600M440 330H600', C.amber, 3) +
      ln('M820 360V200L960 260', C.paper, 4) + ln('M960 260V330', C.paper, 2, '4 6') + r(950, 330, 20, 14, C.amber) +
      [0, 1, 2, 3, 4].map((i) => house(110 + i * 76, 300, 46, 44, '#0d110b')).join('') +
      [0, 2, 4].map((i) => r(124 + i * 76, 286, 14, 14, i === 2 ? C.blue : C.yellow, 0.9)).join('') +
      [0, 1, 2, 3, 4, 5].map((i) => r(240 + i * 78, 500 + (i % 2) * 6, 40, 22, i % 2 ? '#3a4430' : '#2f3a28')).join('') +
      r(42, 560, 1116, 4, C.blue) + r(42, 564, 1116, 4, C.yellow)
  }
];

function render(s, i) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 700" role="img" aria-labelledby="title desc">
  <title id="title">${s.title}</title>
  <desc id="desc">原创抽象矢量插画（程序生成），非照片。${s.note}</desc>
  <defs>
    <pattern id="grain" width="43" height="37" patternUnits="userSpaceOnUse"><circle cx="8" cy="11" r=".8" fill="#d0c398" fill-opacity=".08"/><path d="M26 28h5" stroke="#d0c398" stroke-opacity=".04"/></pattern>
    <clipPath id="field"><path d="M42 126H1158V583H42Z"/></clipPath>
    <style>.serif{font-family:Georgia,'SimSun',serif}.sans{font-family:Arial,'Microsoft YaHei',sans-serif}.mono{font-family:Consolas,monospace}.paper{fill:#c8bc99}.amber{fill:#c9a563}.muted{fill:#969a88}</style>
  </defs>
  <rect width="1200" height="700" fill="${C.bg}"/><rect width="1200" height="700" fill="url(#grain)"/>
  <path d="M0 0H1200V13H0Z" fill="#bba267"/><path d="M0 13H1200V17H0Z" fill="#5a543b"/>
  <text x="42" y="59" class="mono paper" font-size="17" letter-spacing="3">${s.tag}</text>
  <text x="42" y="85" class="mono muted" font-size="12" letter-spacing="2">${s.sub}</text>
  <rect x="1068" y="38" width="90" height="31" fill="none" stroke="#b99a60"/><text x="1082" y="59" class="mono amber" font-size="13">${String(i + 1).padStart(2, '0')} / ${scenes.length}</text>
  <g clip-path="url(#field)">${s.body()}</g>
  <rect x="42" y="126" width="1116" height="457" fill="none" stroke="#7e8770" stroke-width="1.5"/>
  <text x="42" y="626" class="serif paper" font-size="27">${s.title}</text>
  <text x="42" y="654" class="sans muted" font-size="14">${s.note}</text>
  <text x="42" y="682" class="mono muted" font-size="11" letter-spacing="2">ORIGINAL SIMULATED ILLUSTRATION · NOT A PHOTOGRAPH · NO REAL UNIT OR INSIGNIA</text>
</svg>
`;
}

scenes.forEach((s, i) => fs.writeFileSync(path.join(OUT, s.id + '.svg'), render(s, i), 'utf8'));
console.log('生成 ' + scenes.length + ' 张场景插画 → ' + OUT);
