import { beforeEach, describe, expect, it, vi } from 'vitest'
import http from './http'
import { tripApi } from './trip.api'
import type { PagedTripSummary, TripDetail } from '@/types/trip'

vi.mock('./http', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
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
      paramsSerializer: { indexes: null },
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

  it('여행 멤버와 초대 목록을 실제 하위 리소스에서 조회한다', async () => {
    vi.mocked(http.get)
      .mockResolvedValueOnce({ data: trip.members })
      .mockResolvedValueOnce({ data: [] })

    await expect(tripApi.getMembers(trip.id)).resolves.toEqual(trip.members)
    await expect(tripApi.getInvites(trip.id)).resolves.toEqual([])

    expect(http.get).toHaveBeenNthCalledWith(1, `/trips/${trip.id}/members`)
    expect(http.get).toHaveBeenNthCalledWith(2, `/trips/${trip.id}/invites`)
  })

  it('초대 생성과 취소를 백엔드 계약 경로로 요청한다', async () => {
    const invite = {
      id: 'invite-1',
      tripId: trip.id,
      inviteCode: 'JOIN-ME',
      inviteUrl: null,
      inviteeUserId: null,
      status: 'PENDING' as const,
      expiresAt: null,
      createdAt: '2026-06-20T00:00:00Z',
    }
    vi.mocked(http.post).mockResolvedValue({ data: invite })
    vi.mocked(http.delete).mockResolvedValue({ data: undefined })

    await expect(tripApi.createInvite(trip.id)).resolves.toEqual(invite)
    await expect(tripApi.revokeInvite(trip.id, invite.id)).resolves.toBeUndefined()

    expect(http.post).toHaveBeenCalledWith(`/trips/${trip.id}/invites`, {})
    expect(http.delete).toHaveBeenCalledWith(`/trips/${trip.id}/invites/${invite.id}`)
  })

  it('초대 수락은 전용 trip-invites 경로를 사용한다', async () => {
    vi.mocked(http.post).mockResolvedValue({ data: trip })

    await expect(tripApi.acceptInvite('JOIN-ME')).resolves.toEqual(trip)

    expect(http.post).toHaveBeenCalledWith('/trip-invites/JOIN-ME/accept', {})
  })
})
