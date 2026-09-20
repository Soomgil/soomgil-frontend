import { defineConfig, devices } from '@playwright/test'

/**
 * E2E 테스트 설정.
 *
 * 백엔드/DB에 의존하지 않고 실제 빌드된 SPA를 브라우저에서 구동한 뒤,
 * 모든 `/api/v1/**` 호출을 Playwright route 가로채기로 목킹한다(fixtures/mock-api.ts).
 * 덕분에 빈/에러/경계값 상태를 결정론적으로 재현할 수 있다.
 *
 * 개발 서버는 전용 포트(5175)로 띄워 사용자가 쓰는 5173 dev 서버와 충돌하지 않는다.
 */
const PORT = Number(process.env.E2E_PORT || 5175)

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  timeout: 30_000,
  expect: { timeout: 7_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // 실제 Mapbox 토큰 없이도 지도 모듈이 초기화되도록 더미 토큰 주입.
      // 지도 외부 네트워크(api.mapbox.com 등)는 테스트에서 차단/목킹한다.
      VITE_MAPBOX_ACCESS_TOKEN: 'pk.e2e.dummy-token-for-tests',
    },
  },
})
