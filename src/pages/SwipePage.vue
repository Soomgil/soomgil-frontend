<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { placeApi } from '@/api/place.api'
import { useRoute, useRouter } from 'vue-router'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useSwipeFeed } from '@/composables/useSwipeFeed'
import { useAuthStore } from '@/stores/auth.store'
import { useOnboardingStore } from '@/stores/onboarding.store'
import type { SwipeFeedGateway } from '@/stores/swipe.store'
import type { OnboardingPreferenceAnswer, OnboardingReaction } from '@/types/onboarding'
import type { SwipeAction, SwipeFeedItem } from '@/types/swipe'
import type { AccessibilityFlag, ParkingType } from '@/types/place'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const onboarding = useOnboardingStore()
const onboardingMode = route.name === 'OnboardingPreferences'
const onboardingAnswers = ref<Record<string, OnboardingReaction>>({})
const onboardingSubmitting = ref(false)
const onboardingSubmitError = ref<string | null>(null)

function onboardingAnswerKey(provider: string, externalPlaceId: string) {
  return `${provider}:${externalPlaceId}`
}

function onboardingDraftKey() {
  if (!auth.user || !onboarding.survey) return ''
  return `soomgil:onboarding-preferences:${auth.user.id}:${onboarding.survey.surveyVersionId}`
}

function restoreOnboardingDraft() {
  const survey = onboarding.survey
  const key = onboardingDraftKey()
  if (!survey || !key) return
  const allowed = new Set(survey.places.map(place => onboardingAnswerKey(place.provider, place.externalPlaceId)))
  try {
    const parsed = JSON.parse(localStorage.getItem(key) ?? '{}') as Record<string, OnboardingReaction>
    onboardingAnswers.value = Object.fromEntries(
      Object.entries(parsed).filter(([answerKey, reaction]) => (
        allowed.has(answerKey) && ['LIKE', 'NOPE', 'SUPER_LIKE'].includes(reaction)
      )),
    )
  } catch {
    onboardingAnswers.value = {}
  }
  onboarding.setAnsweredPlaceCount(Object.keys(onboardingAnswers.value).length)
}

function persistOnboardingDraft() {
  const key = onboardingDraftKey()
  if (key) localStorage.setItem(key, JSON.stringify(onboardingAnswers.value))
}

function onboardingRedirect() {
  return typeof route.query.redirect === 'string'
    && route.query.redirect.startsWith('/')
    && !route.query.redirect.startsWith('//')
    ? route.query.redirect
    : '/home'
}

function asSwipeFeedItem(place: NonNullable<typeof onboarding.survey>['places'][number]): SwipeFeedItem {
  return {
    place: {
      provider: place.provider,
      externalPlaceId: place.externalPlaceId,
      placeName: place.name,
      address: place.address,
      lat: null,
      lng: null,
      thumbnailUrl: place.thumbnailUrl,
      category: place.category,
      description: place.description ?? undefined,
      summary: place.description ?? undefined,
      tags: place.tags,
      photos: place.thumbnailUrl ? [place.thumbnailUrl] : [],
    },
    myReaction: null,
    likedByFollowees: [],
  }
}

async function completeOnboarding() {
  const survey = onboarding.survey
  if (!auth.user || !survey || onboardingSubmitting.value) return
  const responses: OnboardingPreferenceAnswer[] = survey.places.map(place => ({
    provider: place.provider,
    externalPlaceId: place.externalPlaceId,
    reaction: onboardingAnswers.value[onboardingAnswerKey(place.provider, place.externalPlaceId)],
  }))
  if (responses.some(response => !response.reaction)) return

  onboardingSubmitting.value = true
  onboardingSubmitError.value = null
  try {
    await onboarding.complete(auth.user.id, responses)
    localStorage.removeItem(onboardingDraftKey())
    await router.replace(onboardingRedirect())
  } catch {
    onboardingSubmitError.value = '취향을 저장하지 못했습니다. 네트워크를 확인하고 다시 시도해 주세요.'
  } finally {
    onboardingSubmitting.value = false
  }
}

const onboardingGateway: SwipeFeedGateway = {
  async getFeed() {
    if (!auth.user) throw new Error('로그인이 필요합니다.')
    const survey = await onboarding.load(auth.user.id)
    if (!survey) throw new Error('취향 설문을 불러오지 못했습니다.')
    if (survey.completed) {
      await router.replace(onboardingRedirect())
      return { items: [], nextSeed: null }
    }
    restoreOnboardingDraft()
    const items = survey.places
      .filter(place => !onboardingAnswers.value[onboardingAnswerKey(place.provider, place.externalPlaceId)])
      .map(asSwipeFeedItem)
    if (items.length === 0) void completeOnboarding()
    return { items, nextSeed: null }
  },
  async react(provider, externalPlaceId, reaction) {
    onboardingAnswers.value = {
      ...onboardingAnswers.value,
      [onboardingAnswerKey(provider, externalPlaceId)]: reaction,
    }
    onboarding.setAnsweredPlaceCount(Object.keys(onboardingAnswers.value).length)
    persistOnboardingDraft()
    return {
      place: { provider, externalPlaceId },
      reaction,
      savedPlaceEligible: reaction !== 'NOPE',
      updatedAt: new Date().toISOString(),
    }
  },
}

const {
  currentItem,
  lastParams,
  loading,
  submitting,
  error,
  finished: isFinished,
  load,
  ensureLoaded,
  persistReaction,
  advance,
} = useSwipeFeed(onboardingMode ? onboardingGateway : undefined)

