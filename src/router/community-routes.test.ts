import { describe, expect, it } from 'vitest'
import router from './index'

describe('기존 여행기 커뮤니티 라우트', () => {
  it('커뮤니티 목록에 기존 여행기 화면을 연결한다', () => {
    const route = router.getRoutes().find((item) => item.path === '/community')
    expect(route?.components?.default?.toString()).toContain('CommunityPage.vue')
  })

  it('여행기 목록과 작성 화면으로 직접 이동할 수 있다', () => {
    for (const path of ['/community/stories', '/community/story-write']) {
      const route = router.getRoutes().find((item) => item.path === path)
      expect(route?.redirect).toBeUndefined()
      expect(route?.components?.default).toBeDefined()
    }
    expect(router.resolve('/community/story-write').meta.requiresAuth).toBe(true)
  })

  it('스레드 화면은 더 이상 등록하지 않는다', () => {
    expect(router.getRoutes().some((route) => route.name === 'CommunityThread')).toBe(false)
  })

  it('여행방 투표는 기존대로 로그인한 사용자에게 제공한다', () => {
    const vote = router.resolve('/trips/trip-1/vote')
    expect(vote.name).toBe('TripVote')
    expect(vote.meta.requiresAuth).toBe(true)
  })
})
