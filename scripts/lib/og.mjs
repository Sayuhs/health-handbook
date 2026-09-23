/**
 * scripts/lib/og.mjs
 *
 * 生成微信/社交分享用的 og:image —— 1200×630 的 PNG。
 *
 * 为什么手写 PNG：本环境没有 sharp、没有 canvas、没有图像处理库（都需要原生编译），
 * 也没有字体光栅化能力（画不了文字）。所以这张图完全由线条构成：
 * 深色底 + 双线金边 + 中央十字纹章 + 四角小菱。它不承担信息，只承担识别度。
 *
 * PNG 规范所需的全部东西：8 字节签名 + IHDR + IDAT(zlib) + IEND，
 * 每行前置一个 filter 字节。zlib 用 Node 内置。
 */
import { deflateSync } from "node:zlib";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const BG = [0x17, 0x13, 0x0e]; // 煤气灯书房的纸底
const GOLD = [0xc9, 0xa2, 0x27];
const GOLD_DIM = [0x8e, 0x75, 0x26];

/* ---------------- CRC32 与 PNG 块 ---------------- */
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------------- 画布 ---------------- */
function createCanvas(width, height, fill) {
  const buf = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    buf[i * 4] = fill[0];
    buf[i * 4 + 1] = fill[1];
    buf[i * 4 + 2] = fill[2];
    buf[i * 4 + 3] = 255;
  }

  const set = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    if (alpha >= 1) {
      buf[i] = color[0];
      buf[i + 1] = color[1];
      buf[i + 2] = color[2];
      buf[i + 3] = 255;
      return;
    }
    buf[i] = Math.round(buf[i] * (1 - alpha) + color[0] * alpha);
    buf[i + 1] = Math.round(buf[i + 1] * (1 - alpha) + color[1] * alpha);
    buf[i + 2] = Math.round(buf[i + 2] * (1 - alpha) + color[2] * alpha);
  };

  // 带软边的点，避免硬阶梯太粗糙
  const dot = (x, y, color, strength = 1) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = x - xi;
    const fy = y - yi;
    set(xi, yi, color, strength * (1 - fx) * (1 - fy));
    set(xi + 1, yi, color, strength * fx * (1 - fy));
    set(xi, yi + 1, color, strength * (1 - fx) * fy);
    set(xi + 1, yi + 1, color, strength * fx * fy);
  };

  const line = (x0, y0, x1, y1, color, thickness = 1) => {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy)) * 2;
    const half = thickness / 2;
    for (let s = 0; s <= steps; s++) {
      const t = steps === 0 ? 0 : s / steps;
      const x = x0 + dx * t;
      const y = y0 + dy * t;
      for (let ox = -half; ox <= half; ox += 0.5) {
        for (let oy = -half; oy <= half; oy += 0.5) dot(x + ox, y + oy, color, 0.85);
      }
    }
  };

  const frame = (x0, y0, x1, y1, color, thickness = 1) => {
    line(x0, y0, x1, y0, color, thickness);
    line(x1, y0, x1, y1, color, thickness);
    line(x1, y1, x0, y1, color, thickness);
    line(x0, y1, x0, y0, color, thickness);
  };

  const diamond = (cx, cy, r, color, thickness = 2) => {
    line(cx, cy - r, cx + r, cy, color, thickness);
    line(cx + r, cy, cx, cy + r, color, thickness);
    line(cx, cy + r, cx - r, cy, color, thickness);
    line(cx - r, cy, cx, cy - r, color, thickness);
  };

  const disc = (cx, cy, r, color) => {
    for (let y = -r; y <= r; y++) {
      for (let x = -r; x <= r; x++) {
        const d = Math.sqrt(x * x + y * y);
        if (d <= r) dot(cx + x, cy + y, color, d > r - 1 ? r - d : 1);
      }
    }
  };

  return { buf, set, dot, line, frame, diamond, disc, width, height };
}

/**
 * 深色底、双线金边、中央十字纹章、四角小菱。
 * 「能投下影子的东西」不做——这里只有线，属于装饰性几何图形。
 */
export function renderOgImage({ width = OG_WIDTH, height = OG_HEIGHT } = {}) {
  const canvas = createCanvas(width, height, BG);
  const cx = width / 2;
  const cy = height / 2;

  // 外双线框
  canvas.frame(56, 56, width - 57, height - 57, GOLD_DIM, 2);
  canvas.frame(72, 72, width - 73, height - 73, GOLD, 1);

  // 四角小菱
  for (const [x, y] of [
    [110, 110],
    [width - 111, 110],
    [110, height - 111],
    [width - 111, height - 111],
  ]) {
    canvas.diamond(x, y, 14, GOLD, 1.4);
  }

  // 中央纹章：菱形怀抱一个十字
  canvas.diamond(cx, cy, 148, GOLD, 2.2);
  canvas.diamond(cx, cy, 132, GOLD_DIM, 1);

  const arm = 74;
  const bar = 9;
  canvas.line(cx - bar / 2, cy - arm, cx + bar / 2, cy - arm, GOLD, 1);
  canvas.frame(cx - bar / 2, cy - arm, cx + bar / 2, cy + arm, GOLD, 1);
  canvas.frame(cx - arm, cy - bar / 2, cx + arm, cy + bar / 2, GOLD, 1);
  // 用实心块填出十字，比描边更稳
  for (let y = cy - arm; y <= cy + arm; y++) {
    for (let x = cx - bar / 2; x <= cx + bar / 2; x++) canvas.dot(x, y, GOLD, 0.95);
  }
  for (let y = cy - bar / 2; y <= cy + bar / 2; y++) {
    for (let x = cx - arm; x <= cx + arm; x++) canvas.dot(x, y, GOLD, 0.95);
  }

  // 菱形内的四个圆点，让纹章不至于太空
  for (const [dx, dy] of [
    [0, -104],
    [0, 104],
    [-104, 0],
    [104, 0],
  ]) {
    canvas.disc(cx + dx, cy + dy, 5, GOLD);
  }

  // 上下两条金线，给画面分层
  canvas.line(cx - 240, cy + 205, cx + 240, cy + 205, GOLD_DIM, 1);
  canvas.line(cx - 240, cy - 205, cx + 240, cy - 205, GOLD_DIM, 1);

  return encodePng(width, height, canvas.buf);
}
