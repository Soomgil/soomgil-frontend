<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import type { TripVoteSessionDetail, TripVoteSessionResult } from '@/types/voting'

const props = defineProps<{
  session: TripVoteSessionDetail | null
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
  return [...(props.session?.candidates ?? [])]
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
const resultList = ref<HTMLElement | null>(null)
const brokenImages = ref(new Set<string>())
const displayedRows = computed(() => showAll.value ? rows.value : rows.value.slice(0, 5))
watch(() => props.result?.sessionId ?? props.session?.id, () => { showAll.value = false; brokenImages.value = new Set() })
async function toggleResults() {
  showAll.value = !showAll.value
  await nextTick()
  resultList.value?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' })
}
</script>

<template>
  <div class="vote-result">
    <header class="vote-result__header">
      <p>VOTE COMPLETE</p>
      <h2>함께 고른 여행지를 확인해보세요</h2>
      <span>스티커를 많이 받은 순서대로 정리했어요.</span>
    </header>
    <p v-if="!rows.length" class="vote-result__empty">아직 표시할 투표 결과가 없어요.</p>
    <ul v-else ref="resultList" class="vote-result__list" :class="{ 'is-overview': !showAll }" data-testid="result-list" aria-label="득표순 여행지">
      <li v-for="(row, index) in displayedRows" :key="row.id" class="vote-result__row"
        :class="{
          selected: row.selected,
          'is-top-three': !showAll && index < 3,
          'is-winner': !showAll && index === 0,
          'is-runner-up': !showAll && index > 0 && index < 3,
          'is-second': !showAll && index === 1,
          'is-third': !showAll && index === 2,
          'is-compact': !showAll && index > 0,
        }" data-testid="result-row">
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
    <button v-if="rows.length > 5" type="button" class="vote-result__all" data-testid="result-toggle-all" @click="toggleResults">
      {{ showAll ? '주요 결과로 돌아가기' : `전체 투표 결과 보기 (${rows.length}곳)` }}
      <span class="material-symbols-rounded" aria-hidden="true">{{ showAll ? 'arrow_back' : 'arrow_forward' }}</span>
    </button>
  </div>
</template>

<style scoped>
.vote-result { display:flex; flex-direction:column; gap:16px; color:#35465a; }
.vote-result__header { display:grid; gap:5px; padding:2px 2px 4px; }
.vote-result__header p { margin:0; color:#5d89aa; font-size:10px; font-weight:800; line-height:1.4; letter-spacing:.14em; }
.vote-result__header h2 { margin:0; color:#35465a; font-family:'Noto Serif KR',Batang,serif; font-size:23px; font-weight:600; line-height:1.4; letter-spacing:-.02em; }
.vote-result__header span { color:#647c92; font-size:12px; line-height:1.65; }
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
.is-compact { gap:10px; min-height:58px; padding:7px 12px; background:#f8fbff; }
.is-compact .vote-result__rank { width:20px; color:#328be0; font-size:14px; }
.is-compact .vote-result__media { width:42px; height:42px; border-radius:9px; }
.is-compact .vote-result__body { flex-direction:row; align-items:center; gap:7px; overflow:hidden; }
.is-compact .vote-result__name { min-width:0; overflow:hidden; font-size:14px; text-overflow:ellipsis; white-space:nowrap; }
.is-compact .vote-result__selected { display:none; }
.is-compact .vote-result__badge { flex:none; font-size:10px; white-space:nowrap; }
.is-compact .vote-result__count { font-size:15px; }
.is-compact .vote-result__count .material-symbols-rounded { font-size:15px; }
.is-runner-up { border-color:#c6dff4; background:linear-gradient(135deg,#f3f9ff,#fff); box-shadow:0 5px 16px rgb(50 139 224 / 9%); }
.is-runner-up .vote-result__rank { display:grid; place-items:center; width:28px; height:28px; border-radius:9px; font-size:15px; }
.is-second .vote-result__rank { background:#e5eef5; color:#527188; }
.is-third .vote-result__rank { background:#f4e9df; color:#9a6848; }
.is-runner-up .vote-result__name { color:#2f536f; font-weight:800; }
.vote-result__all { display:flex; align-items:center; justify-content:center; gap:8px; min-height:46px; border:1px solid #c6dff4; border-radius:12px; background:#fff; color:#287cbd; font:inherit; font-size:13px; font-weight:700; cursor:pointer; }
.vote-result__all:hover { background:#eaf4ff; }
.vote-result__all:focus-visible { outline:3px solid #9bcdf6; outline-offset:2px; }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
@media(max-width:520px) {
 .vote-result__row { gap:8px; padding:10px; }
 .vote-result__media { width:40px; height:40px; }
 .is-winner { padding:0 0 16px; gap:14px; }
 .is-winner .vote-result__body { padding-left:14px; }
 .is-winner .vote-result__count { padding-right:14px; }
 .vote-result__header h2 { font-size:20px; }
 .is-compact { gap:7px; padding-inline:9px; }
 .is-compact .vote-result__media { width:38px; height:38px; }
 .is-compact .vote-result__badge { display:none; }
 .vote-result__rank { width:18px; }
 .vote-result__count { font-size:16px; }
}
</style>
