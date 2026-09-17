<script setup lang="ts">
import { formatUiText } from '@/i18n/ui-localizer'
import { computed, ref } from 'vue'
import { useVotingStore } from '@/stores/voting.store'
import type { TripVoteCandidate } from '@/types/voting'

/**
 * 투표 후보를 큰 사진 카드로 한 장씩 넘겨 보는 덱.
 * 좌우 버튼·키보드 화살표·드래그(스와이프)로 이동하고, 현재 카드에 스티커를 붙인다.
 */
const props = defineProps<{
  candidates: TripVoteCandidate[]
}>()

const voting = useVotingStore()

const index = ref(0)
const direction = ref<'next' | 'prev'>('next')
const brokenImages = ref(new Set<string>())

const current = computed(() => props.candidates[index.value] ?? null)
const currentCount = computed(() =>
  current.value ? voting.stickerCountFor(current.value.id) : 0,
)

function go(step: number) {
  const total = props.candidates.length
  if (total === 0) return
  direction.value = step > 0 ? 'next' : 'prev'
  index.value = (index.value + step + total) % total
}

function jump(target: number) {
  if (target === index.value) return
  direction.value = target > index.value ? 'next' : 'prev'
  index.value = target
}

/* ── 드래그 스와이프 ── */
const dragX = ref(0)
let dragging = false
let startX = 0

function onPointerDown(event: PointerEvent) {
  dragging = true
  startX = event.clientX
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onPointerMove(event: PointerEvent) {
  if (!dragging) return
  dragX.value = Math.max(-120, Math.min(120, event.clientX - startX))
}

function onPointerUp() {
  if (!dragging) return
  dragging = false
  if (dragX.value <= -60) go(1)
  else if (dragX.value >= 60) go(-1)
  dragX.value = 0
}

function imageUrl(candidate: TripVoteCandidate | null) {
  if (!candidate?.thumbnailUrl || brokenImages.value.has(candidate.id)) return null
  return candidate.thumbnailUrl
}
</script>

<template>
  <div
    class="vote-deck"
    data-testid="vote-deck"
    tabindex="0"
    @keydown.left.prevent="go(-1)"
    @keydown.right.prevent="go(1)"
  >
    <div
      class="vote-deck__stage"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <Transition :name="direction === 'next' ? 'deck-next' : 'deck-prev'">
        <article
          v-if="current"
          :key="current.id"
          class="vote-deck__slide"
          data-testid="deck-slide"
          :style="{ transform: dragX ? `translateX(${dragX}px)` : undefined }"
        >
          <img
            v-if="imageUrl(current)"
            :src="imageUrl(current)!"
            :alt="current.name ?? '후보 관광지'"
            class="vote-deck__photo"
            draggable="false"
            @error="brokenImages.add(current.id)"
          />
          <div v-else class="vote-deck__photo vote-deck__photo--empty">
            <span class="material-symbols-rounded" aria-hidden="true">landscape</span>
          </div>

          <div class="vote-deck__scrim" aria-hidden="true"></div>

          <span class="vote-deck__counter" data-testid="deck-index">
            {{ index + 1 }} / {{ candidates.length }}
          </span>

          <span
            v-if="currentCount > 0"
            class="vote-deck__badge"
            data-testid="deck-sticker-badge"
          >
            <span class="material-symbols-rounded" aria-hidden="true">favorite</span>{{ formatUiText("스티커 {0}", "{0} stickers", [currentCount]) }}
          </span>

          <div class="vote-deck__caption">
            <span v-if="current.category" class="vote-deck__category">{{ current.category }}</span>
            <h3 class="vote-deck__name" data-testid="candidate-name">{{ current.name ?? '이름 미상' }}</h3>
            <p v-if="current.address" class="vote-deck__address">{{ current.address }}</p>
          </div>
        </article>
      </Transition>

      <button
        type="button"
        class="vote-deck__nav vote-deck__nav--prev"
        data-testid="deck-prev"
        aria-label="이전 후보"
        @pointerdown.stop
        @click="go(-1)"
      >
        <span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
      </button>
      <button
        type="button"
        class="vote-deck__nav vote-deck__nav--next"
        data-testid="deck-next"
        aria-label="다음 후보"
        @pointerdown.stop
        @click="go(1)"
      >
        <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
      </button>
    </div>

    <div v-if="current" class="vote-deck__controls">
      <button
        type="button"
        class="vote-deck__step"
        data-testid="candidate-withdraw"
        :disabled="currentCount === 0"
        aria-label="스티커 회수"
        @click="voting.withdrawSticker(current.id)"
      >
        <span class="material-symbols-rounded" aria-hidden="true">remove</span>
      </button>

      <div class="vote-deck__count">
        <span class="vote-deck__count-value" data-testid="candidate-sticker-count">{{ currentCount }}</span>
        <span class="vote-deck__count-unit">개 붙임</span>
      </div>

      <button
        type="button"
        class="vote-deck__step vote-deck__step--add"
        data-testid="candidate-place"
        :disabled="voting.remainingStickerCount === 0"
        aria-label="스티커 붙이기"
        @click="voting.placeSticker(current.id)"
      >
        <span class="material-symbols-rounded" aria-hidden="true">add</span>
      </button>
    </div>

    <div class="vote-deck__thumbs" role="tablist" aria-label="후보 목록">
      <button
        v-for="(candidate, thumbIndex) in candidates"
        :key="candidate.id"
        type="button"
        class="vote-deck__thumb"
        :class="{ 'vote-deck__thumb--active': thumbIndex === index }"
        data-testid="deck-thumb"
        role="tab"
        :aria-selected="thumbIndex === index"
        :aria-label="candidate.name ?? `후보 ${thumbIndex + 1}`"
        @click="jump(thumbIndex)"
      >
        <img
          v-if="imageUrl(candidate)"
          :src="imageUrl(candidate)!"
          :alt="candidate.name ?? '후보 썸네일'"
          draggable="false"
          @error="brokenImages.add(candidate.id)"
        />
        <span v-else class="material-symbols-rounded" aria-hidden="true">landscape</span>
        <span
          v-if="voting.stickerCountFor(candidate.id) > 0"
          class="vote-deck__thumb-badge"
        >
          {{ voting.stickerCountFor(candidate.id) }}
        </span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.vote-deck {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
  outline: none;
}

.vote-deck:focus-visible .vote-deck__stage {
  box-shadow: 0 0 0 4px rgba(0, 102, 255, 0.18), var(--shadow);
}

.vote-deck__stage {
  position: relative;
  aspect-ratio: 16 / 10;
  border-radius: 24px;
  overflow: hidden;
  background: var(--surface-2);
  box-shadow: var(--shadow);
  touch-action: pan-y;
  user-select: none;
}

.vote-deck__slide {
  position: absolute;
  inset: 0;
  transition: transform 0.15s ease;
}

.vote-deck__photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.vote-deck__photo--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(160deg, #dcebff 0%, #eef6ff 60%, #ffffff 100%);
  color: rgba(0, 102, 255, 0.4);
}

.vote-deck__photo--empty .material-symbols-rounded {
  font-size: 72px;
}

.vote-deck__scrim {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(8, 18, 38, 0.18) 0%, transparent 32%, transparent 52%, rgba(8, 18, 38, 0.72) 100%);
  pointer-events: none;
}

