import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import HomePage from './HomePage.vue'
import { createPinia } from 'pinia'
import { awardApi } from '@/api/award.api'
import type { AwardPhoto } from '@/types/award'

const { push } = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
vi.mock('@/api/award.api', () => ({ awardApi: { getAwardPhotos: vi.fn() } }))
vi.mock('@/api/place.api', () => ({ placeApi: { getPopularPlaces: vi.fn().mockResolvedValue([]) } }))
vi.mock('@/api/community.api', () => ({ communityApi: { getPosts: vi.fn().mockResolvedValue({ items: [] }) } }))
vi.mock('@/stores/auth.store', () => ({ useAuthStore: () => ({ isAuthenticated: false }) }))
vi.mock('@/i18n', () => ({ useLocale: () => ({ locale: 'ko' }) }))

const photo = (title: string): AwardPhoto => ({
  title, imageUrl: `https://example.com/${title}.jpg`, photographer: '김작가',
  placeName: title, regionName: '제주', awardDivision: '대상', awardContentId: title,
  filmLocation: null, filmYearMonth: null, thumbnailUrl: null, copyrightCode: 'Type1', regionCode: null,
})
const render = () => mount(HomePage, {
  global: { plugins: [createPinia()], stubs: { AppShell: { template: '<div><slot /></div>' }, StoryDetailOverlay: true } },
})

describe('홈 검색과 수상작 배경', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.clearAllMocks()
    vi.mocked(awardApi.getAwardPhotos).mockResolvedValue([photo('성산일출봉'), photo('우도')])
  })

  it('카테고리 버튼 없이 전체 검색으로 이동하며 빈 검색은 무시한다', async () => {
    const wrapper = render()
    await wrapper.get('form[role="search"]').trigger('submit')
    expect(push).not.toHaveBeenCalled()
    expect(wrapper.find('.home-search-categories').exists()).toBe(false)
    await wrapper.get('input[type="search"]').setValue('  제주  ')
    await wrapper.get('form[role="search"]').trigger('submit')
    expect(push).toHaveBeenCalledWith({ path: '/search', query: { q: '제주', tab: '전체' } })
    wrapper.unmount()
  })

  it('사진과 출처를 함께 전환하고 마지막 사진에서 처음으로 돌아온다', async () => {
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('성산일출봉')
    expect(wrapper.text()).toContain('김작가')
    await wrapper.get('button[aria-label="다음 사진"]').trigger('click')
    expect(wrapper.get('.home-artwork-title').text()).toBe('우도')
    await wrapper.get('button[aria-label="다음 사진"]').trigger('click')
    expect(wrapper.get('.home-artwork-title').text()).toBe('성산일출봉')
    wrapper.unmount()
  })

  it('사진 API 실패 시에도 검색할 수 있다', async () => {
    vi.mocked(awardApi.getAwardPhotos).mockRejectedValue(new Error('offline'))
    const wrapper = render()
    await flushPromises()
    expect(wrapper.text()).toContain('사진을 불러오지 못했어요')
    await wrapper.get('input[type="search"]').setValue('부산')
    await wrapper.get('form[role="search"]').trigger('submit')
    expect(push).toHaveBeenCalledWith({ path: '/search', query: { q: '부산', tab: '전체' } })
    wrapper.unmount()
  })

  it('이미지 로딩 실패 시 해당 작품의 정보도 숨기고 다음 유효 사진을 보여준다', async () => {
    const wrapper = render()
    await flushPromises()
    await wrapper.get('.home-backdrop img').trigger('error')
    expect(wrapper.get('.home-artwork-title').text()).toBe('우도')
    await wrapper.get('.home-backdrop img').trigger('error')
    expect(wrapper.find('.home-artwork-title').exists()).toBe(false)
    expect(wrapper.find('input[type="search"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('사진이 없으면 전환 버튼 없이 검색을 제공한다', async () => {
    vi.mocked(awardApi.getAwardPhotos).mockResolvedValue([])
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('button[aria-label="다음 사진"]').exists()).toBe(false)
    expect(wrapper.find('input[type="search"]').exists()).toBe(true)
    wrapper.unmount()
  })

  it('최근 검색을 재사용하고 저장된 기록을 지울 수 있다', async () => {
    localStorage.setItem('soomgil.home.recent-searches', JSON.stringify(['강릉']))
    const wrapper = render()
    await flushPromises()
    await wrapper.get('input').trigger('focusin')
    await wrapper.get('.home-search-history li button').trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/search', query: { q: '강릉', tab: '전체' } })
    await wrapper.get('.home-search-history-heading button').trigger('click')
    expect(localStorage.getItem('soomgil.home.recent-searches')).toBeNull()
    expect(wrapper.find('.home-search-history').exists()).toBe(false)
    wrapper.unmount()
  })

  it('사진 재시도 성공 시 오류 안내를 작품 정보로 바꾼다', async () => {
    vi.mocked(awardApi.getAwardPhotos).mockRejectedValueOnce(new Error('offline'))
    const wrapper = render()
    await flushPromises()
    await wrapper.get('.home-photo-status button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.home-photo-status').exists()).toBe(false)
    expect(wrapper.get('.home-artwork-title').text()).toBe('성산일출봉')
    wrapper.unmount()
  })

  it('사진 속 여행지 둘러보기는 전체 검색으로 연결한다', async () => {
    const wrapper = render()
    await flushPromises()
    await wrapper.get('.home-explore-link').trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/search', query: { q: '성산일출봉', tab: '전체' } })
    wrapper.unmount()
  })

  it('장소명이 없으면 지역을 탐색하고, 지역도 없으면 탐색 버튼을 숨긴다', async () => {
    vi.mocked(awardApi.getAwardPhotos).mockResolvedValue([{ ...photo('작품명'), placeName: null }])
    const wrapper = render()
    await flushPromises()
    expect(wrapper.get('.home-explore-link').text()).toContain('여행지 둘러보기')
    await wrapper.get('.home-explore-link').trigger('click')
    expect(push).toHaveBeenCalledWith({ path: '/search', query: { q: '제주', tab: '전체' } })
    wrapper.unmount()
    vi.mocked(awardApi.getAwardPhotos).mockResolvedValue([{ ...photo('작품명'), placeName: null, regionName: null }])
    const unknown = render()
    await flushPromises()
    expect(unknown.find('.home-explore-link').exists()).toBe(false)
    unknown.unmount()
  })

  it('여행계획 세우기는 수상작 제목과 지역을 새 여행 모달로 전달한다', async () => {
    const wrapper = render()
    await flushPromises()
    await wrapper.get('.home-plan-link').trigger('click')
    expect(push).toHaveBeenCalledWith({
      path: '/my-trips',
      query: { create: '1', title: '성산일출봉', destination: '제주' },
    })
    wrapper.unmount()
  })
})
