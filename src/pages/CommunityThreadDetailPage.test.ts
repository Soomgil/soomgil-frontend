import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CommunityThread, CommunityThreadReply } from '@/types/community-thread'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
  user: { id: 'user-1', displayName: '소윤' } as { id: string } | null,
  communityThreadApi: {
    getThread: vi.fn(),
    getReplies: vi.fn(),
    createReply: vi.fn(),
    deleteReply: vi.fn(),
    reportReply: vi.fn(),
    deleteThread: vi.fn(),
    toggleLike: vi.fn(),
  },
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mocks.push }),
  useRoute: () => ({ params: { threadId: 'thread-1' } }),
}))
vi.mock('@/api/community-thread.api', () => ({ communityThreadApi: mocks.communityThreadApi }))
vi.mock('@/composables/useToast', () => ({ useToast: () => mocks.toast }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({
    get user() {
      return mocks.user
    },
  }),
}))

import CommunityThreadDetailPage from './CommunityThreadDetailPage.vue'

const stubs = { AppShell: { template: '<div><slot /></div>' } }

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

describe('커뮤니티 쓰레드 상세 화면', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.user = { id: 'user-1' }
    mocks.communityThreadApi.getThread.mockResolvedValue(thread())
    mocks.communityThreadApi.getReplies.mockResolvedValue({
      items: [reply()],
      page: { page: 0, size: 50, totalElements: 1, totalPages: 1, sort: [] },
    })
  })

  it('쓰레드와 답글을 함께 보여준다', async () => {
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="thread-content"]').text()).toBe('성심당 줄이 미쳤어요')
    expect(wrapper.findAll('[data-testid="reply-item"]')).toHaveLength(1)
  })

  it('1단계 하위 답글을 중첩해 렌더링한다', async () => {
    mocks.communityThreadApi.getReplies.mockResolvedValue({
      items: [reply({ replies: [reply({ id: 'reply-2', depth: 1, parentReplyId: 'reply-1' })] })],
      page: { page: 0, size: 50, totalElements: 1, totalPages: 1, sort: [] },
    })
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="reply-children"]').exists()).toBe(true)
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

    await wrapper.find('[data-testid="thread-composer-input"]').setValue('동감')
    await wrapper.find('[data-testid="thread-composer"]').trigger('submit')
    await flushPromises()

    expect(mocks.communityThreadApi.createReply).toHaveBeenCalledWith('thread-1', {
      content: '동감',
      parentReplyId: 'reply-1',
    })
  })

  it('삭제된 답글은 tombstone으로 표시한다', async () => {
    mocks.communityThreadApi.getReplies.mockResolvedValue({
      items: [reply({ content: null, deletedAt: '2026-08-24T02:00:00Z' })],
      page: { page: 0, size: 50, totalElements: 1, totalPages: 1, sort: [] },
    })
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.find('[data-testid="reply-tombstone"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="reply-content"]').exists()).toBe(false)
  })

  it('내 답글에는 삭제, 남의 답글에는 신고 버튼을 보여준다', async () => {
    mocks.communityThreadApi.getReplies.mockResolvedValue({
      items: [reply({ id: 'mine', editableByMe: true }), reply({ id: 'theirs' })],
      page: { page: 0, size: 50, totalElements: 2, totalPages: 1, sort: [] },
    })
    const wrapper = mount(CommunityThreadDetailPage, { global: { stubs } })
    await flushPromises()

    expect(wrapper.findAll('[data-testid="reply-delete"]')).toHaveLength(1)
    expect(wrapper.findAll('[data-testid="reply-report"]')).toHaveLength(1)
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
