<script setup lang="ts">
import { computed } from 'vue'
import { useVotingStore } from '@/stores/voting.store'
import type { TripVoteCandidate } from '@/types/voting'

/**
 * 지금까지 붙인 스티커를 장바구니처럼 모아 보여주는 패널.
 * 남은 스티커, 후보별 개수 조절, 제출까지 여기서 처리한다.
 */
const props = defineProps<{
  candidates: TripVoteCandidate[]
  isOwner?: boolean
}>()

const emit = defineEmits<{
  submit: []
  'close-request': []
}>()

const voting = useVotingStore()

/** 스티커가 붙은 후보만, 붙인 순서대로. */
const rows = computed(() =>
  voting.draftPlacements
    .map((placement) => {
      const candidate = props.candidates.find((item) => item.id === placement.candidateId)
      return candidate ? { candidate, count: placement.stickerCount } : null
    })
    .filter((row): row is { candidate: TripVoteCandidate; count: number } => row !== null),
)

/** 지급량이 12개 이하일 때만 도트로 표현한다. */
const dots = computed(() => {
  const total = voting.stickerAllowance
  if (total <= 0 || total > 12) return []
  return Array.from({ length: total }, (_, index) => index < voting.usedStickerCount)
})
</script>

<template>
  <aside class="vote-cart" data-testid="vote-tray">
    <header class="vote-cart__header">
      <h2 class="vote-cart__title">
        <span class="material-symbols-rounded" aria-hidden="true">shopping_bag</span>
        스티커 보드
      </h2>
      <span class="vote-cart__remaining" data-testid="vote-remaining">
        남은 스티커 <strong>{{ voting.remainingStickerCount }}</strong> / {{ voting.stickerAllowance }}
      </span>
    </header>

    <div v-if="dots.length" class="vote-cart__dots" aria-hidden="true">
      <span
        v-for="(used, dotIndex) in dots"
        :key="dotIndex"
        class="vote-cart__dot"
        :class="{ 'vote-cart__dot--used': used }"
      ></span>
    </div>

    <p v-if="rows.length === 0" class="vote-cart__empty" data-testid="cart-empty">
      큰 사진을 넘겨 보며<br />마음에 드는 곳에 스티커를 붙여보세요.
    </p>

    <ul v-else class="vote-cart__list">
      <li v-for="row in rows" :key="row.candidate.id" class="vote-cart__item" data-testid="cart-item">
        <img
          v-if="row.candidate.thumbnailUrl"
          :src="row.candidate.thumbnailUrl"
          alt=""
          class="vote-cart__thumb"
        />
        <span v-else class="vote-cart__thumb vote-cart__thumb--empty">
          <span class="material-symbols-rounded" aria-hidden="true">landscape</span>
        </span>

        <span class="vote-cart__name">{{ row.candidate.name ?? '이름 미상' }}</span>

        <div class="vote-cart__stepper">
          <button
            type="button"
            data-testid="cart-minus"
            aria-label="스티커 회수"
            @click="voting.withdrawSticker(row.candidate.id)"
          >
            <span class="material-symbols-rounded" aria-hidden="true">remove</span>
          </button>
          <strong data-testid="cart-count">{{ row.count }}</strong>
          <button
            type="button"
            data-testid="cart-plus"
            aria-label="스티커 추가"
            :disabled="voting.remainingStickerCount === 0"
            @click="voting.placeSticker(row.candidate.id)"
          >
            <span class="material-symbols-rounded" aria-hidden="true">add</span>
          </button>
        </div>
      </li>
    </ul>

    <button
      v-if="rows.length > 0"
      type="button"
      class="vote-cart__reset"
      data-testid="vote-reset"
      @click="voting.resetStickers()"
    >
      모두 회수
    </button>

    <button
      type="button"
      class="vote-cart__submit"
      data-testid="vote-submit"
      :disabled="!voting.canSubmit || voting.submitting"
      @click="emit('submit')"
    >
      <span class="material-symbols-rounded" aria-hidden="true">check_circle</span>
      {{ voting.usedStickerCount > 0 ? `스티커 ${voting.usedStickerCount}개로 제출하기` : '스티커를 붙여주세요' }}
    </button>
    <p class="vote-cart__hint">제출하면 다시 바꿀 수 없어요.</p>

    <button
      v-if="isOwner"
      type="button"
      class="vote-cart__close"
      data-testid="vote-close-open"
      @click="emit('close-request')"
    >
      <span class="material-symbols-rounded" aria-hidden="true">timer_off</span>
      투표 마감하기
    </button>
  </aside>
</template>

<style scoped>
.vote-cart {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface);
  box-shadow: var(--soft-shadow);
}

.vote-cart__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.vote-cart__title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  color: var(--ink);
  font-size: 17px;
  font-weight: 900;
}

.vote-cart__title .material-symbols-rounded {
  color: var(--violet);
  font-size: 20px;
}

.vote-cart__remaining {
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.vote-cart__remaining strong {
  color: var(--violet);
  font-size: 15px;
}

.vote-cart__dots {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.vote-cart__dot {
  width: 12px;
  height: 12px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.vote-cart__dot--used {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border-color: transparent;
}

.vote-cart__empty {
  margin: 8px 0;
  padding: 22px 12px;
  border: 1px dashed var(--line);
  border-radius: 16px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.7;
  text-align: center;
}

.vote-cart__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: 320px;
  overflow-y: auto;
}

.vote-cart__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
}

.vote-cart__thumb {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  object-fit: cover;
}

.vote-cart__thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: rgba(0, 102, 255, 0.4);
}

.vote-cart__name {
  flex: 1;
  min-width: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vote-cart__stepper {
  display: flex;
  align-items: center;
  gap: 6px;
}

.vote-cart__stepper button {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  transition: background 0.15s ease;
}

.vote-cart__stepper button:hover:not(:disabled) {
  background: var(--surface-2);
}

.vote-cart__stepper button:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.vote-cart__stepper .material-symbols-rounded {
  font-size: 16px;
}

.vote-cart__stepper strong {
  min-width: 18px;
  text-align: center;
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
}

.vote-cart__reset {
  align-self: flex-end;
  border: none;
  background: none;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.vote-cart__reset:hover {
  color: var(--ink);
}

.vote-cart__submit {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 14px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 12px 26px rgba(0, 102, 255, 0.28);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.vote-cart__submit:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 16px 32px rgba(0, 102, 255, 0.34);
}

.vote-cart__submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
  box-shadow: none;
}

.vote-cart__hint {
  margin: -6px 0 0;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

.vote-cart__close {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  margin-top: 2px;
  padding: 11px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--muted);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.vote-cart__close:hover {
  background: var(--surface-2);
  color: var(--ink);
}
</style>
