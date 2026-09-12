// 构建 API 落地页：Vue 3 + VueFluentWidgets，产出单文件 HTML 供 Pages Functions 内联分发。
// 用法：node scripts/build-landing.mjs（bun run build 前会自动执行）
import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { build } from 'vite'
import vue from '@vitejs/plugin-vue'

const root = fileURLToPath(new URL('../api/landing-src', import.meta.url))
const outDir = fileURLToPath(new URL('../api/landing-dist', import.meta.url))
const target = fileURLToPath(new URL('../api/landing.html', import.meta.url))
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const buildId = (() => {
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { return '' }
})()

await build({
  root,
  base: './',
  logLevel: 'warn',
  plugins: [vue()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __BUILD_ID__: JSON.stringify(buildId)
  },
  build: {
    outDir,
    emptyOutDir: true,
    cssCodeSplit: false,
    assetsInlineLimit: 100000000
  }
})

let html = readFileSync(join(outDir, 'index.html'), 'utf8')
html = html.replace(/<link rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/g, (match, href) => {
  const css = readFileSync(join(outDir, href.replace(/^\.?\//, '')), 'utf8')
  return `<style>${css}</style>`
})
html = html.replace(/<script type="module"[^>]*src="([^"]+)"[^>]*>\s*<\/script>/g, (match, src) => {
  const js = readFileSync(join(outDir, src.replace(/^\.?\//, '')), 'utf8')
  return `<script type="module">${js}<\/script>`
})
if (html.includes('<script type="module"') && html.includes('src=')) throw new Error('landing assets not inlined')
writeFileSync(target, html)
rmSync(outDir, { recursive: true, force: true })
console.log(`built landing page -> api/landing.html (${(html.length / 1024).toFixed(0)} KiB, build ${buildId || 'dev'})`)