const answeredCount = computed(() => Object.keys(onboardingAnswers.value).length)
const requiredPlaceCount = computed(() => onboarding.survey?.requiredPlaceCount ?? 10)
const interactionDisabled = computed(() => submitting.value || onboardingSubmitting.value)
const displayError = computed(() => onboardingSubmitError.value ?? error.value)

async function retry() {
  if (onboardingSubmitError.value) await completeOnboarding()
  else await load()
}

const currentPlace = computed(() => currentItem.value?.place ?? null)
const currentDescription = computed(() => (
  currentPlace.value?.description?.trim()
  || currentPlace.value?.summary?.trim()
  || ''
))
const displayedDescription = computed(() => (
  currentDescription.value || '상세 설명이 제공되지 않았습니다.'
))
const descriptionExpanded = ref(false)
const currentAccessibility = computed(() => currentPlace.value?.accessibility)
const stageRef = ref<HTMLElement | null>(null)

type AccessibilityState = 'supported' | 'unavailable' | 'unknown'

const accessibilityItems: ReadonlyArray<{
  flag: AccessibilityFlag
  icon: string
  label: string
}> = [
  { flag: 'WHEELCHAIR', icon: 'accessible', label: '휠체어' },
  { flag: 'DISABLED_TOILET', icon: 'accessible_forward', label: '장애인 화장실' },
  { flag: 'STROLLER', icon: 'stroller', label: '유모차' },
  { flag: 'PET', icon: 'pets', label: '반려동물' },
  { flag: 'ELDERLY', icon: 'elderly', label: '노약자 편의' },
]

function accessibilityState(flag: AccessibilityFlag): AccessibilityState {
  if (currentAccessibility.value?.flags.includes(flag)) return 'supported'
  if (currentAccessibility.value?.unavailableFlags.includes(flag)) return 'unavailable'
  return 'unknown'
}

function accessibilityStatusLabel(state: AccessibilityState) {
  if (state === 'supported') return '가능'
  if (state === 'unavailable') return '불가'
  return '-'
}

function parkingTypeLabel(type?: ParkingType) {
  return ({
    FREE: '무료',
    PAID: '유료',
    MIXED: '무료·유료',
    NONE: '주차 불가',
    UNKNOWN: '정보 없음',
  } satisfies Record<ParkingType, string>)[type ?? 'UNKNOWN']
}

/* ── Swipe State ──────────────────────────────────────── */
const decision = ref('')
const isDragging = ref(false)
const overlayOpacity = ref(0)
const cardTransform = ref('')
const swipeClass = ref('')
const isSettling = ref(false)
const cardEntering = ref(false)
let exitTimer: ReturnType<typeof setTimeout> | undefined
let enterTimer: ReturnType<typeof setTimeout> | undefined
onBeforeUnmount(() => { clearTimeout(exitTimer); clearTimeout(enterTimer) })
const activePhotoIdx = ref(0)
const galleryPhotos = computed(() => {
  const photos = [currentPlace.value?.thumbnailUrl, ...(currentPlace.value?.photos ?? [])]
  return [...new Set(photos.filter((photo): photo is string => Boolean(photo?.trim())))]
})
const activePhoto = computed(() => {
  return galleryPhotos.value[activePhotoIdx.value] ?? null
})

function resetCard() {
  decision.value = ''
  isDragging.value = false
  overlayOpacity.value = 0
  cardTransform.value = ''
  swipeClass.value = ''
  descriptionExpanded.value = false
}

async function decide(type: 'like' | 'dislike' | 'superlike') {
  if (interactionDisabled.value || isSettling.value || !currentPlace.value) return
  isSettling.value = true
  const action: SwipeAction = type === 'superlike' ? 'SUPER_LIKE' : type === 'like' ? 'LIKE' : 'NOPE'
  const saved = await persistReaction(action)
  if (!saved) {
    resetCard()
    isSettling.value = false
    return
  }
  decision.value = type === 'superlike' ? 'SUPER' : type === 'like' ? 'LIKE' : 'NOPE'
  swipeClass.value = `swiped-${type}`
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  exitTimer = setTimeout(() => {
    advance()
    activePhotoIdx.value = 0
    resetCard()
    isSettling.value = false
    cardEntering.value = true
    enterTimer = setTimeout(() => { cardEntering.value = false }, reducedMotion ? 0 : 360)
    if (onboardingMode && answeredCount.value === requiredPlaceCount.value) void completeOnboarding()
  }, reducedMotion ? 80 : 620)
}

const photoStrip = ref<HTMLElement | null>(null)
async function selectPhoto(idx: number) {
  if (isSettling.value || interactionDisabled.value || !galleryPhotos.value.length) return
  activePhotoIdx.value = (idx + galleryPhotos.value.length) % galleryPhotos.value.length
  await nextTick()
  const thumb = photoStrip.value?.children[activePhotoIdx.value] as HTMLElement | undefined
  thumb?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

function scrollPhotos(dir: number) {
  void selectPhoto(activePhotoIdx.value + dir)
}

/* ── Drag Handling ────────────────────────────────────── */
let startX = 0
let startY = 0
let dragging = false

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0 || isFinished.value || interactionDisabled.value || isSettling.value) return
  cardEntering.value = false
  clearTimeout(enterTimer)
  dragging = true
  startX = e.clientX
  startY = e.clientY
  isDragging.value = true
  ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return
  const dx = e.clientX - startX
  const dy = e.clientY - startY

  cardTransform.value = `translate(${dx}px, ${dy}px) rotate(${dx / 16}deg)`

  const newDecision =
    Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 50
      ? dx > 0 ? 'LIKE' : 'NOPE'
      : dy < -60 ? 'SUPER' : ''

  decision.value = newDecision

  const maxDrag = 90
  let dragDist = 0
  if (newDecision === 'LIKE' || newDecision === 'NOPE') dragDist = Math.abs(dx)
  else if (newDecision === 'SUPER') dragDist = Math.abs(dy)
  overlayOpacity.value = newDecision ? Math.min(dragDist / maxDrag, 1) : 0
}

