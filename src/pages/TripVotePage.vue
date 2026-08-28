<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import OwnerVoteSetupPanel from '@/components/voting/OwnerVoteSetupPanel.vue'
import VoteResultPanel from '@/components/voting/VoteResultPanel.vue'
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

/** 남은 스티커를 도트로 보여주기 위한 배열. 지급량이 12개를 넘으면 숫자만 쓴다. */
const stickerDots = computed(() => {
  const total = voting.stickerAllowance
  if (total <= 0 || total > 12) return []
  return Array.from({ length: total }, (_, index) => index < voting.usedStickerCount)
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

function goToMap() {
  router.push({ name: 'Route', params: { tripId: tripId.value } })
}

async function handleSessionOpened() {
  restartRequested.value = false
  toast.success('투표를 시작했어요. 멤버들에게 알려주세요!')
  await voting.load(tripId.value)
  voting.startPolling()
}

/**
 * 페이지에 머무는 동안 세션이 OPEN → COMPLETED로 넘어가면 모두 지도 화면으로 이동한다.
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
        goToMap()
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
      <div class="trip-vote__column">
        <button type="button" class="trip-vote__back" data-testid="vote-back" @click="goToMap">
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
          <button type="button" class="trip-vote__cta" @click="goToMap">지도로 가기</button>
        </div>

        <!-- 종료된 세션: 결과 -->
        <template v-else-if="mode === 'completed'">
          <VoteResultPanel
            :session="voting.session!"
            :result="voting.result"
            data-testid="vote-result"
          />
          <div class="trip-vote__result-actions">
            <button type="button" class="trip-vote__cta" data-testid="vote-result-map" @click="goToMap">
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
        </template>

        <!-- 진행 중 + 참여자 아님 -->
        <div v-else-if="mode === 'observer'" class="trip-vote__panel trip-vote__idle" data-testid="vote-observer">
          <span class="material-symbols-rounded trip-vote__idle-icon">hourglass_top</span>
          <h2>투표가 진행 중이에요</h2>
          <p>이번 투표는 시작 시점의 멤버들이 참여하고 있어요. 결과는 일정에 자동으로 반영됩니다.</p>
          <button type="button" class="trip-vote__cta" @click="goToMap">지도로 가기</button>
        </div>

        <!-- 진행 중 세션 -->
        <template v-else>
          <header class="trip-vote__hero">
            <p class="page-hero__eyebrow">
              <span class="material-symbols-rounded" aria-hidden="true">how_to_vote</span>
              Trip Vote
            </p>
            <h1 class="trip-vote__title">
              <span class="page-hero__gradient">어디로 갈까요?</span>
            </h1>
            <p class="trip-vote__lead">
              멤버들의 취향으로 고른 후보예요. 가고 싶은 곳에 스티커를 붙여주세요.
              한 곳에 몰아 붙여도 좋아요.
            </p>
            <p class="trip-vote__progress" data-testid="vote-progress">
              <span class="material-symbols-rounded" aria-hidden="true">group</span>
              {{ participantSummary?.submitted ?? 0 }}/{{ participantSummary?.total ?? 0 }}명 제출
            </p>
          </header>

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
          </div>

          <!-- 투표 -->
          <template v-else>
            <div class="trip-vote__tray" data-testid="vote-tray">
              <div class="trip-vote__tray-info">
                <span class="trip-vote__tray-label">남은 스티커</span>
                <strong class="trip-vote__tray-count" data-testid="vote-remaining">
                  {{ voting.remainingStickerCount }}
                </strong>
                <span class="trip-vote__tray-total">/ {{ voting.stickerAllowance }}</span>
              </div>
              <div v-if="stickerDots.length" class="trip-vote__dots" aria-hidden="true">
                <span
                  v-for="(used, index) in stickerDots"
                  :key="index"
                  class="trip-vote__dot"
                  :class="{ used }"
                />
              </div>
              <button
                type="button"
                class="trip-vote__reset"
                data-testid="vote-reset"
                :disabled="voting.usedStickerCount === 0"
                @click="voting.resetStickers()"
              >
                모두 회수
              </button>
            </div>

            <ul class="trip-vote__candidates" data-testid="vote-candidates">
              <li
                v-for="candidate in candidates"
                :key="candidate.id"
                class="trip-vote__candidate"
                :class="{ picked: voting.stickerCountFor(candidate.id) > 0 }"
              >
                <div class="trip-vote__candidate-media">
                  <img
                    v-if="candidate.thumbnailUrl"
                    :src="candidate.thumbnailUrl"
                    :alt="candidate.name ?? ''"
                    loading="lazy"
                  />
                  <span v-else class="material-symbols-rounded">landscape</span>
                  <span class="trip-vote__candidate-rank">{{ candidate.rank }}</span>
                </div>
                <div class="trip-vote__candidate-body">
                  <span class="trip-vote__candidate-name" data-testid="candidate-name">
                    {{ candidate.name }}
                  </span>
                  <span class="trip-vote__candidate-address">{{ candidate.address }}</span>
                </div>
                <div class="trip-vote__candidate-controls">
                  <button
                    type="button"
                    class="trip-vote__step"
                    data-testid="candidate-withdraw"
                    :disabled="voting.stickerCountFor(candidate.id) === 0"
                    aria-label="스티커 회수"
                    @click="voting.withdrawSticker(candidate.id)"
                  >
                    <span class="material-symbols-rounded">remove</span>
                  </button>
                  <span
                    class="trip-vote__candidate-count"
                    :class="{ active: voting.stickerCountFor(candidate.id) > 0 }"
                    data-testid="candidate-sticker-count"
                  >
                    {{ voting.stickerCountFor(candidate.id) }}
                  </span>
                  <button
                    type="button"
                    class="trip-vote__step trip-vote__step--add"
                    data-testid="candidate-place"
                    :disabled="voting.remainingStickerCount === 0"
                    aria-label="스티커 붙이기"
                    @click="voting.placeSticker(candidate.id)"
                  >
                    <span class="material-symbols-rounded">add</span>
                  </button>
                </div>
              </li>
            </ul>

            <button
              type="button"
              class="trip-vote__cta trip-vote__submit"
              data-testid="vote-submit"
              :disabled="!voting.canSubmit || voting.submitting"
              @click="submit"
            >
              <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
              {{ voting.usedStickerCount > 0 ? `스티커 ${voting.usedStickerCount}개로 제출하기` : '스티커를 붙여주세요' }}
            </button>
          </template>

          <div v-if="isOwner" class="trip-vote__owner">
            <button
              type="button"
              class="trip-vote__ghost"
              data-testid="vote-close-open"
              @click="closeConfirmOpen = true"
            >
              <span class="material-symbols-rounded" aria-hidden="true">timer_off</span>
              투표 마감하기
            </button>
          </div>
        </template>
      </div>

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
.trip-vote__column {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin: 0 auto;
  max-width: 680px;
  padding-bottom: 48px;
  width: 100%;
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
  padding: 6px 10px 6px 4px;
  transition: color 0.2s ease;
}

.trip-vote__back:hover {
  color: var(--ink);
}

.trip-vote__back .material-symbols-rounded {
  font-size: 20px;
}

.trip-vote__hero {
  padding: 4px 4px 0;
}

.trip-vote__title {
  color: var(--ink);
  font-size: clamp(28px, 3.6vw, 40px);
  font-weight: 900;
  line-height: 1.15;
  margin: 0 0 10px;
  word-break: keep-all;
}

.trip-vote__lead {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.7;
  margin: 0 0 12px;
}

.trip-vote__progress {
  align-items: center;
  color: var(--violet);
  display: inline-flex;
  font-size: 13px;
  font-weight: 800;
  gap: 5px;
  margin: 0;
}

.trip-vote__progress .material-symbols-rounded {
  font-size: 17px;
}

.trip-vote__panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--soft-shadow);
  padding: 28px;
}

.trip-vote__idle,
.trip-vote__waiting {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 48px 28px;
  text-align: center;
}

.trip-vote__idle-icon {
  color: var(--lavender);
  font-size: 52px;
  font-variation-settings: 'wght' 300;
}

.trip-vote__idle h2,
.trip-vote__waiting h2 {
  color: var(--ink);
  font-size: 20px;
  font-weight: 800;
  margin: 0;
}

.trip-vote__idle p,
.trip-vote__waiting p {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
  max-width: 380px;
}

.trip-vote__waiting-progress {
  background: var(--surface-2);
  border-radius: 999px;
  height: 8px;
  margin-top: 14px;
  max-width: 320px;
  overflow: hidden;
  width: 100%;
}

.trip-vote__waiting-bar {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border-radius: 999px;
  height: 100%;
  transition: width 0.5s ease;
}

.trip-vote__tray {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--soft-shadow);
  display: flex;
  flex-wrap: wrap;
  gap: 10px 14px;
  padding: 14px 18px;
  position: sticky;
  top: 84px;
  z-index: 5;
}

.trip-vote__tray-info {
  align-items: baseline;
  display: flex;
  gap: 5px;
}

.trip-vote__tray-label {
  color: var(--muted);
  font-size: 13px;
  font-weight: 600;
}

.trip-vote__tray-count {
  color: var(--violet);
  font-size: 22px;
  font-weight: 900;
}

.trip-vote__tray-total {
  color: var(--muted);
  font-size: 13px;
}

.trip-vote__dots {
  display: flex;
  gap: 5px;
}

.trip-vote__dot {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border-radius: 999px;
  height: 12px;
  transition: opacity 0.2s ease, transform 0.2s ease;
  width: 12px;
}

.trip-vote__dot.used {
  opacity: 0.18;
  transform: scale(0.8);
}

.trip-vote__reset {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  margin-left: auto;
  padding: 6px 8px;
}

.trip-vote__reset:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.trip-vote__candidates {
  display: flex;
  flex-direction: column;
  gap: 10px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.trip-vote__candidate {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--soft-shadow);
  display: flex;
  gap: 14px;
  padding: 12px 14px;
  transition: border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease;
}

.trip-vote__candidate:hover {
  transform: translateY(-1px);
}

.trip-vote__candidate.picked {
  border-color: rgba(0, 102, 255, 0.45);
  box-shadow: 0 10px 26px rgba(0, 102, 255, 0.14);
}

.trip-vote__candidate-media {
  align-items: center;
  background: var(--surface-2);
  border-radius: 14px;
  color: var(--lavender);
  display: flex;
  flex-shrink: 0;
  height: 64px;
  justify-content: center;
  overflow: hidden;
  position: relative;
  width: 64px;
}

.trip-vote__candidate-media img {
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.trip-vote__candidate-rank {
  background: rgba(26, 32, 51, 0.72);
  border-radius: 8px;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  left: 4px;
  padding: 2px 6px;
  position: absolute;
  top: 4px;
}

.trip-vote__candidate-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.trip-vote__candidate-name {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}

.trip-vote__candidate-address {
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trip-vote__candidate-controls {
  align-items: center;
  display: flex;
  gap: 8px;
}

.trip-vote__step {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  height: 34px;
  justify-content: center;
  transition: background 0.2s ease, border-color 0.2s ease;
  width: 34px;
}

.trip-vote__step .material-symbols-rounded {
  font-size: 18px;
}

.trip-vote__step:hover:not(:disabled) {
  background: var(--surface-2);
}

.trip-vote__step--add {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: none;
  color: #fff;
}

.trip-vote__step--add:hover:not(:disabled) {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  filter: brightness(1.06);
}

.trip-vote__step:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.trip-vote__candidate-count {
  color: var(--muted);
  font-size: 15px;
  font-weight: 800;
  min-width: 20px;
  text-align: center;
}

.trip-vote__candidate-count.active {
  color: var(--violet);
}

.trip-vote__cta {
  align-items: center;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: none;
  border-radius: 999px;
  box-shadow: 0 10px 30px rgba(0, 102, 255, 0.3);
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 800;
  gap: 6px;
  justify-content: center;
  padding: 14px 26px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.trip-vote__cta:hover:not(:disabled) {
  box-shadow: 0 14px 36px rgba(0, 102, 255, 0.35);
  transform: translateY(-2px);
}

.trip-vote__cta:disabled {
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.5;
}

.trip-vote__submit {
  width: 100%;
}

.trip-vote__ghost {
  align-items: center;
  background: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  display: inline-flex;
  font-size: 13px;
  font-weight: 700;
  gap: 5px;
  justify-content: center;
  padding: 11px 20px;
  transition: background 0.2s ease, color 0.2s ease;
}

.trip-vote__ghost:hover {
  background: var(--surface-2);
  color: var(--ink);
}

.trip-vote__ghost .material-symbols-rounded {
  font-size: 17px;
}

.trip-vote__owner {
  display: flex;
  justify-content: center;
  margin-top: 4px;
}

.trip-vote__result-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.trip-vote__modal {
  align-items: center;
  background: rgba(26, 32, 51, 0.4);
  backdrop-filter: blur(4px);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 2000;
}

.trip-vote__modal-body {
  background: var(--surface);
  border-radius: 24px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
  padding: 26px;
  width: 100%;
}

.trip-vote__modal-body h2 {
  color: var(--ink);
  font-size: 19px;
  font-weight: 800;
  margin: 0;
}

.trip-vote__modal-warning {
  color: var(--rose);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.trip-vote__modal-check {
  align-items: center;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  font-size: 14px;
  font-weight: 600;
  gap: 8px;
}

.trip-vote__modal-check input {
  accent-color: var(--violet);
}

.trip-vote__modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.trip-vote__modal-actions button {
  background: none;
  border: none;
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  padding: 10px 16px;
}

.trip-vote__modal-actions button.confirm {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  padding: 10px 22px;
}

.trip-vote__modal-actions button.confirm:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

@media (max-width: 640px) {
  .trip-vote__tray {
    top: 72px;
  }

  .trip-vote__candidate-media {
    height: 52px;
    width: 52px;
  }
}
</style>