.vote-deck__counter {
  position: absolute;
  top: 16px;
  left: 16px;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(10, 22, 44, 0.44);
  backdrop-filter: blur(6px);
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.vote-deck__badge {
  position: absolute;
  top: 14px;
  right: 14px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 14px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  box-shadow: 0 8px 20px rgba(0, 102, 255, 0.35);
}

.vote-deck__badge .material-symbols-rounded {
  font-size: 16px;
  font-variation-settings: 'FILL' 1;
}

.vote-deck__caption {
  position: absolute;
  left: 22px;
  right: 22px;
  bottom: 18px;
  color: #fff;
}

.vote-deck__category {
  display: inline-block;
  margin-bottom: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(6px);
  font-size: 12px;
  font-weight: 700;
}

.vote-deck__name {
  margin: 0 0 4px;
  font-size: clamp(20px, 2.4vw, 28px);
  font-weight: 900;
  line-height: 1.25;
  word-break: keep-all;
  text-shadow: 0 2px 12px rgba(8, 18, 38, 0.45);
}

.vote-deck__address {
  margin: 0;
  color: rgba(255, 255, 255, 0.85);
  font-size: 14px;
  line-height: 1.5;
}

.vote-deck__nav {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  color: var(--ink);
  box-shadow: var(--soft-shadow);
  cursor: pointer;
  transition: transform 0.15s ease, background 0.15s ease;
}

.vote-deck__nav:hover {
  background: #fff;
  transform: translateY(-50%) scale(1.06);
}

.vote-deck__nav--prev {
  left: 14px;
}

.vote-deck__nav--next {
  right: 14px;
}

.vote-deck__controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 18px;
}

.vote-deck__step {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 52px;
  height: 52px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  color: var(--ink);
  cursor: pointer;
  box-shadow: var(--soft-shadow);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.vote-deck__step:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}

.vote-deck__step:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  box-shadow: none;
}

.vote-deck__step--add {
  border: none;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
}

.vote-deck__count {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 76px;
  justify-content: center;
}

.vote-deck__count-value {
  color: var(--ink);
  font-size: 28px;
  font-weight: 900;
}

.vote-deck__count-unit {
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
}

.vote-deck__thumbs {
  display: flex;
  gap: 10px;
  overflow-x: auto;
  padding: 4px 4px 8px;
  scrollbar-width: thin;
}

.vote-deck__thumb {
  position: relative;
  flex: 0 0 auto;
  width: 64px;
  height: 64px;
  padding: 0;
  border: 2px solid transparent;
  border-radius: 14px;
  overflow: hidden;
  background: var(--surface-2);
  color: rgba(0, 102, 255, 0.4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s ease, transform 0.15s ease;
}

.vote-deck__thumb:hover {
  transform: translateY(-2px);
}

.vote-deck__thumb--active {
  border-color: var(--violet);
}

.vote-deck__thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.vote-deck__thumb-badge {
  position: absolute;
  right: 4px;
  bottom: 4px;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 슬라이드 전환 */
.deck-next-enter-active,
.deck-next-leave-active,
.deck-prev-enter-active,
.deck-prev-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}

.deck-next-enter-from {
  transform: translateX(48px);
  opacity: 0;
}

.deck-next-leave-to {
  transform: translateX(-48px);
  opacity: 0;
}

.deck-prev-enter-from {
  transform: translateX(-48px);
  opacity: 0;
}

.deck-prev-leave-to {
  transform: translateX(48px);
  opacity: 0;
}

@media (max-width: 640px) {
  .vote-deck__stage {
    aspect-ratio: 4 / 3;
    border-radius: 20px;
  }

  .vote-deck__nav {
    width: 38px;
    height: 38px;
  }
}
</style>
