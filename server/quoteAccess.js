const clientHeader = 'X-CyTime-Client'
const clientMarker = 'cytime-v1'
const methods = ['GET', 'HEAD']
const allowedMethodList = 'GET, HEAD, OPTIONS'
const siteOrigins = ['https://time.cyrene.hk', 'https://cytime.pages.dev']
const desktopOrigins = ['http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost']
const preflightHeaders = [clientHeader.toLowerCase(), 'accept']
const vary = `Origin, Sec-Fetch-Site, ${clientHeader}, Access-Control-Request-Method, Access-Control-Request-Headers`

function extraSiteOrigins(value) {
  if (typeof value !== 'string') return []
  return value.split(/[\s,]+/).filter(origin => {
    try {
      const url = new URL(origin)
      return ['http:', 'https:'].includes(url.protocol) && !url.hostname.includes('*') && url.origin === origin
    } catch {
      return false
    }
  })
}

function response(request, body, status, extraHeaders = {}) {
  const headers = {
    'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    Vary: vary,
    ...extraHeaders
  }
  return new Response(request.method === 'HEAD' || body === null ? null : JSON.stringify(body), { status, headers })
}

export function guardQuoteRequest(handler) {
  return ({ request, env }) => {
    const deny = () => response(request, { error: 'Forbidden' }, 403)
    const permittedSites = [...siteOrigins, ...extraSiteOrigins(env?.CYTIME_QUOTE_EXTRA_ORIGINS)]
    if (!permittedSites.includes(new URL(request.url).origin)) return deny()

    const origin = request.headers.get('Origin')
    const permittedOrigin = origin !== null && (permittedSites.includes(origin) || desktopOrigins.includes(origin))
    const cors = permittedOrigin ? { 'Access-Control-Allow-Origin': origin } : {}

    if (request.method === 'OPTIONS') {
      const method = request.headers.get('Access-Control-Request-Method')
      const headers = (request.headers.get('Access-Control-Request-Headers') || '')
        .split(',').map(name => name.trim().toLowerCase()).filter(Boolean)
      if (!permittedOrigin || !methods.includes(method) || !headers.includes(preflightHeaders[0]) || headers.some(name => !preflightHeaders.includes(name))) return deny()
      return response(request, null, 204, { ...cors, 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': `${clientHeader}, Accept` })
    }

    // This browser-facing marker is public. Only the browser's origin rules prevent cross-site reuse.
    const carriesMarker = request.headers.get(clientHeader) === clientMarker
    const sameOrigin = origin === null && request.headers.get('Sec-Fetch-Site') === 'same-origin'
    if (!carriesMarker || !(permittedOrigin || sameOrigin)) return deny()
    if (!methods.includes(request.method)) return response(request, { error: 'Method Not Allowed' }, 405, { ...cors, Allow: allowedMethodList })
    return handler(request, (body, status = 200) => response(request, body, status, cors))
  }
}
