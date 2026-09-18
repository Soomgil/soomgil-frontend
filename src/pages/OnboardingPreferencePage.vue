<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth.store'
import { useOnboardingStore } from '@/stores/onboarding.store'
import type { OnboardingPreferenceAnswer, OnboardingReaction } from '@/types/onboarding'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const onboarding = useOnboardingStore()
const { survey, loading, error } = storeToRefs(onboarding)

const index = ref(0)
const answers = ref<Record<string, OnboardingReaction>>({})
const submitting = ref(false)
const submitError = ref<string | null>(null)
const dragX = ref(0)
const dragStartX = ref<number | null>(null)
const animating = ref(false)

const places = computed(() => survey.value?.places ?? [])
const currentPlace = computed(() => places.value[index.value] ?? null)
const answeredCount = computed(() => Object.keys(answers.value).length)
const progress = computed(() => survey.value ? (answeredCount.value / survey.value.requiredPlaceCount) * 100 : 0)
const decisionLabel = computed(() => dragX.value > 36 ? '가고 싶어요' : dragX.value < -36 ? '내 취향은 아니에요' : '')

function answerKey(provider: string, externalPlaceId: string) {
  return `${provider}:${externalPlaceId}`
}

function draftKey() {
  return auth.user ? `soomgil:onboarding-preferences:${auth.user.id}:${survey.value?.surveyVersionId ?? 'pending'}` : ''
}

function restoreDraft() {
  const key = draftKey()
  if (!key) return
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, OnboardingReaction>
    answers.value = parsed
    index.value = Math.min(Object.keys(parsed).length, Math.max(places.value.length - 1, 0))
  } catch {
    answers.value = {}
  }
}

function persistDraft() {
  const key = draftKey()
  if (key) localStorage.setItem(key, JSON.stringify(answers.value))
}

async function loadSurvey(force = false) {
  if (!auth.user) return
  const loaded = await onboarding.load(auth.user.id, force)
  if (loaded?.completed) {
    await finishNavigation()
    return
  }
  if (loaded) restoreDraft()
}

