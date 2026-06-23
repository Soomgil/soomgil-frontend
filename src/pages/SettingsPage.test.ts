import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSettings, getSessions, getSecurityEvents, updateSettings, logout } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  getSessions: vi.fn(),
  getSecurityEvents: vi.fn(),
  updateSettings: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('@/api/user.api', () => ({
  userApi: { getSettings, getSessions, getSecurityEvents, updateSettings },
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    logout,
    user: { id: 'user-1', email: 'test@example.com', displayName: '테스터', bio: '안녕하세요' },
  }),
}))

import SettingsPage from './SettingsPage.vue'

describe('SettingsPage', () => {
  beforeEach(() => {
    getSettings.mockReset()
    getSessions.mockReset()
    getSecurityEvents.mockReset()
    updateSettings.mockReset()
    logout.mockReset()

    getSettings.mockResolvedValue({
      displayLanguage: 'ko',
      timezone: 'Asia/Seoul',
      marketingEmailOptIn: true,
      tripInviteEmailOptIn: true,
    })
    getSessions.mockResolvedValue({ items: [] })
    getSecurityEvents.mockResolvedValue({ items: [] })
  })

  it('loads account settings on mount and uses option controls', async () => {
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })

    await flushPromises()

    expect(wrapper.text()).not.toContain('불러오는 중')
    
    const selects = wrapper.findAll('select')
    expect((selects[0].element as HTMLSelectElement).value).toBe('ko')
    expect((selects[1].element as HTMLSelectElement).value).toBe('Asia/Seoul')
    expect(wrapper.text()).not.toContain('프로필 저장')
    expect(wrapper.find('textarea').exists()).toBe(false)

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true) // marketing
    expect((checkboxes[1].element as HTMLInputElement).checked).toBe(true) // trip invite
  })

  it('renders actual login session data', async () => {
    getSessions.mockResolvedValue({ items: [{ id: 'session-1', deviceName: 'Chrome', deviceOs: 'Windows', expiresAt: '2026-06-30T00:00:00Z' }] })
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()

    expect(wrapper.text()).toContain('Chrome')
    expect(wrapper.text()).toContain('Windows')
  })

  it('saves settings correctly and shows success message', async () => {
    updateSettings.mockResolvedValue({})
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()

    await wrapper.findAll('input[type="checkbox"]')[0].setValue(false) // toggle marketing
    await wrapper.findAll('button').find((button) => button.text() === '설정 저장')!.trigger('click')

    expect(updateSettings).toHaveBeenCalledWith({
      displayLanguage: 'ko',
      timezone: 'Asia/Seoul',
      marketingEmailOptIn: false,
      tripInviteEmailOptIn: true,
    })

    await flushPromises()
    expect(wrapper.text()).toContain('설정을 저장했습니다.')
  })

  it('triggers logout', async () => {
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === '로그아웃')!.trigger('click')
    expect(logout).toHaveBeenCalled()
  })
})

