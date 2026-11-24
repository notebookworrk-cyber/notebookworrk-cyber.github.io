import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
fs.mkdirSync(PUBLIC, { recursive: true })

function crc32(buf) {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function png(size) {
  const px = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const put = (x, y, r, g, b, a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = a
  }
  // warm paper field
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) put(x, y, 245, 242, 234)
  // the meridian: a hairline and the mark of now
  for (let y = Math.round(size * 0.16); y <= size * 0.84; y++) {
    for (let x = Math.round(cx - size * 0.012); x <= cx + size * 0.012; x++) put(x, y, 23, 22, 20)
  }
  const dotY = cy + size * 0.16
  const dotR = size * 0.095
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((x - cx) ** 2 + (y - dotY) ** 2 <= dotR ** 2) put(x, y, 214, 64, 31)
    }
  }

  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    px.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

fs.writeFileSync(path.join(PUBLIC, 'icon-192.png'), png(192))
fs.writeFileSync(path.join(PUBLIC, 'icon-512.png'), png(512))
fs.writeFileSync(path.join(PUBLIC, 'favicon.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">
<rect width="40" height="40" fill="#f5f2ea"/>
<path d="M20 6v28" stroke="#171614" stroke-width="1"/>
<circle cx="20" cy="26" r="4" fill="#d6401f"/>
</svg>`)
console.log('icons written')
