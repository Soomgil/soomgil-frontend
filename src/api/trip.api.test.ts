import { beforeEach, describe, expect, it, vi } from 'vitest'
import http from './http'
import { tripApi } from './trip.api'
import type { PagedTripSummary, TripDetail } from '@/types/trip'

vi.mock('./http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}))

const trip: TripDetail = {
  id: 'trip-1',
  title: '부산 주말 여행',
  displayDestination: '부산광역시',
  status: 'ACTIVE',
  myRole: 'OWNER',
  itineraryVersion: 0,
  createdAt: '2026-06-19T10:00:00Z',
  ownerUserId: 'user-1',
  regions: [],
  members: [],
  retrippedFromPostId: null,
}

const page: PagedTripSummary = {
  items: [trip],
  page: {
    page: 0,
    size: 20,
    totalElements: 1,
    totalPages: 1,
    sort: ['createdAt,desc'],
  },
}

describe('tripApi', () => {
  beforeEach(() => vi.clearAllMocks())

  it('여행 목록 조회 조건을 전달하고 응답 본문을 반환한다', async () => {
    vi.mocked(http.get).mockResolvedValue({ data: page })

    const result = await tripApi.getTrips({ page: 0, size: 20, status: 'ACTIVE' })

    expect(http.get).toHaveBeenCalledWith('/trips', {
      params: { page: 0, size: 20, status: 'ACTIVE' },
    })
    expect(result).toEqual(page)
  })

  it('여행 생성 요청을 전달하고 생성된 여행을 반환한다', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: trip })

    const result = await tripApi.createTrip({
      title: '부산 주말 여행',
      displayDestination: '부산광역시',
    })

    expect(http.post).toHaveBeenCalledWith('/trips', {
      title: '부산 주말 여행',
      displayDestination: '부산광역시',
    })
    expect(result).toEqual(trip)
  })
})
