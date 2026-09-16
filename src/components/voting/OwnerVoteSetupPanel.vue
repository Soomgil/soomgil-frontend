<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import LegalRegionCombobox from '@/components/trip/LegalRegionCombobox.vue'
import { useVotingStore } from '@/stores/voting.store'
import type { LegalRegion } from '@/types/geo'

/**
 * 방장이 투표를 시작하는 패널.
 * 질문은 "하루에 몇 곳 갈지" 하나뿐이다. 여행 일수(몇박며칠)는 여행방 데이터에서 오고,
 * 선정·후보·스티커 개수는 아래 정책으로 시스템이 제안한다.
 *
 * - 선정 = 일수 × 하루 개수 (최대 24)
 * - 후보 = 선정 × 2 (6~24). 고를 여지를 두면서 덱이 너무 길어지지 않게 한다.
 * - 스티커 = 후보 ÷ 4 올림 (3~8). 한 사람이 후보의 약 1/4에 표를 나눌 수 있게 한다.
 */
const props = withDefaults(
  defineProps<{
    tripTitle?: string
    tripRegions?: LegalRegion[]
    tripDestination?: string | null
    /** 여행 일수. 모르면 null이고 2일로 가정한다. */
    tripDays?: number | null
  }>(),
  { tripTitle: '', tripRegions: () => [], tripDestination: null, tripDays: null },
)

const emit = defineEmits<{ opened: [] }>()

const voting = useVotingStore()

const MIN_PER_DAY = 1
const MAX_PER_DAY = 6
const DEFAULT_PER_DAY = 3
const FALLBACK_DAYS = 2
const MAX_SELECTION = 24
const MIN_CANDIDATES = 6
const MAX_CANDIDATES = 24
const MIN_STICKERS = 3
const MAX_STICKERS = 8

const regions = ref<LegalRegion[]>([...props.tripRegions])
const regionQuery = ref('')
const perDay = ref(DEFAULT_PER_DAY)
const opening = ref(false)
const errorMessage = ref('')

// 여행 상세가 패널보다 늦게 도착하면 비어 있던 지역을 채운다. 방장이 이미 손댔으면 건드리지 않는다.
watch(
  () => props.tripRegions,
  (next) => {
    if (regions.value.length === 0 && next.length > 0) regions.value = [...next]
  },
)

const knowsDays = computed(() => typeof props.tripDays === 'number' && props.tripDays > 0)
const days = computed(() => (knowsDays.value ? (props.tripDays as number) : FALLBACK_DAYS))
const selectionCount = computed(() => Math.min(MAX_SELECTION, days.value * perDay.value))
const candidateCount = computed(() => Math.min(MAX_CANDIDATES, Math.max(MIN_CANDIDATES, selectionCount.value * 2)))
const stickerAllowance = computed(() =>
  Math.min(MAX_STICKERS, Math.max(MIN_STICKERS, Math.ceil(candidateCount.value / 4))),
)

const hasDestination = computed(() => Boolean(props.tripDestination && props.tripDestination.trim()))
const needsRegion = computed(() => regions.value.length === 0 && !hasDestination.value)
const canOpen = computed(() => !needsRegion.value && !opening.value)

function stepPerDay(delta: number) {
  perDay.value = Math.min(MAX_PER_DAY, Math.max(MIN_PER_DAY, perDay.value + delta))
}

function addRegion(region: LegalRegion | null) {
  if (!region) return
  if (!regions.value.some((item) => item.code === region.code)) regions.value.push(region)
  regionQuery.value = ''
}

function removeRegion(code: string) {
  regions.value = regions.value.filter((item) => item.code !== code)
}

