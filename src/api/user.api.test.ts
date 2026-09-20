import { beforeEach, describe, expect, it, vi } from 'vitest'
import http from './http'
import { userApi } from './user.api'

vi.mock('./http', () => ({
  default: {
    get: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}))

describe('userApi social contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uses PUT for idempotent follow requests', async () => {
    vi.mocked(http.put).mockResolvedValue({ data: { status: 'ACTIVE' } })

    await userApi.follow('user-1')

    expect(http.put).toHaveBeenCalledWith('/users/user-1/follow')
  })

  it('unwraps paged follower and following responses', async () => {
    const page = {
      items: [{ id: 'user-2', displayName: 'Traveler', profileImageUrl: null }],
      page: { page: 0, size: 100, totalElements: 1, totalPages: 1, sort: [] },
    }
    vi.mocked(http.get).mockResolvedValue({ data: page })

    await expect(userApi.getFollowers('user-1')).resolves.toEqual(page.items)
    await expect(userApi.getFollowing('user-1')).resolves.toEqual(page.items)

    expect(http.get).toHaveBeenNthCalledWith(1, '/users/user-1/followers', {
      params: { page: 0, size: 100 },
    })
    expect(http.get).toHaveBeenNthCalledWith(2, '/users/user-1/following', {
      params: { page: 0, size: 100 },
    })
  })

  it('unwraps and maps saved-place wrappers for My Page cards', async () => {
    vi.mocked(http.get).mockResolvedValue({
      data: {
        items: [{
          id: 'saved-1',
          place: {
            provider: 'KTO',
            externalPlaceId: '20001',
            name: '국립중앙과학관',
            address: '대전광역시 유성구',
            lat: 36.37,
            lng: 127.37,
            thumbnailUrl: null,
            category: '문화시설',
            sourceStatus: 'AVAILABLE',
          },
          createdAt: '2026-06-23T00:00:00Z',
        }],
        page: { page: 0, size: 100, totalElements: 1, totalPages: 1, sort: [] },
      },
    })

    await expect(userApi.getSavedPlaces()).resolves.toEqual([
      expect.objectContaining({ externalPlaceId: '20001', placeName: '국립중앙과학관' }),
    ])
  })

	it('maps public profile super-liked place wrappers for another user', async () => {
		vi.mocked(http.get).mockResolvedValue({
			data: {
				id: 'user-2',
				displayName: 'Traveler',
				profileImageUrl: null,
				bio: null,
				followerCount: 0,
				followingCount: 0,
				followedByMe: false,
				followStatus: null,
				profileVisibility: 'PUBLIC',
				superLikedPlaces: [{
					id: 'saved-1',
					place: {
						provider: 'KTO', externalPlaceId: '126508', name: '성산일출봉',
						address: '제주 서귀포시', lat: 33.45, lng: 126.94,
						thumbnailUrl: null, category: '자연', sourceStatus: 'AVAILABLE',
					},
					createdAt: '2026-09-20T00:00:00Z',
				}],
				preferences: { topCategories: [], travelStyle: '', preferredTags: [] },
			},
		})

		const profile = await userApi.getUserProfile('user-2')

		expect(http.get).toHaveBeenCalledWith('/users/user-2')
		expect(profile.superLikedPlaces).toEqual([
			expect.objectContaining({ externalPlaceId: '126508', placeName: '성산일출봉' }),
		])
	})
})