function onPointerUp(e: PointerEvent) {
  if (!dragging) return
  dragging = false
  isDragging.value = false
  const dx = e.clientX - startX
  const dy = e.clientY - startY

  if (dx > 90) void decide('like')
  else if (dx < -90) void decide('dislike')
  else if (dy < -90) void decide('superlike')
  else resetCard()
}

function onPointerCancel() {
  if (isSettling.value) return
  dragging = false
  isDragging.value = false
  resetCard()
}

watch(() => currentPlace.value?.externalPlaceId, () => {
  descriptionExpanded.value = false
  activePhotoIdx.value = 0
  const item=currentItem.value
  if(!item) return
  void placeApi.getPlace(item.place.provider,item.place.externalPlaceId).then(detail=>{
    if(currentItem.value===item && detail) item.place={...item.place,...detail}
  }).catch(()=>{ /* 목록의 기존 정보는 유지하고 다음 상세 요청에서 재시도한다. */ })
}, { immediate: true })

onMounted(async () => {
  await ensureLoaded()
  if (!onboardingMode && lastParams.value.legalRegionCode) await load({ limit: 10, excludeRecent: true })
})
</script>

<template>
  <div class="app-shell swipe-discovery">

    <main>
      <section class="section page-with-hero">
        <div class="page-hero primary-page-hero">
          <div class="page-hero__copy">
            <p class="page-hero__eyebrow">
              {{ onboardingMode ? 'First Taste Setup' : 'Travel Preferences' }}
            </p>
            <h1 class="page-hero__title">
              {{ onboardingMode ? '첫 여행 취향 찾기' : '취향 수집' }}
            </h1>
            <p class="page-hero__lead">
              좋아요는 오른쪽, 다음에는 왼쪽으로 넘겨보세요. 꼭 가고 싶은 장소는 위로 밀어주세요.
            </p>
          </div>

        </div>

        <div class="swipe-workspace-card">
          <div class="swipe-layout">
            <div class="swipe-main-column">
              <div
                ref="stageRef"
                class="swipe-stage"
                :data-decision="decision"
                :class="{ 'is-dragging': isDragging, [swipeClass]: swipeClass }"
                :style="{ '--overlay-opacity': overlayOpacity }"
              >
                <LoadingState v-if="loading || onboardingSubmitting" />
                <ErrorState v-else-if="displayError" :message="displayError" @retry="retry" />
                <!-- Finished state -->
                <div v-else-if="isFinished" class="panel" style="text-align: center; padding: 40px">
                  <h2 style="color: var(--violet)">취향 수집 완료!</h2>
                  <p class="lead">{{ onboardingMode ? '첫 추천을 위한 취향 지도를 만들었어요.' : '모든 관광지를 확인했습니다. 이제 멤버들의 선택을 기다려보세요.' }}</p>
                  <a v-if="!onboardingMode" class="btn primary" href="#" @click.prevent="router.push('/my-trips')" style="margin-top: 20px">내 여행 보기</a>
                </div>

                <EmptyState
                  v-else-if="!currentPlace"
                  icon="explore"
                  title="추천할 장소가 아직 없어요"
                  description="여행방에 장소를 추가하거나 잠시 후 다시 시도해주세요."
                  action-label="다시 불러오기"
                  @action="load()"
                />

                <template v-else>
                  <div class="swipe-guide swipe-guide--top" aria-hidden="true">
                    <span>꼭 가고 싶어요</span>
                    <svg viewBox="0 0 28 42"><path d="M14 37 Q17 23 13 6 M5 15 Q11 10 13 6 Q18 10 23 15" /><path class="sketch-echo" d="M12 36 Q14 22 12 8" /></svg>
                  </div>
                  <div class="swipe-guide swipe-guide--left" aria-hidden="true">
                    <svg viewBox="0 0 44 28"><path d="M39 15 Q25 10 6 14 M15 5 Q11 10 6 14 Q10 18 16 23" /><path class="sketch-echo" d="M37 17 Q23 13 8 15" /></svg><span>다음에</span>
                  </div>
                  <div class="swipe-guide swipe-guide--right" aria-hidden="true">
                    <svg viewBox="0 0 44 28"><path d="M5 14 Q22 18 38 13 M29 5 Q33 10 38 13 Q34 18 28 23" /><path class="sketch-echo" d="M7 12 Q22 15 36 12" /></svg><span>좋아요</span>
                  </div>

                  <div v-if="swipeClass" class="swipe-success" :class="swipeClass" role="status">
                    <span class="material-symbols-rounded swipe-success-icon" aria-hidden="true">{{ decision === 'SUPER' ? 'star' : decision === 'LIKE' ? 'favorite' : 'air' }}</span>
                    <span>{{ decision === 'SUPER' ? '꼭 가고 싶은 곳으로 담았어요' : decision === 'LIKE' ? '좋아하는 취향으로 담았어요' : '다음 풍경을 만나볼까요' }}</span>
                    <span v-if="decision === 'NOPE'" class="swipe-breeze" aria-hidden="true">
                      <svg viewBox="0 0 240 140"><path d="M218 42 C164 12 149 79 77 46 S20 48 14 42" /><path d="M232 70 C175 43 135 113 57 77 S20 82 6 74" /><path d="M200 101 C157 81 134 126 54 111" /></svg>
                      <i v-for="n in 6" :key="n" :style="{ '--drift-y': `${(n - 3.5) * 22}px`, '--delay': `${n % 3 * 35}ms` }"></i>
                    </span>
                    <span v-if="decision !== 'NOPE'" class="swipe-celebration" aria-hidden="true">
                      <i class="celebration-ring"></i><i class="celebration-ring ring-echo"></i>
                      <span v-for="n in 12" :key="n" class="celebration-particle" :style="{ '--angle': `${n * 30}deg`, '--distance': `${n % 2 ? 104 : 76}px`, '--delay': `${n % 3 * 25}ms` }"><i>{{ decision === 'SUPER' ? (n % 2 ? '✦' : '✧') : (n % 3 ? '♥' : '✦') }}</i></span>
                    </span>
                  </div>

                  <!-- Swipe Card -->
                  <article
                    v-if="currentPlace"
                    :key="`${currentPlace.provider}:${currentPlace.externalPlaceId}`"
                    class="swipe-card"
                    :data-decision="decision"
                    :class="[swipeClass, { 'is-dragging': isDragging, 'is-entering': cardEntering }]"
                    :style="{ transform: cardTransform || undefined, '--release-transform': cardTransform || 'none', '--overlay-opacity': overlayOpacity }"
                    @pointerdown="onPointerDown"
                    @pointermove="onPointerMove"
                    @pointerup="onPointerUp"
                    @pointercancel="onPointerCancel"
                  >
                    <img
                      v-if="activePhoto"
                      :alt="currentPlace.placeName"
                      :src="activePhoto"
                      data-place-image
                      draggable="false"
                    />
                    <div v-else class="swipe-place-placeholder" aria-hidden="true">
                      <span class="material-symbols-rounded">landscape</span>
                      <strong>{{ currentPlace.placeName }}</strong>
                    </div>
                  </article>
                </template>
              </div>

              <!-- Photo Strip -->
              <section v-if="currentPlace && galleryPhotos.length > 0" class="photo-strip-section" aria-label="관광지 추가 사진">
                <div class="photo-strip-wrap">
                  <button class="photo-nav prev" type="button" aria-label="이전 사진" :disabled="galleryPhotos.length < 2 || isSettling || interactionDisabled" @click="scrollPhotos(-1)">
                    <span class="material-symbols-rounded">chevron_left</span>
                  </button>
                  <div ref="photoStrip" class="photo-strip" data-place-photos>
                    <button
                      v-for="(photo, idx) in galleryPhotos"
                      :key="photo"
                      class="photo-thumb"
                      :class="{ active: activePhotoIdx === idx }"
                      type="button"
                      :aria-label="`${idx + 1}번째 사진 보기`"
                      :aria-pressed="activePhotoIdx === idx"
                      :disabled="isSettling || interactionDisabled"
                      @click="selectPhoto(idx)"
                    >
                      <img :src="photo" :alt="`${currentPlace.placeName} 사진 ${idx + 1}`" />
                    </button>
                  </div>
                  <button class="photo-nav next" type="button" aria-label="다음 사진" :disabled="galleryPhotos.length < 2 || isSettling || interactionDisabled" @click="scrollPhotos(1)">
                    <span class="material-symbols-rounded">chevron_right</span>
                  </button>
                </div>
              </section>
            </div>

            <!-- Detail Panel -->
            <aside v-if="currentPlace" class="panel place-detail-panel">
              <div class="swipe-body">
                      <div class="meta-row">
                        <span style="display: flex; align-items: center; gap: 4px">
                          <span class="material-symbols-rounded" style="font-size: 16px">location_on</span>
                          <span>{{ currentPlace.address }}</span>
                        </span>
                      </div>
                      <h2 style="font-size: 32px; margin: 12px 0 10px">{{ currentPlace.placeName }}</h2>
                      <div v-if="currentPlace.tags?.length || currentPlace.category" class="tag-row" style="margin-top: 12px">
                        <span v-for="tag in (currentPlace.tags ?? [currentPlace.category]).filter(Boolean)" :key="tag ?? ''" class="tag">{{ tag }}</span>
                      </div>
                    </div>

              <section class="place-description-card" :class="{ 'is-empty': !currentDescription }" aria-label="장소 상세 설명">
                <button type="button" class="place-description-toggle" :aria-expanded="descriptionExpanded" aria-controls="swipe-place-description" @click="descriptionExpanded = !descriptionExpanded">
                  <span class="material-symbols-rounded" aria-hidden="true">auto_stories</span>
                  <strong>{{ descriptionExpanded ? '장소 이야기 접기' : '장소 이야기 보기' }}</strong>
                  <span class="material-symbols-rounded" aria-hidden="true">{{ descriptionExpanded ? 'expand_less' : 'expand_more' }}</span>
                </button>
                <p v-if="descriptionExpanded" id="swipe-place-description" class="place-description-text is-expanded">{{ displayedDescription }}</p>
              </section>

              <div v-if="currentPlace.travelStories?.length">
                <p class="detail-section-title">이 장소가 포함된 여행기</p>
                <div class="detail-review-list">
                  <div v-for="story in (currentPlace.travelStories ?? [])" :key="story.id" class="detail-review-card">
                    <img :src="story.image" :alt="story.title" class="detail-review-thumb" />
                    <div class="detail-review-info">
                      <p data-no-translate class="detail-review-title">{{ story.title }}</p>
                      <p class="detail-review-meta">{{ story.author }} · {{ story.date }}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div class="detail-info-card">
                <p class="detail-section-title">이용 안내</p>
                <div class="detail-info-row" data-guide="opening-hours">
                  <span class="detail-info-label"><span class="material-symbols-rounded">schedule</span>이용시간</span>
                  <strong class="detail-info-value">{{ currentAccessibility?.openingHours || '-' }}</strong>
                </div>
                <div class="detail-info-row" data-guide="closed-days">
                  <span class="detail-info-label"><span class="material-symbols-rounded">event_busy</span>쉬는날</span>
                  <strong class="detail-info-value">{{ currentAccessibility?.closedDays || '-' }}</strong>
                </div>
                <div class="detail-info-row" data-guide="parking">
                  <span class="detail-info-label"><span class="material-symbols-rounded">local_parking</span>주차시설</span>
                  <strong
                    class="detail-info-value"
                    :class="{ 'is-unavailable': currentAccessibility?.parkingType === 'NONE' }"
                  >{{ currentAccessibility?.parkingType === 'UNKNOWN' || !currentAccessibility ? '-' : parkingTypeLabel(currentAccessibility.parkingType) }}</strong>
                </div>
                <div class="detail-accessibility-row" aria-label="편의시설 지원 상태">
                  <span
                    v-for="item in accessibilityItems"
                    :key="item.flag"
                    class="accessibility-status"
                    :class="`is-${accessibilityState(item.flag)}`"
                    :data-accessibility="item.flag"
                  >
                    <span class="material-symbols-rounded">{{ item.icon }}</span>
                    <span>{{ item.label }}</span>
                    <strong>{{ accessibilityStatusLabel(accessibilityState(item.flag)) }}</strong>
                  </span>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.swipe-card { display: grid; grid-template-rows: minmax(0, 1fr) auto; overflow: hidden; }
