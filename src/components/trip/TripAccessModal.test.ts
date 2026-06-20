import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TripAccessModal from './TripAccessModal.vue'
import type { TripSummary } from '@/types/trip'

const store = vi.hoisted(() => ({
  accessLoading: false,
  accessError: null as string | null,
  members: [
    {
      id: 'member-1',
      tripId: 'trip-1',
      user: { id: 'user-1', displayName: '김지훈', profileImageUrl: null },
      role: 'MEMBER' as const,
      accessRole: 'OWNER' as const,
      status: 'ACTIVE' as const,
      joinedAt: '2026-06-20T00:00:00Z',
    },
  ],
  invites: [
    {
      id: 'invite-1',
      tripId: 'trip-1',
      inviteCode: 'JOIN-ME',
      inviteUrl: null,
      inviteeUserId: null,
      status: 'PENDING' as const,
      expiresAt: null,
      createdAt: '2026-06-20T00:00:00Z',
    },
  ],
  fetchTripAccess: vi.fn().mockResolvedValue(undefined),
  createInvite: vi.fn().mockResolvedValue(undefined),
  revokeInvite: vi.fn().mockResolvedValue(undefined),
  removeMember: vi.fn().mockResolvedValue(undefined),
}))

vi.mock('@/stores/trip.store', () => ({ useTripStore: () => store }))

const trip: TripSummary = {
  id: 'trip-1',
  title: '부산 여행',
  displayDestination: '부산광역시',
  status: 'ACTIVE',
  myRole: 'OWNER',
  itineraryVersion: 0,
  createdAt: '2026-06-20T00:00:00Z',
}

describe('TripAccessModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    })
  })

  it('방장에게 멤버와 초대 코드를 표시하고 새 코드를 생성한다', async () => {
    const wrapper = mount(TripAccessModal, {
      props: { open: true, trip },
    })

    expect(store.fetchTripAccess).toHaveBeenCalledWith(trip.id, true)
    expect(wrapper.text()).toContain('김지훈')
    expect(wrapper.text()).toContain('JOIN-ME')

    await wrapper.get('button.compact').trigger('click')

    expect(store.createInvite).toHaveBeenCalledWith(trip.id)
  })

  it('닫기 버튼으로 close 이벤트를 보낸다', async () => {
    const wrapper = mount(TripAccessModal, {
      props: { open: true, trip },
    })

    await wrapper.get('button[aria-label="닫기"]').trigger('click')

    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('초대 코드를 로그인 복귀가 가능한 딥링크로 복사한다', async () => {
    const wrapper = mount(TripAccessModal, {
      props: { open: true, trip },
    })

    await wrapper.get('button[aria-label="JOIN-ME 복사"]').trigger('click')

    const copiedValue = vi.mocked(navigator.clipboard.writeText).mock.calls[0][0]
    expect(copiedValue).toMatch(/\/trip-invites\/JOIN-ME$/)
  })
})
