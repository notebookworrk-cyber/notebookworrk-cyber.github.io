import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = path.resolve('.artifacts')
fs.mkdirSync(OUT, { recursive: true })

/** Build a tiny, valid one-page PDF so the check needs no fixture download. */
function samplePdf() {
  const content = 'BT /F1 24 Tf 72 700 Td (Faraday flux) Tj ET\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets = []
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf))
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xref = Buffer.byteLength(pdf)
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf)
}

const pdfPath = path.join(OUT, 'sample.pdf')
fs.writeFileSync(pdfPath, samplePdf())

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] })
const page = await browser.newPage({ viewport: { width: 390, height: 820 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(`${BASE}/?demo=1`, { waitUntil: 'networkidle' })
await page.waitForFunction(() => !document.querySelector('.instrument-modal'), null, { timeout: 20_000 })
await page.goto(`${BASE}/notes`, { waitUntil: 'networkidle' })
await page.locator('input[type=file]').setInputFiles(pdfPath)
await page.locator('.pdf-canvas').waitFor({ state: 'visible', timeout: 20_000 })
await page.waitForFunction(() => {
  const c = document.querySelector('.pdf-canvas')
  return !!c && c.width > 100 && c.height > 100
}, null, { timeout: 20_000 })

const before = await page.evaluate(() => {
  const c = document.querySelector('.ink-canvas')
  return c ? c.width * c.height : 0
})
await page.locator('.ink-canvas').scrollIntoViewIfNeeded()
const box = await page.locator('.ink-canvas').boundingBox()
if (!box) throw new Error('Ink canvas has no box')
await page.mouse.move(box.x + 40, box.y + 40)
await page.mouse.down()
await page.mouse.move(box.x + 180, box.y + 120, { steps: 12 })
await page.mouse.up()
await page.waitForTimeout(300)
const after = await page.evaluate(() => {
  const c = document.querySelector('.ink-canvas')
  const ctx = c?.getContext('2d')
  if (!c || !ctx) return 0
  const data = ctx.getImageData(0, 0, c.width, c.height).data
  let painted = 0
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) painted++
  return painted
})
await page.screenshot({ path: path.join(OUT, 'pdf-390.png'), fullPage: false })
await browser.close()

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
if (!before) throw new Error('Ink canvas has no drawing surface')
if (after < 50) throw new Error(`Ink did not render on the PDF (painted pixels: ${after})`)
console.log(`PDF rendered and ink captured (${after} painted pixels).`)
