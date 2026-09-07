import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { getSettings, updateSettings, deleteMe, logout, toastSuccess, updateMe } = vi.hoisted(() => ({
  getSettings: vi.fn(),
  updateSettings: vi.fn(),
  deleteMe: vi.fn(),
  logout: vi.fn(),
  toastSuccess: vi.fn(),
  updateMe: vi.fn(),
}))

vi.mock('@/api/user.api', () => ({
  userApi: { getSettings, updateSettings, deleteMe, updateMe },
}))

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    logout,
    user: { id: 'user-1', email: 'test@example.com', displayName: '테스터', bio: '안녕하세요' },
  }),
}))

vi.mock('@/composables/useToast', () => ({
  useToast: () => ({ success: toastSuccess, error: vi.fn(), info: vi.fn() }),
}))
import SettingsPage from './SettingsPage.vue'

describe('SettingsPage', () => {
  beforeEach(() => {
    getSettings.mockReset()
    updateSettings.mockReset()
    deleteMe.mockReset()
    logout.mockReset()
    toastSuccess.mockReset()

    getSettings.mockResolvedValue({
      displayLanguage: 'ko',
      timezone: 'Asia/Seoul',
      marketingEmailOptIn: true,
      tripInviteEmailOptIn: true,
    })
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

  it('does not display logout button and only retains account deletion in account management', async () => {
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()

    const logoutButton = wrapper.findAll('button').find((button) => button.text() === '로그아웃')
    expect(logoutButton).toBeUndefined()
    expect(wrapper.findAll('button').find((button) => button.text() === '계정 탈퇴')!.exists()).toBe(true)
  })

  it('allows updating profile visibility between public and private', async () => {
    updateMe.mockResolvedValue({})
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()

    const privateBtn = wrapper.findAll('button').find((button) => button.text().includes('비공개'))!
    await privateBtn.trigger('click')

    expect(updateMe).toHaveBeenCalledWith({ profileVisibility: 'PRIVATE' })
    await flushPromises()
    expect(toastSuccess).toHaveBeenCalledWith('비공개 계정으로 변경되었습니다.')
  })

  it('deletes the account immediately after confirmation and logs out', async () => {
    deleteMe.mockResolvedValue(undefined)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const wrapper = mount(SettingsPage, {
      global: { stubs: { AppShell: { template: '<div><slot /></div>' } } },
    })
    await flushPromises()

    await wrapper.findAll('button').find((button) => button.text() === '계정 탈퇴')!.trigger('click')
    await flushPromises()

    expect(deleteMe).toHaveBeenCalledOnce()
    expect(logout).toHaveBeenCalledOnce()
    expect(toastSuccess).toHaveBeenCalledWith('회원 탈퇴가 완료되었습니다.')
    vi.restoreAllMocks()
  })
})

