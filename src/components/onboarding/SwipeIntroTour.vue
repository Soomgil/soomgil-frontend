<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

/**
 * 취향 수집(스와이프) 페이지의 인터랙션 가이드.
 * RoutePage의 MapSectionTour와 동일한 스포트라이트 투어 스타일을 따른다:
 * 배경을 어둡게 깔고 실제 페이지 요소(카드/방향 화살표)를 하나씩 비추며 설명한다.
 */
interface TourStep {
  selector: string
  eyebrow: string
  title: string
  description: string
}

const props = defineProps<{ userId: string | null; ready: boolean }>()

const steps: TourStep[] = [
  {
    selector: '[data-swipe-tour="card"]',
    eyebrow: '취향 카드',
    title: '이렇게 취향을 골라요',
    description: '관광지를 살펴보고 마음을 정해요. 카드를 드래그하거나, 키보드 방향키, 화살표 버튼으로 고를 수 있어요.',
  },
  {
    selector: '[data-swipe-tour="like"]',
    eyebrow: '좋아요',
    title: '마음에 들면 오른쪽',
    description: '카드를 오른쪽으로 밀거나 → 방향키, 오른쪽 화살표를 눌러 담아요.',
  },
  {
    selector: '[data-swipe-tour="superlike"]',
    eyebrow: '꼭 가고 싶어요',
    title: '가장 가고 싶다면 위로',
    description: '카드를 위로 밀거나 ↑ 방향키, 위쪽 화살표를 눌러 강조해요.',
  },
  {
    selector: '[data-swipe-tour="nope"]',
    eyebrow: '다음에',
    title: '아니면 왼쪽으로',
    description: '카드를 왼쪽으로 밀거나 ← 방향키, 왼쪽 화살표를 눌러 넘겨요.',
  },
]

const active = ref(false)
const finishedThisSession = ref(false)
const stepIndex = ref(0)
const targetRect = ref<DOMRect | null>(null)
const dialog = ref<HTMLElement | null>(null)
let startTimer: number | null = null

const step = computed(() => steps[stepIndex.value])
const storageKey = computed(() => (props.userId ? `soomgil:swipe-intro-tour:v1:${props.userId}` : ''))
const spotlightStyle = computed(() => {
  const rect = targetRect.value
  if (!rect) return { opacity: '0' }
  const gap = 10
  return {
    top: `${Math.max(8, rect.top - gap)}px`,
    left: `${Math.max(8, rect.left - gap)}px`,
    width: `${Math.min(window.innerWidth - 16, rect.width + gap * 2)}px`,
    height: `${Math.min(window.innerHeight - 16, rect.height + gap * 2)}px`,
  }
})
const cardStyle = computed(() => {
  const rect = targetRect.value
  if (!rect || window.innerWidth < 720) return {}
  const width = 360
  const left = Math.min(window.innerWidth - width - 20, Math.max(20, rect.left))
  const fitsBelow = rect.bottom + 220 < window.innerHeight
  const top = fitsBelow ? rect.bottom + 16 : Math.max(20, rect.top - 206)
  return { left: `${left}px`, top: `${top}px`, bottom: 'auto', transform: 'none' }
})

function alreadySeen() {
  try { return !!storageKey.value && localStorage.getItem(storageKey.value) === 'done' } catch { return false }
}

async function measureTarget(attempt = 0) {
  await nextTick()
  const target = document.querySelector<HTMLElement>(step.value.selector)
  if (!target || target.offsetWidth === 0 || target.offsetHeight === 0) {
    if (attempt < 5) window.setTimeout(() => void measureTarget(attempt + 1), 90)
    return
  }
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  await new Promise(resolve => requestAnimationFrame(resolve))
  targetRect.value = target.getBoundingClientRect()
  dialog.value?.focus()
}

async function showStep(index: number) {
  stepIndex.value = Math.max(0, Math.min(steps.length - 1, index))
  targetRect.value = null
  await measureTarget()
}

async function start() {
  active.value = true
  await showStep(0)
}

function finish() {
  try { if (storageKey.value) localStorage.setItem(storageKey.value, 'done') } catch { /* private 모드 */ }
  active.value = false
  finishedThisSession.value = true
  targetRect.value = null
}

function next() {
  if (stepIndex.value === steps.length - 1) finish()
  else void showStep(stepIndex.value + 1)
}

function previous() {
  if (stepIndex.value > 0) void showStep(stepIndex.value - 1)
}

function onKeydown(event: KeyboardEvent) {
  if (!active.value) return
  // 투어 중에는 방향키가 단계 이동을 담당한다(카드 반응 대신). Esc로 종료.
  if (event.key === 'Escape') { event.preventDefault(); finish() }
  else if (event.key === 'ArrowRight') { event.preventDefault(); next() }
  else if (event.key === 'ArrowLeft') { event.preventDefault(); previous() }
}

function refreshPosition() {
  if (active.value) void measureTarget()
}

