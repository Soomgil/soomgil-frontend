import axios from 'axios'
import type { ProblemDetail } from '@/types/api'

export type AuthAction = 'login' | 'register' | 'oauth'

export function getAuthErrorMessage(error: unknown, action: AuthAction): string {
  if (!axios.isAxiosError<ProblemDetail>(error)) {
    return '요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }

  if (error.code === 'ECONNABORTED') {
    return '서버 응답이 늦어지고 있습니다. 잠시 후 다시 시도해 주세요.'
  }
  if (!error.response || error.code === 'ERR_NETWORK') {
    return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.'
  }

  const { status, data } = error.response
  if (data?.code === 'EMAIL_ALREADY_USED') return '이미 가입된 이메일입니다. 로그인하거나 다른 이메일을 사용해 주세요.'
  if (data?.code === 'VALIDATION_FAILED') return '입력한 정보를 다시 확인해 주세요.'
  if (status === 429) return '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'
  if (status >= 500) return '서버에 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
  if (action === 'login' && status === 401) return '이메일 또는 비밀번호가 올바르지 않습니다.'
  if (action === 'oauth') return '간편 로그인을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  return action === 'register'
    ? '회원가입을 완료하지 못했습니다. 입력 내용을 확인하고 다시 시도해 주세요.'
    : '로그인하지 못했습니다. 다시 시도해 주세요.'
}
