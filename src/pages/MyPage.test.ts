import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MyPage from './MyPage.vue'
import LikedPlacesModal from '@/components/mypage/LikedPlacesModal.vue'
import MyStoriesModal from '@/components/mypage/MyStoriesModal.vue'

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }))
const auth = vi.hoisted(() => ({
  isAuthenticated: true,
  user: {
    id: 'user-1',
    email: 'demo01@soomgil.local',
    displayName: '민경철',
    profileImageUrl: null,
    bio: '',
    profileVisibility: 'PUBLIC',
  },
  fetchUser: vi.fn(),
}))
const userApi = vi.hoisted(() => ({
  getSavedPlaces: vi.fn(),
  getFollowers: vi.fn(),
  getFollowing: vi.fn(),
  getPreferences: vi.fn(),
  follow: vi.fn(),
  unfollow: vi.fn(),
  updateMe: vi.fn(),
}))
const swipeApi = vi.hoisted(() => ({ react: vi.fn(), savePlace: vi.fn(), unsavePlace: vi.fn() }))
const communityApi = vi.hoisted(() => ({ getPosts: vi.fn() }))
const tripApi = vi.hoisted(() => ({ getTrips: vi.fn() }))
const mediaApi = vi.hoisted(() => ({ uploadFile: vi.fn() }))
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('vue-router', () => ({ useRouter: () => router }))
vi.mock('@/stores/auth.store', () => ({ useAuthStore: () => auth }))
vi.mock('@/api/user.api', () => ({ userApi }))
vi.mock('@/api/swipe.api', () => ({ swipeApi }))
vi.mock('@/api/community.api', () => ({ communityApi }))
vi.mock('@/api/trip.api', () => ({ tripApi }))
vi.mock('@/api/media.api', () => ({ mediaApi }))
vi.mock('@/composables/useToast', () => ({ useToast: () => toast }))

const place = {
  provider: 'KTO' as const,
  externalPlaceId: '126508',
  placeName: '경복궁',
  address: '서울특별시 종로구',
  lat: 37.57,
  lng: 126.97,
  thumbnailUrl: 'https://example.com/palace.jpg',
  summary: '궁궐 산책',
  tags: ['역사'],
}

function mountPage() {
  return mount(MyPage, {
    global: {
      stubs: {
        AppShell: { template: '<div><slot /></div>' },
        RouterLink: true,
        MyStoriesModal: true,
        StoryDetailOverlay: true,
        FollowListModal: true,
      },
    },
  })
}

