import http from './http'
import type {
  OnboardingPreferenceAnswer,
  OnboardingPreferenceCompletion,
  OnboardingPreferenceSurvey,
} from '@/types/onboarding'

export const onboardingApi = {
  async getPreferenceSurvey(): Promise<OnboardingPreferenceSurvey> {
    const response = await http.get<OnboardingPreferenceSurvey>('/onboarding/preference-survey')
    return response.data
  },

  async completePreferenceSurvey(
    surveyVersionId: string,
    responses: OnboardingPreferenceAnswer[],
  ): Promise<OnboardingPreferenceCompletion> {
    const response = await http.put<OnboardingPreferenceCompletion>(
      '/onboarding/preference-survey/responses',
      { surveyVersionId, responses },
    )
    return response.data
  },
}
