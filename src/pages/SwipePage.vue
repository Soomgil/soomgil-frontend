<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useSwipeFeed } from '@/composables/useSwipeFeed'
import type { SwipeAction } from '@/types/swipe'
import type { AccessibilityFlag, ParkingType } from '@/types/place'

const router = useRouter()

const {
  items,
  currentItem,
  completedCount,
  loading,
  submitting,
  error,
  finished: isFinished,
  load,
  ensureLoaded,
  persistReaction,
  advance,
} = useSwipeFeed()

const totalPlaces = computed(() => completedCount.value + items.value.length)
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
const canExpandDescription = computed(() => currentDescription.value.length > 180)
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

/* ── XP Progress ──────────────────────────────────────── */
const xpGoal = computed(() => Math.max(totalPlaces.value, 1))
const xpCount = completedCount
const xpPercent = computed(() => (xpCount.value / xpGoal.value) * 100)

/* ── Swipe State ──────────────────────────────────────── */
const decision = ref('')
const isDragging = ref(false)
const overlayOpacity = ref(0)
const cardTransform = ref('')
const swipeClass = ref('')
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
  if (submitting.value || !currentPlace.value) return
  const action: SwipeAction = type === 'superlike' ? 'SUPER_LIKE' : type === 'like' ? 'LIKE' : 'NOPE'
  const saved = await persistReaction(action)
  if (!saved) {
    resetCard()
    return
  }

  const label = type === 'superlike' ? 'SUPER' : type === 'like' ? 'LIKE' : 'NOPE'
  decision.value = label
  swipeClass.value = `swiped-${type}`

  // Spawn particles at center of stage
  if (stageRef.value) {
    const rect = stageRef.value.getBoundingClientRect()
    const x = rect.width / 2
    const y = rect.height / 2
    spawnSwipeBurst(type, x, y)
  }

  setTimeout(() => {
    swipeClass.value = ''
    decision.value = ''
    overlayOpacity.value = 0
    advance()
    activePhotoIdx.value = 0
    resetCard()
  }, 700)
}

/* ── Particle System ──────────────────────────────────── */
function spawnSwipeBurst(type: string, x: number, y: number) {
  const stage = stageRef.value
  if (!stage) return

  const particleCount = 28
  const isLike = type === 'like'
  const isNope = type === 'dislike' || type === 'nope'
  const isSuper = type === 'superlike'

  let symbols: string[] = []
  let colors: string[] = []

  if (isLike) {
    symbols = ['♥', '♥', '🌸', '✨', '🌸']
    colors = ['#ff5c8d', '#ff8aa8', '#ffadc2', '#ff3d71', '#ff7099']
  } else if (isNope) {
    symbols = ['✖', '✖', '💧', '💨', '✖']
    colors = ['#0f172a', '#334155', '#64748b', '#93c5fd', '#dbeafe']
  } else if (isSuper) {
    symbols = ['★', '★', '⚡', '✨', '♥', '♥']
    colors = ['#fde68a', '#f59e0b', '#fb7185', '#d946ef', '#7c3aed']
  } else {
    symbols = ['✨']
    colors = ['#8b5cf6', '#3b82f6', '#feda75', '#ff5c8d']
  }

  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement('div')
    particle.className = 'swipe-particle'

    const isSymbol = Math.random() < 0.35
    if (isSymbol) {
      particle.textContent = symbols[Math.floor(Math.random() * symbols.length)]
      particle.style.fontSize = `${14 + Math.random() * 16}px`
      particle.style.color = colors[Math.floor(Math.random() * colors.length)]
      particle.style.fontWeight = 'bold'
    } else {
      const size = 6 + Math.random() * 8
      particle.style.width = `${size}px`
      particle.style.height = `${size}px`
      particle.style.borderRadius = '50%'
      particle.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)]
    }

    let angle = Math.random() * Math.PI * 2
    let distance = 60 + Math.random() * 140

    if (Math.random() < 0.5) {
      if (isLike) angle = (Math.random() - 0.5) * Math.PI
      else if (isNope) angle = Math.PI + (Math.random() - 0.5) * Math.PI
      else if (isSuper) angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI
    }

    const tx = Math.cos(angle) * distance
    const ty = Math.sin(angle) * distance

    particle.style.left = `${x}px`
    particle.style.top = `${y}px`
    particle.style.setProperty('--tx', `${tx}px`)
    particle.style.setProperty('--ty', `${ty}px`)
    particle.style.setProperty('--rot', `${(Math.random() - 0.5) * 360}deg`)
    particle.style.setProperty('--delay', `${Math.random() * 0.12}s`)
    particle.style.setProperty('--duration', `${0.6 + Math.random() * 0.5}s`)

    stage.appendChild(particle)
    particle.addEventListener('animationend', () => particle.remove())
  }
}

