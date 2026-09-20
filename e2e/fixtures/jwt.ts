/**
 * 테스트용 가짜 JWT 생성기.
 *
 * 프런트는 서명을 검증하지 않고 payload의 `exp`(초 단위)만 클라이언트에서 확인한다
 * (src/auth/accessToken.ts의 isUsableAccessToken). 따라서 exp가 충분히 미래인
 * base64url JWT면 "사용 가능한 토큰"으로 취급된다.
 */
function base64url(input: string): string {
  return Buffer.from(input, 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export function makeFakeJwt(claims: Record<string, unknown> = {}, ttlSeconds = 60 * 60): string {
  const header = { alg: 'HS256', typ: 'JWT' }
  const payload = {
    sub: 'user-1',
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    iat: Math.floor(Date.now() / 1000),
    ...claims,
  }
  const signature = 'e2e-signature-not-verified'
  return `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}.${signature}`
}

/** 이미 만료된 토큰(경계값 테스트용). */
export function makeExpiredJwt(claims: Record<string, unknown> = {}): string {
  return makeFakeJwt(claims, -60)
}
