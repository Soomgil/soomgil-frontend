<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import OwnerVoteSetupPanel from '@/components/voting/OwnerVoteSetupPanel.vue'
import VoteCandidateDeck from '@/components/voting/VoteCandidateDeck.vue'
import VoteResultPanel from '@/components/voting/VoteResultPanel.vue'
import VoteStickerCart from '@/components/voting/VoteStickerCart.vue'
import { tripApi } from '@/api/trip.api'
import { useVotingStore } from '@/stores/voting.store'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const voting = useVotingStore()
const auth = useAuthStore()
const toast = useToast()

const tripId = computed(() => String(route.params.tripId ?? ''))
const isOwner = ref(false)
const tripTitle = ref('')
const closeConfirmOpen = ref(false)
const acknowledged = ref(false)

const candidates = computed(() => voting.session?.candidates ?? [])
const participantSummary = computed(() => voting.session?.participantSummary ?? null)
const isOwnerCloseAllowed = computed(() => !voting.hasUnvotedParticipants || acknowledged.value)

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
  if (voting.loading && !voting.session) return 'loading'
  if (voting.error && !voting.session) return 'error'
  const session = voting.session
  if (!session || (session.status === 'COMPLETED' && restartRequested.value)) {
    return isOwner.value ? 'setup' : 'idle'
  }
  if (session.status === 'COMPLETED') return 'completed'
  if (!voting.myParticipation) return 'observer'
  return voting.isSubmitted ? 'waiting' : 'vote'
})

async function submit() {
  try {
    await voting.submit()
    toast.success('투표를 제출했어요.')
  } catch {
    toast.error('투표를 제출하지 못했습니다.')
  }
}

async function closeEarly() {
  try {
    await voting.closeEarly(true)
    closeConfirmOpen.value = false
    toast.success('투표를 마감했어요.')
  } catch {
    toast.error('투표를 종료하지 못했습니다.')
  }
}

/** showResult가 true면 지도 위에 결과 오버레이(투표가 끝났어요)를 띄운다. */
function goToMap(showResult = false) {
  router.push({
    name: 'Route',
    params: { tripId: tripId.value },
    ...(showResult ? { query: { voteCompleted: '1' } } : {}),
  })
}

async function handleSessionOpened() {
  restartRequested.value = false
  toast.success('투표를 시작했어요. 멤버들에게 알려주세요!')
  await voting.load(tripId.value)
  voting.startPolling()
}

/**
 * 페이지에 머무는 동안 세션이 OPEN → COMPLETED로 넘어가면
 * 결과 오버레이와 함께 지도 화면으로 이동한다.
 * 처음부터 COMPLETED로 열린 경우는 결과 화면을 보여준다.
 */
let sawOpenSession = false
watch(
  () => voting.session?.status,
  (status) => {
    if (status === 'OPEN') {
      sawOpenSession = true
      return
    }
    if (status === 'COMPLETED') {
      if (sawOpenSession) {
        goToMap(true)
        return
      }
      void voting.loadResult()
    }
  },
)

