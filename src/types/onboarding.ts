import type { PlaceProvider } from '@/types/place'
import type { SwipeAction } from '@/types/swipe'

export type OnboardingReaction = SwipeAction

export interface OnboardingPreferencePlace {
  provider: PlaceProvider
  externalPlaceId: string
  name: string
  address: string | null
  thumbnailUrl: string | null
  category: string | null
  description: string | null
  tags: string[]
  sortOrder: number
}

export interface OnboardingPreferenceSurvey {
  surveyVersionId: string
  code: string
  requiredPlaceCount: number
  completedAt: string | null
  completed: boolean
  places: OnboardingPreferencePlace[]
}

export interface OnboardingPreferenceAnswer {
  provider: PlaceProvider
  externalPlaceId: string
  reaction: OnboardingReaction
}

export interface OnboardingPreferenceCompletion {
  surveyVersionId: string
  completedAt: string
}
