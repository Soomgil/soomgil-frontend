import { mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import TripSettingsModal from './TripSettingsModal.vue'
import type { TripDetail, TripSummary } from '@/types/trip'

const geo = vi.hoisted(() => ({ searchLegalRegions: vi.fn() }))
const tripApiMock = vi.hoisted(() => ({
  getInvites: vi.fn(),
  createInvite: vi.fn(),
}))

const store = vi.hoisted(() => ({
  mutating: false,
  updateTrip: vi.fn(),
  deleteTrip: vi.fn(),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))
vi.mock('@/api/geo.api', () => ({ geoApi: geo }))
vi.mock('@/api/trip.api', () => ({ tripApi: tripApiMock }))

const trip: TripSummary = {
  id: 'trip-1',
  title: '부산 여행',
  displayDestination: '부산광역시',
  status: 'ACTIVE',
  myRole: 'OWNER',
  itineraryVersion: 0,
  createdAt: '2026-06-20T00:00:00Z',
}

const expectedBaseUpdate = {
  startDate: null,
  endDate: null,
}

describe('TripSettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
    geo.searchLegalRegions.mockResolvedValue({
      items: [],
      page: { page: 0, size: 10, totalElements: 0, totalPages: 0, sort: [] },
    })
    tripApiMock.getInvites.mockResolvedValue([])
    tripApiMock.createInvite.mockResolvedValue({
      id: 'invite-1',
      tripId: trip.id,
      inviteCode: 'abc123',
      inviteUrl: 'https://soomgil.test/invite/abc123',
      inviteeUserId: null,
      status: 'PENDING',
      expiresAt: null,
      createdAt: '2026-06-20T00:00:00Z',
    })
  })

  afterEach(() => vi.useRealTimers())

  it('수정한 제목과 상태를 저장한다', async () => {
    store.updateTrip.mockResolvedValue({ ...trip, title: '여름 부산 여행', status: 'ARCHIVED' })
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="title"]').setValue('여름 부산 여행')
    await wrapper.get('button[data-status="ARCHIVED"]').trigger('click')
    await wrapper.get('form').trigger('submit')

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '여름 부산 여행',
      displayDestination: '부산광역시',
      ...expectedBaseUpdate,
      status: 'ARCHIVED',
    })
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('목적지를 직접 변경하면 기존 법정동 연결을 제거한다', async () => {
    store.updateTrip.mockResolvedValue({ ...trip, displayDestination: '남해' })
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="displayDestination"]').setValue('남해')
    await wrapper.get('form').trigger('submit')

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '부산 여행',
      displayDestination: '남해',
      legalRegionCodes: [],
      ...expectedBaseUpdate,
      status: 'ACTIVE',
    })
  })

  it('목적지를 원래 값으로 되돌리면 기존 법정동 연결을 유지한다', async () => {
    store.updateTrip.mockResolvedValue(trip)
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="displayDestination"]').setValue('서울')
    await wrapper.get('input[name="displayDestination"]').setValue('부산광역시')
    await wrapper.get('form').trigger('submit')

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '부산 여행',
      displayDestination: '부산광역시',
      ...expectedBaseUpdate,
      status: 'ACTIVE',
    })
  })

  it('일정 페이지가 아니어도 여행 기간을 바로 수정해 저장한다', async () => {
    store.updateTrip.mockResolvedValue({
      ...trip,
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    })
    const wrapper = mount(TripSettingsModal, {
      props: { open: true, trip },
      global: {
        mocks: {
          $route: { name: 'MyTrips' },
        },
      },
    })

    const startDateInput = wrapper.get('[data-testid="trip-start-date"]')
    const endDateInput = wrapper.get('[data-testid="trip-end-date"]')

    expect((startDateInput.element as HTMLInputElement).disabled).toBe(false)
    expect((endDateInput.element as HTMLInputElement).disabled).toBe(false)
    expect(wrapper.text()).not.toContain('일정 페이지에서만 수정 가능')

    await startDateInput.setValue('2026-07-10')
    await endDateInput.setValue('2026-07-12')
    await wrapper.get('form').trigger('submit')

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '부산 여행',
      displayDestination: '부산광역시',
      startDate: '2026-07-10',
      endDate: '2026-07-12',
      status: 'ACTIVE',
    })
    expect(wrapper.emitted('saved')).toEqual([[trip.id, {
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    }]])
  })

  it('일반 멤버도 여행 정보는 저장하되 소유자 전용 상태 값은 보내지 않는다', async () => {
    const memberTrip: TripSummary = { ...trip, myRole: 'MEMBER' }
    store.updateTrip.mockResolvedValue({
      ...memberTrip,
      title: '수정한 부산 여행',
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    })
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip: memberTrip } })

    await wrapper.get('input[name="title"]').setValue('수정한 부산 여행')
    await wrapper.get('[data-testid="trip-start-date"]').setValue('2026-07-10')
    await wrapper.get('[data-testid="trip-end-date"]').setValue('2026-07-12')
    await wrapper.get('form').trigger('submit')

    expect(wrapper.find('[data-status="ARCHIVED"]').exists()).toBe(false)
    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '수정한 부산 여행',
      displayDestination: '부산광역시',
      startDate: '2026-07-10',
      endDate: '2026-07-12',
    })
  })

  it('멤버 관리 탭에서 실제 멤버 프로필 이름과 이미지를 표시한다', () => {
    const detailTrip: TripDetail = {
      ...trip,
      ownerUserId: 'user-1',
      regions: [],
      retrippedFromPostId: null,
      members: [
        {
          id: 'member-1',
          tripId: trip.id,
          role: 'OWNER',
          accessRole: 'OWNER',
          status: 'ACTIVE',
          joinedAt: '2026-06-20T00:00:00Z',
          user: {
            id: 'user-1',
            displayName: '김지훈',
            profileImageUrl: 'https://cdn.example.com/user-1.jpg',
          },
        },
        {
          id: 'member-2',
          tripId: trip.id,
          role: 'MEMBER',
          accessRole: 'MEMBER',
          status: 'ACTIVE',
          joinedAt: '2026-06-21T00:00:00Z',
          user: {
            id: 'user-2',
            displayName: '박민지',
            profileImageUrl: null,
          },
        },
      ],
    }

    const wrapper = mount(TripSettingsModal, {
      props: { open: true, trip: detailTrip, defaultTab: 'tab-members' },
    })

    const items = wrapper.findAll('.member-item')
    expect(items).toHaveLength(2)
    expect(items[0].text()).toContain('김지훈')
    expect(items[0].text()).toContain('방장')
    expect(items[0].get('img').attributes('src')).toBe('https://cdn.example.com/user-1.jpg')
    expect(items[0].get('img').attributes('alt')).toBe('김지훈 프로필 사진')
    expect(items[1].text()).toContain('박민지')
    expect(items[1].text()).toContain('멤버')
    expect(items[1].text()).toContain('박')
  })

  it('기존 대기 초대의 inviteUrl이 없어도 공유 링크를 만들어 표시한다', async () => {
    tripApiMock.getInvites.mockResolvedValue([
      {
        id: 'invite-existing',
        tripId: trip.id,
        inviteCode: 'JOIN ME',
        inviteUrl: null,
        inviteeUserId: null,
        status: 'PENDING',
        expiresAt: null,
        createdAt: '2026-06-20T00:00:00Z',
      },
    ])
    const wrapper = mount(TripSettingsModal, {
      props: { open: true, trip, defaultTab: 'tab-members' },
    })

    await vi.waitFor(() => {
      expect(wrapper.get('input[aria-label="초대 링크"]').element).toHaveProperty(
        'value',
        `${window.location.origin}/trip-invites/JOIN%20ME`,
      )
    })
    expect(tripApiMock.createInvite).not.toHaveBeenCalled()
  })

  it('초대 링크 복사 버튼으로 표시된 공유 링크를 복사한다', async () => {
    const wrapper = mount(TripSettingsModal, {
      props: { open: true, trip, defaultTab: 'tab-members' },
    })

    await vi.waitFor(() => {
      expect(wrapper.get('input[aria-label="초대 링크"]').element).toHaveProperty(
        'value',
        'https://soomgil.test/invite/abc123',
      )
    })
    await wrapper.get('.invite-action-btn--primary').trigger('click')

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('https://soomgil.test/invite/abc123')
  })

  it('검색 결과를 선택하면 법정동 연결을 교체한다', async () => {
    vi.useFakeTimers()
    geo.searchLegalRegions.mockResolvedValue({
      items: [{
        code: '1100000000', name: '서울특별시', fullName: '서울특별시',
        level: 'SIDO', parentCode: null, isActive: true,
      }],
      page: { page: 0, size: 10, totalElements: 1, totalPages: 1, sort: [] },
    })
    store.updateTrip.mockResolvedValue({ ...trip, displayDestination: '서울특별시' })
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('input[name="displayDestination"]').setValue('서울')
    await vi.advanceTimersByTimeAsync(300)
    await wrapper.get('[role="option"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    await Promise.resolve()

    expect(store.updateTrip).toHaveBeenCalledWith(trip.id, {
      title: '부산 여행',
      displayDestination: '서울특별시',
      legalRegionCodes: ['1100000000'],
      ...expectedBaseUpdate,
      status: 'ACTIVE',
    })
    wrapper.unmount()
  })

  it('삭제 확인 후 여행을 삭제하고 deleted 이벤트를 보낸다', async () => {
    store.deleteTrip.mockResolvedValue(undefined)
    const wrapper = mount(TripSettingsModal, { props: { open: true, trip } })

    await wrapper.get('[data-testid="delete-open"]').trigger('click')
    await wrapper.get('[data-testid="delete-confirm"]').trigger('click')

    expect(store.deleteTrip).toHaveBeenCalledWith(trip.id)
    expect(wrapper.emitted('deleted')).toEqual([[trip.id]])
  })
})
