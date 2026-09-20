import { test as base, expect } from '@playwright/test'
import { MockBackend } from './mock-api'
import { authToken, backendUser, onboardingSurvey, voteSessionState } from './data'
import { makeFakeJwt } from './jwt'
import type { BackendUser } from '@/types/auth'

/**
 * 공용 E2E 픽스처.
 *
 * - `mock`: 설치된 목 백엔드. 모든 인증 페이지가 진입 시 부르는 엔드포인트
 *   (GET /me, GET /onboarding/preference-survey, GET /trips/:id/vote-sessions/current,
 *   POST /auth/refresh)에 기본 핸들러를 미리 달아 둔다. 테스트는 필요한 것만 override.
 * - `loginAs`: 앱 부팅 전에 localStorage에 유효 토큰을 심고 /me 사용자를 설정한다.
 */

export interface SoomgilFixtures {
  mock: MockBackend
  loginAs: (user?: Partial<BackendUser>) => Promise<void>
}

export const test = base.extend<SoomgilFixtures>({
  mock: async ({ page }, use) => {
    const mock = new MockBackend(page)

    // ── 모든 페이지가 진입 시 부르는 기본 엔드포인트 ──
    // 기본 사용자는 비인증 상태에서도 401을 돌려주도록 하되, loginAs가 override 한다.
    mock.get('/me', () => ({ status: 401, json: { type: 'about:blank', title: 'Unauthorized', status: 401, detail: null } }))
    mock.get('/onboarding/preference-survey', () => ({ json: onboardingSurvey() }))
    mock.get('/trips/:tripId/vote-sessions/current', () => ({ json: voteSessionState() }))
    mock.post('/auth/refresh', () => ({
      json: { accessToken: makeFakeJwt(), refreshToken: 'refresh-token-e2e', tokenType: 'Bearer', expiresIn: 3600 },
    }))
    // 공용 정책 문서(회원가입/온보딩에서 참조).
    mock.get('/auth/policy-documents', () => ({ json: [
      { id: 'policy-tos', policyCode: 'TERMS_OF_SERVICE', version: '1.0', languageCode: 'ko', title: '서비스 이용약관', contentUrl: null, contentHash: null, isRequired: true, publishedAt: '2026-01-01T00:00:00Z' },
      { id: 'policy-privacy', policyCode: 'PRIVACY_POLICY', version: '1.0', languageCode: 'ko', title: '개인정보 처리방침', contentUrl: null, contentHash: null, isRequired: true, publishedAt: '2026-01-01T00:00:00Z' },
      { id: 'policy-marketing', policyCode: 'MARKETING', version: '1.0', languageCode: 'ko', title: '마케팅 정보 수신', contentUrl: null, contentHash: null, isRequired: false, publishedAt: '2026-01-01T00:00:00Z' },
    ] }))

    await mock.install()
    await use(mock)
  },

  loginAs: async ({ page, mock }, use) => {
    const doLogin = async (userOverrides: Partial<BackendUser> = {}) => {
      const user = backendUser(userOverrides)
      const token = authToken({ user })
      // 앱 부팅 전에 토큰을 심는다(가드의 auth.initialize()가 이 토큰을 신뢰한다).
      await page.addInitScript(
        ([access, refresh, expiresAt]) => {
          try {
            localStorage.setItem('accessToken', access)
            localStorage.setItem('refreshToken', refresh)
            localStorage.setItem('tokenExpiresAt', expiresAt)
          } catch { /* private mode */ }
        },
        [token.accessToken, token.refreshToken, String(Date.now() + 3600 * 1000)] as const,
      )
      // /me 를 이 사용자로 override.
      mock.get('/me', () => ({ json: user }))
    }
    await use(doLogin)
  },
})

export { expect }
