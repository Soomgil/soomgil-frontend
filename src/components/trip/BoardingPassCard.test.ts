import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import BoardingPassCard from './BoardingPassCard.vue'

const qr = vi.hoisted(() => ({ toDataURL: vi.fn() }))
const image = vi.hoisted(() => ({ toPng: vi.fn() }))
const tripApiMock = vi.hoisted(() => ({
  getInvites: vi.fn(),
  createInvite: vi.fn(),
}))

vi.mock('qrcode', () => ({ default: qr }))
vi.mock('html-to-image', () => ({ toPng: image.toPng }))
vi.mock('@/api/trip.api', () => ({ tripApi: tripApiMock }))
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
    tripApiMock.getInvites.mockResolvedValue([{
      id: 'invite-1',
      tripId: trip.id,
      inviteCode: 'JOIN-ME',
      inviteUrl: null,
      inviteeUserId: null,
      status: 'PENDING',
      expiresAt: null,
      createdAt: '2026-06-20T00:00:00Z',
    }])
    tripApiMock.createInvite.mockResolvedValue({
      id: 'invite-2',
      tripId: trip.id,
      inviteCode: 'NEW-JOIN',
      inviteUrl: null,
      inviteeUserId: null,
      status: 'PENDING',
      expiresAt: null,
      createdAt: '2026-06-20T00:00:00Z',
    })
  })

  it('방장 티켓에는 초대 링크를 담은 실제 QR을 표시한다', async () => {
    const wrapper = mount(BoardingPassCard, { props: { trip } })
    await flushPromises()

    expect(qr.toDataURL).toHaveBeenCalledWith(
      `${window.location.origin}/trip-invites/JOIN-ME`,
      expect.objectContaining({ errorCorrectionLevel: 'M' }),
    )
    expect(tripApiMock.createInvite).not.toHaveBeenCalled()
    expect(wrapper.get('[data-testid="trip-qr"]').attributes('src')).toBe('data:image/png;base64,qr')
    expect(wrapper.text()).toContain('2026.07.01 - 2026.07.04')
    expect(wrapper.find('.stub-qr-copy').exists()).toBe(false)
    expect(wrapper.get('.ticket-qr-label').text()).toBe('SCAN TO JOIN')
    expect(wrapper.get('.stub-role-badge').text()).toBe('방장')
    expect(wrapper.find('.stub-passenger-meta').exists()).toBe(false)
    expect(wrapper.find('.stub-manage-actions').exists()).toBe(false)
    expect(wrapper.find('.stub-controls').exists()).toBe(false)
    expect(wrapper.get('.stub-detail-btn').text()).toContain('여행 계획 열기')
    expect(wrapper.text()).toContain('TRIP RESERVATION')
    expect(wrapper.text()).not.toContain('PASSENGER')
    expect(wrapper.text()).toContain('STATUS')
    expect(wrapper.text()).toContain('여행 준비 중')
    expect(wrapper.text()).toContain('DEPARTURE')
    expect(wrapper.text()).toContain('2026.07.01')
    expect(wrapper.text()).toContain('RETURN')
    expect(wrapper.text()).toContain('2026.07.04')
    expect(wrapper.text()).toContain('DESTINATION')
    expect(wrapper.text()).not.toContain('FLIGHT')
    expect(wrapper.text()).not.toContain('SEAT')
    expect(wrapper.text()).not.toContain('GATE')
    expect(wrapper.find('.material-symbols-rounded.plane-icon').exists()).toBe(false)
    expect(wrapper.get('.stub-date-label').text()).toBe('DATE')
  })

  it('QR이 포함된 티켓을 PNG로 내보낸다', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    const wrapper = mount(BoardingPassCard, { props: { trip } })
    await flushPromises()

    await wrapper.get('[data-testid="export-ticket"]').trigger('click')
    await flushPromises()

    expect(image.toPng).toHaveBeenCalledWith(
      wrapper.get('[data-testid="trip-ticket"]').element,
      expect.objectContaining({ pixelRatio: 2 }),
    )
    expect(image.toPng.mock.calls[0]?.[1]).not.toHaveProperty('skipFonts')
    expect(click).toHaveBeenCalledOnce()
    click.mockRestore()
  })
})
