import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import tls from 'node:tls'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpsProxyAgent } from 'https-proxy-agent'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DIST = path.join(ROOT, 'web', 'dist')
const PUBLIC = path.join(ROOT, 'web', 'public')
const PORT = Number(process.env.PORT || 8787)
const HOST = process.env.HOST || '127.0.0.1'
const PROXY = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy || ''
const HOSTS_FILE = path.join(ROOT, 'web', 'src', 'data', 'hosts.json')
const STATE_FILE = path.join(ROOT, '.host-state.json')
const HOSTS = JSON.parse(fs.readFileSync(HOSTS_FILE, 'utf8'))
const HOSTNAMES = Object.keys(HOSTS.hostnames)

function loadEnv(file) {
  try {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      const t = line.trim()
      if (!t || t.startsWith('#')) continue
      const i = t.indexOf('=')
      if (i > 0 && !process.env[t.slice(0, i)]) process.env[t.slice(0, i)] = t.slice(i + 1)
    }
  } catch {}
}
loadEnv(path.join(ROOT, '.env.local'))
loadEnv(path.join(ROOT, '.env'))
const NO_SERVER_TOKEN = process.env.OCTODECK_NO_SERVER_TOKEN === '1'
const ALLOW_SERVER_TOKEN = process.env.OCTODECK_ALLOW_SERVER_TOKEN === '1'
const SERVER_TOKEN = NO_SERVER_TOKEN ? '' : process.env.GITHUB_TOKEN || ''
const SERVER_TOKEN_ENABLED = ALLOW_SERVER_TOKEN && Boolean(SERVER_TOKEN)

function requestToken(req, clientToken) {
  if (clientToken) return clientToken
  if ((req.headers['x-gh-anonymous'] || '') === '1') return ''
  return SERVER_TOKEN_ENABLED ? SERVER_TOKEN : ''
}
const LOGIN = process.env.GITHUB_LOGIN || ''
const DEFAULT_REPO = process.env.DEFAULT_REPO || ''
const SNAPSHOT_ONLY = process.env.OCTODECK_SNAPSHOT_ONLY === '1'

function defaultHostState() {
  return {
    enabled: true,
    mappingId: HOSTS.defaultMappingId,
    custom: {
      'github.com': '',
      'api.github.com': '',
      'raw.githubusercontent.com': '',
      'github.githubassets.com': '',
      'codeload.github.com': '',
    },
    updatedAt: null,
  }
}

function loadHostState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
    if (s && typeof s.enabled === 'boolean' && typeof s.mappingId === 'string') {
      return { ...defaultHostState(), ...s, custom: { ...defaultHostState().custom, ...(s.custom || {}) } }
    }
  } catch {}
  return defaultHostState()
}
let hostState = loadHostState()

function saveHostState() {
  hostState.updatedAt = new Date().toISOString()
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(hostState, null, 2))
  } catch (e) {
    console.warn('cannot save host state', e.message)
  }
}

function mappingById(id) {
  return HOSTS.mappings.find((m) => m.id === id) || HOSTS.mappings[0]
}

function mappedIp(hostname) {
  if (!hostState.enabled) return null
  const m = mappingById(hostState.mappingId)
  if (m.id === 'official') return null
  if (m.id === 'custom') {
    const ip = (hostState.custom || {})[hostname]
    return ip && net.isIPv4(ip) ? ip : null
  }
  return m.hosts?.[hostname] || null
}

function agentFor() {
  if (PROXY) return new HttpsProxyAgent(PROXY)
  return undefined
}

function proxyIpOptions(hostname, base = {}) {
  const ip = mappedIp(hostname)
  if (ip) {
    return {
      ...base,
      lookup: (h, opts, cb) => cb(null, ip, 4),
      servername: hostname,
    }
  }
  return base
}

function json(res, status, obj, extraHeaders = {}) {
  const body = JSON.stringify(obj)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    ...extraHeaders,
  })
  res.end(body)
}

