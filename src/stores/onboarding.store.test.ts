import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { onboardingApi } from '@/api/onboarding.api'
import { useOnboardingStore } from './onboarding.store'

vi.mock('@/api/onboarding.api', () => ({
  onboardingApi: {
    getPreferenceSurvey: vi.fn(),
    completePreferenceSurvey: vi.fn(),
  },
}))

const survey = {
  surveyVersionId: 'survey-v1',
  code: 'jeju-diversity-v1',
  requiredPlaceCount: 10,
  completedAt: null,
  completed: false,
  places: [],
}

describe('onboarding store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.resetAllMocks()
  })

  it('caches completion status for the same user', async () => {
    vi.mocked(onboardingApi.getPreferenceSurvey).mockResolvedValue(survey)
    const store = useOnboardingStore()

    expect(await store.ensureStatus('user-1')).toBe(false)
    expect(await store.ensureStatus('user-1')).toBe(false)

    expect(onboardingApi.getPreferenceSurvey).toHaveBeenCalledTimes(1)
  })

  it('marks the survey complete after all answers are saved', async () => {
    vi.mocked(onboardingApi.getPreferenceSurvey).mockResolvedValue(survey)
    vi.mocked(onboardingApi.completePreferenceSurvey).mockResolvedValue({
      surveyVersionId: 'survey-v1',
      completedAt: '2026-09-19T12:00:00+09:00',
    })
    const store = useOnboardingStore()
    await store.load('user-1')

    await store.complete('user-1', [])

    expect(store.completed).toBe(true)
    expect(store.survey?.completedAt).toBe('2026-09-19T12:00:00+09:00')
  })

  it('does not reuse another users onboarding state', async () => {
    vi.mocked(onboardingApi.getPreferenceSurvey)
      .mockResolvedValueOnce(survey)
      .mockResolvedValueOnce({ ...survey, completed: true, completedAt: '2026-09-19T00:00:00Z' })
    const store = useOnboardingStore()

    await store.ensureStatus('user-1')
    expect(await store.ensureStatus('user-2')).toBe(true)

    expect(onboardingApi.getPreferenceSurvey).toHaveBeenCalledTimes(2)
  })
})