function messageFor(code: string | undefined) {
  switch (code) {
    case 'VOTE_CANDIDATE_POOL_INSUFFICIENT':
      return '고른 지역에서 후보 관광지를 충분히 찾지 못했어요. 지역을 넓히거나 하루 개수를 줄여보세요.'
    case 'VOTE_SESSION_ALREADY_OPEN':
      return '이미 진행 중인 투표가 있어요.'
    case 'FORBIDDEN':
      return '투표는 방장만 시작할 수 있어요.'
    case 'VALIDATION_FAILED':
      return '지역 코드 형식이 올바르지 않아요. 지역을 다시 선택해주세요.'
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
      candidateCount: candidateCount.value,
      legalRegionCodes: regions.value.map((region) => region.code),
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
      함께 만드는 여행
    </p>
    <h1 class="vote-setup__title">
      스티커 투표로 갈 곳을 함께 정해요
    </h1>
    <p class="vote-setup__lead">
      지역과 여행 속도를 정하면 투표 준비가 끝나요. 마음에 드는 여행지에 스티커를 붙여 함께 골라요.
    </p>

    <p v-if="tripTitle" class="vote-setup__trip">{{ tripTitle }} · {{ knowsDays ? `${days}일 여행` : '날짜 미정' }}</p>
    <div class="vote-setup__panel">
      <div class="vote-setup__row vote-setup__row--regions">
        <span class="vote-setup__row-icon vote-setup__row-icon--region" aria-hidden="true">
          <span class="material-symbols-rounded">location_on</span>
        </span>
        <div class="vote-setup__row-copy">
          <strong><span class="vote-setup__step">01</span> 어디로 떠날까요?</strong>
          <span>여행방에 등록한 지역이 미리 들어가 있어요. 이번 투표만 다른 지역으로 바꿀 수 있어요.</span>
          <p v-if="regions.length === 0 && hasDestination" class="vote-setup__destination">{{ tripDestination }} 지역에서 후보를 찾아요.</p>
          <ul v-if="regions.length > 0" class="vote-setup__chips" aria-label="선택한 지역">
            <li v-for="region in regions" :key="region.code" class="vote-setup__chip" data-testid="setup-region-chip">
              <span>{{ region.name }}</span>
              <button
                type="button"
                class="vote-setup__chip-remove"
                :aria-label="`${region.name} 제외`"
                data-testid="setup-region-remove"
                @click="removeRegion(region.code)"
              >
                <span class="material-symbols-rounded" aria-hidden="true">close</span>
              </button>
            </li>
          </ul>
          <p v-if="needsRegion" class="vote-setup__hint vote-setup__hint--warn" data-testid="setup-region-hint">
            <span class="material-symbols-rounded" aria-hidden="true">error</span>
            지역을 하나 이상 골라주세요. 여행방에 목적지도 없어서 후보를 뽑을 수 없어요.
          </p>
          <LegalRegionCombobox
            id="vote-region-search"
            v-model="regionQuery"
            name="voteRegion"
            placeholder="지역 검색 (예: 서귀포시, 강남구)"
            @select="addRegion($event)"
          />
        </div>
      </div>

      <div class="vote-setup__row vote-setup__row--question">
        <span class="vote-setup__row-icon vote-setup__row-icon--count" aria-hidden="true">
          <span class="material-symbols-rounded">today</span>
        </span>
        <div class="vote-setup__row-copy">
          <strong><span class="vote-setup__step">02</span> 하루에 몇 곳 갈까요?</strong>
          <span v-if="knowsDays" data-testid="setup-days-note">
            {{ days }}일 여행이에요. 하루 {{ perDay }}곳이면 총 {{ selectionCount }}곳을 뽑아요.
          </span>
          <span v-else data-testid="setup-days-note">
            여행 일정이 아직 없어 {{ days }}일로 가정했어요. 하루 {{ perDay }}곳이면 총 {{ selectionCount }}곳을 뽑아요.
          </span>
        </div>
        <div class="vote-setup__stepper" data-testid="setup-per-day-stepper">
          <button type="button" aria-label="하루 개수 줄이기" :disabled="perDay <= MIN_PER_DAY" data-testid="setup-per-day-minus" @click="stepPerDay(-1)">
            <span class="material-symbols-rounded">remove</span>
          </button>
          <strong data-testid="setup-per-day-count">{{ perDay }}</strong>
          <button type="button" aria-label="하루 개수 늘리기" :disabled="perDay >= MAX_PER_DAY" data-testid="setup-per-day-plus" @click="stepPerDay(1)">
            <span class="material-symbols-rounded">add</span>
          </button>
        </div>
      </div>

      <div class="vote-setup__suggest" aria-label="시스템 제안" aria-live="polite">
        <p class="vote-setup__suggest-title">
          <span class="material-symbols-rounded" aria-hidden="true">auto_awesome</span>
          우리의 투표 미리보기
        </p>
        <ul class="vote-setup__suggest-list">
          <li>
            <span class="vote-setup__suggest-icon vote-setup__row-icon--rank"><span class="material-symbols-rounded">emoji_events</span></span>
            <span class="vote-setup__suggest-label">선정할 관광지</span>
            <strong data-testid="setup-selection-count">{{ selectionCount }}</strong>
            <span class="vote-setup__suggest-unit">곳 → 일차 미정에 담김</span>
          </li>
          <li>
            <span class="vote-setup__suggest-icon vote-setup__row-icon--count"><span class="material-symbols-rounded">grid_view</span></span>
            <span class="vote-setup__suggest-label">후보 관광지</span>
            <strong data-testid="setup-candidate-count">{{ candidateCount }}</strong>
            <span class="vote-setup__suggest-unit">곳 · 멤버 취향 점수 순</span>
          </li>
          <li>
            <span class="vote-setup__suggest-icon"><span class="material-symbols-rounded">favorite</span></span>
            <span class="vote-setup__suggest-label">1인당 스티커</span>
            <strong data-testid="setup-sticker-count">{{ stickerAllowance }}</strong>
            <span class="vote-setup__suggest-unit">개 · 한 곳에 몰아 붙여도 돼요</span>
          </li>
        </ul>
      </div>


      <p class="vote-setup__note">
        <span class="material-symbols-rounded" aria-hidden="true">info</span>
        시작한 뒤에는 지역과 개수를 바꿀 수 없어요. 모두 제출하면 자동으로 마감되고, 뽑힌 곳은 일차 미정에 들어가요.
      </p>

      <p v-if="errorMessage" role="alert" class="vote-setup__error" data-testid="setup-error">
        <span class="material-symbols-rounded" aria-hidden="true">error</span>
        {{ errorMessage }}
      </p>

      <div class="vote-setup__footer">
      <p>현재 여행 멤버 모두가 참여해요</p>
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
  border-radius: 24px;
  box-shadow: 0 18px 44px rgba(0, 50, 150, 0.08);
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px;
}

.vote-setup__row {
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 18px;
  display: flex;
  gap: 14px;
  padding: 16px 18px;
}

.vote-setup__row--question {
  background: rgba(124, 58, 237, 0.05);
  border-color: rgba(124, 58, 237, 0.18);
}

.vote-setup__row--regions {
  align-items: flex-start;
}

.vote-setup__row-icon {
  align-items: center;
  background: rgba(244, 63, 94, 0.1);
  border-radius: 14px;
  color: #e11d48;
  display: inline-flex;
  flex: 0 0 auto;
  height: 44px;
  justify-content: center;
  width: 44px;
}

.vote-setup__row-icon--rank {
  background: rgba(0, 102, 255, 0.1);
  color: var(--violet);
}

.vote-setup__row-icon--region {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}

.vote-setup__row-icon--count {
  background: rgba(124, 58, 237, 0.1);
  color: #7c3aed;
}

.vote-setup__row-copy {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.vote-setup__row-copy strong {
  color: var(--ink);
  font-size: 15px;
  font-weight: 850;
}

.vote-setup__row-copy > span {
  color: var(--muted);
  font-size: 13px;
  line-height: 1.55;
}

.vote-setup__suggest {
  border: 1px dashed rgba(0, 102, 255, 0.28);
  border-radius: 18px;
  padding: 14px 18px;
}

.vote-setup__suggest-title {
  align-items: center;
  color: var(--violet);
  display: flex;
  font-size: 13px;
  font-weight: 850;
  gap: 6px;
  letter-spacing: 0.02em;
  margin: 0 0 10px;
}

.vote-setup__suggest-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.vote-setup__suggest-list li {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.vote-setup__suggest-icon {
  align-items: center;
  background: rgba(244, 63, 94, 0.1);
  border-radius: 10px;
  color: #e11d48;
  display: inline-flex;
  height: 30px;
  justify-content: center;
  width: 30px;
}

.vote-setup__suggest-icon .material-symbols-rounded {
  font-size: 18px;
}

.vote-setup__suggest-label {
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
  min-width: 96px;
}

.vote-setup__suggest-list strong {
  color: var(--violet);
  font-size: 20px;
  font-weight: 900;
  min-width: 28px;
  text-align: right;
}

.vote-setup__suggest-unit {
  color: var(--muted);
  font-size: 13px;
}

.vote-setup__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  list-style: none;
  margin: 4px 0 2px;
  padding: 0;
}

.vote-setup__chip {
  align-items: center;
  background: rgba(0, 102, 255, 0.08);
  border-radius: 999px;
  color: var(--violet);
  display: inline-flex;
  font-size: 13px;
  font-weight: 800;
  gap: 4px;
  padding: 6px 8px 6px 12px;
}

.vote-setup__chip-remove {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 50%;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  height: 22px;
  justify-content: center;
  padding: 0;
  width: 22px;
}

.vote-setup__chip-remove .material-symbols-rounded {
  font-size: 16px;
}

.vote-setup__chip-remove:hover {
  background: rgba(0, 102, 255, 0.14);
}

.vote-setup__hint {
  align-items: center;
  color: var(--muted);
  display: flex;
  font-size: 13px;
  gap: 6px;
  margin: 0;
}

.vote-setup__hint--warn {
  color: #be123c;
  font-weight: 750;
}

.vote-setup__hint .material-symbols-rounded {
  font-size: 18px;
}

.vote-setup__stepper {
  align-items: center;
  border: 1px solid var(--line);
  border-radius: 999px;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;
  padding: 4px;
}

.vote-setup__stepper button {
  align-items: center;
  background: #fff;
  border: 0;
  border-radius: 50%;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  height: 36px;
  justify-content: center;
  width: 36px;
}

.vote-setup__stepper button:hover {
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
}

.vote-setup__stepper strong {
  color: var(--ink);
  font-size: 18px;
  font-weight: 900;
  min-width: 32px;
  text-align: center;
}

.vote-setup__note {
  align-items: center;
  background: rgba(0, 102, 255, 0.06);
  border-radius: 14px;
  color: var(--muted);
  display: flex;
  font-size: 13px;
  gap: 8px;
  margin: 0;
  padding: 12px 14px;
}

.vote-setup__error {
  align-items: center;
  color: #be123c;
  display: flex;
  font-size: 13px;
  font-weight: 750;
  gap: 6px;
  margin: 0;
}

.vote-setup__cta {
  align-items: center;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: 0;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  font-size: 15px;
  font-weight: 900;
  gap: 8px;
  justify-content: center;
  min-height: 52px;
  padding: 0 22px;
  width: 100%;
}

.vote-setup__cta:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

@media (max-width: 720px) {
  .vote-setup__row {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .vote-setup__stepper {
    margin-left: 58px;
  }
}

.vote-setup { gap:10px; color:#35465a; }
.vote-setup__title { font-size:clamp(23px,3vw,30px); line-height:1.4; font-weight:800; }
.vote-setup__lead { font-size:14px; max-width:58ch; }
.vote-setup__trip { margin:0 0 10px; color:#287cbd; font-size:12px; }
.vote-setup__panel { padding:0; border:0; box-shadow:none; border-radius:0; gap:16px; }
.vote-setup__row { border-radius:16px; padding:20px; background:#fff; border-color:#dfeaf5; }
.vote-setup__row--question { background:#f8fbff; }
.vote-setup__step { margin-right:6px; color:#328be0; font-size:12px; }
.vote-setup__row-icon, .vote-setup__suggest-icon { background:#eaf4ff; color:#328be0; }
.vote-setup__suggest { border:1px solid #dfeaf5; background:#f1f8ff; border-radius:16px; padding:20px; }
.vote-setup__suggest-list { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:16px; }
.vote-setup__suggest-list li { display:flex; flex-direction:column; align-items:flex-start; gap:6px; }
.vote-setup__suggest-list strong { text-align:left; color:#287cbd; font-size:28px; }
.vote-setup__suggest-label { min-width:0; font-size:13px; }
.vote-setup__suggest-unit { font-size:11px; line-height:1.6; }
.vote-setup__suggest-title { color:#287cbd; margin-bottom:16px; }
.vote-setup__note { background:transparent; padding:0 4px; line-height:1.7; align-items:flex-start; font-size:12px; }
.vote-setup__footer { position:sticky; bottom:-20px; z-index:3; display:flex; align-items:center; gap:16px; justify-content:space-between; background:#fff; border-top:1px solid #dfeaf5; padding:16px 0; }
.vote-setup__footer p { font-size:12px; color:#647c92; margin:0; }
.vote-setup__cta { width:auto; min-width:180px; border-radius:12px; background:#328be0; font-weight:700; }
.vote-setup__stepper button:disabled { opacity:.35; cursor:not-allowed; }
@media(max-width:520px) {
 .vote-setup__row { padding:14px; gap:10px; }
 .vote-setup__row-icon { width:32px; height:32px; border-radius:10px; }
 .vote-setup__stepper { margin-left:42px; }
 .vote-setup__suggest { padding:16px; }
 .vote-setup__suggest-list { gap:8px; }
 .vote-setup__footer { flex-direction:column; gap:8px; bottom:-16px; }
 .vote-setup__cta { width:100%; }
}
.vote-setup__destination { color:#287cbd; font-size:13px; margin:4px 0; }
</style>
