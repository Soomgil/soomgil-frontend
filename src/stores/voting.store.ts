import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { votingApi } from '@/api/voting.api'
import type {
  MyVoteParticipation,
  OpenVoteSessionRequest,
  TripVoteSessionDetail,
  TripVoteSessionResult,
  VoteNextScreen,
  VoteStickerPlacement,
} from '@/types/voting'

/** 진행 중인 투표 상태를 확인하는 polling 간격(ms). */
const POLL_INTERVAL_MS = 5000

export const useVotingStore = defineStore('voting', () => {
  const tripId = ref<string | null>(null)
  const session = ref<TripVoteSessionDetail | null>(null)
  const myParticipation = ref<MyVoteParticipation | null>(null)
  const nextScreen = ref<VoteNextScreen>('MAP')
  const result = ref<TripVoteSessionResult | null>(null)

  const loading = ref(false)
  const saving = ref(false)
  const submitting = ref(false)
  const closing = ref(false)
  const error = ref<string | null>(null)

  /** 제출 전 로컬 배치. 서버 왕복 없이 스티커를 옮기고 회수하기 위한 상태다. */
  const draftPlacements = ref<VoteStickerPlacement[]>([])

  let pollTimer: ReturnType<typeof setInterval> | null = null

  const stickerAllowance = computed(() => myParticipation.value?.stickerAllowance ?? 0)
  const usedStickerCount = computed(() =>
    draftPlacements.value.reduce((total, placement) => total + placement.stickerCount, 0),
  )
  const remainingStickerCount = computed(() =>
    Math.max(0, stickerAllowance.value - usedStickerCount.value),
  )
  const isSubmitted = computed(() => myParticipation.value?.status === 'SUBMITTED')
  const isCompleted = computed(() => session.value?.status === 'COMPLETED')
  const canSubmit = computed(
    () => !isSubmitted.value && !isCompleted.value && usedStickerCount.value > 0,
  )
  const hasUnvotedParticipants = computed(() => {
    const summary = session.value?.participantSummary
    if (!summary) return false
    return summary.submitted < summary.total
  })

  function stickerCountFor(candidateId: string) {
    return draftPlacements.value.find((placement) => placement.candidateId === candidateId)?.stickerCount ?? 0
  }

  /** 후보에 스티커를 하나 붙인다. 남은 스티커가 없으면 아무 일도 하지 않는다. */
  function placeSticker(candidateId: string) {
    if (isSubmitted.value || remainingStickerCount.value <= 0) return
    const existing = draftPlacements.value.find((placement) => placement.candidateId === candidateId)
    if (existing) existing.stickerCount += 1
    else draftPlacements.value.push({ candidateId, stickerCount: 1 })
  }

  /** 후보에서 스티커를 하나 회수한다. */
  function withdrawSticker(candidateId: string) {
    if (isSubmitted.value) return
    const index = draftPlacements.value.findIndex((placement) => placement.candidateId === candidateId)
    if (index < 0) return
    const placement = draftPlacements.value[index]
    if (placement.stickerCount <= 1) draftPlacements.value.splice(index, 1)
    else placement.stickerCount -= 1
  }

  /** 붙인 스티커를 모두 회수한다. */
  function resetStickers() {
    if (isSubmitted.value) return
    draftPlacements.value = []
  }

  function applyState(state: {
    session: TripVoteSessionDetail | null
    myParticipation: MyVoteParticipation | null
    nextScreen: VoteNextScreen
  }) {
    session.value = state.session
    myParticipation.value = state.myParticipation
    nextScreen.value = state.nextScreen
    if (state.myParticipation) {
      draftPlacements.value = state.myParticipation.placements.map((placement) => ({ ...placement }))
    }
  }

  /**
   * 라우터 가드가 호출하는 진입 판정.
   *
   * 조회에 실패해도 여행 방 진입 자체를 막지 않기 위해 MAP으로 통과시킨다.
   */
  async function ensureGate(nextTripId: string): Promise<VoteNextScreen> {
    tripId.value = nextTripId
    try {
      const state = await votingApi.getCurrentSession(nextTripId)
      applyState(state)
      return state.nextScreen
    } catch {
      session.value = null
      myParticipation.value = null
      nextScreen.value = 'MAP'
      return 'MAP'
    }
  }

  async function load(nextTripId: string) {
    tripId.value = nextTripId
    loading.value = true
    error.value = null
    try {
      applyState(await votingApi.getCurrentSession(nextTripId))
    } catch {
      error.value = '투표 정보를 불러오지 못했습니다.'
    } finally {
      loading.value = false
    }
  }

  async function openSession(request: OpenVoteSessionRequest) {
    if (!tripId.value) return null
    const detail = await votingApi.openSession(tripId.value, request)
    await load(tripId.value)
    return detail
  }

  async function saveStickers() {
    if (!tripId.value || !session.value) return
    saving.value = true
    error.value = null
    try {
      const state = await votingApi.saveStickers(
        tripId.value,
        session.value.id,
        draftPlacements.value,
      )
      myParticipation.value = state.myParticipation
    } catch {
      error.value = '스티커를 저장하지 못했습니다.'
      throw new Error('saveStickers failed')
    } finally {
      saving.value = false
    }
  }

  async function submit() {
    if (!tripId.value || !session.value) return
    submitting.value = true
    error.value = null
    try {
      applyState(await votingApi.submit(tripId.value, session.value.id, draftPlacements.value))
    } catch {
      error.value = '투표를 제출하지 못했습니다.'
      throw new Error('submit failed')
    } finally {
      submitting.value = false
    }
  }

  /** 종료된 세션의 결과를 불러온다. 진행 중이거나 세션이 없으면 아무것도 하지 않는다. */
  async function loadResult() {
    if (!tripId.value || !session.value || session.value.status !== 'COMPLETED') return null
    try {
      result.value = await votingApi.getResult(tripId.value, session.value.id)
      return result.value
    } catch {
      return null
    }
  }

  async function closeEarly(acknowledgeUnvotedParticipants: boolean) {
    if (!tripId.value || !session.value) return null
    closing.value = true
    error.value = null
    try {
      result.value = await votingApi.closeSession(
        tripId.value,
        session.value.id,
        acknowledgeUnvotedParticipants,
      )
      await load(tripId.value)
      return result.value
    } catch {
      error.value = '투표를 종료하지 못했습니다.'
      throw new Error('closeEarly failed')
    } finally {
      closing.value = false
    }
  }

  /** 투표가 진행 중인 동안만 주기적으로 상태를 갱신한다. */
  function startPolling() {
    if (pollTimer || !tripId.value) return
    pollTimer = setInterval(() => {
      if (!tripId.value) return
      void load(tripId.value).then(() => {
        if (session.value?.status === 'COMPLETED') stopPolling()
      })
    }, POLL_INTERVAL_MS)
  }

  function stopPolling() {
    if (!pollTimer) return
    clearInterval(pollTimer)
    pollTimer = null
  }

  function reset() {
    stopPolling()
    tripId.value = null
    session.value = null
    myParticipation.value = null
    result.value = null
    draftPlacements.value = []
    nextScreen.value = 'MAP'
    error.value = null
  }

  return {
    tripId,
    session,
    myParticipation,
    nextScreen,
    result,
    loading,
    saving,
    submitting,
    closing,
    error,
    draftPlacements,
    stickerAllowance,
    usedStickerCount,
    remainingStickerCount,
    isSubmitted,
    isCompleted,
    canSubmit,
    hasUnvotedParticipants,
    stickerCountFor,
    placeSticker,
    withdrawSticker,
    resetStickers,
    ensureGate,
    load,
    openSession,
    loadResult,
    saveStickers,
    submit,
    closeEarly,
    startPolling,
    stopPolling,
    reset,
  }
})
