<script setup lang="ts">
import { computed, ref } from 'vue'
import { useVotingStore } from '@/stores/voting.store'

defineProps<{ tripTitle?: string }>()

const emit = defineEmits<{ opened: [] }>()

const voting = useVotingStore()

/** 기본 후보 수는 서버 설계값 10개다. 지급/선정 개수는 후보 수를 넘을 수 없다. */
const CANDIDATE_COUNT = 10

const stickerAllowance = ref(5)
const selectionCount = ref(3)
const opening = ref(false)
const errorMessage = ref('')

const canOpen = computed(
  () =>
    stickerAllowance.value >= 1 &&
    stickerAllowance.value <= CANDIDATE_COUNT &&
    selectionCount.value >= 1 &&
    selectionCount.value <= CANDIDATE_COUNT &&
    !opening.value,
)

function stepper(target: 'sticker' | 'selection', delta: number) {
  if (target === 'sticker') {
    stickerAllowance.value = Math.min(CANDIDATE_COUNT, Math.max(1, stickerAllowance.value + delta))
  } else {
    selectionCount.value = Math.min(CANDIDATE_COUNT, Math.max(1, selectionCount.value + delta))
  }
}

function messageFor(code: string | undefined) {
  switch (code) {
    case 'VOTE_CANDIDATE_POOL_INSUFFICIENT':
      return '여행 지역에서 후보 관광지를 충분히 찾지 못했어요. 여행 지역이나 목적지를 먼저 설정해주세요.'
    case 'VOTE_SESSION_ALREADY_OPEN':
      return '이미 진행 중인 투표가 있어요.'
    case 'FORBIDDEN':
      return '투표는 방장만 시작할 수 있어요.'
    default:
      return '투표를 시작하지 못했습니다. 잠시 후 다시 시도해주세요.'
  }
}

async function open() {
  if (!canOpen.value) return
  opening.value = true
  errorMessage.value = ''
  try {
    await voting.openSession({
      stickerAllowance: stickerAllowance.value,
      selectionCount: selectionCount.value,
    })
    emit('opened')
  } catch (error) {
    const code = (error as { response?: { data?: { code?: string } } })?.response?.data?.code
    errorMessage.value = messageFor(code)
  } finally {
    opening.value = false
  }
}
</script>

