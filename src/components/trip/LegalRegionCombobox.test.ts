import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { geoApi } from '@/api/geo.api'
import LegalRegionCombobox from './LegalRegionCombobox.vue'

vi.mock('@/api/geo.api', () => ({
  geoApi: { searchLegalRegions: vi.fn() },
}))

const region = {
  code: '2600000000',
  name: '부산광역시',
  fullName: '부산광역시',
  level: 'SIDO' as const,
  parentCode: null,
  isActive: true,
}

describe('LegalRegionCombobox', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
  })

  afterEach(() => vi.useRealTimers())

  it('입력을 지연 검색하고 선택한 법정동을 전달한다', async () => {
    vi.mocked(geoApi.searchLegalRegions).mockResolvedValue({
      items: [region],
      page: { page: 0, size: 10, totalElements: 1, totalPages: 1, sort: [] },
    })
    const wrapper = mount(LegalRegionCombobox, {
      props: { id: 'destination', modelValue: '' },
    })

    await wrapper.get('input').setValue('부산')
    expect(geoApi.searchLegalRegions).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(300)

    const signal = vi.mocked(geoApi.searchLegalRegions).mock.calls[0]?.[1]
    expect(geoApi.searchLegalRegions).toHaveBeenCalledWith({
      q: '부산',
      isActive: true,
      page: 0,
      size: 10,
    }, expect.any(AbortSignal))
    expect(signal?.aborted).toBe(false)

    await wrapper.get('[role="option"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual(['부산광역시'])
    expect(wrapper.emitted('select')?.at(-1)).toEqual([region])
    expect(wrapper.find('[role="listbox"]').exists()).toBe(false)
  })

  it('새 입력이 들어오면 이전 검색 요청을 취소한다', async () => {
    vi.mocked(geoApi.searchLegalRegions).mockReturnValue(new Promise(() => undefined))
    const wrapper = mount(LegalRegionCombobox, {
      props: { id: 'destination', modelValue: '' },
    })

    await wrapper.get('input').setValue('부산')
    await vi.advanceTimersByTimeAsync(300)
    const firstSignal = vi.mocked(geoApi.searchLegalRegions).mock.calls[0]?.[1]

    await wrapper.get('input').setValue('서울')

    expect(firstSignal?.aborted).toBe(true)
    expect(wrapper.emitted('select')?.at(-1)).toEqual([null])
  })
})
