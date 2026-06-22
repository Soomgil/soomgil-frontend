import { describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { useSwipeFeed } from './useSwipeFeed'
import type { SwipeFeedGateway } from './useSwipeFeed'

const item = {
  place: {
    provider: 'KTO' as const,
    externalPlaceId: '126508',
    placeName: '해운대해수욕장',
    address: '부산 해운대구',
    lat: 35.1587,
    lng: 129.1604,
    thumbnailUrl: null,
    category: 'ATTRACTION',
    sourceStatus: 'AVAILABLE' as const,
  },
  myReaction: null,
  likedByFollowees: [],
}

describe('useSwipeFeed', () => {
  it('loads candidates and advances only after reaction persistence succeeds', async () => {
    const gateway: SwipeFeedGateway = {
      getFeed: vi.fn().mockResolvedValue({ items: [item], nextSeed: null }),
      react: vi.fn().mockResolvedValue({
        place: { provider: 'KTO', externalPlaceId: '126508' },
        reaction: 'LIKE',
        savedPlaceEligible: true,
        updatedAt: '2026-06-21T00:00:00Z',
      }),
    }
    const feed = useSwipeFeed(gateway)

    await feed.load()
    expect(feed.currentItem.value?.place.placeName).toBe('해운대해수욕장')

    await feed.react('LIKE')
    expect(gateway.react).toHaveBeenCalledWith('KTO', '126508', 'LIKE')
    expect(feed.finished.value).toBe(true)
  })

  it('keeps the current card and exposes a retryable error when persistence fails', async () => {
    const gateway: SwipeFeedGateway = {
      getFeed: vi.fn().mockResolvedValue({ items: [item], nextSeed: null }),
      react: vi.fn().mockRejectedValue(new Error('network down')),
    }
    const feed = useSwipeFeed(gateway)

    await feed.load()
    await feed.react('SUPER_LIKE')
    await nextTick()

    expect(feed.currentItem.value?.place.externalPlaceId).toBe('126508')
    expect(feed.finished.value).toBe(false)
    expect(feed.error.value).toBe('반응을 저장하지 못했습니다. 다시 시도해 주세요.')
  })

  it('shows an empty completion state when no candidates are returned', async () => {
    const gateway: SwipeFeedGateway = {
      getFeed: vi.fn().mockResolvedValue({ items: [], nextSeed: null }),
      react: vi.fn(),
    }
    const feed = useSwipeFeed(gateway)

    await feed.load()

    expect(feed.loading.value).toBe(false)
    expect(feed.finished.value).toBe(true)
    expect(feed.completedCount.value).toBe(0)
  })

  it('keeps one current card and nine waiting cards, then refills only the missing space', async () => {
    const firstItems = Array.from({ length: 10 }, (_, index) => ({
      ...item,
      place: { ...item.place, externalPlaceId: `place-${index}` },
    }))
    const nextItems = Array.from({ length: 10 }, (_, index) => ({
      ...item,
      place: { ...item.place, externalPlaceId: `next-${index}` },
    }))
    const gateway: SwipeFeedGateway = {
      getFeed: vi.fn()
        .mockResolvedValueOnce({ items: firstItems, nextSeed: 'page-2' })
        .mockResolvedValueOnce({ items: nextItems, nextSeed: 'page-3' }),
      react: vi.fn().mockResolvedValue({}),
    }
    const feed = useSwipeFeed(gateway)

    await feed.load()
    expect(gateway.getFeed).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }))
    expect(feed.currentItem.value?.place.externalPlaceId).toBe('place-0')
    expect(feed.items.value).toHaveLength(10)

    feed.advance()
    await vi.waitFor(() => expect(gateway.getFeed).toHaveBeenCalledTimes(2))

    expect(gateway.getFeed).toHaveBeenLastCalledWith(expect.objectContaining({ seed: 'page-2', limit: 1 }))
    expect(feed.currentItem.value?.place.externalPlaceId).toBe('place-1')
    expect(feed.items.value).toHaveLength(10)
  })
})