function selectPhoto(idx: number) {
  activePhotoIdx.value = idx
}

function scrollPhotos(dir: number) {
  const strip = document.querySelector('[data-place-photos]')
  if (!strip) return
  strip.scrollBy({ left: dir * 260, behavior: 'smooth' })
}

/* ── Drag Handling ────────────────────────────────────── */
let startX = 0
let startY = 0
let dragging = false

function onPointerDown(e: PointerEvent) {
  if (isFinished.value || submitting.value) return
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
  dragging = false
  isDragging.value = false
  resetCard()
}

onMounted(() => {
  void ensureLoaded()
})
</script>

<template>
  <div class="app-shell">
    <AppHeader />

    <main>
      <section class="section">
        <div
          class="section-title community-hero-header"
          style="margin-bottom: 48px; align-items: end"
        >
          <div>
            <p class="eyebrow">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle">bolt</span>
              Swipe Preference
            </p>
            <h1 style="max-width: 100%; word-break: keep-all; font-size: clamp(36px, 4vw, 56px); margin-bottom: 18px">
              <span style="background: linear-gradient(135deg, var(--violet), var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent">우리만의 여행 취향</span>을<br />모아보세요
            </h1>
            <p class="lead" style="max-width: 100%; word-break: keep-all; margin-top: 16px">
              마음에 드는 장소는 오른쪽으로, 아쉬운 장소는 왼쪽으로 밀어보세요. 슈퍼라이크는 멤버들에게 강력하게 추천하고 싶은 장소입니다.
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
                <LoadingState v-if="loading" />
                <ErrorState v-else-if="error" :message="error" @retry="load()" />
                <!-- Finished state -->
                <div v-else-if="isFinished" class="panel" style="text-align: center; padding: 40px">
                  <h2 style="color: var(--violet)">취향 수집 완료!</h2>
                  <p class="lead">모든 관광지를 확인했습니다. 이제 멤버들의 선택을 기다려보세요.</p>
                  <a class="btn primary" href="#" @click.prevent="router.push('/my-trips')" style="margin-top: 20px">내 여행 보기</a>
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
                  <!-- XP bar overlay on card -->
                  <div class="swipe-xp-bar">
                    <div class="swipe-xp-track">
                      <div class="swipe-xp-fill" :style="{ width: xpPercent + '%' }"></div>
                    </div>
                    <span class="swipe-xp-count">{{ xpCount }} / {{ xpGoal }}</span>
                  </div>

                  <!-- Swipe Guides -->
                  <div style="position: absolute; left: 50%; top: 0px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; pointer-events: none; opacity: 0.9; z-index: 2;">
                    <span style="font-weight: 900; font-size: 15px; letter-spacing: 0.5px; background: linear-gradient(135deg, #833ab4, #fd1d1d, #fcb045); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">SUPER LIKE</span>
                    <svg width="24" height="40" viewBox="0 0 24 40" fill="none" stroke="url(#superlike-grad)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <defs>
                        <linearGradient id="superlike-grad" x1="0%" y1="100%" x2="100%" y2="0%">
                          <stop offset="0%" stop-color="#833ab4" />
                          <stop offset="50%" stop-color="#fd1d1d" />
                          <stop offset="100%" stop-color="#fcb045" />
                        </linearGradient>
                      </defs>
                      <path d="M12 36 Q 14 20 12 4 M 6 12 Q 12 6 12 4 Q 14 8 18 12" />
                    </svg>
                  </div>
                  <div style="position: absolute; left: 30px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--muted); pointer-events: none; opacity: 0.9; z-index: 2;">
                    <svg width="40" height="24" viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M36 12 Q 20 10 4 12 M 12 6 Q 6 12 4 12 Q 8 14 12 18" />
                    </svg>
                    <span style="transform: rotate(-8deg); font-weight: 900; font-size: 15px;">NOPE</span>
                  </div>
                  <div style="position: absolute; right: 30px; top: 50%; transform: translateY(-50%); display: flex; flex-direction: column; align-items: center; gap: 8px; color: var(--rose); pointer-events: none; opacity: 1; z-index: 2;">
                    <span style="transform: rotate(8deg); font-weight: 900; font-size: 15px;">LIKE</span>
                    <svg width="40" height="24" viewBox="0 0 40 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M4 12 Q 20 14 36 12 M 28 6 Q 34 12 36 12 Q 32 14 28 18" />
                    </svg>
                  </div>

                  <!-- Swipe Card -->
                  <article
                    v-if="currentPlace"
                    class="swipe-card"
                    :data-decision="decision"
                    :class="[swipeClass, { 'is-dragging': isDragging }]"
                    :style="{ transform: cardTransform || undefined, '--overlay-opacity': overlayOpacity }"
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
                  </article>
                </template>
              </div>

              <!-- Photo Strip -->
              <section v-if="currentPlace" class="photo-strip-section" aria-label="관광지 추가 사진">
                <div class="photo-strip-wrap">
                  <button class="photo-nav prev" type="button" aria-label="이전 사진" @click="scrollPhotos(-1)">
                    <span class="material-symbols-rounded">chevron_left</span>
                  </button>
                  <div class="photo-strip" data-place-photos>
                    <button
                      v-for="(photo, idx) in galleryPhotos"
                      :key="photo"
                      class="photo-thumb"
                      :class="{ active: activePhotoIdx === idx }"
                      type="button"
                      @click="selectPhoto(idx)"
                    >
                      <img :src="photo" :alt="`${currentPlace.placeName} 사진 ${idx + 1}`" />
                    </button>
                  </div>
                  <button class="photo-nav next" type="button" aria-label="다음 사진" @click="scrollPhotos(1)">
                    <span class="material-symbols-rounded">chevron_right</span>
                  </button>
                </div>
              </section>
            </div>

            <!-- Detail Panel -->
            <aside v-if="currentPlace" class="panel place-detail-panel">
              <h3>{{ currentPlace.placeName }}</h3>

              <section class="place-description-card" :class="{ 'is-empty': !currentDescription }" aria-label="장소 상세 설명">
                <div class="place-description-heading">
                  <span class="material-symbols-rounded">auto_stories</span>
                  <strong>장소 이야기</strong>
                </div>
                <p
                  class="place-description-text"
                  :class="{ 'is-expanded': descriptionExpanded }"
                >{{ displayedDescription }}</p>
                <button
                  v-if="canExpandDescription"
                  type="button"
                  class="place-description-toggle"
                  :aria-expanded="descriptionExpanded"
                  @click="descriptionExpanded = !descriptionExpanded"
                >
                  {{ descriptionExpanded ? '접기' : '더보기' }}
                  <span class="material-symbols-rounded">
                    {{ descriptionExpanded ? 'expand_less' : 'expand_more' }}
                  </span>
                </button>
              </section>

              <div class="detail-reaction-card">
                <div class="detail-reaction-header">
                  <span class="detail-reaction-title">팔로우한 친구들의 반응</span>
                  <div class="liked-by-avatars">
                    <template v-for="item in (currentItem?.likedByFollowees ?? [])" :key="item.id">
                      <span class="liked-by-avatar-wrapper" :data-tooltip="`${item.displayName} · 긍정 반응`">
                        <img v-if="item.profileImageUrl" class="liked-by-avatar" :src="item.profileImageUrl" :alt="item.displayName" />
                        <span v-else class="liked-by-avatar-fallback" aria-hidden="true">{{ item.displayName.slice(0, 1) }}</span>
                      </span>
                    </template>
                  </div>
                </div>
                <div class="detail-reaction-body">
                  <div class="detail-reaction-item">
                    <span class="material-symbols-rounded icon-rose">favorite</span>
                    <span class="detail-reaction-value">{{ currentItem?.likedByFollowees.length ?? 0 }}<span class="detail-reaction-unit">친구 반응</span></span>
                  </div>
                  <div class="detail-reaction-item">
                    <span class="material-symbols-rounded icon-yellow">touch_app</span>
                    <span class="detail-reaction-value">{{ currentItem?.myReaction ?? '미선택' }}</span>
                  </div>
                </div>
              </div>

              <div v-if="currentPlace.travelStories?.length">
                <p class="detail-section-title">이 장소가 포함된 여행기</p>
                <div class="detail-review-list">
                  <div v-for="story in (currentPlace.travelStories ?? [])" :key="story.id" class="detail-review-card">
                    <img :src="story.image" :alt="story.title" class="detail-review-thumb" />
                    <div class="detail-review-info">
                      <p class="detail-review-title">{{ story.title }}</p>
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
.detail-reaction-card {
  margin-top: 16px;
  padding: 18px 20px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(139, 92, 246, 0.03), rgba(255, 92, 141, 0.03));
  border: 1px solid rgba(139, 92, 246, 0.08);
}
.detail-reaction-header {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 14px;
}
.detail-reaction-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--violet);
  letter-spacing: -0.01em;
}
.detail-reaction-body {
  display: flex;
  gap: 20px;
}
.detail-reaction-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.detail-reaction-item .material-symbols-rounded {
  font-size: 20px;
}
.detail-reaction-value {
  font-size: 14px;
  font-weight: 800;
  color: var(--ink);
}
.detail-reaction-unit {
  font-size: 12px;
  font-weight: 600;
  color: var(--muted);
  margin-left: 2px;
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
.liked-by-avatar-wrapper {
  position: relative;
  display: inline-block;
  margin-left: -10px;
  z-index: 1;
}
.liked-by-avatar-wrapper:first-child {
  margin-left: 0;
}
.liked-by-avatar-fallback {
  width: 26px;
  height: 26px;
  border: 2px solid #fff;
  border-radius: 50%;
  display: grid;
  place-items: center;
  background: var(--violet);
  color: #fff;
  font-size: 11px;
  font-weight: 800;
}
.liked-by-avatar-wrapper::after {
  content: attr(data-tooltip);
  position: absolute;
  bottom: 130%;
  left: 50%;
  transform: translate(-50%, 6px) scale(0.9);
  padding: 6px 12px;
  border-radius: 10px;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(8px);
  color: #ffffff;
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 1000;
}
.liked-by-avatar-wrapper:hover::after {
  opacity: 1;
  transform: translate(-50%, 0) scale(1);
}
.icon-rose { color: var(--rose) !important; }
.icon-yellow { color: var(--yellow) !important; }

/* Particle */
.swipe-particle {
  position: absolute;
  pointer-events: none;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  user-select: none;
  animation: swipeParticleFade var(--duration) cubic-bezier(0.1, 0.8, 0.3, 1) var(--delay) forwards;
}
@keyframes swipeParticleFade {
  0% {
    transform: translate(-50%, -50%) translate(0, 0) scale(0.2) rotate(0deg);
    opacity: 0;
  }
  15% {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1.4) rotate(0deg);
  }
  45% {
    opacity: 0.9;
    transform: translate(-50%, -50%) translate(calc(var(--tx) * 0.5), calc(var(--ty) * 0.5)) scale(1.1) rotate(calc(var(--rot) * 0.5));
  }
  100% {
    transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) scale(0) rotate(var(--rot));
    opacity: 0;
  }
}
</style>
