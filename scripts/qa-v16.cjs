const { chromium } = require('/workspace/octodeck/.tooling/node_modules/playwright')

const BASE = 'http://127.0.0.1:5173/'
const results = []
const errors = []

function check(name, pass, detail = '') {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
}

async function countExternal(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('a[target="_blank"]')).map((a) => a.getAttribute('href')).filter((h) => h && /github\.com/.test(h)))
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))

  await page.goto(BASE, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(7000)

  const body = await page.evaluate(() => document.body.innerText)
  const isAuth = body.includes('登录到 GitHub Mobile')
  const isDemo = body.includes('演示模式') || body.includes('公开浏览')
  check('应用已启动', !isAuth, isAuth ? '仍在登录页' : (isDemo ? '演示模式' : '实时模式'))

  if (isAuth) {
    await page.getByRole('button', { name: /浏览演示/ }).click()
    await page.waitForTimeout(2500)
  }

  // Actions page
  await page.evaluate(() => { location.hash = '#/sindresorhus/awesome/actions' })
  await page.waitForTimeout(4500)
  let ext = await countExternal(page)
  check('Actions 无 GitHub 外链', ext.length === 0, ext.join(','))
  const actionsText = await page.evaluate(() => document.body.innerText)
  check('Actions 应用内标题/新建', actionsText.includes('新建工作流'), actionsText.slice(0, 80).replace(/\n/g, ' '))

  // Insights page
  await page.evaluate(() => { location.hash = '#/sindresorhus/awesome/insights' })
  await page.waitForTimeout(4000)
  ext = await countExternal(page)
  check('Insights 无 GitHub 外链', ext.length === 0, ext.join(','))
  const addCount = await page.locator('.community-add').count()
  check('Insights 社区标准有应用内操作', addCount > 0, `按钮 ${addCount} 个`)
  if (addCount) {
    await page.locator('.community-add').first().click()
    await page.waitForTimeout(700)
    const dialog = await page.locator('.dialog, .dialog-backdrop').count()
    const h = await page.evaluate(() => location.hash)
    check('社区标准“添加”走应用内流程', dialog > 0 || h.includes('/settings'), dialog > 0 ? '对话框' : h)
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }

  // Deep link route (issue)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('octo-open-url', { detail: 'https://github.com/sindresorhus/awesome/pull/123' })))
  await page.waitForTimeout(1200)
  const hash = await page.evaluate(() => location.hash)
  check('GitHub 深链路由到应用内 PR', hash === '#/sindresorhus/awesome/pulls/123', hash)

  // Deep link route (blob/tree)
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('octo-open-url', { detail: 'https://github.com/sindresorhus/awesome/tree/main' })))
  await page.waitForTimeout(1200)
  const hash2 = await page.evaluate(() => location.hash)
  check('GitHub 深链路由到应用内目录', hash2 === '#/sindresorhus/awesome/tree/main', hash2)

  // OAuth callback dialog
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('octo-open-url', { detail: 'githubmobile://oauth/callback?code=abc123&state=xyz' })))
  await page.waitForTimeout(800)
  const oauthText = await page.evaluate(() => document.body.innerText)
  check('OAuth 回调弹出应用内对话框', oauthText.includes('已收到 GitHub 授权回调') && oauthText.includes('abc123'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // OAuth authorize dialog
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('octo-open-url', { detail: 'https://github.com/login/oauth/authorize?client_id=Ov23liTest&scope=repo%20read:user&redirect_uri=myapp://callback&state=s1' })))
  await page.waitForTimeout(800)
  const authText = await page.evaluate(() => document.body.innerText)
  check('OAuth 授权请求显示权限确认', authText.includes('GitHub 授权请求') && authText.includes('Ov23liTest') && authText.includes('read:user'))
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)

  // Settings links section
  await page.evaluate(() => { location.hash = '#/settings' })
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: /链接与授权/ }).click()
  await page.waitForTimeout(400)
  const linksText = await page.evaluate(() => document.body.innerText)
  check('设置包含链接与授权', linksText.includes('GitHub 链接由应用接管') && linksText.includes('第三方账号绑定'))
  ext = await countExternal(page)
  check('设置页无 GitHub 外链', ext.length === 0, ext.join(','))

  // Test link input
  const input = page.locator('.link-test-row input')
  await input.fill('https://github.com/sindresorhus/awesome/issues')
  await page.getByRole('button', { name: '测试打开' }).click()
  await page.waitForTimeout(1000)
  const hash3 = await page.evaluate(() => location.hash)
  check('设置页测试链接进入应用内议题', hash3 === '#/sindresorhus/awesome/issues', hash3)

  // Gists
  await page.evaluate(() => { location.hash = '#/gists' })
  await page.waitForTimeout(1800)
  const gistText = await page.evaluate(() => document.body.innerText)
  check('Gist 页面可用', gistText.includes('Gist') && !gistText.includes('404'), gistText.slice(0, 60).replace(/\n/g, ' '))

  // Repo code page external anchors
  await page.evaluate(() => { location.hash = '#/sindresorhus/awesome' })
  await page.waitForTimeout(3500)
  ext = await countExternal(page)
  check('仓库代码页无 GitHub 外链', ext.length === 0, ext.join(','))

  // horizontal overflow
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check('移动端无横向溢出', overflow <= 1, `overflow=${overflow}px`)

  check('无控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '))

  await page.screenshot({ path: '/workspace/octodeck/docs/screenshots/v16-deeplink-settings.png', fullPage: false })
  await browser.close()

  const failed = results.filter((r) => !r.pass)
  console.log(`\n${results.length - failed.length}/${results.length} passed`)
  process.exit(failed.length ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(2) })
