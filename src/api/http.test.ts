import { describe, expect, it } from 'vitest'
import { buildLoginRedirectUrl } from './http'

describe('HTTP authentication redirect', () => {
  it('인증 만료 시 현재 경로와 query 및 hash를 로그인 복귀 주소로 보존한다', () => {
    const redirectUrl = buildLoginRedirectUrl({
      pathname: '/trip-invites/JOIN-ME',
      search: '?source=notification',
      hash: '#accept',
    })

    expect(redirectUrl).toBe(
      '/login?redirect=%2Ftrip-invites%2FJOIN-ME%3Fsource%3Dnotification%23accept',
    )
  })

  it('로그인 요청의 401은 로그인 화면 자기 자신을 복귀 주소로 만들지 않는다', () => {
    expect(buildLoginRedirectUrl({ pathname: '/login', search: '', hash: '' })).toBe('/login')
  })
})
