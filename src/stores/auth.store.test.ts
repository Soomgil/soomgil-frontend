import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { ensureStoredAccessToken, getMe, setLocale } = vi.hoisted(() => ({
  ensureStoredAccessToken: vi.fn(),
  getMe: vi.fn(),
  setLocale: vi.fn(),
}))

vi.mock('@/auth/accessToken', () => ({ ensureStoredAccessToken }))
vi.mock('@/api/user.api', () => ({ userApi: { getMe } }))
vi.mock('@/i18n', () => ({ setLocale }))

import { useAuthStore } from './auth.store'

const user = {
  id: 'user-1',
  email: 'traveler@example.com',
  displayName: '여행자',
  profileImageUrl: null,
  profileMediaFileId: null,
  bio: '소개',
  profileVisibility: 'PUBLIC' as const,
  status: 'ACTIVE' as const,
  displayLanguage: 'ko',
  tripInviteEmailOptIn: true,
  lastLoginAt: null,
  createdAt: '2026-09-07T00:00:00Z',
}

describe('auth store initialization', () => {
  beforeEach(() => {
    localStorage.clear()
    ensureStoredAccessToken.mockReset()
    getMe.mockReset()
    setLocale.mockReset()
    setActivePinia(createPinia())
  })

  it('restores the access token and current user after a page reload', async () => {
    localStorage.setItem('refreshToken', 'refresh-token')
    ensureStoredAccessToken.mockResolvedValue('renewed-access-token')
    getMe.mockResolvedValue(user)
    const auth = useAuthStore()

    await auth.initialize()

    expect(auth.token).toBe('renewed-access-token')
    expect(auth.user).toEqual(user)
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.initialized).toBe(true)
    expect(setLocale).toHaveBeenCalledWith('ko')
  })

  it('runs concurrent initialization only once', async () => {
    ensureStoredAccessToken.mockResolvedValue('access-token')
    getMe.mockResolvedValue(user)
    const auth = useAuthStore()

    await Promise.all([auth.initialize(), auth.initialize()])

    expect(ensureStoredAccessToken).toHaveBeenCalledOnce()
    expect(getMe).toHaveBeenCalledOnce()
  })

  it('keeps the visitor logged out when no stored session exists', async () => {
    ensureStoredAccessToken.mockResolvedValue(null)
    const auth = useAuthStore()

    await auth.initialize()

    expect(auth.isAuthenticated).toBe(false)
    expect(auth.user).toBeNull()
    expect(auth.initialized).toBe(true)
    expect(getMe).not.toHaveBeenCalled()
  })
})
