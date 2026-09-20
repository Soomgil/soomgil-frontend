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
        StoryDetailOverlay: true,
        FollowListModal: true,
      },
    },
  })
}

describe('UserProfilePage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
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

  it('uses the same paper hero and profile surface classes as my page', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.get('.mypage-page-heading').classes()).toEqual(expect.arrayContaining([
      'page-hero', 'primary-page-hero', 'account-page-hero',
    ]))
    expect(wrapper.get('.page-hero__eyebrow').text()).toBe('Profile')
    expect(wrapper.find('.page-hero__eyebrow .material-symbols-rounded').exists()).toBe(false)
    expect(wrapper.find('.mypage-profile-card.profile-header-card').exists()).toBe(true)
    expect(wrapper.find('.mypage-glass-container .mypage-body-container').exists()).toBe(true)
    expect(wrapper.findAll('.profile-bottom-col .mypage-empty-state.profile-empty-card')).toHaveLength(2)
    expect(wrapper.get('.pref-empty').classes()).toContain('mypage-empty-state')
  })

  it('shows a toast after copying another user profile link', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const shareButton = wrapper.findAll('button').find(button => button.text().includes('공유하기'))
    expect(shareButton).toBeDefined()
    await shareButton!.trigger('click')
    await flushPromises()

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/mypage/${route.params.userId}`)
    expect(toast.success).toHaveBeenCalledWith('프로필 링크를 복사했습니다.')
  })

  it('opens another user story in a modal without navigating away', async () => {
    communityApi.getPosts.mockResolvedValueOnce({
      items: [{
        id: 'story-1', title: '제주 산책', summary: '천천히 걸은 하루', hashtags: ['제주'],
        publishedBy: { id: route.params.userId, displayName: '여행자', profileImageUrl: null },
        coverMedia: null, likeCount: 3, commentCount: 1, publishedAt: '2026-06-22T00:00:00Z',
      }],
      page: { page: 0, size: 100, totalElements: 1, totalPages: 1, sort: [] },
    })
    const wrapper = mountPage()
    await flushPromises()

    await wrapper.get('button.mypage-story-magazine-item').trigger('click')
    await flushPromises()

    expect(router.push).not.toHaveBeenCalled()
    expect(wrapper.findComponent({ name: 'StoryDetailOverlay' }).exists()).toBe(true)
  })
})
