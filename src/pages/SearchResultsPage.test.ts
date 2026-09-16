import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import SearchResultsPage from './SearchResultsPage.vue'
import { searchApi } from '@/api/search.api'
import { placeApi } from '@/api/place.api'
import type { UnifiedSearchResponse } from '@/types/search'

vi.mock('@/api/search.api', () => ({ searchApi: { unified: vi.fn() } }))
vi.mock('@/api/place.api', () => ({ placeApi: { getPlace: vi.fn() } }))

const results: UnifiedSearchResponse = {
  query: '제주', trips: [], posts: [],
  places: [{ provider: 'KTO', externalPlaceId: '1', name: '사계해변', address: '제주 서귀포시', lat: 33, lng: 126, thumbnailUrl: null, category: '해변', sourceStatus: 'AVAILABLE' }],
  users: [{ id: 'user-1', displayName: '제주 여행자', profileImageUrl: null, followerCount: 3 }],
}
async function render(url = '/search?q=제주&tab=전체') {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/:pathMatch(.*)*', component: SearchResultsPage }] })
  await router.push(url)
  const wrapper = mount(SearchResultsPage, { global: { plugins: [router], stubs: {
    AppShell: { template: '<div><slot /></div>' }, StoryDetailOverlay: true, Teleport: true,
  } } })
  await flushPromises()
  return { wrapper, router }
}
describe('화이트 검색 결과 탐색', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
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
    expect(placeApi.getPlace).toHaveBeenCalledWith('KTO', '1')
    expect(wrapper.get('[role="dialog"]').attributes('aria-label')).toBe('사계해변 상세 정보')
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
