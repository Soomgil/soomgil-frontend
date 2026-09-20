import type { Page, Route, Request } from '@playwright/test'

/**
 * 경량 목 백엔드.
 *
 * 실제 백엔드/DB 없이 브라우저에서 나가는 모든 `/api/v1/**` 요청을 가로채
 * 등록된 핸들러의 JSON을 돌려준다. 테스트별로 핸들러를 덮어써서 빈/에러/경계값
 * 응답을 결정론적으로 재현한다.
 *
 * 경로는 `/api/v1` 접두어와 쿼리스트링을 제거한 뒤 `:param`/`*` 패턴으로 매칭한다.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface MockRequestContext {
  method: HttpMethod
  path: string
  params: Record<string, string>
  query: URLSearchParams
  body: unknown
  request: Request
}

export interface MockReply {
  status?: number
  json?: unknown
  body?: string
  contentType?: string
  headers?: Record<string, string>
}

export type MockHandler = (ctx: MockRequestContext) => MockReply | Promise<MockReply>

interface Registered {
  method: HttpMethod
  segments: string[]
  handler: MockHandler
  once: boolean
  used: boolean
}

const API_PREFIX = '/api/v1'

function toSegments(pathPattern: string): string[] {
  return pathPattern.replace(/^\/+|\/+$/g, '').split('/')
}

function matchPath(patternSegments: string[], pathSegments: string[]): Record<string, string> | null {
  // '*' 를 마지막 세그먼트로 쓰면 나머지 전부를 흡수한다.
  if (patternSegments[patternSegments.length - 1] === '*') {
    if (pathSegments.length < patternSegments.length - 1) return null
  } else if (patternSegments.length !== pathSegments.length) {
    return null
  }
  const params: Record<string, string> = {}
  for (let i = 0; i < patternSegments.length; i++) {
    const p = patternSegments[i]
    if (p === '*') break
    const actual = pathSegments[i]
    if (p.startsWith(':')) {
      params[p.slice(1)] = decodeURIComponent(actual)
    } else if (p !== actual) {
      return null
    }
  }
  return params
}

export class MockBackend {
  private handlers: Registered[] = []
  private page: Page
  /** 매칭되지 않은 요청 기록 — 테스트 디버깅용. */
  public unmatched: string[] = []
  /** 관측된 모든 요청 (검증용). */
  public calls: { method: string; path: string; body: unknown }[] = []

  constructor(page: Page) {
    this.page = page
  }

  /** 핸들러 등록. 나중에 등록한 것이 우선(테스트별 override). */
  on(method: HttpMethod, pathPattern: string, handler: MockHandler, opts: { once?: boolean } = {}) {
    this.handlers.unshift({
      method,
      segments: toSegments(pathPattern),
      handler,
      once: !!opts.once,
      used: false,
    })
    return this
  }

  get(path: string, handler: MockHandler, opts?: { once?: boolean }) { return this.on('GET', path, handler, opts) }
  post(path: string, handler: MockHandler, opts?: { once?: boolean }) { return this.on('POST', path, handler, opts) }
  put(path: string, handler: MockHandler, opts?: { once?: boolean }) { return this.on('PUT', path, handler, opts) }
  patch(path: string, handler: MockHandler, opts?: { once?: boolean }) { return this.on('PATCH', path, handler, opts) }
  delete(path: string, handler: MockHandler, opts?: { once?: boolean }) { return this.on('DELETE', path, handler, opts) }

  /** 특정 경로에 대해 한 번만 다른 응답을 주고 싶을 때(예: 새로고침 시 상태 변화). */
  once(method: HttpMethod, path: string, handler: MockHandler) { return this.on(method, path, handler, { once: true }) }

  private async resolve(route: Route, request: Request) {
    const url = new URL(request.url())
    const method = request.method().toUpperCase() as HttpMethod
    const rawPath = url.pathname.startsWith(API_PREFIX) ? url.pathname.slice(API_PREFIX.length) : url.pathname
    const path = rawPath || '/'
    const pathSegments = toSegments(path)

    let body: unknown = undefined
    if (method !== 'GET' && method !== 'DELETE') {
      try { body = request.postDataJSON() } catch { body = request.postData() ?? undefined }
    }
    this.calls.push({ method, path, body })

    for (const reg of this.handlers) {
      if (reg.method !== method) continue
      if (reg.once && reg.used) continue
      const params = matchPath(reg.segments, pathSegments)
      if (!params) continue
      reg.used = true
      const reply = await reg.handler({ method, path, params, query: url.searchParams, body, request })
      const status = reply.status ?? 200
      const headers = { 'access-control-allow-origin': '*', ...(reply.headers ?? {}) }
      if (reply.json !== undefined) {
        return route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(reply.json) })
      }
      return route.fulfill({
        status,
        contentType: reply.contentType ?? 'application/json',
        headers,
        body: reply.body ?? (status === 204 ? '' : '{}'),
      })
    }

    // 매칭 실패: 명확히 실패시켜 테스트에서 빠르게 드러나게 한다.
    this.unmatched.push(`${method} ${path}`)
    return route.fulfill({
      status: 501,
      contentType: 'application/json',
      body: JSON.stringify({
        type: 'about:blank', title: 'Not mocked', status: 501,
        detail: `No mock handler for ${method} ${path}`,
      }),
    })
  }

  /** 페이지에 라우팅 설치. 외부 네트워크(Mapbox/WS/이미지 등)는 차단하거나 목킹한다. */
  async install() {
    // 지도 타일/스타일/폰트 등 Mapbox 외부 요청은 빈 응답으로 차단(테스트 결정론 확보).
    await this.page.route(/https?:\/\/([a-z0-9.-]+\.)?mapbox\.com\/.*/i, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
    )
    // 외부 호스트의 데모 이미지(MinIO :9000 / img.example.com / CDN 등)는 1x1 투명 PNG로 대체해
    // 깨진 이미지 이벤트를 피한다. ⚠️ dev 서버 자신이 서빙하는 에셋(SVG를 JS 모듈로 변환하는 등)은
    // 절대 가로채면 안 된다 — 앱 부팅이 깨진다. 그래서 우리 dev origin은 통과시킨다.
    const devPort = process.env.E2E_PORT || '5175'
    const isDevOrigin = (u: string) => {
      try {
        const { hostname, port } = new URL(u)
        return port === devPort && (hostname === 'localhost' || hostname === '127.0.0.1')
      } catch { return false }
    }
    await this.page.route(/\.(png|jpe?g|gif|webp|bmp|avif)(\?.*)?$/i, (route) => {
      const url = route.request().url()
      if (url.includes('/api/v1/')) return route.fallback()
      if (isDevOrigin(url)) return route.fallback()
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: Buffer.from(
          'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          'base64',
        ),
      })
    })
    // 본 API
    await this.page.route(`**${API_PREFIX}/**`, (route, request) => this.resolve(route, request))
  }

  /** 특정 method+path가 호출됐는지. */
  wasCalled(method: HttpMethod, pathPattern: string): boolean {
    const segs = toSegments(pathPattern)
    return this.calls.some((c) => c.method === method && matchPath(segs, toSegments(c.path)) !== null)
  }

  /** 특정 method+path의 마지막 호출 바디. */
  lastBody(method: HttpMethod, pathPattern: string): unknown {
    const segs = toSegments(pathPattern)
    for (let i = this.calls.length - 1; i >= 0; i--) {
      const c = this.calls[i]
      if (c.method === method && matchPath(segs, toSegments(c.path)) !== null) return c.body
    }
    return undefined
  }
}

/** RFC7807 problem detail 응답 헬퍼. */
export function problem(status: number, title: string, detail?: string, extra: Record<string, unknown> = {}): MockReply {
  return {
    status,
    json: { type: 'about:blank', title, status, detail: detail ?? null, instance: null, ...extra },
  }
}
