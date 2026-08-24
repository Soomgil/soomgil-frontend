import { beforeEach, describe, expect, it, vi } from 'vitest'

const refresh = vi.hoisted(() => ({ post: vi.fn() }))

vi.mock('axios', () => ({
  default: {
    create: () => refresh,
  },
}))

import {
  ensureStoredAccessToken,
  getStoredAccessToken,
  refreshStoredAccessToken,
} from './accessToken'

function token(exp: number) {
  const payload = btoa(JSON.stringify({ exp }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
  return `header.${payload}.signature`
}

describe('stored access token', () => {
  beforeEach(() => {
    localStorage.clear()
    refresh.post.mockReset()
  })

  it('유효한 access token은 갱신하지 않고 사용한다', async () => {
    const current = token(Math.floor(Date.now() / 1000) + 60)
    localStorage.setItem('accessToken', current)

    await expect(ensureStoredAccessToken()).resolves.toBe(current)
    expect(refresh.post).not.toHaveBeenCalled()
    expect(getStoredAccessToken()).toBe(current)
  })

  it('만료된 access token을 refresh token으로 갱신한다', async () => {
    const renewed = token(Math.floor(Date.now() / 1000) + 60)
    localStorage.setItem('accessToken', token(1))
    localStorage.setItem('refreshToken', 'refresh-1')
    refresh.post.mockResolvedValue({
      data: { accessToken: renewed, refreshToken: 'refresh-2', expiresIn: 900 },
    })

    await expect(ensureStoredAccessToken()).resolves.toBe(renewed)

    expect(refresh.post).toHaveBeenCalledWith('/auth/refresh', { refreshToken: 'refresh-1' })
    expect(localStorage.getItem('accessToken')).toBe(renewed)
    expect(localStorage.getItem('refreshToken')).toBe('refresh-2')
  })

  it('동시 갱신 요청은 하나의 네트워크 요청을 공유한다', async () => {
    const renewed = token(Math.floor(Date.now() / 1000) + 60)
    localStorage.setItem('refreshToken', 'refresh-1')
    refresh.post.mockResolvedValue({
      data: { accessToken: renewed, refreshToken: 'refresh-2', expiresIn: 900 },
    })

    await expect(Promise.all([
      refreshStoredAccessToken(),
      refreshStoredAccessToken(),
    ])).resolves.toEqual([renewed, renewed])
    expect(refresh.post).toHaveBeenCalledOnce()
  })
})
