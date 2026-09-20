import { createPinia, setActivePinia } from 'pinia'
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { LegalRegion } from '@/types/geo'

const mocks = vi.hoisted(() => ({
  votingApi: { getCurrentSession: vi.fn(), openSession: vi.fn() },
  geo: { searchLegalRegions: vi.fn() },
}))

vi.mock('@/api/voting.api', () => ({ votingApi: mocks.votingApi }))
vi.mock('@/api/geo.api', () => ({ geoApi: mocks.geo }))

import OwnerVoteSetupPanel from './OwnerVoteSetupPanel.vue'
import { useVotingStore } from '@/stores/voting.store'

const jejuSi: LegalRegion = {
  code: '5011000000', name: '제주시', fullName: '제주특별자치도 제주시',
  level: 'SIGUNGU', parentCode: '5000000000', isActive: true,
}
const seogwipo: LegalRegion = {
  code: '5013000000', name: '서귀포시', fullName: '제주특별자치도 서귀포시',
  level: 'SIGUNGU', parentCode: '5000000000', isActive: true,
}

function emptyPage() {
  return { items: [], page: { page: 0, size: 10, totalElements: 0, totalPages: 0, sort: [] } }
}

function mountPanel(
  props: Partial<{ tripRegions: LegalRegion[]; tripDestination: string | null; tripDays: number | null }> = {},
) {
  return mount(OwnerVoteSetupPanel, {
    props: { tripTitle: '제주 여행', tripRegions: [jejuSi], tripDestination: '제주', tripDays: 3, ...props },
  })
}

function count(wrapper: ReturnType<typeof mountPanel>, id: string) {
  return wrapper.get(`[data-testid="${id}"]`).text()
}

describe('OwnerVoteSetupPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    useVotingStore().tripId = 'trip-1'
    mocks.votingApi.openSession.mockResolvedValue({ id: 'session-1' })
    mocks.votingApi.getCurrentSession.mockResolvedValue({
      hasSession: true, nextScreen: 'VOTE', session: null, myParticipation: null,
    })
    mocks.geo.searchLegalRegions.mockResolvedValue(emptyPage())
  })

  afterEach(() => vi.useRealTimers())

  it('여행방 지역을 투표 지역 칩으로 미리 채운다', () => {
    const wrapper = mountPanel()

    expect(wrapper.get('.vote-setup__title').text()).toBe('새 투표를 시작할까요?')
    expect(wrapper.text()).toContain('투표할 지역')
    expect(wrapper.text()).toContain('하루 방문 수')
    const chips = wrapper.findAll('[data-testid="setup-region-chip"]')
    expect(chips).toHaveLength(1)
    expect(chips[0].text()).toContain('제주시')
  })

  it('하루에 갈 곳 수를 범위 안에서 조절한다', async () => {
    const wrapper = mountPanel({ tripDays: 3 })

    expect(count(wrapper, 'setup-per-day-count')).toBe('3')

    await wrapper.get('[data-testid="setup-per-day-plus"]').trigger('click')
    expect(count(wrapper, 'setup-per-day-count')).toBe('4')

    for (let i = 0; i < 6; i += 1) await wrapper.get('[data-testid="setup-per-day-minus"]').trigger('click')
    expect(count(wrapper, 'setup-per-day-count')).toBe('1')

    for (let i = 0; i < 10; i += 1) await wrapper.get('[data-testid="setup-per-day-plus"]').trigger('click')
    expect(count(wrapper, 'setup-per-day-count')).toBe('6')
  })

  it('여행 일수를 모르면 2일로 가정하고 그 사실을 알려준다', () => {
    const wrapper = mountPanel({ tripDays: null })

    expect(wrapper.text()).toContain('2일')
    expect(wrapper.find('.vote-setup__suggest').exists()).toBe(false)
  })

  it('시작하면 제안된 개수와 지역 코드를 함께 보낸다', async () => {
    const wrapper = mountPanel({ tripDays: 3 })

    await wrapper.get('[data-testid="setup-open"]').trigger('click')
    await flushPromises()

    expect(mocks.votingApi.openSession).toHaveBeenCalledWith('trip-1', {
      stickerAllowance: 5,
      selectionCount: 9,
      candidateCount: 18,
      legalRegionCodes: ['5011000000'],
    })
    expect(wrapper.emitted('opened')).toHaveLength(1)
  })

  it('검색으로 지역을 추가하고 칩을 지울 수 있다', async () => {
    vi.useFakeTimers()
    mocks.geo.searchLegalRegions.mockResolvedValue({
      items: [seogwipo], page: { page: 0, size: 10, totalElements: 1, totalPages: 1, sort: [] },
    })
    const wrapper = mountPanel()

    await wrapper.get('input[name="voteRegion"]').setValue('서귀포')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.get('[role="option"]').trigger('click')

    const names = wrapper.findAll('[data-testid="setup-region-chip"]').map((chip) => chip.text())
    expect(names.some((name) => name.includes('제주시'))).toBe(true)
    expect(names.some((name) => name.includes('서귀포시'))).toBe(true)

    await wrapper.findAll('[data-testid="setup-region-remove"]')[0].trigger('click')
    const remaining = wrapper.findAll('[data-testid="setup-region-chip"]')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].text()).toContain('서귀포시')
  })

  it('지역도 목적지도 없으면 시작할 수 없다', () => {
    const wrapper = mountPanel({ tripRegions: [], tripDestination: null })

    expect(wrapper.get('[data-testid="setup-open"]').attributes('disabled')).toBeDefined()
    expect(wrapper.text()).toContain('후보를 찾으려면 지역을 하나 이상 선택해 주세요')
  })
})
