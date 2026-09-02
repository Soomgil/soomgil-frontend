import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityThread, PagedCommunityThread } from '@/types/community-thread'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  user: { id: 'user-1', displayName: '소윤', profileImageUrl: null } as
    | { id: string; displayName: string; profileImageUrl: string | null }
    | null,
  communityThreadApi: {
    getThreads: vi.fn(),
    getThread: vi.fn(),
    createThread: vi.fn(),
    updateThread: vi.fn(),
    deleteThread: vi.fn(),
    likeThread: vi.fn(),
    unlikeThread: vi.fn(),
    toggleLike: vi.fn(),
    getReplies: vi.fn(),
    createReply: vi.fn(),
    updateReply: vi.fn(),
    deleteReply: vi.fn(),
    reportThread: vi.fn(),
    reportReply: vi.fn(),
  },
  communityApi: {
    getReportReasons: vi.fn(),
  },
  mediaApi: {
    uploadFile: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/api/community-thread.api', () => ({ communityThreadApi: mocks.communityThreadApi }))
vi.mock('@/api/community.api', () => ({ communityApi: mocks.communityApi }))
vi.mock('@/api/media.api', () => ({ mediaApi: mocks.mediaApi }))
vi.mock('@/composables/useToast', () => ({ useToast: () => mocks.toast }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    get user() {
      return mocks.user
    },
    get isAuthenticated() {
      return Boolean(mocks.user)
    },
    fetchUser: vi.fn(),
  }),
}))

import CommunityFeedPage from './CommunityFeedPage.vue'

const stubs = { AppShell: { template: '<div><slot /></div>' }, Teleport: true }

function thread(overrides: Partial<CommunityThread> = {}): CommunityThread {
  return {
    id: 'thread-1',
    author: { id: 'user-2', displayName: '현우', profileImageUrl: null },
    content: '성심당 줄이 미쳤어요',
    media: [],
    likeCount: 3,
    replyCount: 1,
    likedByMe: false,
    editableByMe: false,
    moderationStatus: 'VISIBLE',
    deletedAt: null,
    createdAt: '2026-08-24T00:00:00Z',
    updatedAt: null,
    ...overrides,
  } as CommunityThread
}

function pageOf(items: CommunityThread[], totalPages = 1, current = 0): PagedCommunityThread {
  return {
    items,
    page: { page: current, size: 20, totalElements: items.length, totalPages, sort: [] },
  }
}

