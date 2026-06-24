import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BoardingPassCard from './BoardingPassCard.vue'

const qr = vi.hoisted(() => ({ toDataURL: vi.fn() }))
const image = vi.hoisted(() => ({ toPng: vi.fn() }))

vi.mock('qrcode', () => ({ default: qr }))
vi.mock('html-to-image', () => ({ toPng: image.toPng }))
vi.mock('@/stores/auth.store', () => ({
  useAuthStore: () => ({ user: { displayName: '김숨길' } }),
}))

const trip = {
  id: 'trip-qr-1',
  title: '제주도 여행',
  displayDestination: '제주특별자치도',
  startDate: '2026-07-01',
  endDate: '2026-07-04',
  status: 'ACTIVE' as const,
  myRole: 'OWNER' as const,
  itineraryVersion: 2,
  createdAt: '2026-06-20T00:00:00Z',
}

describe('BoardingPassCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    qr.toDataURL.mockResolvedValue('data:image/png;base64,qr')
    image.toPng.mockResolvedValue('data:image/png;base64,ticket')
  })

  it('여행 상세 주소를 담은 실제 QR을 표시한다', async () => {
    const wrapper = mount(BoardingPassCard, { props: { trip } })
    await flushPromises()

    expect(qr.toDataURL).toHaveBeenCalledWith(
      `${window.location.origin}/trips/trip-qr-1/route`,
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    )
    expect(wrapper.get('[data-testid="trip-qr"]').attributes('src')).toBe('data:image/png;base64,qr')
    expect(wrapper.text()).toContain('2026.07.01 - 2026.07.04')
  })

  it('QR이 포함된 티켓을 PNG로 내보낸다', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const wrapper = mount(BoardingPassCard, { props: { trip } })
    await flushPromises()

    await wrapper.get('[data-testid="export-ticket"]').trigger('click')
    await flushPromises()

    expect(image.toPng).toHaveBeenCalledWith(
      wrapper.get('[data-testid="trip-ticket"]').element,
      expect.objectContaining({ pixelRatio: 2, skipFonts: true }),
    )
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
  })
})