function readBody(req, limit = 2 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0
    const chunks = []
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        reject(new Error('body too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

function requestUpstream({ method = 'GET', url, headers = {}, body = null, timeout = 30000 }) {
  return new Promise((resolve, reject) => {
    const u = new URL(url)
    const opts = proxyIpOptions(u.hostname, {
      method,
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers,
      timeout,
    })
    const agent = agentFor()
    if (agent) opts.agent = agent
    const req = https.request(opts, (res) => {
      const chunks = []
      let size = 0
      res.on('data', (c) => {
        size += c.length
        if (size < 30 * 1024 * 1024) chunks.push(c)
      })
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        })
      })
    })
    req.on('timeout', () => req.destroy(new Error('upstream timeout')))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

const ALLOWED_IMAGE_HOSTS = [
  'github.com',
  'avatars.githubusercontent.com',
  'raw.githubusercontent.com',
  'user-images.githubusercontent.com',
  'private-user-images.githubusercontent.com',
  'camo.githubusercontent.com',
  'objects.githubusercontent.com',
  'github.githubassets.com',
  'img.shields.io',
  'shields.io',
  'badgen.net',
]

function allowedImage(url) {
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:') return false
    return ALLOWED_IMAGE_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h) || u.hostname.endsWith('.githubusercontent.com'))
  } catch {
    return false
  }
}

const imageCache = new Map()

async function fetchImage(url, depth = 0) {
  if (imageCache.has(url)) return imageCache.get(url)
  const headers = { 'user-agent': 'Mozilla/5.0 GitHub Mobile', accept: 'image/avif,image/webp,image/png,image/svg+xml,image/*,*/*;q=0.8' }
  const r = await requestUpstream({ url, headers, timeout: 20000 })
  if (r.status >= 300 && r.status < 400 && r.headers.location && depth < 3) {
    const next = new URL(r.headers.location, url).toString()
    if (!allowedImage(next)) throw new Error('redirect not allowed')
    return fetchImage(next, depth + 1)
  }
  if (r.status >= 400) throw new Error('image status ' + r.status)
  const result = { body: r.body, type: r.headers['content-type'] || 'application/octet-stream' }
  if (imageCache.size > 120) imageCache.clear()
  imageCache.set(url, result)
  return result
}

function proxyTest(mapping) {
  return new Promise((resolve) => {
    const hostname = HOSTS.testHost
    let ip = null
    if (mapping.id !== 'official') {
      ip = mapping.id === 'custom' ? (hostState.custom || {})[hostname] : mapping.hosts?.[hostname]
      if (!ip || !net.isIPv4(ip)) {
        resolve({ id: mapping.id, ok: false, error: '未配置 API IP', ip: null })
        return
      }
    }
    const started = performance.now()
    const finish = (result, sockets = []) => {
      for (const s of sockets) {
        try { s.destroy() } catch {}
      }
      resolve({ id: mapping.id, ip, elapsed: Math.round(performance.now() - started), ...result })
    }

    if (!PROXY) {
      const req = https.request(
        ip
          ? {
              host: ip,
              servername: hostname,
              path: '/rate_limit',
              method: 'GET',
              headers: { host: hostname, 'user-agent': 'GitHub Mobile-Healthcheck', accept: 'application/vnd.github+json', connection: 'close' },
              timeout: 9000,
            }
          : {
              hostname,
              path: '/rate_limit',
              method: 'GET',
              headers: { 'user-agent': 'GitHub Mobile-Healthcheck', accept: 'application/vnd.github+json', connection: 'close' },
              timeout: 9000,
            },
        (res) => {
          res.resume()
          finish({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode, ms: Math.round(performance.now() - started) })
          req.destroy()
        },
      )
      req.on('timeout', () => { req.destroy(); finish({ ok: false, error: '超时' }) })
      req.on('error', (e) => finish({ ok: false, error: e.message }))
      req.end()
      return
    }

    // 经出口代理：CONNECT 到选定的 GitHub 边缘 IP，再用真实 SNI 完成 TLS。
    const proxy = new URL(PROXY)
    const proxyAuth = proxy.username
      ? 'Proxy-Authorization: Basic ' + Buffer.from(decodeURIComponent(proxy.username) + ':' + decodeURIComponent(proxy.password)).toString('base64') + '\r\n'
      : ''
    const target = ip || hostname
    let tlsSock = null
    let settled = false
    const finishOnce = (r) => {
      if (settled) return
      settled = true
      finish(r, [tlsSock, sock])
    }
    const sock = net.connect(Number(proxy.port) || (proxy.protocol === 'https:' ? 443 : 80), proxy.hostname)
    sock.setTimeout(10000, () => { finishOnce({ ok: false, error: '代理连接超时' }); sock.destroy() })
    sock.on('error', (e) => finishOnce({ ok: false, error: '代理 ' + e.message }))
    sock.on('connect', () => {
      sock.write(`CONNECT ${target}:443 HTTP/1.1\r\nHost: ${target}:443\r\n${proxyAuth}Proxy-Connection: keep-alive\r\n\r\n`)
    })
    let handshake = ''
    const onData = (chunk) => {
      handshake += chunk.toString('latin1')
      const idx = handshake.indexOf('\r\n\r\n')
      if (idx === -1) return
      sock.removeListener('data', onData)
      const first = handshake.split('\r\n')[0]
      const code = Number(first.split(' ')[1])
      if (code !== 200) {
        finishOnce({ ok: false, error: 'CONNECT ' + (first || 'failed') })
        return
      }
      tlsSock = tls.connect({ socket: sock, servername: hostname, ALPNProtocols: ['http/1.1'] }, () => {
        tlsSock.write(
          `GET /rate_limit HTTP/1.1\r\nHost: ${hostname}\r\nUser-Agent: GitHub Mobile-Healthcheck\r\nAccept: application/vnd.github+json\r\nConnection: close\r\n\r\n`,
        )
      })
      tlsSock.setTimeout(9000, () => finishOnce({ ok: false, error: 'TLS 超时' }))
      tlsSock.on('error', (e) => finishOnce({ ok: false, error: 'TLS ' + e.message }))
      let resp = ''
      tlsSock.on('data', (d) => {
        resp += d.toString('latin1')
        const m = resp.match(/^HTTP\/1\.[01] (\d{3})/)
        if (m) {
          finishOnce({ ok: Number(m[1]) >= 200 && Number(m[1]) < 500, status: Number(m[1]), ms: Math.round(performance.now() - started) })
        }
      })
    }
    sock.on('data', onData)
  })
}

