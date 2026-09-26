// Draws the extension icons (an indigo rounded square with a white check mark) as PNGs,
// with no image libraries: shapes are rasterized with 4×4 supersampling for smooth edges.
// Usage: node scripts/make-icons.mjs   → writes src/icons/icon-{16,32,48,128}.png
import { mkdir, writeFile } from 'node:fs/promises';
import { deflateSync } from 'node:zlib';

const SIZES = [16, 32, 48, 128];
const BG = [79, 70, 229]; // #4f46e5, the app's accent
const FG = [255, 255, 255];
// The check mark, in units of the icon's size.
const CHECK = [
  [0.27, 0.53],
  [0.43, 0.69],
  [0.74, 0.36],
];
const STROKE = 0.12;
const RADIUS = 0.22;
const SAMPLES = 4;

function insideRoundedSquare(x, y) {
  const r = RADIUS;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

const onCheck = (x, y) =>
  CHECK.slice(1).some((point, i) => distanceToSegment(x, y, CHECK[i], point) <= STROKE / 2);

function render(size) {
  const rgba = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let shape = 0;
      let mark = 0;
      for (let sy = 0; sy < SAMPLES; sy++) {
        for (let sx = 0; sx < SAMPLES; sx++) {
          const x = (px + (sx + 0.5) / SAMPLES) / size;
          const y = (py + (sy + 0.5) / SAMPLES) / size;
          if (insideRoundedSquare(x, y)) {
            shape++;
            if (onCheck(x, y)) mark++;
          }
        }
      }
      const n = SAMPLES * SAMPLES;
      const markShare = shape ? mark / shape : 0;
      const i = (py * size + px) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(BG[c] * (1 - markShare) + FG[c] * markShare);
      rgba[i + 3] = Math.round((shape / n) * 255);
    }
  }
  return encodePng(size, rgba);
}

// ─── Minimal PNG encoder ──────────────────────────────────────────────────────

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0; // no filter
    rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

await mkdir('src/icons', { recursive: true });
for (const size of SIZES) await writeFile(`src/icons/icon-${size}.png`, render(size));
console.log(`Wrote ${SIZES.map((s) => `icon-${s}.png`).join(', ')} to src/icons/`);
