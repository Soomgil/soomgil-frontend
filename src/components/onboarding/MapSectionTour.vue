<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

type TourSection = 'itinerary' | 'map' | 'map-tools' | 'trip-management' | 'collaboration'

interface TourStep {
  section: TourSection
  selector: string
  eyebrow: string
  title: string
  description: string
}

const props = defineProps<{ userId: string | null }>()
const emit = defineEmits<{ prepare: [section: TourSection] }>()

const steps: TourStep[] = [
  {
    section: 'itinerary',
    selector: '[data-tour-section="itinerary"]',
    eyebrow: '일정 패널',
    title: '일차별 계획을 한눈에',
    description: '장소를 추가하고, 카드를 끌어서 방문 일차와 순서를 바꿀 수 있어요.',
  },
  {
    section: 'map',
    selector: '[data-tour-section="map"]',
    eyebrow: '여행 지도',
    title: '일정과 동선을 지도에서',
    description: '장소와 이동 경로를 확인하고, 지도 위 장소를 선택해 자세히 살펴보세요.',
  },
  {
    section: 'map-tools',
    selector: '[data-tour-section="map-tools"]',
    eyebrow: '지도 도구',
    title: '경로를 잇고 자유롭게 표시해요',
    description: '경로 연결, 자유 그리기, 스티커, 보기 설정과 실행 취소 도구가 모여 있어요.',
  },
  {
    section: 'trip-management',
    selector: '[data-tour-section="trip-management"]',
    eyebrow: '여행방 관리',
    title: '멤버와 투표를 관리해요',
    description: '접속 중인 멤버를 확인하고 취향 보기로 추천 장소를 살펴보세요. 주변 여행지를 표시하거나 지도 테마를 바꾸고, 투표와 여행방 설정도 열 수 있어요.',
  },
  {
    section: 'collaboration',
    selector: '[data-tour-section="collaboration"]',
    eyebrow: '협업 도구',
    title: '함께 계획하는 모든 도구',
    description: 'AI에게 일정을 부탁하거나 멤버들과 채팅하고, 메모와 할 일을 공유할 수 있어요.',
  },
]

const active = ref(false)
const stepIndex = ref(0)
const targetRect = ref<DOMRect | null>(null)
const dialog = ref<HTMLElement | null>(null)
let startTimer: number | null = null

const step = computed(() => steps[stepIndex.value])
const storageKey = computed(() => props.userId ? `soomgil:map-section-tour:v1:${props.userId}` : '')
const spotlightStyle = computed(() => {
  const rect = targetRect.value
  if (!rect) return { opacity: '0' }
  const gap = step.value.section === 'map' ? 4 : 8
  const top = Math.max(8, rect.top - gap)
  const left = Math.max(8, rect.left - gap)
  const right = Math.min(window.innerWidth - 8, rect.right + gap)
  const bottom = Math.min(window.innerHeight - 8, rect.bottom + gap)
  return {
    top: `${top}px`,
    left: `${left}px`,
    width: `${Math.max(0, right - left)}px`,
    height: `${Math.max(0, bottom - top)}px`,
  }
})
const cardStyle = computed(() => {
  const rect = targetRect.value
  if (!rect || window.innerWidth < 720) return {}
  const width = 360
  const left = Math.min(window.innerWidth - width - 20, Math.max(20, rect.left))
  const fitsBelow = rect.bottom + 210 < window.innerHeight
  const top = fitsBelow ? rect.bottom + 16 : Math.max(20, rect.top - 196)
  return { left: `${left}px`, top: `${top}px`, bottom: 'auto', transform: 'none' }
})

function alreadySeen() {
  return storageKey.value && localStorage.getItem(storageKey.value) === 'done'
}

async function measureTarget(attempt = 0) {
  await nextTick()
  await new Promise(resolve => requestAnimationFrame(resolve))
  const target = document.querySelector<HTMLElement>(step.value.selector)
  if (!target || target.offsetWidth === 0 || target.offsetHeight === 0) {
    if (attempt < 4) window.setTimeout(() => void measureTarget(attempt + 1), 80)
    return
  }
  const rect = target.getBoundingClientRect()
  if (step.value.section === 'map-tools') {
    const viewport = target.closest<HTMLElement>('.map-tools-viewport')
    if (viewport) {
      const visible = viewport.getBoundingClientRect()
      const left = Math.max(rect.left, visible.left)
      const top = Math.max(rect.top, visible.top)
      targetRect.value = new DOMRect(left, top, Math.max(0, Math.min(rect.right, visible.right) - left), Math.max(0, Math.min(rect.bottom, visible.bottom) - top))
    } else {
      targetRect.value = rect
    }
  } else {
    targetRect.value = rect
  }
  dialog.value?.focus()
}

async function showStep(index: number) {
  stepIndex.value = Math.max(0, Math.min(steps.length - 1, index))
  targetRect.value = null
  emit('prepare', step.value.section)
  await measureTarget()
}

