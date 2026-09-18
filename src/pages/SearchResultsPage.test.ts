import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import SearchResultsPage from './SearchResultsPage.vue'
import { searchApi } from '@/api/search.api'
import { createPinia } from 'pinia'
import { swipeApi } from '@/api/swipe.api'
import { placeApi } from '@/api/place.api'
import type { UnifiedSearchResponse } from '@/types/search'

vi.mock('@/api/search.api', () => ({ searchApi: { unified: vi.fn() } }))
vi.mock('@/api/swipe.api', () => ({ swipeApi: { getReaction: vi.fn(), react: vi.fn() } }))
vi.mock('@/api/place.api', () => ({ placeApi: { getPlace: vi.fn() } }))

const results: UnifiedSearchResponse = {
  query: '제주', trips: [], posts: [],
  places: [{ provider: 'KTO', externalPlaceId: '1', name: '사계해변', address: '제주 서귀포시', lat: 33, lng: 126, thumbnailUrl: null, category: '해변', sourceStatus: 'AVAILABLE' }],
  users: [{ id: 'user-1', displayName: '제주 여행자', profileImageUrl: null, followerCount: 3 }],
}
async function render(url = '/search?q=제주&tab=전체') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: SearchResultsPage }] })
  await router.push(url)
  const wrapper = mount(SearchResultsPage, { global: { plugins: [router, createPinia()], stubs: {
    AppShell: { template: '<div><slot /></div>' }, StoryDetailOverlay: true, Teleport: true,
  } } })
  await flushPromises()
  return { wrapper, router }
}
describe('화이트 검색 결과 탐색', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(swipeApi.getReaction).mockResolvedValue(null)
    vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    vi.mocked(searchApi.unified).mockResolvedValue(results)
    vi.mocked(placeApi.getPlace).mockResolvedValue({ ...results.places[0]!, placeName: '사계해변' })
  })

  it('검색어를 제목으로 표시하고 결과를 필터링한다', async () => {
    const { wrapper } = await render()
    expect(wrapper.get('h1').text()).toContain('제주')
    expect(wrapper.findAll('.search-card')).toHaveLength(2)
    await wrapper.get('button[aria-label="장소 결과 보기"]').trigger('click')
    expect(wrapper.findAll('.search-card')).toHaveLength(1)
    expect(wrapper.get('.search-card-title').text()).toBe('사계해변')
  })

  it('장소 카드에서 기존 상세 조회를 유지한다', async () => {
    const { wrapper } = await render()
    await wrapper.get('.search-card--place').trigger('click')
    await flushPromises()
    expect(placeApi.getPlace).toHaveBeenCalledWith('KTO', '1', false)
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('사계해변 상세 정보')
  })

  it('사진을 선택하고 긴 설명을 펼친 뒤 다시 열면 초기 상태로 돌아온다', async () => {
    vi.mocked(placeApi.getPlace).mockResolvedValue({ ...results.places[0]!, placeName: '사계해변', thumbnailUrl: '/first.jpg', photos: ['/first.jpg', '/second.jpg'], description: '제주의 바다를 따라 걷는 여행입니다. '.repeat(20) })
    const { wrapper } = await render()
    await wrapper.get('.search-card--place').trigger('click')
    await flushPromises()
    expect(wrapper.findAll('.place-detail-thumbnail')).toHaveLength(2)
    await wrapper.get('[aria-label="2번째 사진 보기"]').trigger('click')
    expect(wrapper.get('.place-detail-media > img').attributes('src')).toBe('/second.jpg')
    expect(wrapper.find('.place-detail-description').exists()).toBe(false)
    expect(wrapper.get('.place-detail-summary-toggle').attributes('aria-expanded')).toBe('false')
    expect(wrapper.get('.place-detail-dialog').classes()).not.toContain('is-expanded')
    await wrapper.get('.place-detail-summary-toggle').trigger('click')
    expect(wrapper.get('.place-detail-summary-toggle').attributes('aria-expanded')).toBe('true')
    expect(wrapper.get('.place-detail-dialog').classes()).toContain('is-expanded')
    await wrapper.get('.place-detail-close').trigger('click')
    await wrapper.get('.search-card--place').trigger('click')
    await flushPromises()
    expect(wrapper.get('.place-detail-media > img').attributes('src')).toBe('/first.jpg')
    expect(wrapper.find('.place-detail-description').exists()).toBe(false)
    expect(wrapper.get('.place-detail-summary-toggle').attributes('aria-expanded')).toBe('false')
    wrapper.unmount()
  })

  it('저장된 반응을 복원하고 즉시 선택한 뒤 실패하면 이전 선택으로 복구한다', async () => {
    vi.mocked(swipeApi.getReaction).mockResolvedValue('LIKE')
    const { wrapper } = await render()
    await wrapper.get('.search-card--place').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="좋아요"]').attributes('aria-pressed')).toBe('true')
    let rejectSave!: (reason: Error) => void
    vi.mocked(swipeApi.react).mockReturnValue(new Promise((_, reject) => { rejectSave = reject }))
    await wrapper.get('[aria-label="슈퍼라이크"]').trigger('click')
    expect(wrapper.get('[aria-label="슈퍼라이크"]').attributes('aria-pressed')).toBe('true')
    rejectSave(new Error('offline'))
    await flushPromises()
    expect(wrapper.get('[aria-label="좋아요"]').attributes('aria-pressed')).toBe('true')
    vi.mocked(swipeApi.react).mockResolvedValue({ place: { provider: 'KTO', externalPlaceId: '1' }, reaction: 'SUPER_LIKE', savedPlaceEligible: true, updatedAt: null })
    await wrapper.get('[aria-label="슈퍼라이크"]').trigger('click')
    await flushPromises()
    expect(swipeApi.react).toHaveBeenLastCalledWith('KTO', '1', 'SUPER_LIKE')
    expect(wrapper.find('.place-reaction-feedback').exists()).toBe(false)
    await wrapper.get('.place-detail-close').trigger('click')
    vi.mocked(swipeApi.getReaction).mockResolvedValue('SUPER_LIKE')
    await wrapper.get('.search-card--place').trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="슈퍼라이크"]').attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('다시 검색하면 새 검색어를 조회하고 오류와 빈 결과를 표시한다', async () => {
    const { wrapper } = await render()
    vi.mocked(searchApi.unified).mockRejectedValueOnce(new Error('offline'))
    await wrapper.get('input').setValue('  부산  ')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(searchApi.unified).toHaveBeenLastCalledWith('부산', 4)
    expect(wrapper.text()).toContain('검색 결과를 불러오지 못했습니다')
    vi.mocked(searchApi.unified).mockResolvedValue({ query: '밀양', trips: [], places: [], posts: [], users: [] })
    await wrapper.get('input').setValue('밀양')
    await wrapper.get('form[role="search"]').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('검색 결과가 없어요')
  })
})
