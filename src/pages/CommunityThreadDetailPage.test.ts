import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityThread, CommunityThreadReply } from '@/types/community-thread'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  user: { id: 'user-1', displayName: '소윤', profileImageUrl: null } as { id: string } | null,
  communityThreadApi: {
    getThread: vi.fn(),
    getReplies: vi.fn(),
    createReply: vi.fn(),
    updateReply: vi.fn(),
    deleteReply: vi.fn(),
    reportReply: vi.fn(),
    reportThread: vi.fn(),
    deleteThread: vi.fn(),
    updateThread: vi.fn(),
    toggleLike: vi.fn(),
  },
  communityApi: {
    getReportReasons: vi.fn(),
  },
  mediaApi: {
    uploadFile: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => ({ params: { threadId: 'thread-1' } }),
}))
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

import CommunityThreadDetailPage from './CommunityThreadDetailPage.vue'

const stubs = { AppShell: { template: '<div><slot /></div>' }, Teleport: true }

function thread(overrides: Partial<CommunityThread> = {}): CommunityThread {
  return {
    id: 'thread-1',
    author: { id: 'user-2', displayName: '현우', profileImageUrl: null },
    content: '성심당 줄이 미쳤어요',
    media: [],
    likeCount: 3,
    replyCount: 2,
    likedByMe: false,
    editableByMe: false,
    moderationStatus: 'VISIBLE',
    deletedAt: null,
    createdAt: '2026-08-24T00:00:00Z',
    updatedAt: null,
    ...overrides,
  } as CommunityThread
}

function reply(overrides: Partial<CommunityThreadReply> = {}): CommunityThreadReply {
  return {
    id: 'reply-1',
    threadId: 'thread-1',
    parentReplyId: null,
    author: { id: 'user-3', displayName: '민지', profileImageUrl: null },
    content: '저도 갔어요',
    depth: 0,
    editableByMe: false,
    moderationStatus: 'VISIBLE',
    deletedAt: null,
    createdAt: '2026-08-24T01:00:00Z',
    updatedAt: null,
    replies: [],
    ...overrides,
  } as CommunityThreadReply
}

function replyPage(items: CommunityThreadReply[]) {
  return {
    items,
    page: { page: 0, size: 50, totalElements: items.length, totalPages: 1, sort: [] },
  }
}

