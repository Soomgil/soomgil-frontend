import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import RouteTransportPanel from './RouteTransportPanel.vue'
import type { TripRoute } from '@/types/itinerary'

const route: TripRoute = {
  id: 'route-1', originItineraryItemId: 'a', destinationItineraryItemId: 'b', mode: 'WALKING',
  provider: 'MAPBOX', providerProfile: 'mapbox/walking', geometryFormat: 'GEOJSON', geometry: {},
  distanceMeters: 1350, durationSeconds: 780, confidence: null,
}
const props = { mode: 'WALKING' as const, routes: [route], names: { a: '잠실역', b: '올림픽공원' }, busy: false }

describe('RouteTransportPanel', () => {
  it('세 가지 이동수단을 선택하고 실제 구간의 거리와 시간을 표시한다', async () => {
    const wrapper = mount(RouteTransportPanel, { props })
    expect(wrapper.text()).toContain('잠실역 → 올림픽공원')
    expect(wrapper.text()).toContain('1.4km · 약 13분')
    await wrapper.findAll('button')[1]!.trigger('click')
    expect(wrapper.emitted('update:mode')).toEqual([['CYCLING']])
    await wrapper.find('select').setValue('DRIVING')
    expect(wrapper.emitted('changeRoute')).toEqual([['route-1', 'DRIVING']])
    expect(wrapper.find('select').element.value).toBe('WALKING')
  })

  it('계산 중에는 구간과 이동수단을 중복 변경할 수 없다', () => {
    const wrapper = mount(RouteTransportPanel, { props: { ...props, busy: true } })
    expect(wrapper.findAll('button').every(button => button.element.disabled)).toBe(true)
    expect(wrapper.find('select').element.disabled).toBe(true)
  })

  it('과거 직접 그린 선을 계산된 경로로 표시하지 않는다', () => {
    const wrapper = mount(RouteTransportPanel, { props: { ...props, routes: [{ ...route, provider: 'USER_TRACE' }] } })
    expect(wrapper.text()).toContain('경로 미확인')
    expect(wrapper.text()).not.toContain('약 13분')
  })
})
