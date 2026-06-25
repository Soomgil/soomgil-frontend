import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import UserProfilePage from './UserProfilePage.vue'

const router = vi.hoisted(() => ({ back: vi.fn(), push: vi.fn() }))
const route = vi.hoisted(() => ({ params: { userId: 'c70a8e64-e5be-d91d-c1e2-73c2aad7e49d' } }))
const auth = vi.hoisted(() => ({
  user: { id: 'current-user', displayName: '민경철' },
}))
const userApi = vi.hoisted(() => ({
  getUserProfile: vi.fn(),
  getSavedPlaces: vi.fn(),
  getFollowers: vi.fn(),
  getFollowing: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
}))
const communityApi = vi.hoisted(() => ({ getPosts: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('vue-router', () => ({
  useRoute: () => route,
  useRouter: () => router,
}))
vi.mock('@/stores/auth.store', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/user.api', () => ({ userApi }))
vi.mock('@/api/community.api', () => ({ communityApi }))
vi.mock('@/composables/useToast', () => ({ useToast: () => toast }))

function mountPage() {
  return mount(UserProfilePage, {
    global: {
      stubs: {
        AppShell: { template: '<div><slot /></div>' },
        LikedPlacesModal: true,
        MyStoriesModal: true,
        FollowListModal: true,
      },
    },
  })
}

describe('UserProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    userApi.getUserProfile.mockResolvedValue({
      id: route.params.userId,
      displayName: '여행자',
      email: 'traveler@soomgil.local',
      bio: '느긋한 여행을 좋아해요.',
      profileImageUrl: null,
      profileVisibility: 'PUBLIC',
      followedByMe: false,
      followStatus: null,
      followerCount: 0,
      followingCount: 0,
    })
    userApi.getFollowers.mockResolvedValue([])
    userApi.getFollowing.mockResolvedValue([])
    communityApi.getPosts.mockResolvedValue({
      items: [],
      page: { page: 0, size: 100, totalElements: 0, totalPages: 0, sort: [] },
    })
  })

  it('does not present another user profile as my liked places', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(userApi.getSavedPlaces).not.toHaveBeenCalled()
    expect(wrapper.text()).toContain('슈퍼라이크한 장소')
    expect(wrapper.text()).toContain('공개된 슈퍼라이크 장소가 없어요')
    expect(wrapper.text()).not.toContain('좋아요한 장소')
    expect(wrapper.text()).not.toContain('아직 좋아요한 장소가 없어요')
  })
})
