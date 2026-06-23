import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { swipeApi } from '@/api/swipe.api'
import { useAuthStore } from '@/stores/auth.store'
import { useSwipeStore } from '@/stores/swipe.store'
import App from './App.vue'

vi.mock('@/api/swipe.api', () => ({
  swipeApi: {
    getFeed: vi.fn(),
    react: vi.fn(),
    getTagStatuses: vi.fn(),
  },
}))

const item = {
  place: {
    provider: 'KTO' as const,
    externalPlaceId: '126508',
    placeName: '해운대해수욕장',
    address: '부산 해운대구',
    lat: 35.1587,
    lng: 129.1604,
    thumbnailUrl: null,
    category: '관광지',
    sourceStatus: 'AVAILABLE' as const,
  },
  myReaction: null,
  likedByFollowees: [],
}

describe('App swipe queue bootstrap', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
  })

  it('warms the queue for an authenticated session and clears it on logout', async () => {
    localStorage.setItem('accessToken', 'test-token')
    vi.mocked(swipeApi.getFeed).mockResolvedValue({ items: [item], nextSeed: null })
    const pinia = createPinia()

    mount(App, {
      global: {
        plugins: [pinia],
        stubs: { RouterView: true },
      },
    })
    await flushPromises()

    const swipe = useSwipeStore(pinia)
    const auth = useAuthStore(pinia)
    expect(swipeApi.getFeed).toHaveBeenCalledWith({ limit: 10, excludeRecent: true })
    expect(swipe.currentItem?.place.externalPlaceId).toBe('126508')

    auth.token = null
    await flushPromises()

    expect(swipe.items).toEqual([])
    expect(swipe.initialized).toBe(false)
  })
})
