<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useVotingStore } from '@/stores/voting.store'
import { useToast } from '@/composables/useToast'

const route = useRoute()
const router = useRouter()
const voting = useVotingStore()
const toast = useToast()

const tripId = computed(() => String(route.params.tripId ?? ''))
const closeConfirmOpen = ref(false)
const acknowledged = ref(false)

const candidates = computed(() => voting.session?.candidates ?? [])
const participantSummary = computed(() => voting.session?.participantSummary ?? null)
const isOwnerCloseAllowed = computed(() => !voting.hasUnvotedParticipants || acknowledged.value)

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
    toast.success('투표를 종료했어요.')
  } catch {
    toast.error('투표를 종료하지 못했습니다.')
  }
}

function goToMap() {
  router.push({ name: 'Route', params: { tripId: tripId.value } })
}

watch(
  () => voting.nextScreen,
  (next) => {
    if (next === 'MAP') goToMap()
  },
)

onMounted(async () => {
  await voting.load(tripId.value)
  if (voting.nextScreen === 'MAP') {
    goToMap()
    return
  }
  voting.startPolling()
})

onUnmounted(() => {
  voting.stopPolling()
})
</script>

<template>
  <AppShell>
    <section class="trip-vote">
      <LoadingState v-if="voting.loading && !voting.session" data-testid="vote-loading" />

      <ErrorState
        v-else-if="voting.error && !voting.session"
        data-testid="vote-error"
        message="투표 정보를 불러오지 못했습니다."
        @retry="voting.load(tripId)"
      />

      <template v-else-if="voting.session">
        <header class="trip-vote-header">
          <h1 class="trip-vote-title">어디를 갈까요?</h1>
          <p class="trip-vote-subtitle">
            스티커를 붙여 가고 싶은 곳을 골라주세요. 한 곳에 여러 개를 몰아 붙일 수 있어요.
          </p>
          <p class="trip-vote-progress" data-testid="vote-progress">
            {{ participantSummary?.submitted ?? 0 }}/{{ participantSummary?.total ?? 0 }}명 제출
          </p>
        </header>

        <!-- 제출을 마치면 투표가 끝날 때까지 대기 화면을 본다. -->
        <div v-if="voting.isSubmitted" class="trip-vote-waiting" data-testid="vote-waiting">
          <span class="material-symbols-rounded">hourglass_top</span>
          <p class="trip-vote-waiting-title">제출을 마쳤어요</p>
          <p class="trip-vote-waiting-text">
            다른 참여자들이 모두 제출하면 결과가 자동으로 정리돼요.
          </p>
        </div>

        <template v-else>
          <div class="trip-vote-tray" data-testid="vote-tray">
            <span class="trip-vote-tray-label">남은 스티커</span>
            <strong class="trip-vote-tray-count" data-testid="vote-remaining">
              {{ voting.remainingStickerCount }}
            </strong>
            <span class="trip-vote-tray-total">/ {{ voting.stickerAllowance }}</span>
            <button
              type="button"
              class="trip-vote-reset"
              data-testid="vote-reset"
              @click="voting.resetStickers()"
            >
              모두 회수
            </button>
          </div>

          <ul class="trip-vote-candidates" data-testid="vote-candidates">
            <li v-for="candidate in candidates" :key="candidate.id" class="trip-vote-candidate">
              <img
                v-if="candidate.thumbnailUrl"
                :src="candidate.thumbnailUrl"
                :alt="candidate.name ?? ''"
                class="trip-vote-candidate-image"
                loading="lazy"
              />
              <div class="trip-vote-candidate-body">
                <span class="trip-vote-candidate-name" data-testid="candidate-name">
                  {{ candidate.name }}
                </span>
                <span class="trip-vote-candidate-address">{{ candidate.address }}</span>
              </div>
              <div class="trip-vote-candidate-controls">
                <button
                  type="button"
                  class="trip-vote-step"
                  data-testid="candidate-withdraw"
                  :disabled="voting.stickerCountFor(candidate.id) === 0"
                  @click="voting.withdrawSticker(candidate.id)"
                >
                  −
                </button>
                <span class="trip-vote-candidate-count" data-testid="candidate-sticker-count">
                  {{ voting.stickerCountFor(candidate.id) }}
                </span>
                <button
                  type="button"
                  class="trip-vote-step"
                  data-testid="candidate-place"
                  :disabled="voting.remainingStickerCount === 0"
                  @click="voting.placeSticker(candidate.id)"
                >
                  +
                </button>
              </div>
            </li>
          </ul>

          <div class="trip-vote-actions">
            <button
              type="button"
              class="trip-vote-submit"
              data-testid="vote-submit"
              :disabled="!voting.canSubmit || voting.submitting"
              @click="submit"
            >
              제출하기
            </button>
          </div>
        </template>

        <div v-if="voting.session.status === 'OPEN'" class="trip-vote-owner">
          <button
            type="button"
            class="trip-vote-close"
            data-testid="vote-close-open"
            @click="closeConfirmOpen = true"
          >
            투표 마감하기
          </button>
        </div>
      </template>

      <div v-if="closeConfirmOpen" class="trip-vote-modal" data-testid="vote-close-modal">
        <div class="trip-vote-modal-body">
          <h2 class="trip-vote-modal-title">투표를 마감할까요?</h2>
          <p v-if="voting.hasUnvotedParticipants" class="trip-vote-modal-warning" data-testid="vote-close-warning">
            아직 제출하지 않은 참여자가
            {{ (participantSummary?.total ?? 0) - (participantSummary?.submitted ?? 0) }}명 있어요.
            지금 마감하면 그분들의 스티커는 반영되지 않아요.
          </p>
          <label v-if="voting.hasUnvotedParticipants" class="trip-vote-modal-check">
            <input v-model="acknowledged" type="checkbox" data-testid="vote-close-ack" />
            <span>확인했어요</span>
          </label>
          <div class="trip-vote-modal-actions">
            <button type="button" data-testid="vote-close-cancel" @click="closeConfirmOpen = false">
              취소
            </button>
            <button
              type="button"
              class="trip-vote-modal-confirm"
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
  margin: 0 auto;
  max-width: 640px;
  padding-bottom: 40px;
  width: 100%;
}

