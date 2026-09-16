<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { TripVoteSessionDetail, TripVoteSessionResult } from '@/types/voting'

const props = defineProps<{
  session: TripVoteSessionDetail
  result: TripVoteSessionResult | null
}>()

/** 결과 API가 아직 없으면 세션 후보의 종료 후 집계로 그린다. */
const rows = computed(() => {
  if (props.result) {
    return [...props.result.results].sort((a, b) => b.stickerCount - a.stickerCount || (a.selectedRank ?? Infinity) - (b.selectedRank ?? Infinity)).map((item) => ({
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

const showAll = ref(false)
const heading = ref<HTMLElement | null>(null)
const brokenImages = ref(new Set<string>())
const displayedRows = computed(() => showAll.value ? rows.value : rows.value.slice(0, 5))
const addedCount = computed(() => rows.value.filter(row => row.addedToItinerary).length)
const duplicateCount = computed(() => rows.value.filter(row => row.alreadyInItinerary).length)
watch(() => props.session.id, () => { showAll.value = false; brokenImages.value = new Set() })
async function toggleResults() {
  showAll.value = !showAll.value
  await nextTick()
  heading.value?.focus({ preventScroll: true })
  heading.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
}
const selectedCount = computed(() => rows.value.filter((row) => row.selected).length)

const completionLabel = computed(() =>
  props.session.completionReason === 'OWNER_EARLY_CLOSE' ? '방장이 마감했어요' : '모두 제출해서 자동으로 마감됐어요',
)
</script>

<template>
  <div class="vote-result">
    <header class="vote-result__header">
      <p class="vote-result__eyebrow"><span class="material-symbols-rounded" aria-hidden="true">how_to_vote</span> 함께 고른 여행</p>
      <h1 ref="heading" tabindex="-1" class="vote-result__title">{{ showAll ? '전체 투표 결과' : '우리의 다음 여행지' }}</h1>
      <p class="vote-result__lead" data-testid="result-summary">
        {{ completionLabel }}. <strong>{{ selectedCount }}곳 선정</strong>
      </p>
      <p v-if="addedCount || duplicateCount" class="vote-result__outcome">
        일차 미정에 {{ addedCount }}곳 추가<span v-if="duplicateCount"> · 이미 일정에 {{ duplicateCount }}곳</span>
      </p>
    </header>
    <p v-if="!rows.length" class="vote-result__empty">아직 표시할 투표 결과가 없어요.</p>
    <ul v-else class="vote-result__list" :class="{ 'is-overview': !showAll }" data-testid="result-list" aria-label="득표순 여행지">
      <li v-for="(row, index) in displayedRows" :key="row.id" class="vote-result__row"
        :class="{ selected: row.selected, 'is-winner': !showAll && index === 0, 'is-runner-up': !showAll && index > 0 && index < 3 }" data-testid="result-row">
        <span class="vote-result__rank">{{ index + 1 }}<span class="sr-only">위</span></span>
        <div class="vote-result__media">
          <img v-if="row.thumbnailUrl && !brokenImages.has(row.id)" :src="row.thumbnailUrl" :alt="row.name ?? '여행지'" :loading="index === 0 ? 'eager' : 'lazy'" @error="brokenImages.add(row.id)" />
          <span v-else class="material-symbols-rounded" aria-hidden="true">landscape</span>
        </div>
        <div class="vote-result__body">
          <span v-if="!showAll && index === 0" class="vote-result__favorite">가장 많은 스티커를 받은 곳</span>
          <strong class="vote-result__name">{{ row.name || '이름 없는 여행지' }}</strong>
          <span v-if="row.selected" class="vote-result__selected">선정된 장소</span>
          <span v-if="row.addedToItinerary" class="vote-result__badge" data-testid="result-added">일차 미정에 추가됨</span>
          <span v-else-if="row.alreadyInItinerary" class="vote-result__badge" data-testid="result-dup">이미 일정에 있어요</span>
        </div>
        <span class="vote-result__count" data-testid="result-sticker-count"><span class="material-symbols-rounded" aria-hidden="true">favorite</span>{{ row.stickerCount }}<small>개</small></span>
      </li>
    </ul>
    <button v-if="rows.length" type="button" class="vote-result__all" data-testid="result-toggle-all" @click="toggleResults">
      {{ showAll ? '주요 결과로 돌아가기' : `전체 투표 결과 보기 (${rows.length}곳)` }}
      <span class="material-symbols-rounded" aria-hidden="true">{{ showAll ? 'arrow_back' : 'arrow_forward' }}</span>
    </button>
  </div>
</template>

<style scoped>
.vote-result { display:flex; flex-direction:column; gap:16px; color:#35465a; }
.vote-result__header { padding:20px 24px; background:#f1f8ff; border:1px solid #dfeaf5; border-radius:18px; }
.vote-result__eyebrow { display:flex; align-items:center; gap:6px; margin:0 0 8px; color:#328be0; font-size:12px; font-weight:700; }
.vote-result__eyebrow .material-symbols-rounded { font-size:18px; }
.vote-result__title { margin:0 0 8px; font-size:clamp(23px,3vw,30px); line-height:1.3; outline:none; }
.vote-result__lead,.vote-result__outcome { margin:4px 0 0; font-size:13px; line-height:1.6; color:#647c92; }
.vote-result__list { display:flex; flex-direction:column; gap:10px; list-style:none; padding:0; margin:0; }
.vote-result__row { position:relative; display:flex; align-items:center; gap:14px; padding:12px 16px; border:1px solid #e4edf5; border-radius:14px; background:#fff; }
.vote-result__rank { flex:none; width:25px; text-align:center; color:#647c92; font-size:14px; font-weight:800; }
.vote-result__media { flex:none; width:52px; height:52px; display:grid; place-items:center; overflow:hidden; border-radius:10px; background:#eaf4ff; color:#87accb; }
.vote-result__media img { width:100%; height:100%; object-fit:cover; }
.vote-result__body { flex:1; min-width:0; display:flex; flex-direction:column; align-items:flex-start; gap:4px; }
.vote-result__name { font-size:15px; overflow-wrap:anywhere; }
.vote-result__selected { display:inline-flex; padding:3px 7px; border-radius:6px; background:#eaf4ff; color:#287cbd; font-size:10px; font-weight:700; }
.vote-result__badge { color:#647c92; font-size:11px; }
.vote-result__count { flex:none; display:flex; align-items:center; gap:4px; color:#328be0; font-size:18px; font-weight:800; white-space:nowrap; }
.vote-result__count .material-symbols-rounded { font-size:17px; font-variation-settings:'FILL' 1; }
.vote-result__count small { font-size:11px; font-weight:500; }
.is-winner { display:grid; grid-template-columns:minmax(0,1fr) auto; padding:0 0 20px; gap:18px; overflow:hidden; border-color:#c6dff4; }
.is-winner .vote-result__media { grid-column:1 / -1; width:100%; height:clamp(190px,29vw,310px); border-radius:0; }
.is-winner .vote-result__rank { position:absolute; top:16px; left:16px; display:grid; place-items:center; width:38px; height:38px; background:white; color:#287cbd; border-radius:12px; box-shadow:0 3px 12px #20344f20; font-size:20px; }
.is-winner .vote-result__body { padding-left:22px; }
.is-winner .vote-result__count { padding-right:22px; font-size:24px; }
.is-winner .vote-result__name { font-size:23px; }
.vote-result__favorite { font-size:11px; color:#647c92; }
.is-runner-up { background:#f8fbff; padding:16px; }
.is-runner-up .vote-result__media { width:88px; height:72px; }
.is-runner-up .vote-result__name { font-size:17px; }
.is-runner-up .vote-result__rank { color:#328be0; font-size:19px; }
.vote-result__all { display:flex; align-items:center; justify-content:center; gap:8px; min-height:46px; border:1px solid #c6dff4; border-radius:12px; background:#fff; color:#287cbd; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.vote-result__all:hover { background:#eaf4ff; }
.vote-result__all:focus-visible { outline:3px solid #9bcdf6; outline-offset:2px; }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
@media(max-width:520px) {
 .vote-result__header { padding:18px; }
 .vote-result__row { gap:8px; padding:10px; }
 .vote-result__media { width:40px; height:40px; }
 .is-winner { padding:0 0 16px; gap:14px; }
 .is-winner .vote-result__body { padding-left:14px; }
 .is-winner .vote-result__count { padding-right:14px; }
 .is-runner-up .vote-result__media { width:64px; height:64px; }
 .is-runner-up .vote-result__name { font-size:15px; }
 .vote-result__rank { width:18px; }
 .vote-result__count { font-size:16px; }
}
</style>
