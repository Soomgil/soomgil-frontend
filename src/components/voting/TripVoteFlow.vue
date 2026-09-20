<script setup lang="ts">
import { formatUiText } from '@/i18n/ui-localizer'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import OwnerVoteSetupPanel from '@/components/voting/OwnerVoteSetupPanel.vue'
import VoteCandidateDeck from '@/components/voting/VoteCandidateDeck.vue'
import VoteResultPanel from '@/components/voting/VoteResultPanel.vue'
import VoteStickerCart from '@/components/voting/VoteStickerCart.vue'
import { votingApi } from '@/api/voting.api'
import type { TripVoteSessionResult } from '@/types/voting'
import { tripApi } from '@/api/trip.api'
import { useVotingStore } from '@/stores/voting.store'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/composables/useToast'
import type { LegalRegion } from '@/types/geo'

const voting = useVotingStore()
const auth = useAuthStore()
const toast = useToast()

/**
 * 여행 방 투표 흐름 전체(시작 설정 → 스티커 → 대기 → 결과).
 * 지도 위 모달에서 사용한다. 이동은 직접 하지 않고 `close`로 알린다.
 */
const props = withDefaults(defineProps<{
  tripId: string
  embedded?: boolean
  targetSessionId?: string | null
  tripDays?: number | null
  isOwner?: boolean
}>(), { embedded: false, tripDays: null, isOwner: false })
const emit = defineEmits<{
  /** 흐름을 닫는다. showResult가 true면 방금 끝난 투표 결과를 지도에서 보여 달라는 뜻이다. */
  close: [showResult: boolean]
  /** 선정된 장소 이름을 AI에게 넘겨 일정 배치를 맡긴다. */
  'ai-arrange': [names: string[]]
}>()

const tripId = computed(() => props.tripId)
const loadedTripDays = ref<number | null>(null)
const setupTripDays = computed(() => props.tripDays ?? loadedTripDays.value)
const apiOwner = ref(false)
const isOwner = computed(() => props.isOwner || apiOwner.value)
const tripTitle = ref('')
const tripRegions = ref<LegalRegion[]>([])
const tripDestination = ref<string | null>(null)
const historicalResult = ref<TripVoteSessionResult | null>(null)
const targetLoading = ref(Boolean(props.targetSessionId))
const targetError = ref(false)
const historical = computed(() => Boolean(props.targetSessionId && props.targetSessionId !== voting.session?.id))
const displayedResult = computed(() => historical.value ? historicalResult.value : voting.result)
async function loadTargetResult() {
  if (!props.targetSessionId) return
  targetLoading.value = true
  targetError.value = false
  try { historicalResult.value = await votingApi.getResult(tripId.value, props.targetSessionId) }
  catch { targetError.value = true }
  finally { targetLoading.value = false }
}
const closeConfirmOpen = ref(false)
/** 마감 API가 결과를 반환한 직후 current-session 응답이 비어도 결과 화면을 유지한다. */
const completedInCurrentView = ref(false)
/** 제출 성공 뒤 세션 응답이 잠시 비어도 방장의 새 투표 화면으로 돌아가지 않게 한다. */
const submittedInCurrentView = ref(false)

const candidates = computed(() => voting.session?.candidates ?? [])
const participantSummary = computed(() => voting.session?.participantSummary ?? null)

/**
 * 화면 모드.
 * - vote/waiting/observer: 진행 중 세션
 * - completed: 종료된 세션 결과
 * - setup: 세션 없음 + 방장 → 투표 시작 패널
 * - idle: 세션 없음 + 멤버
 */
/** 완료된 세션이 있어도 방장이 새 투표 시작을 눌렀으면 setup 패널을 보여준다. */
const restartRequested = ref(false)

const mode = computed(() => {
  if (targetLoading.value) return 'loading'
  if (targetError.value) return 'error'
  if (historical.value && historicalResult.value) return 'completed'
  if (completedInCurrentView.value && voting.result) return 'completed'
  if (voting.loading && !voting.session) return 'loading'
  if (voting.error && !voting.session) return 'error'
  const session = voting.session
  if (submittedInCurrentView.value && (!session || session.status === 'OPEN')) return 'waiting'
  if (!session || (session.status === 'COMPLETED' && restartRequested.value)) {
    return isOwner.value ? 'setup' : 'idle'
  }
  if (session.status === 'COMPLETED') return 'completed'
  if (!voting.myParticipation) return 'observer'
  return voting.isSubmitted ? 'waiting' : 'vote'
})

async function submit() {
  const submittedSessionId = voting.session?.id
  try {
    await voting.submit()
    submittedInCurrentView.value = true
    if (voting.session?.status === 'COMPLETED' || !voting.session) {
      const result = await voting.loadResult(submittedSessionId)
      completedInCurrentView.value = Boolean(result)
      if (result) voting.stopPolling()
    }
    toast.success('투표를 제출했어요.')
  } catch {
    toast.error('투표를 제출하지 못했습니다.')
  }
}