// 첫 방문(카드가 준비된 뒤) 자동 시작. 한 번 끝내면 다시 자동으로 열리지 않는다.
watch(
  () => [props.userId, props.ready] as const,
  ([userId, ready]) => {
    if (!userId || !ready || active.value || finishedThisSession.value || alreadySeen()) return
    if (startTimer !== null) window.clearTimeout(startTimer)
    startTimer = window.setTimeout(() => void start(), 700)
  },
  { immediate: true },
)

window.addEventListener('resize', refreshPosition)
window.addEventListener('scroll', refreshPosition, true)
window.addEventListener('keydown', onKeydown, true)
onBeforeUnmount(() => {
  if (startTimer !== null) window.clearTimeout(startTimer)
  window.removeEventListener('resize', refreshPosition)
  window.removeEventListener('scroll', refreshPosition, true)
  window.removeEventListener('keydown', onKeydown, true)
})

defineExpose({ start })
</script>

<template>
  <Teleport to="body">
    <div v-if="active" class="swipe-tour" aria-live="polite" data-testid="swipe-tour">
      <div class="swipe-tour-backdrop"></div>
      <div class="swipe-tour-spotlight" :style="spotlightStyle"></div>
      <section
        ref="dialog"
        class="swipe-tour-card"
        :style="cardStyle"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`swipe-tour-title-${stepIndex}`"
        tabindex="-1"
      >
        <div class="swipe-tour-topline">
          <span>{{ step.eyebrow }}</span>
          <button type="button" aria-label="사용법 안내 건너뛰기" data-testid="swipe-tour-skip" @click="finish">건너뛰기</button>
        </div>
        <h2 :id="`swipe-tour-title-${stepIndex}`">{{ step.title }}</h2>
        <p>{{ step.description }}</p>
        <div class="swipe-tour-footer">
          <div class="swipe-tour-progress" :aria-label="`${stepIndex + 1} / ${steps.length}`">
            <span v-for="(_, index) in steps" :key="index" :class="{ active: index === stepIndex }"></span>
          </div>
          <div class="swipe-tour-actions">
            <button v-if="stepIndex > 0" class="swipe-tour-previous" type="button" @click="previous">이전</button>
            <button class="swipe-tour-next" type="button" data-testid="swipe-tour-next" @click="next">
              {{ stepIndex === steps.length - 1 ? '시작하기' : '다음' }}
              <span class="material-symbols-rounded" aria-hidden="true">{{ stepIndex === steps.length - 1 ? 'check' : 'arrow_forward' }}</span>
            </button>
          </div>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.swipe-tour { position:fixed; inset:0; z-index:20000; pointer-events:auto; }
.swipe-tour-backdrop { position:absolute; inset:0; background:rgba(14,29,43,.64); backdrop-filter:blur(1px); }
.swipe-tour-spotlight { position:fixed; z-index:1; border:2px solid #8fcaf3; border-radius:18px; background:transparent; box-shadow:0 0 0 9999px rgba(14,29,43,.06),0 0 0 5px rgba(143,202,243,.2),0 16px 48px rgba(0,0,0,.2); pointer-events:none; transition:all .28s cubic-bezier(.2,.8,.2,1); }
.swipe-tour-card { position:fixed; z-index:2; left:50%; bottom:28px; width:min(360px,calc(100vw - 32px)); padding:22px; border:1px solid #dbeaf5; border-radius:20px; background:#fff; color:#31465a; box-shadow:0 24px 80px rgba(7,25,40,.3); transform:translateX(-50%); outline:none; }
.swipe-tour-topline { display:flex; align-items:center; justify-content:space-between; gap:16px; color:#328be0; font-size:11px; font-weight:850; letter-spacing:.1em; }
.swipe-tour-topline button { border:0; background:transparent; color:#8797a6; font-size:11px; font-weight:700; letter-spacing:0; cursor:pointer; }
.swipe-tour-card h2 { margin:12px 0 7px; font-family:'Noto Serif KR',serif; font-size:22px; font-weight:650; letter-spacing:-.03em; }
.swipe-tour-card > p { margin:0; color:#677d91; font-size:13px; line-height:1.65; }
.swipe-tour-footer { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:20px; }
.swipe-tour-progress { display:flex; gap:5px; }
.swipe-tour-progress span { width:6px; height:6px; border-radius:999px; background:#d5e1ea; transition:width .2s ease,background .2s ease; }
.swipe-tour-progress span.active { width:18px; background:#328be0; }
.swipe-tour-actions { display:flex; align-items:center; gap:8px; }
.swipe-tour-actions button { min-height:38px; border-radius:999px; padding:0 15px; font-size:12px; font-weight:800; cursor:pointer; }
.swipe-tour-previous { border:0; background:transparent; color:#627b91; }
.swipe-tour-next { display:flex; align-items:center; gap:5px; border:1px solid #328be0; background:#328be0; color:#fff; }
.swipe-tour-next .material-symbols-rounded { font-size:17px; }
@media(max-width:719px) {
  .swipe-tour-spotlight { border-radius:14px; }
  .swipe-tour-card { bottom:16px; }
}
@media(prefers-reduced-motion:reduce) { .swipe-tour-spotlight,.swipe-tour-progress span { transition:none; } }
</style>
