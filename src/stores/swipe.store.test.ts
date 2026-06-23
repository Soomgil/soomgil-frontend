import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { swipeApi } from '@/api/swipe.api'
import { useSwipeStore } from './swipe.store'

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

describe('swipe store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('warms the queue without exposing page loading state', async () => {
    let resolveFeed!: (value: { items: (typeof item)[]; nextSeed: null }) => void
    vi.mocked(swipeApi.getFeed).mockReturnValue(new Promise((resolve) => { resolveFeed = resolve }))
    const store = useSwipeStore()

    const warming = store.warm()

    expect(store.warming).toBe(true)
    expect(store.loading).toBe(false)
    resolveFeed({ items: [item], nextSeed: null })
    await warming

    expect(store.currentItem?.place.externalPlaceId).toBe('126508')
    expect(store.initialized).toBe(true)
  })

  it('keeps one global queue across repeated page composable access', async () => {
    vi.mocked(swipeApi.getFeed).mockResolvedValue({ items: [item], nextSeed: null })
    const firstAccess = useSwipeStore()
    await firstAccess.warm()

    const secondAccess = useSwipeStore()
    await secondAccess.ensureLoaded()

    expect(secondAccess).toBe(firstAccess)
    expect(secondAccess.currentItem?.place.externalPlaceId).toBe('126508')
    expect(swipeApi.getFeed).toHaveBeenCalledTimes(1)
  })

  it('deduplicates simultaneous background and page requests', async () => {
    let resolveFeed!: (value: { items: (typeof item)[]; nextSeed: null }) => void
    vi.mocked(swipeApi.getFeed).mockReturnValue(new Promise((resolve) => { resolveFeed = resolve }))
    const store = useSwipeStore()

    const background = store.warm()
    const pageEntry = store.ensureLoaded()
    resolveFeed({ items: [item], nextSeed: null })
    await Promise.all([background, pageEntry])

    expect(swipeApi.getFeed).toHaveBeenCalledTimes(1)
  })

  it('clears another users queue and ignores its late response', async () => {
    let resolveFeed!: (value: { items: (typeof item)[]; nextSeed: null }) => void
    vi.mocked(swipeApi.getFeed).mockReturnValue(new Promise((resolve) => { resolveFeed = resolve }))
    const store = useSwipeStore()

    const oldSession = store.warm()
    store.reset()
    resolveFeed({ items: [item], nextSeed: null })
    await oldSession

    expect(store.items).toEqual([])
    expect(store.initialized).toBe(false)
  })
})
