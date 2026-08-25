import { describe, expect, it } from 'vitest'
import router from './index'

describe('커뮤니티 라우트', () => {
  it('/community는 새 공개 피드 화면을 사용한다', () => {
    const route = router.getRoutes().find((item) => item.path === '/community')

    expect(route?.name).toBe('Community')
  })

  it('쓰레드 상세 라우트를 제공한다', () => {
    expect(router.resolve('/community/threads/thread-1').name).toBe('CommunityThread')
    expect(router.resolve('/community/threads/thread-1').params.threadId).toBe('thread-1')
  })

  it('여행 스냅샷 게시글 화면은 새 피드로 redirect한다', () => {
    const stories = router.getRoutes().find((item) => item.path === '/community/stories')
    const storyWrite = router.getRoutes().find((item) => item.path === '/community/story-write')

    expect(stories?.redirect).toEqual({ name: 'Community' })
    expect(storyWrite?.redirect).toEqual({ name: 'Community' })
  })

  it('스냅샷 게시글 전용 화면 컴포넌트를 더 이상 연결하지 않는다', () => {
    const stories = router.getRoutes().find((item) => item.path === '/community/stories')
    const storyWrite = router.getRoutes().find((item) => item.path === '/community/story-write')

    expect(stories?.components).toBeUndefined()
    expect(storyWrite?.components).toBeUndefined()
  })

  it('여행 방 투표 라우트를 인증 전용으로 제공한다', () => {
    const vote = router.resolve('/trips/trip-1/vote')

    expect(vote.name).toBe('TripVote')
    expect(vote.meta.requiresAuth).toBe(true)
  })
})