.swipe-card > img { min-height: 0; object-fit: cover; }
.swipe-body { min-width: 0; max-height: 230px; overflow-y: auto; overscroll-behavior: contain; }
.swipe-body h2 { overflow-wrap: anywhere; line-height: 1.2; }
.swipe-body .muted { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow-wrap: anywhere; }
.swipe-body .tag-row { max-height: 62px; overflow: hidden; }
.swipe-body .meta-row span { min-width: 0; }
.swipe-body .meta-row span span:last-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.swipe-place-placeholder {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: grid;
  place-content: center;
  justify-items: center;
  gap: 10px;
  background: #e8eef5;
  color: #526078;
}
.swipe-place-placeholder .material-symbols-rounded { font-size: 52px; }
.swipe-place-placeholder strong { font-size: 16px; }
.place-detail-panel {
  background: rgba(255, 255, 255, 0.85) !important;
  border: 1px solid rgba(255, 255, 255, 0.6) !important;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-radius: 28px;
  box-shadow: 0 20px 48px rgba(0, 50, 150, 0.05), inset 0 1px 1px #fff;
  padding: 28px 24px !important;
  transition: all 0.3s ease;
  overflow-y: auto;
  max-height: calc(100vh - 160px);
}
.place-detail-panel h3 {
  font-size: 24px !important;
  font-weight: 850 !important;
  color: var(--ink);
  letter-spacing: 0;
  margin-bottom: 10px !important;
}
.place-detail-panel p.muted {
  font-size: 14px !important;
  line-height: 1.65 !important;
  color: var(--muted);
  margin-bottom: 20px;
}
.place-description-card {
  position: relative;
  margin-top: 16px;
  padding: 18px 18px 14px;
  border: 1px solid rgba(59, 130, 246, 0.12);
  border-radius: 20px;
  background:
    radial-gradient(circle at 100% 0, rgba(139, 92, 246, 0.08), transparent 42%),
    linear-gradient(145deg, rgba(239, 246, 255, 0.82), rgba(255, 255, 255, 0.94));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.95);
}
.place-description-card.is-empty {
  border-style: dashed;
  background: #f8fafc;
}
.place-description-heading {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 10px;
  color: var(--violet);
  font-size: 13px;
  letter-spacing: 0;
}
.place-description-heading .material-symbols-rounded {
  font-size: 18px;
}
.place-description-text {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: #465168;
  font-size: 14px;
  line-height: 1.75;
  letter-spacing: 0;
  white-space: pre-line;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 5;
}
.place-description-text.is-expanded {
  display: block;
  overflow: visible;
  -webkit-line-clamp: unset;
}
.place-description-toggle {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin: 10px 0 0 auto;
  padding: 5px 7px 5px 10px;
  border: 0;
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.07);
  color: var(--violet);
  font: inherit;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
  transition: background 0.18s ease, transform 0.18s ease;
}
.place-description-toggle:hover {
  background: rgba(124, 58, 237, 0.13);
  transform: translateY(-1px);
}
.place-description-toggle .material-symbols-rounded {
  font-size: 17px;
}
.detail-section-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--muted);
  margin-bottom: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.detail-review-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.detail-review-card {
  display: flex;
  gap: 12px;
  padding: 12px;
  border-radius: 16px;
  background: #ffffff;
  border: 1px solid rgba(227, 234, 244, 0.6);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.01);
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
}
.detail-review-card:hover {
  transform: translateY(-2px);
  border-color: rgba(139, 92, 246, 0.24);
  box-shadow: 0 8px 20px rgba(139, 92, 246, 0.06);
}
.detail-review-thumb {
  width: 56px;
  height: 56px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 2px 6px rgba(0,0,0,0.05);
}
.detail-review-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}
.detail-review-title {
  font-size: 13.5px;
  font-weight: 800;
  color: var(--ink);
  margin: 0 0 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.detail-review-meta {
  font-size: 11px;
  color: var(--muted);
  margin: 0;
  font-weight: 600;
}
.detail-info-card {
  margin-top: 18px;
  padding: 18px;
  border-radius: 18px;
  background: #ffffff;
  border: 1px solid rgba(227, 234, 244, 0.6);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.01);
}
.detail-info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  font-size: 13px;
  margin-bottom: 10px;
}
.detail-info-row:last-child {
  margin-bottom: 0;
}
.detail-info-label {
  color: var(--muted);
  display: flex;
  align-items: center;
  gap: 5px;
  font-weight: 700;
}
.detail-info-label .material-symbols-rounded {
  font-size: 16px;
  color: var(--violet);
}
.detail-info-value {
  font-size: 13px;
  font-weight: 800;
  color: var(--ink);
  text-align: right;
  max-width: 60%;
  word-break: keep-all;
}
.detail-info-value.is-unavailable {
  color: #e83e68;
}
.detail-accessibility-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
.accessibility-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-height: 36px;
  font-size: 11.5px;
  font-weight: 800;
  padding: 7px 9px;
  border-radius: 8px;
  border: 1px solid var(--line);
  background: #f8fafc;
  color: var(--muted);
}
.accessibility-status strong {
  margin-left: auto;
  font-size: 11px;
}
.accessibility-status.is-supported {
  background: rgba(76, 175, 80, 0.06);
  color: #2e7d32;
  border-color: rgba(76, 175, 80, 0.12);
}
.accessibility-status.is-unavailable {
  background: rgba(255, 92, 141, 0.08);
  color: #d93667;
  border-color: rgba(255, 92, 141, 0.2);
}
.accessibility-status.is-unknown {
  background: #f8fafc;
  color: #7b879b;
}
.accessibility-status .material-symbols-rounded {
  font-size: 15px;
}
/* Match My Trips: paper background, serif headings and white album cards. */
.swipe-discovery { --ink:#35465a; --muted:#647c92; --violet:#328be0; --blue:#328be0; --line:#dfeaf5; --surface:#fff; --surface-2:#eaf4ff; background:#f8fbff; min-height:100svh; }
.swipe-discovery main { background:transparent; }
.swipe-discovery .section { max-width:1200px; margin:0 auto; padding:48px 32px; }
.swipe-discovery .page-hero__gradient { background:none; -webkit-text-fill-color:#35465a; color:#35465a; }
.swipe-workspace-card { background:transparent; border:0; border-radius:0; padding:0; box-shadow:none; overflow:visible; }
.swipe-layout { grid-template-columns:minmax(0,1fr) 280px; gap:40px; align-items:start; }
.swipe-main-column { min-width:0; min-height:0; grid-template-rows:auto auto; gap:12px; }
.swipe-stage { min-height:0; padding:64px 64px 20px; }
.swipe-discovery .swipe-card { width:100%; aspect-ratio:auto; grid-template-rows:420px; border:1px solid #eaf4ff; border-radius:16px; background:#fff; box-shadow:none; }
.swipe-card:not(.is-dragging):not(.swiped-like):not(.swiped-dislike):not(.swiped-superlike) { transform:none; }
.swipe-card img[data-place-image] { position:relative; inset:auto; grid-row:1; width:100%; height:100%; object-fit:cover; }
.swipe-body { position:relative; inset:auto; grid-row:auto; max-height:none; overflow:visible; padding:0; background:none; color:#35465a; }
.swipe-body h2 { font-family:'Noto Serif KR','Batang','바탕',serif; font-size:23px !important; font-weight:500; }
.swipe-body .meta-row { color:#647c92; font-size:11px; font-weight:400; }
.swipe-body .tag { color:#647c92; background:transparent; border:1px solid #dfeaf5; font-size:11px; font-weight:400; backdrop-filter:none; }
.swipe-place-placeholder { position:relative; grid-row:1; background:#eaf4ff; }
.place-detail-panel { align-self:start; height:auto; max-height:none; padding:24px !important; background:#fff !important; border:1px solid #eaf4ff !important; border-radius:16px; box-shadow:none; backdrop-filter:none; -webkit-backdrop-filter:none; overflow:visible; gap:20px; }
.place-detail-panel h3 { font-family:'Noto Serif KR','Batang','바탕',serif; font-weight:500 !important; font-size:22px !important; margin:0 !important; }
.place-description-card, .place-description-card.is-empty { margin:0; padding:0; background:transparent; border:0; border-radius:0; box-shadow:none; }
.place-description-toggle { display:flex; width:100%; margin:0; padding:8px 0; min-height:44px; gap:8px; border-radius:0; background:transparent; text-align:left; color:#427ead; font-size:13px; }
.place-description-toggle strong { flex:1; font-weight:600; }
.place-description-toggle:hover { background:transparent; color:#35465a; transform:none; }
.place-description-toggle:focus-visible { outline:3px solid #a9d2ff; outline-offset:3px; }
.place-description-text { padding:12px 0 0; color:#647c92; font-size:13px; line-height:1.9; }
.detail-info-card { margin:0; padding:20px 0 0; background:transparent; border:0; border-top:1px solid #dfeaf5; border-radius:0; box-shadow:none; }
.detail-info-label,.detail-info-value,.accessibility-status { font-weight:400; }
.accessibility-status { background:transparent; }
.photo-strip-section { padding:0 16px; }
.photo-strip { grid-auto-columns:90px; }
.photo-thumb { height:64px; border-radius:8px; box-shadow:none; }
.photo-nav { background:transparent; box-shadow:none; }
.photo-nav:hover { background:#eaf4ff; }
.swipe-guide { position:absolute; z-index:2; display:flex; flex-direction:column; align-items:center; gap:6px; pointer-events:none; color:#647c92; font-size:11px; font-weight:500; }
.swipe-guide--top { top:4px; left:50%; transform:translateX(-50%); color:#427ead; }
.swipe-guide--left { left:4px; top:calc(50% + 22px); transform:translateY(-50%) rotate(-5deg); }
.swipe-guide--right { right:4px; top:calc(50% + 22px); transform:translateY(-50%) rotate(5deg); color:#427ead; }
@media(max-width:900px) {
 .swipe-layout { grid-template-columns:minmax(0,1fr); gap:28px; }
 .place-detail-panel { padding:20px !important; }
}
@media(max-width:640px) {
 .swipe-discovery .section { padding:28px 20px; }
 .swipe-discovery .swipe-card { grid-template-rows:280px; }
 .swipe-card img[data-place-image] { max-height:280px; }
 .swipe-body { padding:0; }
 .swipe-stage { padding:60px 32px 16px; }
 .swipe-body h2 { font-size:23px !important; }
 .swipe-guide--left { left:0; }
 .swipe-guide--right { right:0; }
 .swipe-guide { gap:2px; font-size:10px; }
 .photo-strip-section { padding:0; }
}
.swipe-guide svg { width:42px; height:28px; fill:none; stroke:currentColor; stroke-width:1.8; stroke-linecap:round; stroke-linejoin:round; }
.swipe-guide--top svg { width:24px; height:32px; }
.swipe-guide .sketch-echo { stroke-width:.8; opacity:.4; }
.place-detail-panel .swipe-body .meta-row { justify-content:flex-start; }
.place-detail-panel .swipe-body .meta-row span span:last-child { white-space:normal; overflow-wrap:anywhere; }
.place-detail-panel .swipe-body .tag-row { max-height:none; flex-wrap:wrap; }
@media(max-width:640px) { .swipe-guide--left svg,.swipe-guide--right svg { width:26px; height:24px; } }

/* 엽서를 넘기는 짧은 동작. 저장 성공 후에만 반응을 표시한다. */
.swipe-discovery .swipe-stage::before,.swipe-discovery .swipe-stage::after,
.swipe-discovery .swipe-card::before,.swipe-discovery .swipe-card::after { content:none !important; }
.swipe-discovery .swipe-card { will-change:transform,opacity; }
.swipe-discovery .swipe-card.swiped-like { animation:postcard-right 400ms cubic-bezier(.3,.05,.65,1) both; }
.swipe-discovery .swipe-card.swiped-dislike { animation:postcard-left 400ms cubic-bezier(.3,.05,.65,1) both; }
.swipe-discovery .swipe-card.swiped-superlike { animation:postcard-up 400ms cubic-bezier(.3,.05,.65,1) both; }
.swipe-discovery .swipe-card.is-entering { animation:postcard-enter 360ms cubic-bezier(.16,1,.3,1) both; }
.swipe-success { position:absolute; z-index:5; top:50%; left:50%; transform:translate(-50%,-50%); display:flex; flex-direction:column; align-items:center; gap:10px; width:max-content; max-width:90%; color:#427ead; font-size:12px; pointer-events:none; animation:swipe-confirm 620ms ease-out both; }
.swipe-success-icon { display:grid; place-items:center; width:68px; height:68px; border-radius:50%; background:linear-gradient(135deg,#f7fcff,#d5ecff); box-shadow:0 0 35px #86c9ff66, inset 0 0 0 1px #ffffff; animation:success-pop 620ms cubic-bezier(.2,.8,.2,1) both; font-size:34px; font-variation-settings:'FILL' 1; }
.swipe-success.swiped-dislike { color:#647c92; }
.swipe-celebration { position:absolute; top:34px; left:50%; width:0; height:0; }
.celebration-ring { position:absolute; width:70px; height:70px; left:-35px; top:-35px; border:2px solid #7cc4f4; border-radius:50%; animation:celebration-ring 600ms ease-out both; }
.celebration-ring.ring-echo { animation-delay:70ms; border:1px solid #b8ddfa; }
.celebration-particle { position:absolute; left:0; top:0; transform:rotate(var(--angle)); }
.celebration-particle i { display:block; position:absolute; font-style:normal; font-size:18px; color:#68b2e7; text-shadow:0 0 12px #a7d8ff; animation:celebration-flight 570ms cubic-bezier(.12,.65,.3,1) both; animation-delay:var(--delay); }
.celebration-particle:nth-child(3n) i { color:#abcff5; font-size:12px; }
.swiped-superlike .celebration-particle i { color:#71b6ec; font-size:24px; }
.swiped-superlike .celebration-particle:nth-child(3n) i { color:#e5bf79; font-size:16px; }
.swipe-success.swiped-like { color:#b34e73; }
.swiped-like .swipe-success-icon { color:#ec7296; background:linear-gradient(135deg,#fff7fa,#ffdce7); box-shadow:0 0 38px #f393b066,inset 0 0 0 1px #fff; }
.swiped-like .celebration-ring { border-color:#f4a1bb; }
.swiped-like .celebration-ring.ring-echo { border-color:#ffd0de; }
.swiped-like .celebration-particle i { color:#ed7799; text-shadow:0 0 12px #ffc5d7; }
.swiped-like .celebration-particle:nth-child(3n) i { color:#ffa98f; }
.swipe-success.swiped-superlike { color:#a47726; }
.swiped-superlike .swipe-success-icon { color:#eab343; background:linear-gradient(135deg,#fffdf1,#ffe9ad); box-shadow:0 0 40px #f7d27680,inset 0 0 0 1px #fff; }
.swiped-superlike .celebration-ring { border-color:#efcb77; }
.swiped-superlike .celebration-ring.ring-echo { border-color:#a7d8f7; }
.swiped-superlike .celebration-particle i { color:#efba4d; text-shadow:0 0 12px #ffe1a1; }
.swiped-superlike .celebration-particle:nth-child(3n) i { color:#79bdec; text-shadow:0 0 12px #c2e8ff; }
.swiped-dislike .swipe-success-icon { color:#72aab7; background:linear-gradient(135deg,#f7ffff,#deeff3); box-shadow:0 0 30px #a7d2dd55,inset 0 0 0 1px #fff; animation:breeze-icon 620ms ease-out both; }
.swipe-breeze { position:absolute; width:240px; height:140px; left:50%; top:34px; transform:translate(-50%,-50%); }
.swipe-breeze svg { width:100%; height:100%; overflow:visible; }
.swipe-breeze path { fill:none; stroke:#91c4d1; stroke-width:2; stroke-linecap:round; stroke-dasharray:95 190; animation:breeze-trail 620ms ease-out both; }
.swipe-breeze path:nth-child(2) { stroke:#b1dbe2; animation-delay:35ms; }
.swipe-breeze path:nth-child(3) { stroke-width:1.5; animation-delay:65ms; }
.swipe-breeze > i { position:absolute; top:50%; left:50%; width:6px; height:6px; border-radius:50%; background:#a8d4dd; animation:breeze-dot 550ms ease-out both; animation-delay:var(--delay); }
@keyframes breeze-trail { 0% { opacity:0; stroke-dashoffset:95; transform:translateX(20px); } 35% { opacity:.8; } 100% { opacity:0; stroke-dashoffset:-190; transform:translateX(-24px); } }
@keyframes breeze-dot { 0% { opacity:0; transform:translate(25px,0) scale(.4); } 30% { opacity:.9; } 100% { opacity:0; transform:translate(-95px,var(--drift-y)) scale(.3); } }
@keyframes breeze-icon { 0% { opacity:0; transform:translateX(22px) rotate(8deg) scale(.65); } 45% { opacity:1; transform:translateX(0) rotate(-5deg) scale(1.08); } 100% { opacity:0; transform:translateX(-22px) rotate(-9deg) scale(.95); } }
@keyframes celebration-flight { 0% { opacity:0; transform:translateX(12px) rotate(calc(-1 * var(--angle))) scale(.2); } 25% { opacity:1; } 70% { opacity:.9; } 100% { opacity:0; transform:translateX(var(--distance)) rotate(calc(35deg - var(--angle))) scale(.55); } }
@keyframes celebration-ring { from { opacity:.8; transform:scale(.45); } to { opacity:0; transform:scale(3.4); } }
@keyframes success-pop { 0% { transform:scale(.4) rotate(-18deg); } 42% { transform:scale(1.18) rotate(8deg); } 65% { transform:scale(.96) rotate(-3deg); } 100% { transform:scale(1); } }
@keyframes postcard-right { from { transform:var(--release-transform); opacity:1; } to { transform:translateX(110%) rotate(8deg); opacity:0; } }
@keyframes postcard-left { from { transform:var(--release-transform); opacity:1; } to { transform:translateX(-110%) rotate(-8deg); opacity:0; } }
@keyframes postcard-up { from { transform:var(--release-transform); opacity:1; } to { transform:translateY(-110%) rotate(-3deg); opacity:0; } }
@keyframes postcard-enter { from { opacity:0; transform:scale(.94) translateY(18px); } to { opacity:1; transform:none; } }
@keyframes swipe-confirm { 0% { opacity:0; scale:.92; } 40%,85% { opacity:1; scale:1; } 100% { opacity:0; scale:1; } }
@keyframes swipe-spark { from { opacity:0; transform:translateY(6px) scale(.6); } 45% { opacity:1; } to { opacity:0; transform:translateY(-10px) scale(1); } }
@media(prefers-reduced-motion:reduce) {
 .swipe-discovery .swipe-card.swiped-like,.swipe-discovery .swipe-card.swiped-dislike,.swipe-discovery .swipe-card.swiped-superlike { animation:none; transform:none !important; transition:opacity 80ms; opacity:0; }
 .swipe-discovery .swipe-card.is-entering { animation:none; }
 .swipe-success { animation:none; }
 .swipe-breeze, .swipe-celebration { display:none; }
 .swipe-success .swipe-success-icon { animation:none; }
}
</style>
