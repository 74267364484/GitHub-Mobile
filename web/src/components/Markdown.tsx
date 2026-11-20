import { useEffect, useRef } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import bash from 'highlight.js/lib/languages/bash'
import python from 'highlight.js/lib/languages/python'
import yaml from 'highlight.js/lib/languages/yaml'
import xml from 'highlight.js/lib/languages/xml'
import css from 'highlight.js/lib/languages/css'
import markdown from 'highlight.js/lib/languages/markdown'
import java from 'highlight.js/lib/languages/java'
import groovy from 'highlight.js/lib/languages/groovy'
import diff from 'highlight.js/lib/languages/diff'
import { loadImage } from '../lib/api'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('jsx', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('tsx', typescript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('shell', bash)
hljs.registerLanguage('python', python)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('css', css)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('java', java)
hljs.registerLanguage('groovy', groovy)
hljs.registerLanguage('gradle', groovy)
hljs.registerLanguage('diff', diff)

marked.setOptions({ gfm: true, breaks: false })

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s+/g, '-')
}

function resolveRelative(href: string, owner: string, repo: string, branch: string, baseDir: string): string {
  if (!href) return href
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return href
  if (href.startsWith('#')) return href
  if (href.startsWith('/')) {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}${href}`
  }
  const base = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${baseDir ? baseDir.replace(/\/$/, '') + '/' : ''}`
  try {
    return new URL(href, base).toString()
  } catch {
    return href
  }
}

async function fillImages(container: HTMLElement): Promise<void> {
  const imgs = Array.from(container.querySelectorAll<HTMLImageElement>('img[data-octo-src]'))
  let index = 0
  const worker = async () => {
    while (index < imgs.length) {
      const img = imgs[index++]
      const src = img.getAttribute('data-octo-src') || ''
      if (!src) continue
      try {
        const resolved = await loadImage(src)
        if (resolved) {
          img.src = resolved
          img.removeAttribute('data-octo-src')
        }
      } catch {
        img.classList.add('md-img-error')
        img.alt = img.alt || 'image'
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, imgs.length) }, worker))
}

export function Markdown({
  text, owner, repo, branch, baseDir = '', className = '',
}: {
  text: string
  owner?: string
  repo?: string
  branch?: string
  baseDir?: string
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let cancelled = false
    const raw = marked.parse(text || '', { async: false }) as string
    const clean = DOMPurify.sanitize(raw, {
      FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'textarea', 'select', 'button'],
      FORBID_ATTR: ['style', 'onerror', 'onload', 'onclick'],
      ADD_ATTR: ['target', 'rel', 'align'],
    })
    el.innerHTML = clean

    // Headings get GitHub-style anchors.
    el.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((h) => {
      const id = slug(h.textContent || '')
      if (id) h.id = id
    })

    // Code blocks
    el.querySelectorAll<HTMLElement>('pre > code').forEach((code) => {
      try {
        if (!code.dataset.highlighted) {
          hljs.highlightElement(code)
          code.dataset.highlighted = 'yes'
        }
      } catch {}
    })

    // Images: fetch through bridge/proxy so host mapping also applies to assets.
    el.querySelectorAll<HTMLImageElement>('img').forEach((img) => {
      const src = img.getAttribute('src') || ''
      if (!src) return
      let resolved = src
      if (owner && repo && branch) resolved = resolveRelative(src, owner, repo, branch, baseDir)
      img.removeAttribute('src')
      img.setAttribute('data-octo-src', resolved)
      img.setAttribute('loading', 'lazy')
      img.setAttribute('decoding', 'async')
      img.addEventListener('error', () => img.classList.add('md-img-error'), { once: true })
    })
    fillImages(el)

    // Links
    el.querySelectorAll<HTMLAnchorElement>('a').forEach((a) => {
      const href = a.getAttribute('href') || ''
      if (!href) return
      if (href.startsWith('#')) return
      let resolved = href
      if (owner && repo && branch) resolved = resolveRelative(href, owner, repo, branch, baseDir)
      if (resolved.startsWith('https://github.com/')) {
        const u = new URL(resolved)
        const prefix = `/${owner}/${repo}`
        if (owner && repo && u.pathname.startsWith(prefix + '/')) {
          a.href = '#' + u.pathname + u.search + u.hash
          a.removeAttribute('target')
          return
        }
      }
      a.href = resolved
      a.target = '_blank'
      a.rel = 'nofollow noreferrer noopener'
    })

    return () => {
      cancelled = true
      el.innerHTML = ''
    }
  }, [text, owner, repo, branch, baseDir])

  return <div className={`markdown-body ${className}`} ref={ref} />
}