async function closeEarly() {
  try {
    const result = await voting.closeEarly(true)
    completedInCurrentView.value = Boolean(result)
    voting.stopPolling()
    closeConfirmOpen.value = false
    toast.success('투표를 마감했어요.')
  } catch {
    toast.error('투표를 종료하지 못했습니다.')
  }
}

/** 흐름을 닫는다. 페이지는 지도로 이동하고, 모달은 그대로 닫힌다. */
function goToMap(showResult = false) {
  emit('close', showResult)
}

/** 시작일·종료일로 여행 일수를 센다. 둘 중 하나라도 없으면 null. */
function countTripDays(startDate: string | null, endDate: string | null) {
  if (!startDate || !endDate) return null
  const start = new Date(startDate.slice(0, 10))
  const end = new Date(endDate.slice(0, 10))
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null
  const diff = Math.round((end.getTime() - start.getTime()) / 86_400_000)
  return Math.max(1, diff + 1)
}

/** 결과에서 선정된 장소 이름. AI 배치 프롬프트에 쓴다. */
const selectedResultNames = computed(() =>
  (displayedResult.value?.results ?? [])
    .filter((item) => item.selected && item.name)
    .map((item) => item.name as string),
)

function arrangeWithAi() {
  emit('ai-arrange', selectedResultNames.value)
}

async function handleSessionOpened() {
  completedInCurrentView.value = false
  submittedInCurrentView.value = false
  restartRequested.value = false
  toast.success('투표를 시작하고 멤버들에게 알림을 보냈어요.')
  await voting.load(tripId.value)
  voting.startPolling()
}

/**
 * 페이지에 머무는 동안 세션이 OPEN → COMPLETED로 넘어가면
 * 모달을 닫지 않고 결과를 불러와 즉시 결과 화면으로 전환한다.
 */
watch(
  () => voting.session?.status,
  (status) => {
    if (historical.value) return
    if (status === 'OPEN') {
      return
    }
    if (status === 'COMPLETED') {
      void voting.loadResult()
    }
  },
)

onMounted(async () => {
  // 부모가 이미 확인한 방장 여부와 라우터 가드가 채운 투표 상태를 즉시 사용한다.
  // 새로고침 등 캐시가 없는 경우에만 각 API를 병렬로 보완 조회한다.
  const restoreUser = auth.isAuthenticated && !auth.user
    ? auth.fetchUser().catch(() => null)
    : Promise.resolve(auth.user)
  const loadVoting = voting.tripId === tripId.value
    ? Promise.resolve()
    : voting.load(tripId.value)
  const [, trip] = await Promise.all([
    loadVoting,
    tripApi.getTrip(tripId.value).catch(() => null),
    restoreUser,
  ])
  if (trip) {
    apiOwner.value = trip.ownerUserId != null && trip.ownerUserId === auth.user?.id
    tripTitle.value = trip.title ?? ''
    tripRegions.value = trip.regions ?? []
    tripDestination.value = trip.displayDestination ?? null
    loadedTripDays.value = countTripDays(trip.startDate ?? null, trip.endDate ?? null)
  }
  targetLoading.value = false
  if (historical.value) {
    await loadTargetResult()
    return
  }
  if (voting.session?.status === 'OPEN') {
    voting.startPolling()
  } else if (voting.session?.status === 'COMPLETED') {
    void voting.loadResult()
  }
})

onUnmounted(() => {
  voting.stopPolling()
})
</script>

