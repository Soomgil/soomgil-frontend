import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { onboardingApi } from '@/api/onboarding.api'
import type { OnboardingPreferenceAnswer, OnboardingPreferenceSurvey } from '@/types/onboarding'

export const useOnboardingStore = defineStore('onboarding', () => {
  const survey = ref<OnboardingPreferenceSurvey | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loadedForUserId = ref<string | null>(null)

  const completed = computed(() => survey.value?.completed === true)

  async function load(userId: string, force = false) {
    if (!force && loadedForUserId.value === userId && survey.value) return survey.value
    loading.value = true
    error.value = null
    try {
      survey.value = await onboardingApi.getPreferenceSurvey()
      loadedForUserId.value = userId
      return survey.value
    } catch {
      error.value = '취향 설정을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
      return null
    } finally {
      loading.value = false
    }
  }

  async function ensureStatus(userId: string): Promise<boolean | null> {
    const current = await load(userId)
    return current ? current.completed : null
  }

  async function complete(userId: string, responses: OnboardingPreferenceAnswer[]) {
    if (!survey.value) throw new Error('활성 취향 설문이 없습니다.')
    const result = await onboardingApi.completePreferenceSurvey(survey.value.surveyVersionId, responses)
    survey.value = { ...survey.value, completed: true, completedAt: result.completedAt }
    loadedForUserId.value = userId
    return result
  }

  function reset() {
    survey.value = null
    loadedForUserId.value = null
    error.value = null
  }

  return { survey, loading, error, completed, load, ensureStatus, complete, reset }
})