onMounted(async () => {
  // 새로고침 직후에는 토큰만 있고 user가 비어 있을 수 있다. 방장 판별에 필요하므로 먼저 복원한다.
  if (auth.isAuthenticated && !auth.user) {
    try { await auth.fetchUser() } catch { /* user 조회 실패 시 방장 기능만 숨긴다 */ }
  }
  const [, trip] = await Promise.all([
    voting.load(tripId.value),
    tripApi.getTrip(tripId.value).catch(() => null),
  ])
  if (trip) {
    isOwner.value = trip.ownerUserId != null && trip.ownerUserId === auth.user?.id
    tripTitle.value = trip.title ?? ''
  }
  if (voting.session?.status === 'OPEN') {
    sawOpenSession = true
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
  <AppShell>
    <section class="section page-with-hero trip-vote">
      <button type="button" class="trip-vote__back" data-testid="vote-back" @click="goToMap()">
        <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>
        지도로 가기
      </button>

      <LoadingState v-if="mode === 'loading'" data-testid="vote-loading" />

      <ErrorState
        v-else-if="mode === 'error'"
        data-testid="vote-error"
        message="투표 정보를 불러오지 못했습니다."
        @retry="voting.load(tripId)"
      />

      <!-- 세션 없음 + 방장: 투표 시작 -->
      <OwnerVoteSetupPanel
        v-else-if="mode === 'setup'"
        :trip-title="tripTitle"
        @opened="handleSessionOpened"
      />

      <!-- 세션 없음 + 멤버 -->
      <div v-else-if="mode === 'idle'" class="trip-vote__panel trip-vote__idle" data-testid="vote-idle">
        <span class="material-symbols-rounded trip-vote__idle-icon">how_to_vote</span>
        <h2>진행 중인 투표가 없어요</h2>
        <p>방장이 투표를 시작하면 여기서 스티커를 붙일 수 있어요.</p>
        <button type="button" class="trip-vote__cta" @click="goToMap()">지도로 가기</button>
      </div>

      <!-- 종료된 세션: 결과 -->
      <div v-else-if="mode === 'completed'" class="trip-vote__narrow">
        <VoteResultPanel
          :session="voting.session!"
          :result="voting.result"
          data-testid="vote-result"
        />
        <div class="trip-vote__result-actions">
          <button type="button" class="trip-vote__cta" data-testid="vote-result-map" @click="goToMap(true)">
            <span class="material-symbols-rounded" aria-hidden="true">map</span>
            지도에서 일정 확인하기
          </button>
          <button
            v-if="isOwner"
            type="button"
            class="trip-vote__ghost"
            data-testid="vote-restart"
            @click="restartRequested = true"
          >
            <span class="material-symbols-rounded" aria-hidden="true">restart_alt</span>
            새 투표 시작하기
          </button>
        </div>
      </div>

      <!-- 진행 중 + 참여자 아님 -->
      <div v-else-if="mode === 'observer'" class="trip-vote__panel trip-vote__idle" data-testid="vote-observer">
        <span class="material-symbols-rounded trip-vote__idle-icon">hourglass_top</span>
        <h2>투표가 진행 중이에요</h2>
        <p>이번 투표는 시작 시점의 멤버들이 참여하고 있어요. 결과는 일정에 자동으로 반영됩니다.</p>
        <button type="button" class="trip-vote__cta" @click="goToMap()">지도로 가기</button>
      </div>

      <!-- 진행 중 세션 -->
      <template v-else>
        <div class="page-hero trip-vote__hero">
          <div class="page-hero__copy">
            <p class="page-hero__eyebrow">
              <span class="material-symbols-rounded" aria-hidden="true">how_to_vote</span>
              Trip Vote
            </p>
            <h1 class="page-hero__title">
              <span class="page-hero__gradient">어디로 갈까요?</span>
            </h1>
            <p class="page-hero__lead">
              멤버들의 취향으로 고른 후보예요. 사진을 넘겨 보며 가고 싶은 곳에 스티커를 붙여주세요.
            </p>
          </div>
          <div class="page-hero__actions">
            <p class="trip-vote__progress" data-testid="vote-progress">
              <span class="material-symbols-rounded" aria-hidden="true">group</span>
              {{ participantSummary?.submitted ?? 0 }}/{{ participantSummary?.total ?? 0 }}명 제출
            </p>
          </div>
        </div>

        <!-- 제출 완료: 대기 -->
        <div v-if="mode === 'waiting'" class="trip-vote__panel trip-vote__waiting" data-testid="vote-waiting">
          <span class="material-symbols-rounded trip-vote__idle-icon">hourglass_top</span>
          <h2>제출을 마쳤어요</h2>
          <p>다른 멤버들이 모두 제출하면 결과가 일정에 자동으로 정리돼요.</p>
          <div class="trip-vote__waiting-progress">
            <div
              class="trip-vote__waiting-bar"
              :style="{ width: `${participantSummary && participantSummary.total > 0
                ? (participantSummary.submitted / participantSummary.total) * 100 : 0}%` }"
            />
          </div>
          <button
            v-if="isOwner"
            type="button"
            class="trip-vote__ghost"
            data-testid="vote-close-open"
            @click="closeConfirmOpen = true"
          >
            <span class="material-symbols-rounded" aria-hidden="true">timer_off</span>
            투표 마감하기
          </button>
        </div>

        <!-- 투표: 큰 사진 덱 + 스티커 장바구니 -->
        <div v-else class="trip-vote__layout">
          <VoteCandidateDeck :candidates="candidates" />
          <VoteStickerCart
            :candidates="candidates"
            :is-owner="isOwner"
            @submit="submit"
            @close-request="closeConfirmOpen = true"
          />
        </div>
      </template>

      <!-- 조기 종료 확인 -->
      <div v-if="closeConfirmOpen" class="trip-vote__modal" data-testid="vote-close-modal">
        <div class="trip-vote__modal-body">
          <h2>투표를 마감할까요?</h2>
          <p v-if="voting.hasUnvotedParticipants" class="trip-vote__modal-warning" data-testid="vote-close-warning">
            아직 제출하지 않은 멤버가
            {{ (participantSummary?.total ?? 0) - (participantSummary?.submitted ?? 0) }}명 있어요.
            지금 마감하면 그분들의 스티커는 반영되지 않아요.
          </p>
          <label v-if="voting.hasUnvotedParticipants" class="trip-vote__modal-check">
            <input v-model="acknowledged" type="checkbox" data-testid="vote-close-ack" />
            <span>확인했어요</span>
          </label>
          <div class="trip-vote__modal-actions">
            <button type="button" data-testid="vote-close-cancel" @click="closeConfirmOpen = false">
              취소
            </button>
            <button
              type="button"
              class="confirm"
              data-testid="vote-close-confirm"
              :disabled="!isOwnerCloseAllowed || voting.closing"
              @click="closeEarly"
            >
              마감
            </button>
          </div>
        </div>
      </div>
    </section>
  </AppShell>
</template>

<style scoped>
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
  padding: 46px 32px;
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
  background: var(--surface-2);
  border-radius: 999px;
  height: 10px;
  margin: 0 auto 20px;
  max-width: 380px;
  overflow: hidden;
}

.trip-vote__waiting-bar {
  background: linear-gradient(90deg, var(--violet), var(--blue));
  border-radius: 999px;
  height: 100%;
  transition: width 0.4s ease;
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
  backdrop-filter: blur(4px);
  background: rgba(10, 22, 44, 0.45);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 1200;
}

.trip-vote__modal-body {
  background: var(--surface);
  border-radius: 24px;
  box-shadow: var(--shadow);
  max-width: 420px;
  padding: 28px 24px;
  width: 100%;
}

.trip-vote__modal-body h2 {
  color: var(--ink);
  font-size: 20px;
  font-weight: 900;
  margin: 0 0 12px;
}

.trip-vote__modal-warning {
  background: rgba(255, 90, 138, 0.08);
  border-radius: 14px;
  color: var(--rose, #ff5a8a);
  font-size: 14px;
  line-height: 1.6;
  margin: 0 0 14px;
  padding: 12px 14px;
}

.trip-vote__modal-check {
  align-items: center;
  color: var(--ink);
  display: flex;
  font-size: 14px;
  font-weight: 700;
  gap: 8px;
  margin-bottom: 18px;
}

.trip-vote__modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.trip-vote__modal-actions button {
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  padding: 10px 18px;
}

.trip-vote__modal-actions button.confirm {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
}

.trip-vote__modal-actions button.confirm:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 640px) {
  .trip-vote__panel {
    padding: 34px 20px;
  }
}
</style>
