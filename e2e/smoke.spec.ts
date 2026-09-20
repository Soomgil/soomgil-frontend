import { test, expect } from './fixtures/test'

/**
 * 인프라 스모크 테스트.
 * webServer 기동 / 라우트 가로채기 / JWT 인증 시딩 / 전역 가드 통과를 한 번에 검증한다.
 * (모든 /api/v1 호출은 fixtures/mock-api.ts가 가로채므로 백엔드가 필요 없다.)
 */
test.describe('infra smoke', () => {
  test('랜딩 페이지는 비인증 상태로 열린다', async ({ page, mock }) => {
    void mock
    await page.goto('/')
    await expect(page).toHaveURL('/')
    await expect(page.locator('body')).toContainText(/여행|로그인|시작/)
  })

  test('비인증으로 보호 경로 접근 시 /login 으로 리다이렉트된다', async ({ page, mock }) => {
    void mock
    await page.goto('/home')
    await expect(page).toHaveURL(/\/login\?redirect=/)
  })

  test('로그인 상태로 /home 진입 시 가드가 통과된다', async ({ page, loginAs }) => {
    await loginAs()
    await page.goto('/home')
    await expect(page).toHaveURL('/home')
  })
})
