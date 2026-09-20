<script setup lang="ts">
import { formatUiText } from '@/i18n/ui-localizer'
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
      return '이 지역에서는 후보를 충분히 찾지 못했어요. 지역을 추가하거나 하루 방문 수를 줄여보세요.'
    case 'VOTE_SESSION_ALREADY_OPEN':
      return '이미 진행 중인 투표가 있어요.'
    case 'FORBIDDEN':
      return '투표는 방장만 시작할 수 있어요.'
    case 'VALIDATION_FAILED':
      return '지역 정보를 확인할 수 없어요. 지역을 다시 선택해 주세요.'
    default:
      return '투표를 시작하지 못했어요. 잠시 후 다시 시도해 주세요.'
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
    <h1 class="vote-setup__title">
      새 투표를 시작할까요?
    </h1>
    <p v-if="tripTitle" class="vote-setup__trip">{{ tripTitle }} · {{ knowsDays ? `${days}일` : '날짜 미정' }}</p>
    <p class="vote-setup__lead">
      투표할 지역과 하루에 방문할 장소 수를 정해 주세요.
    </p>

    <div class="vote-setup__panel">
      <div class="vote-setup__row vote-setup__row--regions">
        <span class="vote-setup__row-icon vote-setup__row-icon--region" aria-hidden="true">
          <span class="material-symbols-rounded">location_on</span>
        </span>
        <div class="vote-setup__row-copy">
          <strong>투표할 지역</strong>
          <span>여행에 설정한 지역이에요. 이번 투표에서만 바꿀 수 있어요.</span>
          <p v-if="regions.length === 0 && hasDestination" class="vote-setup__destination">{{ formatUiText("{0}에서 후보를 찾아요.", "Find candidates in {0}.", [tripDestination]) }}</p>
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
            후보를 찾으려면 지역을 하나 이상 선택해 주세요.
          </p>
          <LegalRegionCombobox
            id="vote-region-search"
            v-model="regionQuery"
            name="voteRegion"
            placeholder="지역 검색 (예: 서귀포시)"
            @select="addRegion($event)"
          />
        </div>
      </div>

      <div class="vote-setup__row vote-setup__row--question">
        <span class="vote-setup__row-icon vote-setup__row-icon--count" aria-hidden="true">
          <span class="material-symbols-rounded">today</span>
        </span>
        <div class="vote-setup__row-copy">
          <strong>하루 방문 수</strong>
          <span v-if="knowsDays" data-testid="setup-days-note">
            {{ formatUiText("{0}일 동안 총 {1}곳을 선정해요.", "Select {1} places across {0} days.", [days, selectionCount]) }}</span>
          <span v-else data-testid="setup-days-note">{{ formatUiText("여행 날짜가 없어 {0}일 기준으로 총 {1}곳을 선정해요.", "No dates set, so {1} places will be selected based on {0} days.", [days, selectionCount]) }}</span>
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

      <p v-if="errorMessage" role="alert" class="vote-setup__error" data-testid="setup-error">
        <span class="material-symbols-rounded" aria-hidden="true">error</span>
        {{ errorMessage }}
      </p>

      <div class="vote-setup__footer">
        <button
          type="button"
          class="vote-setup__cta"
          data-testid="setup-open"
          :disabled="!canOpen"
          @click="open"
        >
          <span class="material-symbols-rounded" aria-hidden="true">how_to_vote</span>
          {{ opening ? '후보를 준비하는 중…' : '투표 시작' }}
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
    margin-left: 37px;
  }
}

.vote-setup { width:min(100%,720px); margin:0 auto; gap:7px; padding:4px 2px 2px; color:#35465a; }
.vote-setup__title { font-size:clamp(22px,2.7vw,27px); line-height:1.35; font-weight:750; }
.vote-setup__trip { max-width:100%; margin:0; color:#427ead; font-size:12px; font-weight:750; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vote-setup__lead { max-width:62ch; margin:2px 0 8px; font-size:13px; line-height:1.6; }
.vote-setup__panel { gap:0; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; }
.vote-setup__row { border:0; border-bottom:1px solid #e5edf3; border-radius:0; padding:20px 2px; background:transparent; }
.vote-setup__row--question { background:transparent; }
.vote-setup__row-icon { width:28px; height:28px; border-radius:0; background:transparent; color:#4f87ad; }
.vote-setup__row-icon .material-symbols-rounded { font-size:22px; }
.vote-setup__row-copy strong { font-size:14px; }
.vote-setup__row-copy > span { font-size:12px; }
.vote-setup__stepper { background:#f7fafc; border-color:#d8e4ec; }
.vote-setup__stepper button { width:32px; height:32px; }
.vote-setup__stepper strong { font-size:16px; }
.vote-setup__footer { display:flex; justify-content:flex-end; padding:20px 0 0; }
.vote-setup__cta { width:auto; min-width:164px; min-height:44px; padding:0 18px; border:1px solid #427ead; border-radius:999px; background:#427ead; box-shadow:0 5px 14px rgb(49 95 129 / 18%); font-size:13px; font-weight:700; transition:background .18s ease,border-color .18s ease,box-shadow .18s ease,transform .18s ease; }
.vote-setup__cta:hover:not(:disabled) { background:#356d99; border-color:#356d99; box-shadow:0 7px 18px rgb(49 95 129 / 24%); transform:translateY(-1px); }
.vote-setup__cta:focus-visible { outline:2px solid #79b5e0; outline-offset:3px; }
.vote-setup__cta .material-symbols-rounded { font-size:19px; }
.vote-setup__stepper button:disabled { opacity:.35; cursor:not-allowed; }
@media(max-width:520px) {
 .vote-setup { gap:7px; }
 .vote-setup__title { font-size:21px; }
 .vote-setup__lead { font-size:12px; }
 .vote-setup__panel { padding:0; gap:0; }
 .vote-setup__row { padding:16px 0; gap:9px; }
 .vote-setup__row-icon { width:26px; height:26px; }
 .vote-setup__stepper { margin-left:35px; }
 .vote-setup__footer { padding-top:16px; }
 .vote-setup__cta { width:100%; }
}
.vote-setup__destination { color:#287cbd; font-size:13px; margin:4px 0; }
</style>