async function start() {
  if (!props.userId) return
  active.value = true
  await showStep(0)
}

function finish() {
  if (storageKey.value) localStorage.setItem(storageKey.value, 'done')
  active.value = false
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
  if (event.key === 'Escape') finish()
  if (event.key === 'ArrowRight') next()
  if (event.key === 'ArrowLeft') previous()
}

function refreshPosition() {
  if (active.value) void measureTarget()
}

watch(() => props.userId, userId => {
  if (!userId || alreadySeen()) return
  if (startTimer !== null) window.clearTimeout(startTimer)
  startTimer = window.setTimeout(() => void start(), 900)
}, { immediate: true })

window.addEventListener('resize', refreshPosition)
window.addEventListener('keydown', onKeydown)
onBeforeUnmount(() => {
  if (startTimer !== null) window.clearTimeout(startTimer)
  window.removeEventListener('resize', refreshPosition)
  window.removeEventListener('keydown', onKeydown)
})

defineExpose({ start })
</script>

<template>
  <Teleport to="body">
    <div v-if="active" class="map-tour" aria-live="polite">
      <div class="map-tour-backdrop"></div>
      <div class="map-tour-spotlight" :style="spotlightStyle"></div>
      <section
        ref="dialog"
        class="map-tour-card"
        :style="cardStyle"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="`map-tour-title-${stepIndex}`"
        tabindex="-1"
      >
        <div class="map-tour-topline">
          <span>{{ step.eyebrow }}</span>
          <button type="button" aria-label="화면 안내 건너뛰기" @click="finish">건너뛰기</button>
        </div>
        <h2 :id="`map-tour-title-${stepIndex}`">{{ step.title }}</h2>
        <p>{{ step.description }}</p>
        <div class="map-tour-footer">
          <div class="map-tour-progress" :aria-label="`${stepIndex + 1} / ${steps.length}`">
            <span v-for="(_, index) in steps" :key="index" :class="{ active: index === stepIndex }"></span>
          </div>
          <div class="map-tour-actions">
            <button v-if="stepIndex > 0" class="map-tour-previous" type="button" @click="previous">이전</button>
            <button class="map-tour-next" type="button" @click="next">
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
.map-tour { position:fixed; inset:0; z-index:20000; pointer-events:auto; }
.map-tour-backdrop { position:absolute; inset:0; background:rgba(14,29,43,.64); backdrop-filter:blur(1px); }
.map-tour-spotlight { position:fixed; z-index:1; border:2px solid #8fcaf3; border-radius:18px; background:transparent; box-shadow:0 0 0 9999px rgba(14,29,43,.06),0 0 0 5px rgba(143,202,243,.2),0 16px 48px rgba(0,0,0,.2); pointer-events:none; transition:all .28s cubic-bezier(.2,.8,.2,1); }
.map-tour-card { position:fixed; z-index:2; left:50%; bottom:28px; width:min(360px,calc(100vw - 32px)); padding:22px; border:1px solid #dbeaf5; border-radius:20px; background:#fff; color:#31465a; box-shadow:0 24px 80px rgba(7,25,40,.3); transform:translateX(-50%); outline:none; }
.map-tour-topline { display:flex; align-items:center; justify-content:space-between; gap:16px; color:#328be0; font-size:11px; font-weight:850; letter-spacing:.1em; }
.map-tour-topline button { border:0; background:transparent; color:#8797a6; font-size:11px; font-weight:700; letter-spacing:0; cursor:pointer; }
.map-tour-card h2 { margin:12px 0 7px; font-family:'Noto Serif KR',serif; font-size:22px; font-weight:650; letter-spacing:-.03em; }
.map-tour-card > p { margin:0; color:#677d91; font-size:13px; line-height:1.65; }
.map-tour-footer { display:flex; align-items:center; justify-content:space-between; gap:14px; margin-top:20px; }
.map-tour-progress { display:flex; gap:5px; }
.map-tour-progress span { width:6px; height:6px; border-radius:999px; background:#d5e1ea; transition:width .2s ease,background .2s ease; }
.map-tour-progress span.active { width:18px; background:#328be0; }
.map-tour-actions { display:flex; align-items:center; gap:8px; }
.map-tour-actions button { min-height:38px; border-radius:999px; padding:0 15px; font-size:12px; font-weight:800; cursor:pointer; }
.map-tour-previous { border:0; background:transparent; color:#627b91; }
.map-tour-next { display:flex; align-items:center; gap:5px; border:1px solid #328be0; background:#328be0; color:#fff; }
.map-tour-next .material-symbols-rounded { font-size:17px; }
@media(max-width:719px) {
  .map-tour-spotlight { border-radius:14px; }
  .map-tour-card { bottom:16px; }
}
@media(prefers-reduced-motion:reduce) { .map-tour-spotlight,.map-tour-progress span { transition:none; } }
</style>
