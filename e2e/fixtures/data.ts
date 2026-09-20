import type { BackendUser, AuthTokenResponse } from '@/types/auth'
import type { OnboardingPreferenceSurvey } from '@/types/onboarding'
import type { TripVoteSessionState } from '@/types/voting'
import { makeFakeJwt } from './jwt'

/**
 * 핵심 엔티티 팩토리. 모든 필드에 합리적 기본값을 주고, 테스트에서 부분 override 한다.
 * (백엔드는 응답 본문을 감싸지 않고 raw 객체를 그대로 내려준다 — src/api/*.api.ts 참고)
 */

export function backendUser(overrides: Partial<BackendUser> = {}): BackendUser {
  const { profile, settings, ...rest } = overrides
  return {
    id: 'user-1',
    primaryEmail: 'demo01@soomgil.test',
    primaryEmailVerifiedAt: '2026-01-01T00:00:00Z',
    status: 'ACTIVE',
    statusReason: null,
    deletionRequestedAt: null,
    deletionScheduledAt: null,
    createdAt: '2026-01-01T00:00:00Z',
    ...rest,
    profile: {
      displayName: '데모유저',
      profileImageUrl: null,
      profileMediaFileId: null,
      bio: '여행을 좋아합니다.',
      profileVisibility: 'PUBLIC',
      ...(profile ?? {}),
    },
    settings: {
      displayLanguage: 'ko',
      timezone: 'Asia/Seoul',
      marketingEmailOptIn: false,
      marketingEmailOptedInAt: null,
      marketingEmailOptedOutAt: null,
      tripInviteEmailOptIn: true,
      ...(settings ?? {}),
    },
  }
}

export function authToken(overrides: Partial<AuthTokenResponse> = {}): AuthTokenResponse {
  const user = overrides.user ?? backendUser()
  return {
    accessToken: makeFakeJwt({ sub: user.id }),
    refreshToken: 'refresh-token-e2e',
    tokenType: 'Bearer',
    expiresIn: 3600,
    user,
    onboarded: true,
    ...overrides,
  }
}

/** 기본: 온보딩 완료 상태 (가드가 온보딩 페이지로 튕기지 않게). */
export function onboardingSurvey(overrides: Partial<OnboardingPreferenceSurvey> = {}): OnboardingPreferenceSurvey {
  return {
    surveyVersionId: 'survey-v1',
    code: 'ONBOARDING_PREF',
    requiredPlaceCount: 5,
    completedAt: '2026-01-02T00:00:00Z',
    completed: true,
    places: [],
    ...overrides,
  }
}

/** 온보딩 미완료 + 카드 N장. */
export function onboardingSurveyPending(placeCount = 8): OnboardingPreferenceSurvey {
  return onboardingSurvey({
    completed: false,
    completedAt: null,
    requiredPlaceCount: 5,
    places: Array.from({ length: placeCount }).map((_, i) => ({
      provider: 'KTO',
      externalPlaceId: `pref-${i + 1}`,
      name: `추천 장소 ${i + 1}`,
      address: `서울특별시 어딘가 ${i + 1}`,
      thumbnailUrl: `https://img.example.com/pref-${i + 1}.jpg`,
      category: '관광지',
      description: `설명 ${i + 1}`,
      tags: ['자연', '힐링'],
      sortOrder: i,
    })),
  })
}

/** 기본: 진행 중 투표 세션 없음 → 가드가 MAP으로 통과. */
export function voteSessionState(overrides: Partial<TripVoteSessionState> = {}): TripVoteSessionState {
  return {
    hasSession: false,
    nextScreen: 'MAP',
    session: null,
    myParticipation: null,
    ...overrides,
  }
}