const DOWNLOAD_HOSTS = [
  'api.github.com',
  'github.com',
  'codeload.github.com',
  'raw.githubusercontent.com',
  'objects.githubusercontent.com',
  'release-assets.githubusercontent.com',
  'github-releases.githubusercontent.com',
  'uploads.github.com',
]

function downloadAllowed(raw) {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:') return false
    if (u.hostname === 'githubusercontent.com' || u.hostname.endsWith('.githubusercontent.com')) return true
    return DOWNLOAD_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}

function sanitizeName(raw) {
  return (raw || '')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .replace(/^\.+/, '')
    .trim()
    .slice(0, 180)
}

function filenameFromDisposition(value) {
  if (!value) return ''
  const star = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i)
  if (star) {
    try {
      return sanitizeName(decodeURIComponent(star[1].trim().replace(/^"|"$/g, '')))
    } catch {}
  }
  const plain = value.match(/filename\s*=\s*"?([^";]+)"?/i)
  return plain ? sanitizeName(plain[1]) : ''
}

function openDownloadStream(raw, headers) {
  return new Promise((resolve, reject) => {
    const u = new URL(raw)
    const opts = proxyIpOptions(u.hostname, {
      method: 'GET',
      hostname: u.hostname,
      path: u.pathname + u.search,
      headers,
      timeout: 60000,
    })
    const agent = agentFor()
    if (agent) opts.agent = agent
    const req = https.request(opts, (r) => resolve(r))
    req.on('timeout', () => req.destroy(new Error('upstream timeout')))
    req.on('error', reject)
    req.end()
  })
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
}

