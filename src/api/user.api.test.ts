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
})
