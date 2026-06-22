import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSettings, updateMe, updateSettings, logout } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateMe: vi.fn(),
  updateSettings: vi.fn(),
  logout: vi.fn(),
}))

vi.mock('@/api/user.api', () => ({
  userApi: { getSettings, updateMe, updateSettings },
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
    updateMe.mockReset()
    updateSettings.mockReset()
    logout.mockReset()

    getSettings.mockResolvedValue({
      displayLanguage: 'ko',
      timezone: 'Asia/Seoul',
      marketingEmailOptIn: true,
      tripInviteEmailOptIn: true,
    })
  })

  it('loads user profile and settings on mount', async () => {
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })

    await flushPromises()

    expect(wrapper.text()).not.toContain('불러오는 중')
    
    // Check if the input models are populated properly
    const inputs = wrapper.findAll('input[type="text"]')
    // displayName, displayLanguage, timezone
    expect(inputs[0].element.value).toBe('테스터')
    expect(inputs[1].element.value).toBe('ko')
    expect(inputs[2].element.value).toBe('Asia/Seoul')

    const textareas = wrapper.findAll('textarea')
    expect(textareas[0].element.value).toBe('안녕하세요')

    const checkboxes = wrapper.findAll('input[type="checkbox"]')
    expect(checkboxes[0].element.checked).toBe(true) // marketing
    expect(checkboxes[1].element.checked).toBe(true) // trip invite
  })

  it('saves profile correctly and shows success message', async () => {
    updateMe.mockResolvedValue({})
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()

    await wrapper.findAll('input[type="text"]')[0].setValue('새이름')
    await wrapper.findAll('button')[0].trigger('click') // Profile Save button

    expect(updateMe).toHaveBeenCalledWith({
      displayName: '새이름',
      bio: '안녕하세요',
    })

    await flushPromises()
    expect(wrapper.text()).toContain('프로필을 저장했습니다.')
  })

  it('saves settings correctly and shows success message', async () => {
    updateSettings.mockResolvedValue({})
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()

    await wrapper.findAll('input[type="checkbox"]')[0].setValue(false) // toggle marketing
    await wrapper.findAll('button')[1].trigger('click') // Settings Save button

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

    await wrapper.findAll('button')[2].trigger('click') // Logout button
    expect(logout).toHaveBeenCalled()
  })
})