describe('MyPage super likes', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    auth.isAuthenticated = true
    auth.user = {
      id: 'user-1', email: 'demo01@soomgil.local', displayName: '민경철',
      profileImageUrl: null, bio: '', profileVisibility: 'PUBLIC',
    }
    auth.fetchUser.mockResolvedValue(undefined)
    userApi.updateMe.mockImplementation(async () => auth.user)
    mediaApi.uploadFile.mockResolvedValue({ id: 'media-1' })
    userApi.getSavedPlaces.mockResolvedValue([place])
    userApi.getFollowers.mockResolvedValue([])
    userApi.getFollowing.mockResolvedValue([])
    userApi.getPreferences.mockResolvedValue({ topCategories: [], preferredTags: [], travelStyle: '' })
    communityApi.getPosts.mockResolvedValue({ items: [], page: { page: 0, size: 100, totalElements: 0, totalPages: 0, sort: [] } })
    tripApi.getTrips.mockResolvedValue({ items: [], page: { page: 0, size: 1, totalElements: 0, totalPages: 0, sort: [] } })
    swipeApi.react.mockResolvedValue({ reaction: 'SUPER_LIKE', savedPlaceEligible: true })
    swipeApi.savePlace.mockResolvedValue({ id: 'saved-1', place, createdAt: '2026-06-24T00:00:00Z' })
    swipeApi.unsavePlace.mockResolvedValue(undefined)
  })

  it('downgrades and restores a super like through the real reaction and saved-place APIs', async () => {
    const wrapper = mountPage()
    await flushPromises()

    expect(wrapper.text()).toContain('가고 싶은 장소')
    expect(wrapper.text()).not.toContain('좋아요한 장소')

    const button = wrapper.get('button[aria-label="슈퍼라이크 취소"]')
    await button.trigger('click')
    await flushPromises()

    expect(swipeApi.react).toHaveBeenNthCalledWith(1, 'KTO', '126508', 'LIKE')
    expect(swipeApi.unsavePlace).toHaveBeenCalledWith('KTO', '126508')
    expect(button.classes()).toContain('is-unsaved')

    await button.trigger('click')
    await flushPromises()

    expect(swipeApi.react).toHaveBeenNthCalledWith(2, 'KTO', '126508', 'SUPER_LIKE')
    expect(swipeApi.savePlace).toHaveBeenCalledWith('KTO', '126508')
    expect(button.classes()).not.toContain('is-unsaved')
  })

  it('does not show a place count beside the close control in the all-super-likes modal', () => {
    const wrapper = mount(LikedPlacesModal, { props: { places: [place] } })

    expect(wrapper.text()).toContain('가고 싶은 장소')
    expect(wrapper.text()).not.toContain('1곳')
  })

  it('previews two keyboard-accessible story cards and retains the complete story list', async () => {
    communityApi.getPosts.mockResolvedValue({
      items: Array.from({ length: 8 }, (_, index) => ({ id: `story-${index}`, title: `여행 ${index}`, hashtags: ['서울'] })),
      page: { totalElements: 8 },
    })
    const wrapper = mountPage()
    await flushPromises()
    expect(wrapper.findAll('button.mypage-story-magazine-item')).toHaveLength(2)
    expect(wrapper.find('.story-magazine-title').attributes('data-no-translate')).toBeDefined()
    await wrapper.find('.profile-bottom-col .mypage-more-link').trigger('click')
    expect(wrapper.findComponent(MyStoriesModal).props('stories')).toHaveLength(8)
  })

  it('starts dashboard requests while an existing profile is refreshing', async () => {
    auth.fetchUser.mockImplementationOnce(() => new Promise(() => {}))
    mountPage()
    await flushPromises()
    expect(userApi.getSavedPlaces).toHaveBeenCalledOnce()
    expect(communityApi.getPosts).toHaveBeenCalledOnce()
  })

  it('copies the profile link when the share button is clicked', async () => {
    const wrapper = mountPage()
    await flushPromises()

    const shareButton = wrapper.findAll('button').find((button) => button.text().includes('공유하기'))
    expect(shareButton).toBeDefined()
    await shareButton!.trigger('click')
    await flushPromises()

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/mypage/user-1`)
    expect(toast.success).toHaveBeenCalledWith('프로필 링크를 복사했습니다.')
    expect(wrapper.text()).not.toContain('프로필 링크를 복사했습니다.')
  })

  it('registers a supported profile photo and saves its media ID', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const wrapper = mountPage()
    await flushPromises()
    const fetchesBeforeSave = auth.fetchUser.mock.calls.length
    userApi.updateMe.mockResolvedValue({ ...auth.user, profileImageUrl: '/api/v1/media/files/media-1/content' })
    await wrapper.findAll('button').find((button) => button.text().includes('프로필 수정'))!.trigger('click')

    const input = wrapper.get('input[type="file"]')
    expect(input.attributes('accept')).toContain('image/heic')
    const file = new File(['photo'], 'avatar.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
    await input.trigger('change')
    await wrapper.findAll('.story-overlay button').find((button) => button.text().includes('저장'))!.trigger('click')
    await flushPromises()

    expect(mediaApi.uploadFile).toHaveBeenCalledWith(file, 'PROFILE_IMAGE')
    expect(userApi.updateMe).toHaveBeenCalledWith(expect.objectContaining({ profileMediaFileId: 'media-1' }))
    expect(auth.fetchUser).toHaveBeenCalledTimes(fetchesBeforeSave)
    expect(auth.user.profileImageUrl).toBe('/api/v1/media/files/media-1/content')
    vi.restoreAllMocks()
  })

  it('keeps the editor open and separates the buttons from a photo upload error', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:profile-preview')
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    mediaApi.uploadFile.mockRejectedValue(new Error('파일 저장소 업로드에 실패했습니다.'))
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('프로필 수정'))!.trigger('click')
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['photo'], 'avatar.jpg', { type: 'image/jpeg' })], configurable: true,
    })
    await input.trigger('change')
    await wrapper.findAll('.story-overlay button').find((button) => button.text().includes('저장'))!.trigger('click')
    await flushPromises()

    expect(wrapper.get('[role="alert"]').text()).toContain('사진 저장에 실패했습니다.')
    expect(wrapper.get('[role="alert"]').attributes('style')).toContain('margin: 16px 0px')
    expect(wrapper.find('.story-overlay').exists()).toBe(true)
    expect(userApi.updateMe).not.toHaveBeenCalled()
    vi.restoreAllMocks()
  })

  it('rejects unsupported profile formats before upload', async () => {
    const wrapper = mountPage()
    await flushPromises()
    await wrapper.findAll('button').find((button) => button.text().includes('프로필 수정'))!.trigger('click')
    const input = wrapper.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', {
      value: [new File(['svg'], 'avatar.svg', { type: 'image/svg+xml' })], configurable: true,
    })
    await input.trigger('change')

    expect(wrapper.text()).toContain('JPG, PNG, WebP, GIF, HEIC 또는 HEIF 이미지를 선택해 주세요.')
    expect(mediaApi.uploadFile).not.toHaveBeenCalled()
  })
})