<template>
  <div class="vote-setup" data-testid="vote-setup">
    <p class="page-hero__eyebrow">
      <span class="material-symbols-rounded" aria-hidden="true">how_to_vote</span>
      Trip Vote
    </p>
    <h1 class="vote-setup__title">
      <span class="page-hero__gradient">스티커 투표</span>로<br />갈 곳을 함께 정해요
    </h1>
    <p class="vote-setup__lead">
      투표를 시작하면 지금 함께하는 멤버 전원이 참여자가 되고, 여행 지역과 멤버들의 취향으로
      후보 관광지 {{ CANDIDATE_COUNT }}곳을 자동으로 골라드려요.
    </p>

    <div class="vote-setup__panel">
      <div class="vote-setup__row">
        <span class="vote-setup__row-icon" aria-hidden="true">
          <span class="material-symbols-rounded">favorite</span>
        </span>
        <div class="vote-setup__row-copy">
          <strong>1인당 스티커</strong>
          <span>각 멤버가 붙일 수 있는 스티커 개수예요.</span>
          <span class="vote-setup__dots" aria-hidden="true">
            <span v-for="dot in stickerAllowance" :key="dot" class="vote-setup__dot"></span>
          </span>
        </div>
        <div class="vote-setup__stepper" data-testid="setup-sticker-stepper">
          <button type="button" aria-label="스티커 줄이기" data-testid="setup-sticker-minus" @click="stepper('sticker', -1)">
            <span class="material-symbols-rounded">remove</span>
          </button>
          <strong data-testid="setup-sticker-count">{{ stickerAllowance }}</strong>
          <button type="button" aria-label="스티커 늘리기" data-testid="setup-sticker-plus" @click="stepper('sticker', 1)">
            <span class="material-symbols-rounded">add</span>
          </button>
        </div>
      </div>

      <div class="vote-setup__row">
        <span class="vote-setup__row-icon vote-setup__row-icon--rank" aria-hidden="true">
          <span class="material-symbols-rounded">emoji_events</span>
        </span>
        <div class="vote-setup__row-copy">
          <strong>선정할 관광지</strong>
          <span>스티커를 많이 받은 순서로 일정(일차 미정)에 담아드려요.</span>
          <span class="vote-setup__ranks" aria-hidden="true">
            <span v-for="rank in selectionCount" :key="rank" class="vote-setup__rank">{{ rank }}</span>
          </span>
        </div>
        <div class="vote-setup__stepper" data-testid="setup-selection-stepper">
          <button type="button" aria-label="선정 개수 줄이기" data-testid="setup-selection-minus" @click="stepper('selection', -1)">
            <span class="material-symbols-rounded">remove</span>
          </button>
          <strong data-testid="setup-selection-count">{{ selectionCount }}</strong>
          <button type="button" aria-label="선정 개수 늘리기" data-testid="setup-selection-plus" @click="stepper('selection', 1)">
            <span class="material-symbols-rounded">add</span>
          </button>
        </div>
      </div>

      <p class="vote-setup__note">
        <span class="material-symbols-rounded" aria-hidden="true">info</span>
        시작한 뒤에는 스티커 개수와 선정 개수를 바꿀 수 없어요. 모두 제출하면 자동으로 마감됩니다.
      </p>

      <p v-if="errorMessage" class="vote-setup__error" data-testid="setup-error">
        <span class="material-symbols-rounded" aria-hidden="true">error</span>
        {{ errorMessage }}
      </p>

      <button
        type="button"
        class="vote-setup__cta"
        data-testid="setup-open"
        :disabled="!canOpen"
        @click="open"
      >
        <span class="material-symbols-rounded" aria-hidden="true">rocket_launch</span>
        {{ opening ? '후보를 고르는 중…' : '투표 시작하기' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.vote-setup {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;
}

.vote-setup__title {
  color: var(--ink);
  font-size: clamp(28px, 3.6vw, 40px);
  font-weight: 900;
  line-height: 1.2;
  margin: 0;
  word-break: keep-all;
}

.vote-setup__lead {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.7;
  margin: 0 0 8px;
}

.vote-setup__panel {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--soft-shadow);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.vote-setup__row {
  align-items: flex-start;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.vote-setup__row-copy {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}

.vote-setup__row-copy strong {
  color: var(--ink);
  font-size: 15px;
  font-weight: 800;
}

.vote-setup__row-copy span {
  color: var(--muted);
  font-size: 12.5px;
}

.vote-setup__stepper {
  align-items: center;
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 999px;
  display: flex;
  gap: 4px;
  padding: 4px;
}

.vote-setup__stepper strong {
  color: var(--ink);
  font-size: 16px;
  font-weight: 900;
  min-width: 30px;
  text-align: center;
}

.vote-setup__stepper button {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: flex;
  height: 32px;
  justify-content: center;
  transition: background 0.2s ease;
  width: 32px;
}

.vote-setup__stepper button:hover {
  background: var(--surface-2);
}

.vote-setup__stepper .material-symbols-rounded {
  font-size: 17px;
}

.vote-setup__note {
  align-items: flex-start;
  background: var(--surface-2);
  border-radius: 14px;
  color: var(--muted);
  display: flex;
  font-size: 12.5px;
  gap: 6px;
  line-height: 1.6;
  margin: 0;
  padding: 12px 14px;
}

.vote-setup__note .material-symbols-rounded {
  color: var(--violet);
  font-size: 17px;
}

.vote-setup__error {
  align-items: flex-start;
  color: var(--rose);
  display: flex;
  font-size: 13px;
  font-weight: 600;
  gap: 6px;
  line-height: 1.5;
  margin: 0;
}

.vote-setup__error .material-symbols-rounded {
  font-size: 17px;
}

.vote-setup__cta {
  align-items: center;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: none;
  border-radius: 999px;
  box-shadow: 0 10px 30px rgba(0, 102, 255, 0.3);
  color: #fff;
  cursor: pointer;
  display: flex;
  font-size: 15px;
  font-weight: 800;
  gap: 6px;
  justify-content: center;
  padding: 15px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  width: 100%;
}

.vote-setup__cta:hover:not(:disabled) {
  box-shadow: 0 14px 36px rgba(0, 102, 255, 0.35);
  transform: translateY(-2px);
}

.vote-setup__cta:disabled {
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.55;
}

@media (max-width: 640px) {
  .vote-setup__row {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }
}

/* 행 아이콘 칩 */
.vote-setup__row-icon {
  align-items: center;
  background: rgba(255, 92, 141, 0.1);
  border-radius: 999px;
  color: #ff5c8d;
  display: flex;
  flex: 0 0 auto;
  height: 34px;
  justify-content: center;
  width: 34px;
}

.vote-setup__row-icon--rank {
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
}

.vote-setup__row-icon .material-symbols-rounded {
  font-size: 18px;
  font-variation-settings: 'FILL' 1;
}

/* 개수 미리보기: 스티커 도트 */
.vote-setup__dots {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.vote-setup__dot {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border-radius: 999px;
  height: 11px;
  width: 11px;
}

/* 개수 미리보기: 선정 순위 배지 */
.vote-setup__ranks {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}

.vote-setup__rank {
  align-items: center;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border-radius: 999px;
  color: #fff;
  display: flex;
  font-size: 11px;
  font-weight: 800;
  height: 20px;
  justify-content: center;
  width: 20px;
}

</style>
