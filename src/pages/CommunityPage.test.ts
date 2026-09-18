import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ getPosts: vi.fn(), push: vi.fn() }))
vi.mock('@/api/community.api', () => ({ communityApi: { getPosts: mocks.getPosts } }))
vi.mock('@/api/user.api', () => ({ userApi: { getUserProfile: vi.fn() } }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {}, fullPath: '/community' }), useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ user: null, isAuthenticated: false }) }))
vi.mock('@/composables/useToast', () => ({ useToast: () => ({ error: vi.fn(), success: vi.fn() }) }))
import CommunityPage from './CommunityPage.vue'
const stubs = { AppShell: { template: '<main><slot /></main>' }, PopularStoryCarousel: true, StoryWriteModal: true }
describe('최근 여행기 보기 전환', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPosts.mockResolvedValue({ items: ['부산의 파도', '제주의 바람'].map((title, i) => ({ id: `${i}`, title, summary: '천천히 걷는 여행', publishedAt: '2026-09-17T00:00:00Z', publishedBy: null, hashtags: [], likeCount: 2, commentCount: 1 })) })
  })
  it('기본 그리드에서 리스트로 전환해도 현재 검색 결과와 데이터 요청을 유지한다', async () => {
    const wrapper = mount(CommunityPage, { global: { stubs } })
    await flushPromises()
    expect(wrapper.get('[aria-label="그리드 보기"]').attributes('aria-pressed')).toBe('true')
    await wrapper.get('[aria-label="여행기 검색"]').setValue('부산')
    await wrapper.get('[aria-label="리스트 보기"]').trigger('click')
    expect(wrapper.get('[data-stories-list]').attributes('data-view')).toBe('list')
    expect(wrapper.findAll('[data-stories-list] .story-tile')).toHaveLength(1)
    expect(wrapper.get('[data-stories-list]').text()).toContain('부산의 파도')
    expect(mocks.getPosts).toHaveBeenCalledTimes(1)
    await wrapper.get('[aria-label="그리드 보기"]').trigger('click')
    expect(wrapper.get('[data-stories-list]').attributes('data-view')).toBe('grid')
    wrapper.unmount()
  })
  it('keeps eight posts per page at every breakpoint and in list mode', async () => {
    mocks.getPosts.mockResolvedValue({items:Array.from({length:12},(_,i)=>({id:String(i),title:'여행 '+i,hashtags:[],likeCount:0,commentCount:0,publishedAt:'2026-09-17T00:00:00Z'}))})
    const oldWidth=window.innerWidth
    Object.defineProperty(window,'innerWidth',{value:1440,writable:true,configurable:true})
    const wrapper=mount(CommunityPage,{global:{stubs}})
    await flushPromises()
    expect(wrapper.findAll('[data-stories-list] .story-tile')).toHaveLength(8)
    window.innerWidth=900;window.dispatchEvent(new Event('resize'));await flushPromises()
    expect(wrapper.findAll('[data-stories-list] .story-tile')).toHaveLength(8)
    window.innerWidth=390;window.dispatchEvent(new Event('resize'));await flushPromises()
    expect(wrapper.findAll('[data-stories-list] .story-tile')).toHaveLength(8)
    await wrapper.get('[aria-label="리스트 보기"]').trigger('click')
    expect(wrapper.findAll('[data-stories-list] .story-tile')).toHaveLength(8)
    wrapper.unmount();window.innerWidth=oldWidth
  })

})
