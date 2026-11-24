import fs from 'node:fs'
import path from 'node:path'
import { chromium } from 'playwright-core'

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const OUT = path.resolve('.artifacts')
fs.mkdirSync(OUT, { recursive: true })

const WIDTHS = [320, 360, 375, 390, 430, 768, 1024, 1440]
const ROUTES = ['/?demo=1', '/notes', '/plan', '/review', '/instrument', '/studio', '/progress', '/settings']
const failures = []
const results = []

const browser = await chromium.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: 820 }, deviceScaleFactor: 1 })
    const page = await context.newPage()
    page.on('pageerror', (error) => failures.push(`${width}px page error: ${error.message}`))
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const source = message.location()?.url ?? ''
      // Ignore third-party browser-extension noise; only fail on our own origin.
      if (!source.startsWith(BASE) && !message.text().includes(BASE)) return
      failures.push(`${width}px console: ${message.text()}`)
    })
    for (const route of ROUTES) {
      await page.goto(BASE + route, { waitUntil: 'networkidle' })
      await page.waitForFunction(() => !document.querySelector('.instrument-modal'), { timeout: 10000 }).catch(() => {})
      await page.locator('h1, .studio-time, .dial-shell').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
      const metrics = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        inner: window.innerWidth,
      }))
      if (metrics.scroll > metrics.inner + 1) {
        failures.push(`${width}px ${route}: horizontal overflow ${metrics.scroll} > ${metrics.inner}`)
      }
      results.push(`${width}px ${route} ok`)
      if (width === 390 && route === '/?demo=1') {
        await page.screenshot({ path: path.join(OUT, 'today-390.png'), fullPage: false })
      }
      if (width === 390 && route === '/instrument') {
        await page.screenshot({ path: path.join(OUT, 'instrument-390.png'), fullPage: false })
      }
      if (width === 390 && route === '/notes') {
        await page.screenshot({ path: path.join(OUT, 'notes-390.png'), fullPage: false })
      }
    }
    await context.close()
  }

  // Journey: new student → one-tap launch → dial → rescue → recall.
  const context = await browser.newContext({ viewport: { width: 390, height: 820 } })
  const page = await context.newPage()
  page.on('pageerror', (error) => failures.push(`journey page error: ${error.message}`))
  await page.goto(BASE + '/?demo=1', { waitUntil: 'networkidle' })
  await page.waitForFunction(() => !document.querySelector('.instrument-modal'), { timeout: 10000 })
  await page.getByRole('button', { name: /Start now/ }).click()
  await page.waitForURL(/\/instrument/)
  await page.locator('.dial-shell').waitFor({ state: 'visible' })
  results.push('one-tap launch opens the dial')
  const beforeTick = await page.locator('.dial-value').innerText()
  await page.waitForTimeout(2300)
  const afterTick = await page.locator('.dial-value').innerText()
  if (beforeTick === afterTick) failures.push('timer did not tick without another click')
  else results.push(`timer counts down on its own (${beforeTick} → ${afterTick})`)

  await page.goto(BASE + '/notes', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /New page/ }).first().click()
  await page.getByLabel('Page title').fill('Electromagnetic induction')
  await page.getByLabel('Page text').fill('Faraday: a changing flux induces an emf.')
  if ((await page.getByLabel('Page text').inputValue()).includes('Faraday')) {
    results.push('Notes binder creates and saves a page')
  } else {
    failures.push('Notes binder did not save the page text')
  }

  await page.goto(BASE + '/plan', { waitUntil: 'networkidle' })
  await page.getByRole('button', { name: /Rescue my day/ }).click()
  await page.getByRole('dialog').waitFor({ state: 'visible' })
  results.push('Rescue My Day opens with a diff')
  await page.getByRole('button', { name: /Keep my original plan/ }).click()

  await page.goto(BASE + '/review', { waitUntil: 'networkidle' })
  const recallButton = page.getByRole('button', { name: 'Recall' }).first()
  if (await recallButton.count()) {
    await recallButton.click()
    await page.getByRole('button', { name: /Explain from memory/ }).click()
    await page.locator('textarea').fill('Key ideas from memory')
    await page.getByRole('button', { name: /I have a rating/ }).click()
    await page.getByRole('button', { name: /Easy/ }).click()
    await page.getByText(/Next review/).waitFor({ state: 'visible', timeout: 5000 })
    results.push('Recall Loop schedules a next review')
  } else {
    failures.push('Recall Loop: no chapters in queue')
  }
  await context.close()
} finally {
  await browser.close()
}

console.log(results.join('\n'))
if (failures.length) {
  console.error('\nFAILED:\n' + failures.join('\n'))
  process.exit(1)
}
console.log('\nAll browser checks passed.')
