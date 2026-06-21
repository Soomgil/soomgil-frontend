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
})