.trip-vote-header {
  padding: 24px 16px 12px;
}

.trip-vote-title {
  color: var(--ink);
  font-size: 24px;
  font-weight: 800;
  margin: 0;
}

.trip-vote-subtitle {
  color: var(--muted);
  font-size: 14px;
  line-height: 1.6;
  margin: 8px 0 0;
}

.trip-vote-progress {
  color: var(--brand-violet, #6b5bff);
  font-size: 13px;
  font-weight: 700;
  margin: 10px 0 0;
}

.trip-vote-tray {
  align-items: center;
  background: var(--surface-2, transparent);
  border-radius: 14px;
  display: flex;
  gap: 6px;
  margin: 0 16px;
  padding: 12px 16px;
}

.trip-vote-tray-label {
  color: var(--muted);
  font-size: 13px;
}

.trip-vote-tray-count {
  color: var(--ink);
  font-size: 20px;
  font-weight: 800;
}

.trip-vote-tray-total {
  color: var(--muted);
  font-size: 13px;
}

.trip-vote-reset {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 12px;
  margin-left: auto;
}

.trip-vote-candidates {
  display: flex;
  flex-direction: column;
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
}

.trip-vote-candidate {
  align-items: center;
  border-bottom: 1px solid var(--line);
  display: flex;
  gap: 12px;
  padding: 14px 16px;
}

.trip-vote-candidate-image {
  border-radius: 12px;
  height: 56px;
  object-fit: cover;
  width: 56px;
}

.trip-vote-candidate-body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.trip-vote-candidate-name {
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
}

.trip-vote-candidate-address {
  color: var(--muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.trip-vote-candidate-controls {
  align-items: center;
  display: flex;
  gap: 10px;
}

.trip-vote-step {
  background: var(--surface-2, transparent);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  font-size: 16px;
  height: 32px;
  width: 32px;
}

.trip-vote-step:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.trip-vote-candidate-count {
  color: var(--ink);
  font-size: 15px;
  font-weight: 700;
  min-width: 18px;
  text-align: center;
}

.trip-vote-actions {
  padding: 20px 16px 0;
}

.trip-vote-submit {
  background: var(--brand-violet, #6b5bff);
  border: none;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font-size: 15px;
  font-weight: 800;
  padding: 14px;
  width: 100%;
}

.trip-vote-submit:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.trip-vote-waiting {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 48px 16px;
  text-align: center;
}

.trip-vote-waiting-title {
  color: var(--ink);
  font-size: 18px;
  font-weight: 800;
  margin: 0;
}

.trip-vote-waiting-text {
  color: var(--muted);
  font-size: 14px;
  margin: 0;
}

.trip-vote-owner {
  padding: 16px;
}

.trip-vote-close {
  background: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  padding: 10px;
  width: 100%;
}

.trip-vote-modal {
  align-items: center;
  background: rgb(0 0 0 / 40%);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 50;
}

.trip-vote-modal-body {
  background: var(--surface, #fff);
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 400px;
  padding: 20px;
  width: 100%;
}

.trip-vote-modal-title {
  color: var(--ink);
  font-size: 18px;
  font-weight: 800;
  margin: 0;
}

.trip-vote-modal-warning {
  color: var(--brand-rose, #e0567a);
  font-size: 14px;
  line-height: 1.6;
  margin: 0;
}

.trip-vote-modal-check {
  align-items: center;
  color: var(--ink);
  display: flex;
  font-size: 14px;
  gap: 8px;
}

.trip-vote-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.trip-vote-modal-actions button {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 14px;
  padding: 8px 14px;
}

.trip-vote-modal-confirm {
  background: var(--brand-violet, #6b5bff);
  border-radius: 999px;
  color: #fff;
  font-weight: 700;
}

.trip-vote-modal-confirm:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
