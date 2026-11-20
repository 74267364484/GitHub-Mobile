const { chromium } = require('/workspace/octodeck/.tooling/node_modules/playwright')
const fs = require('fs')

const OUT = '/workspace/octodeck/docs/screenshots'
fs.mkdirSync(OUT, { recursive: true })
const BASE = 'http://127.0.0.1:8788/'
const results = []
const consoleErrors = []

async function assertNoPersonal(page, label) {
  const text = await page.evaluate(() => document.body.innerText)
  const hits = ['ghp_', 'github_pat_'].filter((s) => text.includes(s))
  results.push({ check: `${label}: 无个人数据`, pass: hits.length === 0, detail: hits })
  if (hits.length) throw new Error(`${label} contains personal data: ${hits.join(',')}`)
}

async function overflow(page, label) {
  const o = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    iw: window.innerWidth,
  }))
  results.push({ check: `${label}: 无横向溢出`, pass: o.sw <= o.iw + 1, detail: o })
  return o
}

async function waitAuth(page) {
  await page.getByRole('heading', { name: '登录到 OctoMobile' }).waitFor({ timeout: 15000 })
  await page.waitForTimeout(400)
}

async function waitDemo(page) {
  await page.getByText('演示模式', { exact: false }).first().waitFor({ timeout: 30000 })
  await page.waitForTimeout(1200)
}

async function main() {
  const browser = await chromium.launch({ headless: true })

  // Desktop
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 1 })
  const page = await desktop.newPage()
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message))

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await waitAuth(page)
  await assertNoPersonal(page, '桌面登录页')
  await overflow(page, '桌面登录页')
  await page.screenshot({ path: `${OUT}/v11-auth-desktop.png`, fullPage: false })

  // Host dialog from auth
  await page.getByRole('button', { name: '管理' }).first().click()
  await page.locator('.host-dialog, .dialog').first().waitFor({ timeout: 8000 })
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${OUT}/v11-host-desktop.png`, fullPage: false })
  results.push({ check: '登录页可打开 Host 映射', pass: true })
  const cancel = page.getByRole('button', { name: '完成' })
  if (await cancel.count()) await cancel.first().click()
  await page.waitForTimeout(300)

  // Demo
  await page.getByRole('button', { name: /浏览演示/ }).click()
  await waitDemo(page)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(500)
  await assertNoPersonal(page, '桌面演示首页')
  await overflow(page, '桌面演示首页')
  await page.screenshot({ path: `${OUT}/v11-home-desktop.png`, fullPage: false })

  await page.goto(BASE + '#/microsoft/vscode', { waitUntil: 'domcontentloaded' })
  await page.getByRole('link', { name: '代码', exact: true }).first().waitFor({ timeout: 20000 })
  await page.waitForTimeout(1500)
  await assertNoPersonal(page, '桌面演示仓库')
  await overflow(page, '桌面演示仓库')
  await page.screenshot({ path: `${OUT}/v11-repo-desktop.png`, fullPage: false })

  // Issues page
  await page.goto(BASE + '#/microsoft/vscode/issues', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/v11-issues-desktop.png`, fullPage: false })
  await assertNoPersonal(page, '桌面演示议题')

  // Settings (demo)
  await page.goto(BASE + '#/settings', { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${OUT}/v11-settings-desktop.png`, fullPage: false })
  await assertNoPersonal(page, '桌面演示设置')
  await desktop.close()

  // Mobile
  const mobile = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const m = await mobile.newPage()
  m.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push('mobile: ' + msg.text()) })
  m.on('pageerror', (e) => consoleErrors.push('mobile pageerror: ' + e.message))

  await m.goto(BASE, { waitUntil: 'domcontentloaded' })
  await waitAuth(m)
  await assertNoPersonal(m, '手机登录页')
  await overflow(m, '手机登录页')
  await m.screenshot({ path: `${OUT}/v11-auth-mobile.png`, fullPage: false })

  // Host dialog on auth mobile
  await m.getByRole('button', { name: '管理' }).first().click()
  await m.locator('.host-dialog, .dialog').first().waitFor({ timeout: 8000 })
  await m.waitForTimeout(400)
  await m.screenshot({ path: `${OUT}/v11-host-mobile.png`, fullPage: false })
  const done = m.getByRole('button', { name: '完成' })
  if (await done.count()) await done.first().click()
  await m.waitForTimeout(300)

  await m.getByRole('button', { name: /浏览演示/ }).click()
  await waitDemo(m)
  await m.keyboard.press('Escape')
  await m.waitForTimeout(500)
  await assertNoPersonal(m, '手机演示首页')
  await overflow(m, '手机演示首页')
  await m.screenshot({ path: `${OUT}/v11-home-mobile.png`, fullPage: false })

  // Drawer
  await m.getByRole('button', { name: '打开导航' }).click()
  await m.waitForTimeout(400)
  await m.screenshot({ path: `${OUT}/v11-drawer-mobile.png`, fullPage: false })
  results.push({ check: '手机抽屉可打开', pass: true })
  await m.getByRole('button', { name: '关闭导航' }).click()
  await m.waitForTimeout(300)

  await m.goto(BASE + '#/microsoft/vscode', { waitUntil: 'domcontentloaded' })
  await m.waitForTimeout(1800)
  await assertNoPersonal(m, '手机演示仓库')
  await overflow(m, '手机演示仓库')
  await m.screenshot({ path: `${OUT}/v11-repo-mobile.png`, fullPage: false })

  await m.goto(BASE + '#/microsoft/vscode/issues', { waitUntil: 'domcontentloaded' })
  await m.waitForTimeout(1500)
  await m.screenshot({ path: `${OUT}/v11-issues-mobile.png`, fullPage: false })
  await overflow(m, '手机演示议题')

  await mobile.close()
  await browser.close()

  console.log(JSON.stringify({ results, consoleErrors: consoleErrors.slice(0, 12) }, null, 2))
  if (results.some((r) => !r.pass)) process.exit(1)
}

main().catch((e) => { console.error('QA FAILED:', e); process.exit(1) })