<template>
    <section class="section page-with-hero trip-vote" :class="{ 'trip-vote--embedded': embedded, 'trip-vote--voting': mode === 'vote' }">
      <button v-if="!embedded" type="button" class="trip-vote__back" data-testid="vote-back" @click="goToMap()">
        <span class="material-symbols-rounded" aria-hidden="true">{{ embedded ? 'close' : 'arrow_back' }}</span>
        {{ embedded ? '닫기' : '지도로 가기' }}
      </button>

      <LoadingState v-if="mode === 'loading'" data-testid="vote-loading" />

      <ErrorState
        v-else-if="mode === 'error'"
        data-testid="vote-error"
        message="투표 정보를 불러오지 못했습니다."
        @retry="historical ? loadTargetResult() : voting.load(tripId)"
      />

      <!-- 세션 없음 + 방장: 투표 시작 -->
      <OwnerVoteSetupPanel
        v-else-if="mode === 'setup'"
        :trip-title="tripTitle"
        :trip-regions="tripRegions"
        :trip-destination="tripDestination"
        :trip-days="setupTripDays"
        @opened="handleSessionOpened"
      />

      <!-- 세션 없음 + 멤버 -->
      <div v-else-if="mode === 'idle'" class="trip-vote__panel trip-vote__idle" data-testid="vote-idle">
        <header class="trip-vote__state-header">
          <p class="trip-vote__state-eyebrow">VOTE STATUS</p>
          <h2>진행 중인 투표가 없어요</h2>
          <p class="trip-vote__state-lead">방장이 투표를 시작하면 여기서 스티커를 붙일 수 있어요.</p>
        </header>
        <button type="button" class="trip-vote__cta" @click="goToMap()">{{ embedded ? '닫기' : '지도로 가기' }}</button>
      </div>

      <!-- 종료된 세션: 결과 -->
      <div v-else-if="mode === 'completed'" class="trip-vote__narrow">
        <VoteResultPanel
          :session="historical ? null : voting.session"
          :result="displayedResult"
          data-testid="vote-result"
        />
          <button
            v-if="isOwner && !historical"
            type="button"
            class="trip-vote__ghost trip-vote__restart"
            data-testid="vote-restart"
            @click="completedInCurrentView = false; restartRequested = true"
          >
            <span class="material-symbols-rounded" aria-hidden="true">restart_alt</span>
            새 투표 시작하기
          </button>
        <div class="trip-vote__result-actions">
          <button type="button" class="trip-vote__cta" data-testid="vote-result-map" @click="goToMap(true)">
            <span class="material-symbols-rounded" aria-hidden="true">map</span>
            지도에서 일정 확인하기
          </button>
          <!-- 뽑힌 장소는 일차 미정에 들어가 있다. 바로 AI에게 날짜별 배치를 맡기도록 유도한다. -->
          <button
            v-if="selectedResultNames.length > 0"
            type="button"
            class="trip-vote__cta trip-vote__cta--ai"
            data-testid="vote-ai-arrange"
            @click="arrangeWithAi"
          >
            <span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span>
            AI에게 일정 배치 맡기기
          </button>
        </div>
      </div>

      <!-- 진행 중 + 참여자 아님 -->
      <section v-else-if="mode === 'observer'" class="trip-vote__observer-card" data-testid="vote-observer">
        <header class="trip-vote__state-header">
          <p class="trip-vote__state-eyebrow">VOTE IN PROGRESS</p>
          <h2>투표가 진행 중이에요</h2>
          <p class="trip-vote__state-lead trip-vote__observer-copy">이번 투표는 <strong>시작 시점의 여행 메이트</strong>들이 참여하고 있어요. 모두 제출하면 선정된 장소가 일정에 자동으로 반영됩니다.</p>
        </header>

        <div class="trip-vote__observer-progress">
          <div class="trip-vote__observer-progress-head">
            <span>멤버 제출 현황</span>
            <strong>{{ participantSummary?.submitted ?? 0 }} / {{ participantSummary?.total ?? 0 }}명</strong>
          </div>
          <div class="trip-vote__waiting-progress" role="progressbar" aria-label="투표 제출 진행률" :aria-valuenow="participantSummary?.submitted ?? 0" aria-valuemin="0" :aria-valuemax="participantSummary?.total ?? 0">
            <div class="trip-vote__waiting-bar" :style="{ width: `${participantSummary && participantSummary.total > 0 ? (participantSummary.submitted / participantSummary.total) * 100 : 0}%` }" />
          </div>
          <p><span class="material-symbols-rounded" aria-hidden="true">notifications_active</span>결과가 확정되면 여행방에서 바로 확인할 수 있어요.</p>
        </div>

        <button type="button" class="trip-vote__cta trip-vote__observer-cta" @click="goToMap()">
          <span class="material-symbols-rounded" aria-hidden="true">map</span>
          {{ embedded ? '지도로 돌아가기' : '지도로 가기' }}
        </button>
      </section>

      <!-- 제출 완료: 다른 멤버의 제출을 기다리는 진행 현황 -->
      <section v-else-if="mode === 'waiting'" class="trip-vote__waiting-card" data-testid="vote-waiting">
        <header class="trip-vote__state-header">
          <p class="trip-vote__state-eyebrow">VOTE SUBMITTED</p>
          <h2>내 투표를 제출했어요</h2>
          <p class="trip-vote__state-lead trip-vote__waiting-copy">이제 다른 여행 메이트의 선택을 기다리고 있어요. 모두 제출하면 선정된 장소가 일정에 자동으로 정리됩니다.</p>
        </header>

        <div class="trip-vote__waiting-overview">
          <div class="trip-vote__waiting-heading">
            <span>멤버 제출 현황</span>
            <strong>{{ participantSummary?.submitted ?? 0 }}<small>/{{ participantSummary?.total ?? 0 }}명</small></strong>
          </div>
          <div
            class="trip-vote__waiting-progress"
            role="progressbar"
            aria-label="투표 제출 진행률"
            :aria-valuenow="participantSummary?.submitted ?? 0"
            aria-valuemin="0"
            :aria-valuemax="participantSummary?.total ?? 0"
          >
            <div
              class="trip-vote__waiting-bar"
              :style="{ width: `${participantSummary && participantSummary.total > 0
                ? (participantSummary.submitted / participantSummary.total) * 100 : 0}%` }"
            />
          </div>
          <p class="trip-vote__waiting-caption">
            <span class="material-symbols-rounded" aria-hidden="true">notifications_active</span>
            결과가 확정되면 이 화면에서 바로 알려드릴게요.
          </p>
        </div>

        <div class="trip-vote__waiting-summary" aria-label="투표 처리 상태">
          <div><span class="material-symbols-rounded" aria-hidden="true">check_circle</span><span><small>내 상태</small><strong>제출 완료</strong></span></div>
          <div><span class="material-symbols-rounded" aria-hidden="true">groups</span><span><small>남은 인원</small><strong>{{ Math.max(0, (participantSummary?.total ?? 0) - (participantSummary?.submitted ?? 0)) }}명</strong></span></div>
          <div><span class="material-symbols-rounded" aria-hidden="true">event_available</span><span><small>완료 후</small><strong>일정 자동 반영</strong></span></div>
        </div>

        <div class="trip-vote__waiting-actions">
          <button type="button" class="trip-vote__ghost" @click="goToMap()">
            <span class="material-symbols-rounded" aria-hidden="true">map</span>
            지도 보며 기다리기
          </button>
          <button
            v-if="isOwner && !historical && voting.session?.status === 'OPEN'"
            type="button"
            class="trip-vote__ghost trip-vote__close"
            data-testid="vote-close-open"
            @click="closeConfirmOpen = true"
          >
            <span class="material-symbols-rounded" aria-hidden="true">timer_off</span>
            투표 마감
          </button>
        </div>
      </section>

      <!-- 투표 진행 중: 후보 선택 -->
      <template v-else>
        <div class="page-hero trip-vote__hero">
          <div class="page-hero__copy">
            <p class="trip-vote__state-eyebrow">VOTE IN PROGRESS</p>
            <h1 class="page-hero__title">
              <span class="page-hero__gradient">어디로 갈까요?</span>
            </h1>
            <p class="page-hero__lead">
              멤버들의 취향으로 고른 후보예요. 사진을 넘겨 보며 가고 싶은 곳에 스티커를 붙여주세요.
            </p>
          </div>
          <div class="page-hero__actions trip-vote__hero-actions">
            <p class="trip-vote__progress" data-testid="vote-progress">
              <span class="material-symbols-rounded" aria-hidden="true">group</span>{{ formatUiText("{0}/{1}명 제출", "{0}/{1} submitted", [participantSummary?.submitted ?? 0, participantSummary?.total ?? 0]) }}</p>
            <!-- 마감은 방장의 진행 관리 동작이라 개인 제출 버튼과 분리해 진행 현황 옆에 둔다. -->
            <button
              v-if="isOwner && !historical && voting.session?.status === 'OPEN'"
              type="button"
              class="trip-vote__ghost trip-vote__close"
              data-testid="vote-close-open"
              @click="closeConfirmOpen = true"
            >
              <span class="material-symbols-rounded" aria-hidden="true">timer_off</span>
              투표 마감
            </button>
          </div>
        </div>

        <!-- 투표: 큰 사진 덱 + 스티커 장바구니 -->
        <div class="trip-vote__layout">
          <VoteCandidateDeck :candidates="candidates" />
          <VoteStickerCart :candidates="candidates" @submit="submit" />
        </div>
      </template>

      <!-- 조기 종료 확인 -->
      <div
        v-if="closeConfirmOpen"
        class="trip-vote__modal"
        data-testid="vote-close-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vote-close-title"
      >
        <div class="trip-vote__modal-body">
          <header class="trip-vote__modal-header">
            <div>
              <span class="trip-vote__modal-kicker">CLOSE VOTE</span>
              <h2 id="vote-close-title">투표를 마감할까요?</h2>
              <p class="trip-vote__modal-lead">마감하면 현재까지 제출된 스티커로 선정 장소를 확정하고 일정에 반영해요.</p>
            </div>
            <button type="button" class="trip-vote__modal-dismiss" aria-label="투표 마감 창 닫기" @click="closeConfirmOpen = false">
              <span class="material-symbols-rounded" aria-hidden="true">close</span>
            </button>
          </header>

          <div class="trip-vote__modal-summary" aria-label="현재 투표 현황">
            <div>
              <small>제출 완료</small>
              <strong>{{ participantSummary?.submitted ?? 0 }}명</strong>
            </div>
            <span aria-hidden="true"></span>
            <div>
              <small>미제출</small>
              <strong class="is-pending">{{ Math.max(0, (participantSummary?.total ?? 0) - (participantSummary?.submitted ?? 0)) }}명</strong>
            </div>
          </div>

          <div v-if="voting.hasUnvotedParticipants" class="trip-vote__modal-warning" data-testid="vote-close-warning">
            <span class="material-symbols-rounded" aria-hidden="true">info</span>
            <p>{{ formatUiText("아직 제출하지 않은 멤버가 {0}명 있어요.", "{0} members have not submitted yet.", [(participantSummary?.total ?? 0) - (participantSummary?.submitted ?? 0)]) }}</p>
          </div>
          <div v-else class="trip-vote__modal-ready">
            <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
            모든 멤버가 투표를 제출했어요.
          </div>

          <div class="trip-vote__modal-actions">
            <button type="button" class="cancel" data-testid="vote-close-cancel" @click="closeConfirmOpen = false">
              투표 계속하기
            </button>
            <button
              type="button"
              class="confirm"
              data-testid="vote-close-confirm"
              :disabled="voting.closing"
              @click="closeEarly"
            >
              <span class="material-symbols-rounded" aria-hidden="true">flag</span>
              {{ voting.closing ? '마감 중…' : '현재 결과로 마감' }}
            </button>
          </div>
        </div>
      </div>
    </section>
</template>

<style scoped>
.trip-vote__hero-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.trip-vote__close {
  white-space: nowrap;
}

.trip-vote {
  display: flex;
  flex-direction: column;
  max-width: 1200px;
}

.trip-vote__back {
  align-items: center;
  align-self: flex-start;
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 700;
  gap: 4px;
  margin-bottom: 18px;
  padding: 4px 0;
  transition: color 0.15s ease;
}

.trip-vote__back:hover {
  color: var(--ink);
}

.trip-vote__back .material-symbols-rounded {
  font-size: 18px;
}

.trip-vote__hero {
  margin-bottom: 30px;
}

.trip-vote__progress {
  align-items: center;
  background: rgba(0, 102, 255, 0.08);
  border-radius: 999px;
  color: var(--violet);
  display: inline-flex;
  font-size: 14px;
  font-weight: 800;
  gap: 6px;
  margin: 0;
  padding: 10px 18px;
}

.trip-vote__progress .material-symbols-rounded {
  font-size: 18px;
}

/* 덱 + 장바구니 2컬럼 */
.trip-vote__layout {
  align-items: start;
  display: grid;
  gap: 28px;
  grid-template-columns: minmax(0, 1fr) 360px;
}

.trip-vote__layout > aside {
  position: sticky;
  top: 92px;
}

@media (max-width: 1023px) {
  .trip-vote__layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .trip-vote__layout > aside {
    position: static;
  }
}

.trip-vote__narrow {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0 auto;
  max-width: 680px;
  width: 100%;
}

/* 안내 패널(대기/관전/세션 없음) */
.trip-vote__panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--soft-shadow);
  margin: 0 auto;
  max-width: 620px;
  padding: 28px 32px 32px;
  text-align: center;
  width: 100%;
}

.trip-vote__panel h2 {
  color: var(--ink);
  font-size: 22px;
  font-weight: 900;
  margin: 12px 0 8px;
}

.trip-vote__panel p {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.7;
  margin: 0 0 20px;
}

.trip-vote__idle-icon {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  -webkit-text-fill-color: transparent;
  font-size: 44px;
}

.trip-vote__waiting-progress {
  background: #e8f1f8;
  border-radius: 999px;
  height: 12px;
  margin: 12px 0 0;
  overflow: hidden;
}

.trip-vote__waiting-bar {
  background: linear-gradient(90deg, var(--violet), var(--blue));
  border-radius: 999px;
  height: 100%;
  transition: width 0.4s ease;
}

.trip-vote__waiting-card {
  margin: 0 auto;
  max-width: 680px;
  padding: 14px 30px 24px;
  text-align: left;
  width: 100%;
}

.trip-vote__waiting-icon { align-items: center; background: linear-gradient(145deg, #e8f4ff, #f4f0ff); border: 1px solid #d7e8f7; border-radius: 22px; color: #397fbd; display: flex; height: 76px; justify-content: center; margin: 0 auto 14px; transform: rotate(-3deg); width: 76px; }
.trip-vote__waiting-icon .material-symbols-rounded { font-size: 38px; transform: rotate(3deg); }
.trip-vote__state-header { display:grid; gap:5px; margin:0 0 20px; padding:2px 2px 4px; text-align:left; }
.trip-vote__state-eyebrow { color:#5d89aa; font-family:Inter,'Pretendard Variable',Pretendard,sans-serif; font-size:10px; font-weight:800; letter-spacing:.14em; line-height:1.4; margin:0; text-transform:uppercase; }
.trip-vote__state-header h2 { color:#35465a; font-family:'Noto Serif KR',Batang,serif; font-size:23px; font-weight:600; letter-spacing:-.02em; line-height:1.4; margin:0; }
.trip-vote__state-lead { color:#647c92; font-size:12px; line-height:1.65; margin:0; }
.trip-vote__waiting-copy { margin:0; }
.trip-vote__waiting-overview { background: rgb(239 247 253 / 82%); border: 1px solid #dbe9f4; border-radius: 20px; padding: 18px 20px 15px; text-align: left; }
.trip-vote__waiting-heading { align-items: flex-end; color: #587086; display: flex; font-size: 13px; font-weight: 800; justify-content: space-between; }
.trip-vote__waiting-heading strong { color: #347db8; font-size: 25px; line-height: 1; }
.trip-vote__waiting-heading small { color: #73899d; font-size: 12px; margin-left: 3px; }
.trip-vote__waiting-caption { align-items: center; color: #71869a; display: flex; font-size: 12px; gap: 6px; margin: 11px 0 0; }
.trip-vote__waiting-caption .material-symbols-rounded { color: #5a9bcf; font-size: 16px; }
.trip-vote__waiting-summary { display: grid; gap: 10px; grid-template-columns: repeat(3, 1fr); margin-top: 14px; }
.trip-vote__waiting-summary > div { align-items: center; background: #fff; border: 1px solid #e1ebf3; border-radius: 16px; display: flex; gap: 9px; min-width: 0; padding: 12px; text-align: left; }
.trip-vote__waiting-summary .material-symbols-rounded { color: #5b98ca; font-size: 21px; }
.trip-vote__waiting-summary span:last-child { display: grid; min-width: 0; }
.trip-vote__waiting-summary small { color: #8a9aa9; font-size: 10px; }
.trip-vote__waiting-summary strong { color: #40566a; font-size: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.trip-vote__waiting-actions { display: flex; gap: 10px; justify-content: center; margin-top: 22px; }

.trip-vote__observer-card {
  margin: 0 auto;
  max-width: 680px;
  padding: 14px 36px 26px;
  text-align: center;
  width: 100%;
}

.trip-vote__observer-icon {
  align-items: center;
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: 22px;
  color: var(--blue);
  display: flex;
  height: 78px;
  justify-content: center;
  margin: 0 auto 18px;
  width: 78px;
}

.trip-vote__observer-icon .material-symbols-rounded { font-size: 39px; }
.trip-vote__observer-copy { max-width: 550px; word-break: keep-all; }
.trip-vote__observer-copy strong { color: #3f607a; font-weight: 850; }
.trip-vote__observer-progress { background: var(--surface-2); border: 1px solid var(--line); border-radius: 20px; padding: 19px 21px 16px; text-align: left; }
.trip-vote__observer-progress-head { align-items: center; color: #5d758a; display: flex; font-size: 14px; font-weight: 800; justify-content: space-between; }
.trip-vote__observer-progress-head strong { color: #347db8; font-size: 19px; }
.trip-vote__observer-progress > p { align-items: center; color: #6b8194; display: flex; font-size: 13px; gap: 7px; margin: 12px 0 0; }
.trip-vote__observer-progress > p .material-symbols-rounded { color: #5798ca; font-size: 18px; }
.trip-vote__observer-cta { gap: 8px; margin-top: 24px; min-height: 50px; padding-inline: 24px; }
.trip-vote__observer-cta .material-symbols-rounded { font-size: 19px; }

@media (max-width: 600px) {
  .trip-vote__waiting-card { padding: 12px 4px; }
  .trip-vote__waiting-summary { grid-template-columns: 1fr; }
  .trip-vote__waiting-summary > div { justify-content: center; }
  .trip-vote__waiting-actions { align-items: stretch; flex-direction: column; }
  .trip-vote__waiting-actions .trip-vote__ghost { width: 100%; }
  .trip-vote__observer-card { padding: 12px 4px 14px; }
  .trip-vote__observer-copy { font-size: 15px; line-height: 1.75; }
  .trip-vote__observer-copy br { display: none; }
  .trip-vote__observer-progress { padding: 17px 16px 14px; }
  .trip-vote__observer-progress > p { align-items: flex-start; }
  .trip-vote__observer-cta { width: 100%; }
}

.trip-vote__cta {
  align-items: center;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: none;
  border-radius: 999px;
  box-shadow: 0 12px 26px rgba(0, 102, 255, 0.28);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 800;
  gap: 6px;
  justify-content: center;
  padding: 13px 26px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.trip-vote__cta:hover {
  box-shadow: 0 16px 32px rgba(0, 102, 255, 0.34);
  transform: translateY(-2px);
}

.trip-vote__ghost {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  font-size: 14px;
  font-weight: 700;
  gap: 6px;
  justify-content: center;
  padding: 11px 22px;
  transition: background 0.15s ease, color 0.15s ease;
}

.trip-vote__ghost:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.trip-vote__result-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

/* 조기 종료 확인 모달 */
.trip-vote__modal {
  align-items: center;
  backdrop-filter: blur(8px);
  background: rgb(25 43 59 / 48%);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 1200;
}

.trip-vote__modal-body {
  background: #fff;
  border: 1px solid rgb(219 233 243 / 90%);
  border-radius: 28px;
  box-shadow: 0 28px 80px rgb(31 58 82 / 24%);
  max-width: 500px;
  overflow: hidden;
  padding: 24px 30px 30px;
  width: 100%;
}

.trip-vote__modal-header {
  align-items: flex-start;
  display: grid;
  gap: 14px;
  grid-template-columns: 1fr auto;
}

.trip-vote__modal-icon {
  align-items: center;
  background: #fff1f3;
  border: 1px solid #f6d7dd;
  border-radius: 16px;
  color: #c8576b;
  display: flex;
  font-size: 25px;
  height: 48px;
  justify-content: center;
  width: 48px;
}

.trip-vote__modal-kicker {
  color: #5d89aa;
  display: block;
  font-family: Inter, 'Pretendard Variable', Pretendard, sans-serif;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: .14em;
  line-height: 1.4;
  margin: 1px 0 6px;
  text-transform: uppercase;
}

.trip-vote__modal-body h2 {
  color: #30465a;
  font-family: 'Noto Serif KR', Batang, serif;
  font-size: 23px;
  font-weight: 600;
  letter-spacing: -.02em;
  line-height: 1.4;
  margin: 0;
}

.trip-vote__modal-dismiss {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 10px;
  color: #91a1af;
  cursor: pointer;
  display: flex;
  height: 36px;
  justify-content: center;
  padding: 0;
  width: 36px;
}

.trip-vote__modal-dismiss:hover { background: #f1f6fa; color: #526a7e; }
.trip-vote__modal-dismiss .material-symbols-rounded { font-size: 21px; }

.trip-vote__modal-lead {
  color: #6d8295;
  font-size: 12px;
  line-height: 1.65;
  margin: 4px 0 0;
}

.trip-vote__modal-summary {
  align-items: center;
  background: linear-gradient(135deg, #f2f8fd, #f8fbfd);
  border: 1px solid #dce9f2;
  border-radius: 18px;
  display: grid;
  grid-template-columns: 1fr 1px 1fr;
  margin-bottom: 14px;
  padding: 15px 18px;
}

.trip-vote__modal-summary > div { display: grid; gap: 3px; text-align: center; }
.trip-vote__modal-summary > span { background: #d9e6ef; height: 30px; }
.trip-vote__modal-summary small { color: #8396a7; font-size: 10px; font-weight: 800; }
.trip-vote__modal-summary strong { color: #397ead; font-size: 20px; }
.trip-vote__modal-summary strong.is-pending { color: #c0576a; }

.trip-vote__modal-ready {
  align-items: center;
  background: #eff9f3;
  border: 1px solid #d3eadb;
  border-radius: 15px;
  color: #3d7d56;
  display: flex;
  font-size: 13px;
  font-weight: 750;
  gap: 8px;
  padding: 13px 14px;
}

.trip-vote__modal-ready .material-symbols-rounded { font-size: 19px; }

.trip-vote__modal-warning {
  align-items: flex-start;
  background: #fff5f6;
  border: 1px solid #f6dce1;
  border-radius: 15px;
  color: #a9495b;
  display: flex;
  font-size: 13px;
  gap: 9px;
  line-height: 1.6;
  margin: 0 0 14px;
  padding: 13px 14px;
}

.trip-vote__modal-warning .material-symbols-rounded { flex: 0 0 auto; font-size: 19px; margin-top: 1px; }
.trip-vote__modal-warning p { margin: 0; }

.trip-vote__modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 22px;
}

.trip-vote__modal-actions button {
  align-items: center;
  background: #eef4f8;
  border: none;
  border-radius: 14px;
  color: #61798d;
  cursor: pointer;
  display: inline-flex;
  flex: 1;
  font-size: 14px;
  font-weight: 800;
  gap: 7px;
  justify-content: center;
  min-height: 50px;
  padding: 0 16px;
}

.trip-vote__modal-actions button.confirm {
  background: linear-gradient(135deg, #d25a6f, #bc465c);
  box-shadow: 0 10px 22px rgb(188 70 92 / 22%);
  color: #fff;
}

.trip-vote__modal-actions button:not(:disabled):hover { transform: translateY(-1px); }
.trip-vote__modal-actions .material-symbols-rounded { font-size: 18px; }

.trip-vote__modal-actions button.confirm:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 640px) {
  .trip-vote__panel {
    padding: 34px 20px;
  }
  .trip-vote__modal { align-items: flex-end; padding: 12px; }
  .trip-vote__modal-body { border-radius: 24px; padding: 24px 18px 18px; }
  .trip-vote__modal-header { gap: 10px; }
  .trip-vote__modal-icon { border-radius: 14px; height: 42px; width: 42px; }
  .trip-vote__modal-body h2 { font-size: 19px; }
  .trip-vote__modal-actions { flex-direction: column-reverse; }
  .trip-vote__modal-actions button { width: 100%; }
}

/* 모달 안에서는 페이지 여백을 줄이고 히어로를 촘촘하게 쓴다. */
.trip-vote--embedded {
  padding: 8px 4px 4px;
}

.trip-vote--embedded .trip-vote__back {
  margin-bottom: 8px;
}

.trip-vote__cta--ai {
  background: linear-gradient(135deg, #7c3aed, #2563eb);
}

/* Shared white and sky palette for every stage of the vote dialog. */
.trip-vote--embedded { --ink:#35465a; --muted:#647c92; --surface:#fff; --surface-2:#eaf4ff; --line:#dfeaf5; --violet:#328be0; --blue:#328be0; }
.trip-vote--embedded .trip-vote__back { align-self:flex-end; min-height:36px; padding:6px 10px; border-radius:10px; margin:0 0 8px; background:#f1f8ff; }
.trip-vote--embedded .trip-vote__hero { padding:2px 2px 4px; margin-bottom:20px; border:0; border-radius:0; background:transparent; box-shadow:none; }
.trip-vote--embedded :deep(.page-hero__title) { font-family:'Noto Serif KR',Batang,serif; font-size:23px; font-weight:600; letter-spacing:-.02em; line-height:1.4; }
.trip-vote--embedded :deep(.page-hero__gradient) { background:none; -webkit-text-fill-color:#35465a; color:#35465a; }
.trip-vote--embedded :deep(.page-hero__lead) { font-size:12px; line-height:1.65; }
.trip-vote--embedded .trip-vote__layout { gap:20px; grid-template-columns:minmax(0,1.6fr) minmax(260px,1fr); }
.trip-vote--embedded .trip-vote__result-actions { position:static; padding:16px 0 0; border-top:1px solid #dfeaf5; gap:10px; }
.trip-vote--embedded .trip-vote__cta { background:#328be0; border-radius:12px; box-shadow:none; font-size:14px; }
.trip-vote--embedded .trip-vote__cta--ai { background:#eaf4ff; color:#287cbd; border:1px solid #c6dff4; }
.trip-vote--embedded :deep(.vote-cart) { border-radius:16px; box-shadow:none; }
@media(min-width:761px) {
 .trip-vote--embedded.trip-vote--voting { height:100%; min-height:0; overflow:hidden; }
 .trip-vote--embedded .trip-vote__layout { align-items:stretch; flex:1; min-height:0; }
 .trip-vote--embedded .trip-vote__layout > :deep(.vote-deck),
 .trip-vote--embedded .trip-vote__layout > :deep(.vote-cart) { height:100%; min-height:0; }
 .trip-vote--embedded .trip-vote__layout > :deep(.vote-cart) { overflow:hidden; }
 .trip-vote--embedded :deep(.vote-cart__list) { flex:1; min-height:0; max-height:none; }
 .trip-vote--embedded :deep(.vote-cart__empty) { display:grid; flex:1; place-items:center; }
 .trip-vote--embedded :deep(.vote-deck__stage) { flex:1; min-height:240px; aspect-ratio:auto; }
}
@media(max-width:760px) {
 .trip-vote--embedded .trip-vote__layout { grid-template-columns:minmax(0,1fr); }
}

.trip-vote--embedded { padding-top:18px; }
.trip-vote__restart { display:flex; margin:14px 0 0 auto; padding:6px 8px; min-height:36px; border:0; background:transparent; font-size:12px; }
@media(max-width:520px) {
 .trip-vote--embedded .trip-vote__result-actions { display:grid; grid-template-columns:1fr; padding:10px 0; gap:6px; }
 .trip-vote--embedded .trip-vote__result-actions .trip-vote__cta { min-height:42px; padding:10px 12px; }
 .trip-vote--embedded .trip-vote__result-actions .trip-vote__cta--ai { min-height:34px; background:transparent; border:0; padding:6px; font-size:12px; }
}
</style>
