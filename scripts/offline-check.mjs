import { chromium } from 'playwright-core'

const BASE = 'http://127.0.0.1:4173'
const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-sandbox'],
})
const context = await browser.newContext({ viewport: { width: 390, height: 820 } })
const page = await context.newPage()
await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' })
await page.waitForFunction(() => !document.querySelector('.instrument-modal'), { timeout: 10000 })
await page.evaluate(() => navigator.serviceWorker.ready)
await context.setOffline(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await page.locator('h1').waitFor({ state: 'visible', timeout: 10000 })
console.log('offline reload ok:', (await page.locator('h1').innerText()).trim())
await context.setOffline(false)
await browser.close()
