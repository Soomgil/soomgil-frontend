<script setup lang="ts">
import { computed } from 'vue'
import type { TripVoteSessionDetail, TripVoteSessionResult } from '@/types/voting'

const props = defineProps<{
  session: TripVoteSessionDetail
  result: TripVoteSessionResult | null
}>()

/** 결과 API가 아직 없으면 세션 후보의 종료 후 집계로 그린다. */
const rows = computed(() => {
  if (props.result) {
    return props.result.results.map((item) => ({
      id: item.candidateId,
      name: item.name,
      thumbnailUrl: item.thumbnailUrl,
      stickerCount: item.stickerCount,
      selected: item.selected,
      selectedRank: item.selectedRank,
      addedToItinerary: item.itineraryOutcome === 'ADDED',
      alreadyInItinerary: item.itineraryOutcome === 'SKIPPED_DUPLICATE',
    }))
  }
  return [...props.session.candidates]
    .sort((a, b) => (b.stickerCount ?? 0) - (a.stickerCount ?? 0) || a.rank - b.rank)
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      thumbnailUrl: candidate.thumbnailUrl,
      stickerCount: candidate.stickerCount ?? 0,
      selected: false,
      selectedRank: null as number | null,
      addedToItinerary: false,
      alreadyInItinerary: false,
    }))
})

const selectedCount = computed(() => rows.value.filter((row) => row.selected).length)

const completionLabel = computed(() =>
  props.session.completionReason === 'OWNER_EARLY_CLOSE' ? '방장이 마감했어요' : '모두 제출해서 자동으로 마감됐어요',
)
</script>

<template>
  <div class="vote-result">
    <header class="vote-result__header">
      <p class="page-hero__eyebrow">
        <span class="material-symbols-rounded" aria-hidden="true">celebration</span>
        Vote Result
      </p>
      <h1 class="vote-result__title">
        <span class="page-hero__gradient">투표가 끝났어요!</span>
      </h1>
      <p class="vote-result__lead" data-testid="result-summary">
        {{ completionLabel }}.
        <template v-if="selectedCount > 0">
          선정된 {{ selectedCount }}곳을 일정의 <strong>일차 미정</strong>에 담아뒀어요.
        </template>
      </p>
    </header>

    <ul class="vote-result__list" data-testid="result-list">
      <li
        v-for="(row, index) in rows"
        :key="row.id"
        class="vote-result__row"
        :class="{ selected: row.selected }"
        data-testid="result-row"
      >
        <span class="vote-result__rank" :class="{ top: row.selected }">
          {{ row.selectedRank ?? index + 1 }}
        </span>
        <div class="vote-result__media">
          <img v-if="row.thumbnailUrl" :src="row.thumbnailUrl" :alt="row.name ?? ''" loading="lazy" />
          <span v-else class="material-symbols-rounded">landscape</span>
        </div>
        <div class="vote-result__body">
          <span class="vote-result__name">{{ row.name }}</span>
          <span v-if="row.addedToItinerary" class="vote-result__badge added" data-testid="result-added">
            <span class="material-symbols-rounded">event_available</span>
            일차 미정에 추가됨
          </span>
          <span v-else-if="row.alreadyInItinerary" class="vote-result__badge dup" data-testid="result-dup">
            <span class="material-symbols-rounded">event_repeat</span>
            이미 일정에 있어요
          </span>
        </div>
        <span class="vote-result__count" data-testid="result-sticker-count">
          <span class="material-symbols-rounded" aria-hidden="true">favorite</span>
          {{ row.stickerCount }}
        </span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.vote-result {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.vote-result__header {
  padding: 4px;
}

.vote-result__title {
  color: var(--ink);
  font-size: clamp(28px, 3.6vw, 40px);
  font-weight: 900;
  line-height: 1.2;
  margin: 0 0 8px;
}

.vote-result__lead {
  color: var(--muted);
  font-size: 15px;
  line-height: 1.7;
  margin: 0;
}

.vote-result__lead strong {
  color: var(--ink);
}

.vote-result__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.vote-result__row {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--soft-shadow);
  display: flex;
  gap: 12px;
  padding: 12px 16px;
}

.vote-result__row.selected {
  border-color: rgba(0, 102, 255, 0.45);
  box-shadow: 0 10px 26px rgba(0, 102, 255, 0.14);
}

.vote-result__rank {
  align-items: center;
  background: var(--surface-2);
  border-radius: 999px;
  color: var(--muted);
  display: flex;
  flex-shrink: 0;
  font-size: 13px;
  font-weight: 900;
  height: 30px;
  justify-content: center;
  width: 30px;
}

.vote-result__rank.top {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
}

.vote-result__media {
  align-items: center;
  background: var(--surface-2);
  border-radius: 12px;
  color: var(--lavender);
  display: flex;
  flex-shrink: 0;
  height: 48px;
  justify-content: center;
  overflow: hidden;
  width: 48px;
}

.vote-result__media img {
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.vote-result__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.vote-result__name {
  color: var(--ink);
  font-size: 14.5px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vote-result__badge {
  align-items: center;
  border-radius: 999px;
  display: inline-flex;
  font-size: 11px;
  font-weight: 700;
  gap: 3px;
  padding: 2px 8px;
  width: fit-content;
}

.vote-result__badge .material-symbols-rounded {
  font-size: 13px;
}

.vote-result__badge.added {
  background: rgba(0, 224, 209, 0.14);
  color: #009e93;
}

.vote-result__badge.dup {
  background: var(--surface-2);
  color: var(--muted);
}

.vote-result__count {
  align-items: center;
  color: var(--rose);
  display: flex;
  font-size: 15px;
  font-weight: 900;
  gap: 3px;
}

.vote-result__count .material-symbols-rounded {
  font-size: 17px;
  font-variation-settings: 'FILL' 1;
}
</style>