describe('커뮤니티 쓰레드 상세 화면', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { id: 'user-1' }
    mocks.communityThreadApi.getThread.mockResolvedValue(thread())
    mocks.communityThreadApi.getReplies.mockResolvedValue(replyPage([reply()]))
    mocks.communityApi.getReportReasons.mockResolvedValue([
      { code: 'SPAM', displayName: '스팸 · 광고', isActive: true },
      { code: 'HARASSMENT_OR_HATE', displayName: '괴롭힘 · 혐오 표현', isActive: true },
    ])
  })

  it('쓰레드와 답글을 함께 보여준다', async () => {
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="thread-content"]').text()).toBe('성심당 줄이 미쳤어요')
    expect(wrapper.findAll('[data-testid="reply-item"]')).toHaveLength(1)
  })

  it('1단계 하위 답글을 중첩해 렌더링한다', async () => {
    mocks.communityThreadApi.getReplies.mockResolvedValue(replyPage([
      reply({ replies: [reply({ id: 'reply-2', depth: 1, parentReplyId: 'reply-1' })] }),
    ]))
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    const items = wrapper.findAll('[data-testid="reply-item"]')
    expect(items).toHaveLength(2)
    expect(items[1].attributes('data-depth')).toBe('1')
  })

  it('답글을 작성하면 목록을 다시 불러온다', async () => {
    mocks.communityThreadApi.createReply.mockResolvedValue(reply({ id: 'reply-new' }))
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="thread-composer-input"]').setValue('저도요')
    await wrapper.find('[data-testid="thread-composer"]').trigger('submit')
    await flushPromises()

    expect(mocks.communityThreadApi.createReply).toHaveBeenCalledWith('thread-1', {
      content: '저도요',
      parentReplyId: null,
    })
    expect(mocks.communityThreadApi.getReplies).toHaveBeenCalledTimes(2)
  })

  it('답글에 답글을 달면 parentReplyId를 함께 보낸다', async () => {
    mocks.communityThreadApi.createReply.mockResolvedValue(reply({ id: 'reply-new' }))
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="reply-reply"]').trigger('click')
    expect(wrapper.find('[data-testid="reply-target"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reply-target"]').text()).toContain('민지')

    await wrapper.find('[data-testid="thread-composer-input"]').setValue('동감')
    await wrapper.find('[data-testid="thread-composer"]').trigger('submit')
    await flushPromises()

    expect(mocks.communityThreadApi.createReply).toHaveBeenCalledWith('thread-1', {
      content: '동감',
      parentReplyId: 'reply-1',
    })
  })

  it('답글 대상 지정을 취소할 수 있다', async () => {
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="reply-reply"]').trigger('click')
    await wrapper.find('[data-testid="reply-target-cancel"]').trigger('click')

    expect(wrapper.find('[data-testid="reply-target"]').exists()).toBe(false)
  })

  it('내 답글은 인라인으로 수정할 수 있다', async () => {
    mocks.communityThreadApi.getReplies.mockResolvedValue(replyPage([
      reply({ editableByMe: true }),
    ]))
    mocks.communityThreadApi.updateReply.mockResolvedValue(reply({ content: '수정된 답글' }))
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="reply-edit"]').trigger('click')
    expect(wrapper.find('[data-testid="reply-edit-form"]').exists()).toBe(true)

    await wrapper.find('[data-testid="reply-edit-input"]').setValue('수정된 답글')
    await wrapper.find('[data-testid="reply-edit-save"]').trigger('click')
    await flushPromises()

    expect(mocks.communityThreadApi.updateReply).toHaveBeenCalledWith(
      'thread-1',
      'reply-1',
      '수정된 답글',
    )
  })

  it('삭제된 답글은 tombstone으로 표시한다', async () => {
    mocks.communityThreadApi.getReplies.mockResolvedValue(replyPage([
      reply({ content: null, deletedAt: '2026-08-24T02:00:00Z' }),
    ]))
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="reply-tombstone"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reply-content"]').exists()).toBe(false)
  })

  it('내 답글에는 수정/삭제, 남의 답글에는 신고 버튼을 보여준다', async () => {
    mocks.communityThreadApi.getReplies.mockResolvedValue(replyPage([
      reply({ id: 'mine', editableByMe: true }),
      reply({ id: 'theirs' }),
    ]))
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="reply-edit"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="reply-delete"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="reply-report"]')).toHaveLength(1)
  })

  it('답글 신고는 사유를 골라 THREAD_REPLY 신고를 보낸다', async () => {
    mocks.communityThreadApi.reportReply.mockResolvedValue({})
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    await wrapper.find('[data-testid="reply-report"]').trigger('click')
    await flushPromises()

    expect(wrapper.find('[data-testid="report-modal"]').exists()).toBe(true)
    await wrapper.findAll('[data-testid="report-reason"]')[1].setValue(true)
    await wrapper.find('[data-testid="report-submit"]').trigger('click')
    await flushPromises()

    expect(mocks.communityThreadApi.reportReply).toHaveBeenCalledWith(
      'reply-1',
      'HARASSMENT_OR_HATE',
      undefined,
    )
  })

  it('조회에 실패하면 error 상태를 보여준다', async () => {
    mocks.communityThreadApi.getThread.mockRejectedValue(new Error('boom'))
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="detail-error"]').exists()).toBe(true)
  })

  it('비로그인 사용자에게는 답글 작성 폼을 감춘다', async () => {
    mocks.user = null
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="thread-composer"]').exists()).toBe(false)
  })
})