function serveStatic(req, res, pathname) {
  let file = null
  for (const base of [DIST, PUBLIC]) {
    const candidate = path.join(base, pathname === '/' ? 'index.html' : pathname)
    if (candidate.startsWith(base) && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      file = candidate
      break
    }
  }
  if (!file) {
    const index = path.join(DIST, 'index.html')
    if (fs.existsSync(index)) file = index
  }
  if (!file) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(`<!doctype html><meta charset=utf-8><title>GitHub Mobile</title><body style="font:15px system-ui;padding:40px;background:#f6f8fa"><h2>GitHub Mobile 前端尚未构建</h2><p>请先运行 <code>cd web && npm run build</code>，或用 <code>npm run dev</code> 启动 Vite 开发服务器（5173）。</p><p>API 服务已在 8787 端口运行。</p>`)
    return
  }
  const ext = path.extname(file).toLowerCase()
  const isHashed = /\/assets\//.test(file)
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': isHashed ? 'public, max-age=31536000, immutable' : 'no-cache',
  })
  fs.createReadStream(file).pipe(res)
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const p = url.pathname

  try {
    if (p === '/api/config') {
      const clientToken = (req.headers['x-gh-token'] || '').toString().trim()
      json(res, 200, {
        hasToken: SNAPSHOT_ONLY ? false : Boolean(clientToken || SERVER_TOKEN_ENABLED),
        tokenSource: SNAPSHOT_ONLY ? 'none' : clientToken ? 'client' : SERVER_TOKEN_ENABLED ? 'server' : 'none',
        login: LOGIN,
        defaultRepo: DEFAULT_REPO,
        host: hostState,
        native: false,
        version: '1.6.2',
        proxy: Boolean(PROXY),
      })
      return
    }

    if (p === '/api/host' && req.method === 'GET') {
      json(res, 200, { ok: true, host: hostState })
      return
    }

    if (p === '/api/host' && req.method === 'POST') {
      const body = JSON.parse((await readBody(req)) || '{}')
      const next = { ...hostState }
      if (typeof body.enabled === 'boolean') next.enabled = body.enabled
      if (typeof body.mappingId === 'string' && HOSTS.mappings.some((m) => m.id === body.mappingId)) next.mappingId = body.mappingId
      if (body.custom && typeof body.custom === 'object') {
        const clean = {}
        for (const name of HOSTNAMES) {
          const ip = String(body.custom[name] || '').trim()
          if (!ip) clean[name] = ''
          else if (net.isIPv4(ip)) clean[name] = ip
          else {
            json(res, 400, { ok: false, message: `${name} 的 IP 格式不正确：${ip}` })
            return
          }
        }
        next.custom = { ...next.custom, ...clean }
      }
      hostState = next
      saveHostState()
      json(res, 200, { ok: true, host: hostState })
      return
    }

    if (p === '/api/host/test') {
      const targets = HOSTS.mappings.filter((m) => m.id !== 'custom' || (hostState.custom || {})['api.github.com'])
      const results = await Promise.all(targets.map((m) => proxyTest(m)))
      json(res, 200, { ok: true, proxy: Boolean(PROXY), results })
      return
    }

    if (p === '/api/graphql' && req.method === 'POST') {
      if (SNAPSHOT_ONLY) {
        json(res, 401, { message: '离线快照模式未启用 GitHub API。' })
        return
      }
      const clientToken = (req.headers['x-gh-token'] || '').toString().trim()
      const token = requestToken(req, clientToken)
      if (!token) {
        json(res, 401, { message: '需要 GitHub Token 才能读取贡献数据。' })
        return
      }
      const body = await readBody(req)
      const r = await requestUpstream({
        method: 'POST',
        url: 'https://api.github.com/graphql',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          'user-agent': 'GitHub Mobile',
          accept: 'application/vnd.github+json',
        },
        body,
      })
      res.writeHead(r.status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      res.end(r.body)
      return
    }

    if (p === '/api/gh') {
      if (SNAPSHOT_ONLY) {
        json(res, 401, { message: '离线快照模式未启用 GitHub API。' })
        return
      }
      const clientToken = (req.headers['x-gh-token'] || '').toString().trim()
      const token = requestToken(req, clientToken)
      const ghPath = url.searchParams.get('path') || '/'
      if (!ghPath.startsWith('/')) {
        json(res, 400, { message: 'invalid path' })
        return
      }
      const body = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) ? await readBody(req) : null
      const headers = {
        accept: req.headers.accept || 'application/vnd.github+json',
        'user-agent': 'GitHub Mobile',
        'x-github-api-version': '2022-11-28',
      }
      if (token) headers.authorization = `Bearer ${token}`
      if (body) {
        headers['content-type'] = 'application/json'
        headers['content-length'] = Buffer.byteLength(body)
      }
      const r = await requestUpstream({
        method: req.method === 'GET' ? 'GET' : req.method,
        url: `https://api.github.com${ghPath}`,
        headers,
        body,
        timeout: 35000,
      })
      const outHeaders = {
        'content-type': r.headers['content-type'] || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
        'x-octo-source': 'live',
      }
      for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset', 'x-ratelimit-used', 'link']) {
        if (r.headers[h]) outHeaders[h] = r.headers[h]
      }
      res.writeHead(r.status, outHeaders)
      res.end(r.body)
      return
    }

    if (p === '/api/raw') {
      const src = url.searchParams.get('url') || ''
      let target
      try {
        target = new URL(src)
      } catch {
        json(res, 400, { message: '无效地址' })
        return
      }
      if (target.protocol !== 'https:' || target.hostname !== 'raw.githubusercontent.com' || !target.pathname.startsWith('/wiki/')) {
        json(res, 400, { message: '只允许读取 GitHub Wiki 原始内容' })
        return
      }
      const r = await requestUpstream({
        url: src,
        headers: { 'user-agent': 'GitHub Mobile', accept: 'text/plain' },
        timeout: 25000,
      })
      res.writeHead(r.status, {
        'content-type': r.headers['content-type'] || 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      })
      res.end(r.body)
      return
    }

    if (p === '/api/img') {
      const src = url.searchParams.get('url') || ''
      if (!allowedImage(src)) {
        json(res, 400, { message: 'image host not allowed' })
        return
      }
      const img = await fetchImage(src)
      res.writeHead(200, {
        'content-type': img.type,
        'cache-control': 'public, max-age=3600',
        'content-length': img.body.length,
      })
      res.end(img.body)
      return
    }

    if (p === '/api/download') {
      if (SNAPSHOT_ONLY) {
        json(res, 401, { message: '离线快照模式未启用下载。' })
        return
      }
      const src = url.searchParams.get('url') || ''
      if (!downloadAllowed(src)) {
        json(res, 400, { message: '下载地址不在允许的 GitHub 域名内。' })
        return
      }
      const wanted = sanitizeName(url.searchParams.get('name') || '')
      const accept = (req.headers['x-accept'] || '').toString() || 'application/vnd.github+json'
      const clientToken = (req.headers['x-gh-token'] || '').toString().trim()
      const token = requestToken(req, clientToken)

      let current = src
      let upstream = null
      for (let hop = 0; hop < 6; hop++) {
        const host = new URL(current).hostname
        const headers = {
          'user-agent': 'GitHub Mobile',
          accept,
          'accept-encoding': 'identity',
          'x-github-api-version': '2022-11-28',
        }
        if (token && host === 'api.github.com') headers.authorization = `Bearer ${token}`
        const r = await openDownloadStream(current, headers)
        const status = r.statusCode || 0
        if (status >= 300 && status < 400 && r.headers.location) {
          const next = new URL(r.headers.location, current).toString()
          r.resume()
          if (!downloadAllowed(next)) {
            json(res, 502, { message: '下载重定向到未授权的域名。' })
            return
          }
          current = next
          continue
        }
        upstream = r
        break
      }

      if (!upstream) {
        json(res, 502, { message: '下载重定向次数过多。' })
        return
      }
      if (upstream.statusCode >= 400) {
        const chunks = []
        let size = 0
        for await (const chunk of upstream) {
          size += chunk.length
          if (size < 1024 * 1024) chunks.push(chunk)
        }
        let message = `GitHub 返回 ${upstream.statusCode}`
        try {
          const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'))
          if (parsed?.message) message = parsed.message
        } catch {}
        json(res, upstream.statusCode, { message })
        return
      }

      const filename = wanted || filenameFromDisposition(upstream.headers['content-disposition']) || 'download'
      const headers = {
        'content-type': upstream.headers['content-type'] || 'application/octet-stream',
        'content-disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'cache-control': 'no-store',
        'x-octo-download': filename,
      }
      if (upstream.headers['content-length']) headers['content-length'] = upstream.headers['content-length']
      res.writeHead(200, headers)
      upstream.pipe(res)
      upstream.on('error', () => {
        try { res.destroy() } catch {}
      })
      res.on('close', () => {
        try { upstream.destroy() } catch {}
      })
      return
    }

    if (p === '/api/health') {
      json(res, 200, { ok: true, ts: Date.now() })
      return
    }

    serveStatic(req, res, p)
  } catch (e) {
    console.error(e)
    if (!res.headersSent) json(res, 502, { message: e.message || 'upstream error' })
    else res.end()
  }
})

server.listen(PORT, HOST, () => {
  console.log(`GitHub Mobile dev server → http://${HOST}:${PORT}`)
  console.log(`GitHub API token: ${SERVER_TOKEN ? 'server-side configured' : 'not configured'}`)
  console.log(`Egress proxy: ${PROXY || 'none (direct + host mapping)'}`)
  console.log(`Host mapping: ${hostState.enabled ? hostState.mappingId : 'disabled'}`)
})