function pointerDown(event: PointerEvent) {
  if (animating.value) return
  dragStartX.value = event.clientX
  ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function pointerMove(event: PointerEvent) {
  if (dragStartX.value === null || animating.value) return
  dragX.value = Math.max(-180, Math.min(180, event.clientX - dragStartX.value))
}

function pointerUp() {
  if (dragStartX.value === null || animating.value) return
  const reaction: OnboardingReaction | null = dragX.value > 90 ? 'LIKE' : dragX.value < -90 ? 'NOPE' : null
  dragStartX.value = null
  if (reaction) void choose(reaction)
  else dragX.value = 0
}

async function choose(reaction: OnboardingReaction) {
  const place = currentPlace.value
  if (!place || animating.value) return
  animating.value = true
  dragX.value = reaction === 'LIKE' ? 520 : -520
  answers.value = {
    ...answers.value,
    [answerKey(place.provider, place.externalPlaceId)]: reaction,
  }
  persistDraft()

  await new Promise(resolve => window.setTimeout(resolve, 240))
  if (answeredCount.value === places.value.length) {
    await submit()
    return
  }
  index.value += 1
  dragX.value = 0
  animating.value = false
}

function previous() {
  if (index.value === 0 || animating.value) return
  const previousPlace = places.value[index.value - 1]
  const nextAnswers = { ...answers.value }
  delete nextAnswers[answerKey(previousPlace.provider, previousPlace.externalPlaceId)]
  answers.value = nextAnswers
  index.value -= 1
  dragX.value = 0
  persistDraft()
}

async function submit() {
  if (!auth.user || !survey.value || submitting.value) return
  submitting.value = true
  submitError.value = null
  const responses: OnboardingPreferenceAnswer[] = places.value.map(place => ({
    provider: place.provider,
    externalPlaceId: place.externalPlaceId,
    reaction: answers.value[answerKey(place.provider, place.externalPlaceId)],
  }))
  try {
    await onboarding.complete(auth.user.id, responses)
    localStorage.removeItem(draftKey())
    await finishNavigation()
  } catch {
    submitError.value = '취향을 저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.'
    animating.value = false
    dragX.value = 0
  } finally {
    submitting.value = false
  }
}

async function finishNavigation() {
  const redirect = typeof route.query.redirect === 'string'
    && route.query.redirect.startsWith('/')
    && !route.query.redirect.startsWith('//')
    ? route.query.redirect
    : '/home'
  await router.replace(redirect)
}

onMounted(() => void loadSurvey())
</script>

<template>
  <main class="preference-onboarding">
    <section class="preference-shell" aria-labelledby="preference-title">
      <header class="preference-header">
        <div>
          <p class="preference-eyebrow">TASTE CALIBRATION</p>
          <h1 id="preference-title">당신다운 여행을 골라주세요</h1>
          <p>서로 다른 열 곳을 보고 끌리는 방향으로 넘겨주세요. 첫 추천을 만드는 데 사용됩니다.</p>
        </div>
        <div v-if="survey" class="preference-progress-copy"><strong>{{ answeredCount }}</strong> / {{ survey.requiredPlaceCount }}</div>
      </header>

      <div class="preference-progress" aria-hidden="true"><span :style="{ width: `${progress}%` }"></span></div>

      <div v-if="loading && !survey" class="preference-state" role="status">
        <span class="material-symbols-rounded spin">progress_activity</span>
        <p>여행지를 준비하고 있어요.</p>
      </div>

      <div v-else-if="error && !survey" class="preference-state" role="alert">
        <span class="material-symbols-rounded">cloud_off</span>
        <p>{{ error }}</p>
        <button class="preference-secondary" type="button" @click="loadSurvey(true)">다시 시도</button>
      </div>

      <template v-else-if="currentPlace">
        <div class="preference-card-stage">
          <article
            class="preference-card"
            :class="{ dragging: dragStartX !== null, leaving: animating }"
            :style="{ transform: `translateX(${dragX}px) rotate(${dragX / 24}deg)` }"
            @pointerdown="pointerDown"
            @pointermove="pointerMove"
            @pointerup="pointerUp"
            @pointercancel="pointerUp"
          >
            <img v-if="currentPlace.thumbnailUrl" :src="currentPlace.thumbnailUrl" :alt="currentPlace.name" draggable="false">
            <div v-else class="preference-image-placeholder"><span class="material-symbols-rounded">landscape</span></div>
            <div class="preference-card-shade"></div>
            <div v-if="decisionLabel" :class="['preference-decision', dragX > 0 ? 'like' : 'nope']">{{ decisionLabel }}</div>
            <div class="preference-card-copy">
              <div class="preference-tags">
                <span v-if="currentPlace.category">{{ currentPlace.category }}</span>
                <span v-for="tag in currentPlace.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
              </div>
              <h2>{{ currentPlace.name }}</h2>
              <p class="preference-address"><span class="material-symbols-rounded">location_on</span>{{ currentPlace.address }}</p>
              <p class="preference-description">{{ currentPlace.description }}</p>
            </div>
          </article>
        </div>

        <div class="preference-actions" aria-label="여행지 취향 선택">
          <button class="preference-action nope" type="button" :disabled="animating || submitting" @click="choose('NOPE')">
            <span class="material-symbols-rounded">close</span><span>내 취향은 아니에요</span>
          </button>
          <button class="preference-action like" type="button" :disabled="animating || submitting" @click="choose('LIKE')">
            <span class="material-symbols-rounded">favorite</span><span>가고 싶어요</span>
          </button>
        </div>
        <div class="preference-footer">
          <button class="preference-back" type="button" :disabled="index === 0 || animating || submitting" @click="previous">
            <span class="material-symbols-rounded">arrow_back</span> 이전 장소
          </button>
          <p><span class="material-symbols-rounded">swipe</span>카드를 좌우로 넘겨도 돼요</p>
        </div>
        <p v-if="submitting" class="preference-submit-status" role="status">취향 지도를 만들고 있어요…</p>
        <p v-if="submitError" class="preference-submit-error" role="alert">{{ submitError }} <button type="button" @click="submit">다시 저장</button></p>
      </template>
    </section>
  </main>
</template>

<style scoped>
.preference-onboarding { min-height:100svh; display:grid; place-items:center; padding:32px; color:#31455a; background:radial-gradient(circle at 15% 10%,#dff1ff 0,transparent 34%),radial-gradient(circle at 85% 85%,#fff0d6 0,transparent 30%),#f7fbff; }
.preference-shell { width:min(1040px,100%); }
.preference-header { display:flex; align-items:end; justify-content:space-between; gap:24px; max-width:760px; margin:0 auto 18px; }
.preference-eyebrow { margin:0 0 7px; color:#328be0; font-size:11px; font-weight:800; letter-spacing:.14em; }
.preference-header h1 { margin:0; font-family:'Noto Serif KR',serif; font-size:clamp(27px,4vw,40px); font-weight:600; letter-spacing:-.04em; }
.preference-header p:not(.preference-eyebrow) { margin:8px 0 0; color:#6a7d90; font-size:14px; line-height:1.65; }
.preference-progress-copy { flex:0 0 auto; color:#8293a3; font-size:14px; }
.preference-progress-copy strong { color:#328be0; font-size:22px; }
.preference-progress { width:min(760px,100%); height:6px; margin:0 auto 22px; overflow:hidden; border-radius:999px; background:#dfeaf4; }
.preference-progress span { display:block; height:100%; border-radius:inherit; background:linear-gradient(90deg,#328be0,#65b9ee); transition:width .28s ease; }
.preference-card-stage { width:min(760px,100%); height:min(560px,64svh); margin:0 auto; perspective:1200px; }
.preference-card { position:relative; width:100%; height:100%; overflow:hidden; border:1px solid #fff; border-radius:28px; background:#dceaf4; box-shadow:0 24px 70px #294d6d24; cursor:grab; touch-action:pan-y; user-select:none; transition:transform .24s cubic-bezier(.2,.8,.2,1),opacity .24s ease; }
.preference-card.dragging { cursor:grabbing; transition:none; }
.preference-card.leaving { opacity:.4; }
.preference-card > img,.preference-image-placeholder { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }
.preference-image-placeholder { display:grid; place-items:center; background:linear-gradient(145deg,#d6eafd,#b9d7ea); }
.preference-image-placeholder span { font-size:72px; color:#5b8bab; }
.preference-card-shade { position:absolute; inset:0; background:linear-gradient(180deg,transparent 34%,rgba(11,28,43,.82) 100%); }
.preference-card-copy { position:absolute; right:0; bottom:0; left:0; padding:32px; color:#fff; }
.preference-card-copy h2 { margin:10px 0 7px; font-family:'Noto Serif KR',serif; font-size:34px; font-weight:650; }
.preference-tags { display:flex; flex-wrap:wrap; gap:6px; }
.preference-tags span { padding:5px 9px; border:1px solid #ffffff70; border-radius:999px; background:#17344d66; font-size:11px; backdrop-filter:blur(8px); }
.preference-address { display:flex; align-items:center; gap:4px; margin:0; color:#e8f3fb; font-size:13px; }
.preference-address span { font-size:17px; }
.preference-description { max-width:620px; margin:10px 0 0; color:#f2f7fa; font-size:13px; line-height:1.65; }
.preference-decision { position:absolute; z-index:4; top:36px; padding:10px 16px; border:3px solid currentColor; border-radius:12px; background:#ffffffde; font-size:20px; font-weight:900; letter-spacing:-.03em; }
.preference-decision.like { right:32px; color:#e05d85; transform:rotate(7deg); }
.preference-decision.nope { left:32px; color:#56899c; transform:rotate(-7deg); }
.preference-actions { display:grid; grid-template-columns:1fr 1fr; gap:12px; width:min(600px,100%); margin:20px auto 0; }
.preference-action { display:flex; align-items:center; justify-content:center; gap:8px; min-height:52px; border:1px solid; border-radius:999px; background:#fff; font-weight:800; cursor:pointer; transition:transform .18s ease,box-shadow .18s ease; }
.preference-action:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 8px 22px #3154711a; }
.preference-action:disabled { opacity:.55; cursor:not-allowed; }
.preference-action.nope { border-color:#b9d4dd; color:#4e7d8e; }
.preference-action.like { border-color:#f1b4c7; color:#d8517b; }
.preference-footer { display:flex; align-items:center; justify-content:space-between; width:min(760px,100%); margin:10px auto 0; color:#7b8d9f; font-size:12px; }
.preference-footer p { display:flex; align-items:center; gap:4px; margin:0; }
.preference-footer p span { font-size:18px; }
.preference-back,.preference-secondary { display:flex; align-items:center; gap:4px; border:0; background:transparent; color:#55728d; font-weight:700; cursor:pointer; }
.preference-back:disabled { opacity:.3; cursor:not-allowed; }
.preference-submit-status,.preference-submit-error { width:min(760px,100%); margin:10px auto 0; text-align:center; font-size:13px; }
.preference-submit-error { color:#b53d5f; }
.preference-submit-error button { border:0; background:transparent; color:inherit; font-weight:900; text-decoration:underline; cursor:pointer; }
.preference-state { display:grid; place-items:center; min-height:480px; color:#61778b; text-align:center; }
.preference-state .material-symbols-rounded { font-size:44px; color:#4e9bd7; }
.spin { animation:spin 1s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
@media(max-width:640px) {
  .preference-onboarding { padding:20px 16px; align-items:start; }
  .preference-header { align-items:start; margin-top:8px; }
  .preference-header p:not(.preference-eyebrow) { font-size:12px; }
  .preference-card-stage { height:58svh; min-height:430px; }
  .preference-card { border-radius:22px; }
  .preference-card-copy { padding:24px 20px; }
  .preference-card-copy h2 { font-size:28px; }
  .preference-description { display:-webkit-box; overflow:hidden; -webkit-box-orient:vertical; -webkit-line-clamp:2; }
  .preference-action span:last-child { font-size:12px; }
  .preference-footer { justify-content:center; }
  .preference-footer p { display:none; }
  .preference-back { margin-right:auto; }
}
@media(prefers-reduced-motion:reduce) { .preference-card,.preference-progress span,.preference-action { transition:none; } }
</style>
