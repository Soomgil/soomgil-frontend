import { beforeEach, describe, expect, it, vi } from 'vitest'

const { get, post, put, del } = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
}))

vi.mock('@/api/http', () => ({
  default: { get, post, put, delete: del },
}))

import { placeApi } from '@/api/place.api'
import { swipeApi } from '@/api/swipe.api'

const place = {
  provider: 'KTO',
  externalPlaceId: '126508',
  name: '해운대해수욕장',
  address: '부산 해운대구',
  lat: 35.1587,
  lng: 129.1604,
  thumbnailUrl: 'https://cdn.example.com/haeundae.jpg',
  category: 'ATTRACTION',
  sourceStatus: 'AVAILABLE',
}

describe('place and preference APIs', () => {
  beforeEach(() => {
    get.mockReset()
    post.mockReset()
    put.mockReset()
    del.mockReset()
  })

  it('searches places and maps backend names to UI places', async () => {
    get.mockResolvedValue({ data: { items: [place], page: { page: 0, size: 20, totalElements: 1, totalPages: 1, sort: [] } } })

    const result = await placeApi.search({ q: '해운대', bbox: '129,35,130,36' })

    expect(get).toHaveBeenCalledWith('/places/search', { params: { q: '해운대', bbox: '129,35,130,36' } })
    expect(result.items[0].placeName).toBe('해운대해수욕장')
    expect(result.page.totalElements).toBe(1)
  })

  it('loads swipe feed and persists reactions using backend contract paths', async () => {
    const swipePlace = {
      ...place,
      description: '넓은 백사장이 있는 해수욕장',
      photos: ['https://cdn.example.com/haeundae.jpg', 'https://cdn.example.com/haeundae-2.jpg'],
      tags: ['바다·해안', '산책'],
      accessibility: {
        openingHours: '09:00~18:00',
        closedDays: null,
        parkingType: 'FREE',
        flags: ['WHEELCHAIR', 'STROLLER'],
      },
    }
    get.mockResolvedValue({ data: { items: [{ place: swipePlace, myReaction: null, likedByFollowees: [] }], nextSeed: 'next' } })
    put.mockResolvedValue({ data: { place: { provider: 'KTO', externalPlaceId: '126508' }, reaction: 'SUPER_LIKE', savedPlaceEligible: true, updatedAt: '2026-06-21T00:00:00Z' } })

    const feed = await swipeApi.getFeed({ limit: 20, excludeRecent: true })
    get.mockResolvedValueOnce({ data: [{ externalPlaceId: '126508', tags: ['바다'], status: 'READY' }] })
    const tagStatuses = await swipeApi.getTagStatuses(['126508', '999999'])
    const reaction = await swipeApi.react('KTO', '126508', 'SUPER_LIKE')

    expect(get).toHaveBeenCalledWith('/swipe/feed', { params: { limit: 20, excludeRecent: true } })
    expect(get).toHaveBeenCalledWith('/swipe/tags', { params: { externalPlaceIds: '126508,999999' } })
    expect(tagStatuses[0]?.status).toBe('READY')
    expect(put).toHaveBeenCalledWith('/places/KTO/126508/swipe-reaction', { reaction: 'SUPER_LIKE', source: 'swipe-feed' })
    expect(feed.items[0].place.placeName).toBe('해운대해수욕장')
    expect(feed.items[0].place.description).toBe('넓은 백사장이 있는 해수욕장')
    expect(feed.items[0].place.photos).toHaveLength(2)
    expect(feed.items[0].place.tags).toEqual(['바다·해안', '산책'])
    expect(feed.items[0].place.accessibility).toEqual({
      openingHours: '09:00~18:00',
      closedDays: null,
      parkingType: 'FREE',
      flags: ['WHEELCHAIR', 'STROLLER'],
      unavailableFlags: [],
    })
    expect(reaction.savedPlaceEligible).toBe(true)
  })

  it('loads and maps accessibility for route places in one batch', async () => {
    post.mockResolvedValue({
      data: {
        map: {
          'KTO:126508': {
            openingHours: null,
            closedDays: '매주 월요일',
            parkingType: 'PAID',
            flags: ['PET'],
          },
        },
      },
    })

    const result = await placeApi.getAccessibilityBatch([
      { provider: 'KTO', externalPlaceId: '126508' },
    ])

    expect(post).toHaveBeenCalledWith('/places/accessibility/batch', {
      items: [{ provider: 'KTO', externalPlaceId: '126508' }],
    })
    expect(result['KTO:126508']).toEqual({
      openingHours: null,
      closedDays: '매주 월요일',
      parkingType: 'PAID',
      flags: ['PET'],
      unavailableFlags: [],
    })
  })

  it('loads trip recommendations and toggles saved places', async () => {
    get.mockResolvedValueOnce({ data: { items: [{ place, matchedMembers: [], rank: 1, distanceMeters: 120, recommendationReason: '그룹 취향과 잘 맞아요' }], page: { page: 0, size: 20, totalElements: 1, totalPages: 1, sort: [] } } })
    put.mockResolvedValueOnce({ data: { id: 'saved-1', place, createdAt: '2026-06-21T00:00:00Z' } })
    del.mockResolvedValueOnce({ status: 204 })

    const recommendations = await swipeApi.getRecommendations('trip-1', {
      bbox: '129,35,130,36',
      tab: 'SUPER_LIKE',
    })
    const saved = await swipeApi.savePlace('KTO', '126508')
    await swipeApi.unsavePlace('KTO', '126508')

    expect(get).toHaveBeenCalledWith('/trips/trip-1/place-recommendations', {
      params: { bbox: '129,35,130,36', tab: 'SUPER_LIKE' },
    })
    expect(saved.place.placeName).toBe('해운대해수욕장')
    expect(del).toHaveBeenCalledWith('/places/KTO/126508/save')
    expect(recommendations.items[0].rank).toBe(1)
  })
})
