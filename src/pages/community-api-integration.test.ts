import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  back: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  communityApi: {
    getPosts: vi.fn(), getPost: vi.fn(), getComments: vi.fn(), createComment: vi.fn(),
    createPost: vi.fn(), updatePost: vi.fn(), deletePost: vi.fn(), deleteComment: vi.fn(),
    likePost: vi.fn(), unlikePost: vi.fn(), retrip: vi.fn(), rotateShareToken: vi.fn(),
    getReportReasons: vi.fn(), createReport: vi.fn(),
  },
  userApi: { getUserProfile: vi.fn() },
  mediaApi: { getRecordPhotos: vi.fn(), uploadFile: vi.fn(), delete: vi.fn() },
  tripApi: { getTrips: vi.fn() },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push, back: mocks.back }),
  useRoute: () => ({ path: '/community', query: {}, params: {} }),
}))
vi.mock('@/api/community.api', () => ({ communityApi: mocks.communityApi }))
vi.mock('@/api/user.api', () => ({ userApi: mocks.userApi }))
vi.mock('@/api/media.api', () => ({ mediaApi: mocks.mediaApi }))
vi.mock('@/api/trip.api', () => ({ tripApi: mocks.tripApi }))
vi.mock('@/composables/useToast', () => ({ useToast: () => mocks.toast }))
vi.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ user: null }) }))

import CommunityPage from './CommunityPage.vue'
import FeedPage from './FeedPage.vue'
import StoriesPage from './StoriesPage.vue'
import StoryWritePage from './StoryWritePage.vue'

const page = {
  items: [{
    id: 'post-1', sourceTripId: 'trip-1', publishedBy: { id: 'user-1', displayName: '소윤', profileImageUrl: null },
    coverMedia: { id: 'media-1', servingUrl: 'https://cdn.example/story.jpg', publicUrl: null },
    visibility: 'PUBLIC', title: '서울 골목 여행', summary: '지하철로 다녀온 여행', hashtags: ['서울'],
    likeCount: 3, retripCount: 1, commentCount: 0, mediaCount: 1, likedByMe: false,
    moderationStatus: 'VISIBLE', publishedAt: '2026-06-22T00:00:00Z',
  }],
  page: { page: 0, size: 20, totalElements: 1, totalPages: 1, sort: [] },
}

const stubs = {
  AppShell: { template: '<div><slot /></div>' },
  AppHeader: true,
  StoryWriteModal: true,
}

describe('커뮤니티 API 화면 연동', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.communityApi.getPosts.mockResolvedValue(page)
    mocks.communityApi.getComments.mockResolvedValue({ items: [], page: page.page })
    mocks.communityApi.getPost.mockResolvedValue({
      ...page.items[0], snapshotVersion: 7, snapshot: { days: [], routes: [], authorDisplay: page.items[0].publishedBy },
      media: [page.items[0].coverMedia], shareToken: null, shareUrl: null, shareTokenCreatedAt: null, shareTokenRotatedAt: null,
    })
    mocks.userApi.getUserProfile.mockResolvedValue({ id: 'user-1', displayName: '소윤' })
    mocks.tripApi.getTrips.mockResolvedValue({
      items: [{ id: 'trip-1', title: '서울 여행', displayDestination: '서울', itineraryVersion: 7 }],
      page: page.page,
    })
    mocks.mediaApi.getRecordPhotos.mockResolvedValue({
      items: [{
        id: 'photo-1', tripId: 'trip-1', capturedAt: '2026-06-22T00:00:00Z',
        media: { id: 'media-1', servingUrl: 'https://cdn.example/photo.jpg', publicUrl: null },
      }],
      page: page.page,
    })
    mocks.communityApi.createPost.mockResolvedValue({ ...page.items[0], snapshotVersion: 7 })
  })

  it.each([
    ['CommunityPage', CommunityPage],
    ['StoriesPage', StoriesPage],
  ])('%s가 실제 목록 client 응답을 렌더링한다', async (_name, component) => {
    const wrapper = mount(component, { global: { stubs } })
    await flushPromises()

    expect(mocks.communityApi.getPosts).toHaveBeenCalledWith({ page: 0, size: 100 })
    expect(wrapper.text()).toContain('서울 골목 여행')
  })

  it('CommunityPage에서 여행기 상세와 댓글을 API로 조회한다', async () => {
    const wrapper = mount(CommunityPage, { global: { stubs } })
    await flushPromises()
    await wrapper.get('.story-list-card').trigger('click')
    await flushPromises()

    expect(mocks.communityApi.getPost).toHaveBeenCalledWith('post-1')
    expect(mocks.communityApi.getComments).toHaveBeenCalledWith('post-1')
  })

  it('피드의 빈 상태에서 실제 작성 라우트로 이동한다', async () => {
    mocks.communityApi.getPosts.mockResolvedValueOnce({ ...page, items: [] })
    const wrapper = mount(FeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.get('button').trigger('click')
    expect(mocks.push).toHaveBeenCalledWith('/community/story-write')
  })

  it('작성 화면에 더미 본문을 채우지 않고 여행 기록 사진으로 게시물을 등록한다', async () => {
    const wrapper = mount(StoryWritePage, { global: { stubs } })
    await flushPromises()

    expect((wrapper.get('#story-title').element as HTMLInputElement).value).toBe('')
    expect((wrapper.get('#story-content').element as HTMLTextAreaElement).value).toBe('')

    await wrapper.get('#story-title').setValue('서울의 하루')
    await wrapper.get('#story-content').setValue('골목을 천천히 걸었다.')
    await wrapper.get('#story-tags').setValue('#서울 #골목')
    await wrapper.get('#story-trip-select').setValue('trip-1')
    await flushPromises()
    await wrapper.get('.upload-grid button').trigger('click')
    await wrapper.findAll('button').find((button) => button.text().includes('게시하기'))!.trigger('click')
    await flushPromises()

    expect(mocks.communityApi.createPost).toHaveBeenCalledWith(expect.objectContaining({
      sourceTripId: 'trip-1', baseVersion: 7, title: '서울의 하루',
      mediaFileIds: ['media-1'], coverMediaFileId: 'media-1', hashtags: ['서울', '골목'],
    }))
    expect(mocks.push).toHaveBeenCalledWith('/community/stories')
  })
})
