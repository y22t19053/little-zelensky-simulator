/* 小型 QR 码编码器：字节模式、纠错等级 M、版本 1–6（最多 106 字节）。
 * 只服务于纪念海报里的网址二维码，不依赖任何外部库。
 * 输出 { size, version, mask, modules[y][x] }，true 为深色模块。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.LZS_QR = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 纠错等级 M：[总码字数, 每块纠错码字数, 块数, 对齐图案坐标, 余位]
  const VERSIONS = {
    1: { total: 26, ecc: 10, blocks: 1, align: [], rem: 0 },
    2: { total: 44, ecc: 16, blocks: 1, align: [6, 18], rem: 7 },
    3: { total: 70, ecc: 26, blocks: 1, align: [6, 22], rem: 7 },
    4: { total: 100, ecc: 18, blocks: 2, align: [6, 26], rem: 7 },
    5: { total: 134, ecc: 24, blocks: 2, align: [6, 30], rem: 7 },
    6: { total: 172, ecc: 16, blocks: 4, align: [6, 34], rem: 7 }
  };

  function utf8(text) {
    const out = [];
    const s = unescape(encodeURIComponent(String(text)));
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  function gfMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z & 0xFF;
  }

  function rsDivisor(degree) {
    const result = [];
    for (let i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    let rootValue = 1;
    for (let i = 0; i < degree; i++) {
      for (let j = 0; j < result.length; j++) {
        result[j] = gfMul(result[j], rootValue);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      rootValue = gfMul(rootValue, 0x02);
    }
    return result;
  }

  function rsRemainder(data, divisor) {
    const result = divisor.map(function () { return 0; });
    data.forEach(function (b) {
      const factor = b ^ result.shift();
      result.push(0);
      divisor.forEach(function (coef, i) { result[i] ^= gfMul(coef, factor); });
    });
    return result;
  }

  function dataCapacity(version) {
    const v = VERSIONS[version];
    return v.total - v.ecc * v.blocks;
  }

  function buildCodewords(bytes, version) {
    const v = VERSIONS[version];
    const capBits = dataCapacity(version) * 8;
    const bits = [];
    function put(value, len) { for (let i = len - 1; i >= 0; i--) bits.push((value >>> i) & 1); }
    put(0x4, 4);
    put(bytes.length, 8);
    bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, capBits - bits.length));
    while (bits.length % 8) bits.push(0);
    for (let pad = 0xEC; bits.length < capBits; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const data = [];
    for (let i = 0; i < bits.length; i += 8) {
      let b = 0;
      for (let j = 0; j < 8; j++) b = (b << 1) | bits[i + j];
      data.push(b);
    }
    const numShort = v.blocks - (v.total % v.blocks);
    const shortLen = Math.floor(v.total / v.blocks);
    const divisor = rsDivisor(v.ecc);
    const blocks = [];
    for (let i = 0, k = 0; i < v.blocks; i++) {
      const dat = data.slice(k, k + shortLen - v.ecc + (i < numShort ? 0 : 1));
      k += dat.length;
      blocks.push({ dat: dat, ecc: rsRemainder(dat, divisor) });
    }
    const result = [];
    for (let i = 0; i < blocks[0].dat.length + 1; i++) {
      blocks.forEach(function (blk) { if (i < blk.dat.length) result.push(blk.dat[i]); });
    }
    for (let i = 0; i < v.ecc; i++) blocks.forEach(function (blk) { result.push(blk.ecc[i]); });
    return result;
  }

  function formatBits(mask) {
    const data = (0 << 3) | mask; // 纠错等级 M 的格式位为 00
    let rem = data;
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    return ((data << 10) | rem) ^ 0x5412;
  }

  function maskTest(mask, x, y) {
    switch (mask) {
      case 0: return (x + y) % 2 === 0;
      case 1: return y % 2 === 0;
      case 2: return x % 3 === 0;
      case 3: return (x + y) % 3 === 0;
      case 4: return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5: return (x * y) % 2 + (x * y) % 3 === 0;
      case 6: return ((x * y) % 2 + (x * y) % 3) % 2 === 0;
      default: return ((x + y) % 2 + (x * y) % 3) % 2 === 0;
    }
  }

  function penalty(m, size) {
    let score = 0;
    function runs(get) {
      for (let a = 0; a < size; a++) {
        let run = 1;
        for (let b = 1; b < size; b++) {
          if (get(a, b) === get(a, b - 1)) { run++; if (run === 5) score += 3; else if (run > 5) score++; } else run = 1;
        }
        // 规则 3：类似定位图案的 1:1:3:1:1
        for (let b = 0; b + 11 <= size; b++) {
          const w = [];
          for (let k = 0; k < 11; k++) w.push(get(a, b + k) ? 1 : 0);
          const s = w.join('');
          if (s === '10111010000' || s === '00001011101') score += 40;
        }
      }
    }
    runs(function (y, x) { return m[y][x]; });
    runs(function (x, y) { return m[y][x]; });
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
      const c = m[y][x];
      if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) score += 3;
    }
    let dark = 0;
    m.forEach(function (row) { row.forEach(function (c) { if (c) dark++; }); });
    const total = size * size;
    score += Math.floor(Math.abs(dark * 20 - total * 10) / total) * 10;
    return score;
  }

  function encode(text) {
    const bytes = utf8(text);
    let version = 0;
    for (let v = 1; v <= 6; v++) {
      if (4 + 8 + bytes.length * 8 <= dataCapacity(v) * 8) { version = v; break; }
    }
    if (!version) throw new Error('QR_TOO_LONG');
    const info = VERSIONS[version];
    const size = version * 4 + 17;
    const modules = [];
    const fn = [];
    for (let y = 0; y < size; y++) { modules.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    function setFn(x, y, dark) {
      if (x < 0 || y < 0 || x >= size || y >= size) return;
      modules[y][x] = !!dark;
      fn[y][x] = true;
    }
    for (let i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    [[3, 3], [size - 4, 3], [3, size - 4]].forEach(function (c) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        setFn(c[0] + dx, c[1] + dy, dist !== 2 && dist !== 4);
      }
    });
    const last = info.align.length - 1;
    info.align.forEach(function (cy, i) {
      info.align.forEach(function (cx, j) {
        if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) return;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setFn(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      });
    });
    function drawFormat(mask) {
      const bits = formatBits(mask);
      const bit = function (i) { return ((bits >>> i) & 1) !== 0; };
      for (let i = 0; i <= 5; i++) setFn(8, i, bit(i));
      setFn(8, 7, bit(6)); setFn(8, 8, bit(7)); setFn(7, 8, bit(8));
      for (let i = 9; i < 15; i++) setFn(14 - i, 8, bit(i));
      for (let i = 0; i < 8; i++) setFn(size - 1 - i, 8, bit(i));
      for (let i = 8; i < 15; i++) setFn(8, size - 15 + i, bit(i));
      setFn(8, size - 8, true);
    }
    drawFormat(0);

    const codewords = buildCodewords(bytes, version);
    let bitIndex = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? size - 1 - vert : vert;
          if (!fn[y][x] && bitIndex < codewords.length * 8) {
            modules[y][x] = ((codewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0;
            bitIndex++;
          }
        }
      }
    }
    function applyMask(mask) {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (!fn[y][x] && maskTest(mask, x, y)) modules[y][x] = !modules[y][x];
      }
    }
    let best = 0, bestScore = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      applyMask(mask);
      drawFormat(mask);
      const s = penalty(modules, size);
      if (s < bestScore) { bestScore = s; best = mask; }
      applyMask(mask);
    }
    applyMask(best);
    drawFormat(best);
    return { size: size, version: version, mask: best, modules: modules };
  }

  return { encode: encode, maxBytes: 62 };
});