describe('커뮤니티 공개 피드 화면', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { id: 'user-1', displayName: '소윤', profileImageUrl: null }
    mocks.communityThreadApi.getThreads.mockResolvedValue(pageOf([thread()]))
    mocks.communityApi.getReportReasons.mockResolvedValue([
      { code: 'SPAM', displayName: '스팸 · 광고', isActive: true },
      { code: 'INAPPROPRIATE', displayName: '부적절한 내용', isActive: true },
    ])
  })

  it('불러오는 동안 loading 상태를 보여준다', async () => {
    let resolve: (value: PagedCommunityThread) => void = () => {}
    mocks.communityThreadApi.getThreads.mockReturnValue(
      new Promise<PagedCommunityThread>((r) => {
        resolve = r
      }),
    )
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })

    expect(wrapper.find('[data-testid="feed-list"]').exists()).toBe(false)

    resolve(pageOf([thread()]))
    await flushPromises()
    expect(wrapper.find('[data-testid="feed-list"]').exists()).toBe(true)
  })

  it('쓰레드 목록을 렌더링한다', async () => {
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="thread-card"]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="thread-content"]').text()).toBe('성심당 줄이 미쳤어요')
  })

  it('글이 없으면 empty 상태를 보여준다', async () => {
    mocks.communityThreadApi.getThreads.mockResolvedValue(pageOf([]))
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="feed-empty"]').exists()).toBe(true)
  })

  it('조회에 실패하면 error 상태와 재시도를 제공한다', async () => {
    mocks.communityThreadApi.getThreads.mockRejectedValueOnce(new Error('boom'))
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    const error = wrapper.find('[data-testid="feed-error"]')
    expect(error.exists()).toBe(true)

    mocks.communityThreadApi.getThreads.mockResolvedValue(pageOf([thread()]))
    await error.find('button').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="feed-list"]').exists()).toBe(true)
  })

  it('더 보기를 누르면 다음 페이지를 이어 붙인다', async () => {
    mocks.communityThreadApi.getThreads
      .mockResolvedValueOnce(pageOf([thread({ id: 'thread-1' })], 2, 0))
      .mockResolvedValueOnce(pageOf([thread({ id: 'thread-2' })], 2, 1))
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="feed-load-more"]').trigger('click')
    await flushPromises()

    expect(wrapper.findAll('[data-testid="thread-card"]')).toHaveLength(2)
  })

  it('좋아요를 누르면 서버가 준 값으로 갱신한다', async () => {
    mocks.communityThreadApi.toggleLike.mockResolvedValue({
      threadId: 'thread-1',
      liked: true,
      likeCount: 4,
    })
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-like"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="thread-like-count"]').text()).toBe('4')
  })

  it('좋아요 요청 중에는 중복 호출하지 않는다', async () => {
    let resolve: (value: unknown) => void = () => {}
    mocks.communityThreadApi.toggleLike.mockReturnValue(
      new Promise((r) => {
        resolve = r
      }),
    )
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-like"]').trigger('click')
    await wrapper.find('[data-testid="thread-like"]').trigger('click')

    expect(mocks.communityThreadApi.toggleLike).toHaveBeenCalledTimes(1)
    resolve({ threadId: 'thread-1', liked: true, likeCount: 4 })
  })

  it('작성자에게만 수정과 삭제 버튼을 보여준다', async () => {
    mocks.communityThreadApi.getThreads.mockResolvedValue(
      pageOf([thread({ editableByMe: true })]),
    )
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-menu"]').trigger('click')
    expect(wrapper.find('[data-testid="thread-edit"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="thread-delete"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="thread-report"]').exists()).toBe(false)
  })

  it('수정 버튼을 누르면 인라인 편집 폼이 열리고 저장하면 PATCH를 보낸다', async () => {
    mocks.communityThreadApi.getThreads.mockResolvedValue(
      pageOf([thread({ editableByMe: true })]),
    )
    mocks.communityThreadApi.updateThread.mockResolvedValue(
      thread({ editableByMe: true, content: '수정된 본문', updatedAt: '2026-08-24T01:00:00Z' }),
    )
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-menu"]').trigger('click')
    await wrapper.find('[data-testid="thread-edit"]').trigger('click')
    expect(wrapper.find('[data-testid="thread-edit-form"]').exists()).toBe(true)

    await wrapper.find('[data-testid="thread-edit-input"]').setValue('수정된 본문')
    await wrapper.find('[data-testid="thread-edit-save"]').trigger('click')
    await flushPromises()

    expect(mocks.communityThreadApi.updateThread).toHaveBeenCalledWith('thread-1', {
      content: '수정된 본문',
    })
    expect(wrapper.find('[data-testid="thread-content"]').text()).toBe('수정된 본문')
  })

  it('Esc로 수정을 취소하고 Ctrl+Enter로 저장한다', async () => {
    mocks.communityThreadApi.getThreads.mockResolvedValue(
      pageOf([thread({ editableByMe: true })]),
    )
    mocks.communityThreadApi.updateThread.mockResolvedValue(
      thread({ editableByMe: true, content: '키보드 저장', updatedAt: '2026-08-24T01:00:00Z' }),
    )
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    // Esc → 취소
    await wrapper.find('[data-testid="thread-menu"]').trigger('click')
    await wrapper.find('[data-testid="thread-edit"]').trigger('click')
    await wrapper.find('[data-testid="thread-edit-input"]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.find('[data-testid="thread-edit-form"]').exists()).toBe(false)
    expect(mocks.communityThreadApi.updateThread).not.toHaveBeenCalled()

    // Ctrl+Enter → 저장
    await wrapper.find('[data-testid="thread-menu"]').trigger('click')
    await wrapper.find('[data-testid="thread-edit"]').trigger('click')
    await wrapper.find('[data-testid="thread-edit-input"]').setValue('키보드 저장')
    await wrapper.find('[data-testid="thread-edit-input"]').trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()
    expect(mocks.communityThreadApi.updateThread).toHaveBeenCalledWith('thread-1', { content: '키보드 저장' })
  })

  it('수정을 취소하면 원래 본문으로 돌아간다', async () => {
    mocks.communityThreadApi.getThreads.mockResolvedValue(
      pageOf([thread({ editableByMe: true })]),
    )
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-menu"]').trigger('click')
    await wrapper.find('[data-testid="thread-edit"]').trigger('click')
    await wrapper.find('[data-testid="thread-edit-input"]').setValue('바꾸다 말았어요')
    await wrapper.find('[data-testid="thread-edit-cancel"]').trigger('click')

    expect(mocks.communityThreadApi.updateThread).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="thread-content"]').text()).toBe('성심당 줄이 미쳤어요')
  })

  it('남의 글에는 신고 버튼만 보여준다', async () => {
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-menu"]').trigger('click')
    expect(wrapper.find('[data-testid="thread-edit"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="thread-report"]').exists()).toBe(true)
  })

  it('삭제된 글은 tombstone으로 표시한다', async () => {
    mocks.communityThreadApi.getThreads.mockResolvedValue(
      pageOf([thread({ content: null, deletedAt: '2026-08-24T01:00:00Z' })]),
    )
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="thread-tombstone"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="thread-content"]').exists()).toBe(false)
  })

  it('작성 폼으로 새 글을 올리면 목록 맨 위에 추가된다', async () => {
    mocks.communityThreadApi.createThread.mockResolvedValue(
      thread({ id: 'thread-new', content: '새 글' }),
    )
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-composer-input"]').setValue('새 글')
    await wrapper.find('[data-testid="thread-composer"]').trigger('submit')
    await flushPromises()

    expect(mocks.communityThreadApi.createThread).toHaveBeenCalledWith({ content: '새 글' })
    expect(wrapper.findAll('[data-testid="thread-card"]')[0].text()).toContain('새 글')
  })

  it('이미지를 첨부하면 업로드 후 mediaFileIds를 함께 보낸다', async () => {
    mocks.mediaApi.uploadFile.mockResolvedValue({ id: 'media-1' })
    mocks.communityThreadApi.createThread.mockResolvedValue(
      thread({ id: 'thread-new', content: '사진 글' }),
    )
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    const fileInput = wrapper.find('[data-testid="composer-file-input"]')
    expect(fileInput.exists()).toBe(true)

    const file = new File(['img'], 'photo.png', { type: 'image/png' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')
    await flushPromises()

    expect(mocks.mediaApi.uploadFile).toHaveBeenCalledWith(file, 'COMMUNITY_POST')
    expect(wrapper.findAll('[data-testid="composer-preview"]')).toHaveLength(1)

    await wrapper.find('[data-testid="thread-composer-input"]').setValue('사진 글')
    await wrapper.find('[data-testid="thread-composer"]').trigger('submit')
    await flushPromises()

    expect(mocks.communityThreadApi.createThread).toHaveBeenCalledWith({
      content: '사진 글',
      mediaFileIds: ['media-1'],
    })
    vi.unstubAllGlobals()
  })

  it('첨부한 이미지를 제거할 수 있다', async () => {
    mocks.mediaApi.uploadFile.mockResolvedValue({ id: 'media-1' })
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:preview'),
      revokeObjectURL: vi.fn(),
    })
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    const fileInput = wrapper.find('[data-testid="composer-file-input"]')
    const file = new File(['img'], 'photo.png', { type: 'image/png' })
    Object.defineProperty(fileInput.element, 'files', { value: [file] })
    await fileInput.trigger('change')
    await flushPromises()

    await wrapper.find('[data-testid="composer-preview-remove"]').trigger('click')

    expect(wrapper.findAll('[data-testid="composer-preview"]')).toHaveLength(0)
    vi.unstubAllGlobals()
  })

  it('이미지를 드래그해 놓으면 첨부로 업로드한다', async () => {
    mocks.mediaApi.uploadFile.mockResolvedValue({ id: 'media-drop' })
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    const file = new File(['x'], 'drop.png', { type: 'image/png' })
    await wrapper.find('[data-testid="thread-composer"]').trigger('drop', {
      dataTransfer: { files: [file] },
    })
    await flushPromises()

    expect(mocks.mediaApi.uploadFile).toHaveBeenCalledWith(file, 'COMMUNITY_POST')
    expect(wrapper.findAll('[data-testid="composer-preview"]')).toHaveLength(1)
  })

  it('클립보드 이미지를 붙여넣으면 첨부로 업로드한다', async () => {
    mocks.mediaApi.uploadFile.mockResolvedValue({ id: 'media-paste' })
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    const file = new File(['x'], 'paste.png', { type: 'image/png' })
    await wrapper.find('[data-testid="thread-composer-input"]').trigger('paste', {
      clipboardData: { items: [{ kind: 'file', type: 'image/png', getAsFile: () => file }] },
    })
    await flushPromises()

    expect(mocks.mediaApi.uploadFile).toHaveBeenCalledWith(file, 'COMMUNITY_POST')
  })

  it('비로그인 사용자에게는 작성 폼을 보여주지 않는다', async () => {
    mocks.user = null
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="thread-composer"]').exists()).toBe(false)
  })

  it('빈 본문은 게시 버튼이 비활성이다', async () => {
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    const submit = wrapper.find('[data-testid="thread-composer-submit"]')
    expect(submit.attributes('disabled')).toBeDefined()

    await wrapper.find('[data-testid="thread-composer-input"]').setValue('내용')
    expect(wrapper.find('[data-testid="thread-composer-submit"]').attributes('disabled')).toBeUndefined()
  })

  it('신고 버튼을 누르면 사유 선택 모달이 열리고 선택한 사유로 신고한다', async () => {
    mocks.communityThreadApi.reportThread.mockResolvedValue({})
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-menu"]').trigger('click')
    await wrapper.find('[data-testid="thread-report"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="report-modal"]').exists()).toBe(true)
    // 사유를 고르기 전에는 제출할 수 없다.
    expect(wrapper.find('[data-testid="report-submit"]').attributes('disabled')).toBeDefined()

    await wrapper.findAll('[data-testid="report-reason"]')[0].setValue(true)
    await wrapper.find('[data-testid="report-detail"]').setValue('광고 글이에요')
    await wrapper.find('[data-testid="report-submit"]').trigger('click')
    await flushPromises()

    expect(mocks.communityThreadApi.reportThread).toHaveBeenCalledWith(
      'thread-1',
      'SPAM',
      '광고 글이에요',
    )
    expect(wrapper.find('[data-testid="report-modal"]').exists()).toBe(false)
  })

  it('답글 아이콘을 누르면 상세로 이동한다', async () => {
    const wrapper = mount(CommunityFeedPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-open"]').trigger('click')

    expect(mocks.push).toHaveBeenCalledWith('/community/threads/thread-1')
  })
})
