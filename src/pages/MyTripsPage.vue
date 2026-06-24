<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import LegalRegionCombobox from '@/components/trip/LegalRegionCombobox.vue'
import TripSettingsModal from '@/components/trip/TripSettingsModal.vue'
import BoardingPassCard from '@/components/trip/BoardingPassCard.vue'
import TripSettingsButton from '@/components/trip/TripSettingsButton.vue'
import { useModal } from '@/composables/useModal'
import { useTripStore } from '@/stores/trip.store'
import { useAuthStore } from '@/stores/auth.store'
import type { TripFilter, TripSummary } from '@/types/trip'
import type { LegalRegion } from '@/types/geo'
import logoUrl from '@/assets/images/soomgil_logo_none_text.png'

const router = useRouter()
const route = useRoute()
const tripStore = useTripStore()
const authStore = useAuthStore()
const createModal = useModal()
const activeFilter = ref<TripFilter>('all')
const searchQuery = ref('')
const newTitle = ref('')
const newDestination = ref('')
const selectedRegion = ref<LegalRegion | null>(null)
const createError = ref('')
const activeSettingsTrip = ref<TripSummary | null>(null)
const defaultSettingsTab = ref<'tab-settings' | 'tab-members'>('tab-settings')
const timelineEl = ref<HTMLElement | null>(null)
const requestedIntent = computed(() => typeof route.query.intent === 'string' ? route.query.intent : null)
const intentMessage = computed(() => requestedIntent.value === 'invite' || requestedIntent.value === 'share'
  ? '초대할 여행의 설정 버튼을 눌러 멤버 관리 탭에서 초대 링크를 만들거나 공유하세요.'
  : null)

function scrollTimeline(direction: number) {
  const el = timelineEl.value
  if (!el) return
  const cardWidth = 280 + 20 // timeline-card width + gap
  el.scrollBy({ left: direction * cardWidth * 2, behavior: 'smooth' })
}

const filters: { label: string; value: TripFilter }[] = [
  { label: '전체', value: 'all' },
  { label: '진행 중', value: 'upcoming' },
  { label: '보관됨', value: 'past' },
]

function isAutoArchived(trip: TripSummary): boolean {
  if (trip.status !== 'ACTIVE') return false
  if (!trip.endDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(trip.endDate)
  end.setHours(0, 0, 0, 0)
  return end < today
}

function effectiveStatus(trip: TripSummary): TripSummary['status'] {
  return isAutoArchived(trip) ? 'ARCHIVED' : trip.status
}

const filteredTrips = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return tripStore.trips.filter((trip) => {
    const status = effectiveStatus(trip)
    const matchesStatus =
      activeFilter.value === 'all' ||
      (activeFilter.value === 'upcoming' && status === 'ACTIVE') ||
      (activeFilter.value === 'past' && status === 'ARCHIVED')
    const matchesQuery =
      !query ||
      trip.title.toLowerCase().includes(query) ||
      trip.displayDestination?.toLowerCase().includes(query)

    return matchesStatus && matchesQuery
  })
})

const emptyMessage = computed(() => {
  if (searchQuery.value.trim()) return '검색 조건에 맞는 여행이 없습니다.'
  if (activeFilter.value === 'upcoming') return '진행 중인 여행이 없습니다.'
  if (activeFilter.value === 'past') return '보관한 여행이 없습니다.'
  return '아직 만든 여행이 없습니다.'
})

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value))
}

function statusLabel(trip: TripSummary) {
  const status = effectiveStatus(trip)
  if (status === 'ARCHIVED') return '보관됨'
  if (status === 'DELETED') return '삭제됨'
  return '진행 중'
}

function goTripDetail(tripId: string) {
  router.push({ name: 'Route', params: { tripId } })
}

/* ── Carousel (다음 여행) ───────────────────────────── */
const featuredTrips = computed(() => filteredTrips.value)
const carouselIndex = ref(0)
const currentTrip = computed(() => featuredTrips.value[carouselIndex.value] ?? featuredTrips.value[0] ?? null)

function nextCarousel() {
  if (featuredTrips.value.length === 0) return
  carouselIndex.value = (carouselIndex.value + 1) % featuredTrips.value.length
}
function prevCarousel() {
  if (featuredTrips.value.length === 0) return
  carouselIndex.value = (carouselIndex.value - 1 + featuredTrips.value.length) % featuredTrips.value.length
}
const carouselDots = computed(() => featuredTrips.value.map((_, i) => i))

/* ── Boarding pass / timeline helpers ───────────────── */
function getDestCode(trip: TripSummary): string {
  const name = trip.displayDestination ?? trip.title
  if (name.includes('부산')) return 'PUS'
  if (name.includes('제주')) return 'CJU'
  if (name.includes('강릉')) return 'KAG'
  if (name.includes('경주')) return 'KYJ'
  if (name.includes('여수')) return 'YSU'
  if (name.includes('대전')) return 'DJN'
  if (name.includes('전주')) return 'JNJ'
  return 'SMG'
}

function getDestName(trip: TripSummary): string {
  return trip.displayDestination ?? '목적지 미정'
}

function getTripStatus(trip: TripSummary): string {
  const status = effectiveStatus(trip)
  if (status === 'ARCHIVED') return '지난 여행'
  if (status === 'DELETED') return '삭제됨'
  return '진행 중'
}

function getDestinationLabel(trip: TripSummary): string {
  return trip.displayDestination?.trim() || '목적지 미정'
}

function getStatusCls(trip: TripSummary): string {
  const status = effectiveStatus(trip)
  if (status === 'ARCHIVED') return 'is-past'
  if (status === 'ACTIVE') return 'is-active'
  return ''
}

function getPassengerText(trip: TripSummary): string {
  return authStore.user?.displayName || '사용자'
}

function getFlight(trip: TripSummary): string { return trip.id.substring(0, 5).toUpperCase() }
function getSeat(trip: TripSummary): string { return trip.id.substring(5, 8).toUpperCase() }
function getGate(trip: TripSummary): string { return trip.id.substring(8, 11).toUpperCase() }

function formatTripDate(value: string | null | undefined): string {
  if (!value) return '미정'
  return value.replace(/-/g, '.')
}

async function loadTrips() {
  const status = activeFilter.value === 'upcoming'
    ? 'ACTIVE'
    : activeFilter.value === 'past'
      ? 'ARCHIVED'
      : undefined
  await tripStore.fetchTrips({ page: 0, size: 20, status, sort: ['createdAt,desc'] }).catch(() => undefined)
}

function openTripAccess(trip: TripSummary) {
  activeSettingsTrip.value = trip
  defaultSettingsTab.value = 'tab-members'
}

function openTripSettings(trip: TripSummary) {
  activeSettingsTrip.value = trip
  defaultSettingsTab.value = 'tab-settings'
}

function closeTripSettings() {
  activeSettingsTrip.value = null
}

async function handleCreateTrip() {
  const title = newTitle.value.trim()
  if (!title) {
    createError.value = '여행 이름을 입력해 주세요.'
    return
  }

  createError.value = ''
  try {
    const created = await tripStore.createTrip({
      title,
      displayDestination: newDestination.value.trim() || undefined,
      ...(selectedRegion.value ? { legalRegionCodes: [selectedRegion.value.code] } : {}),
    })
    resetForm()
    createModal.close()
    if (activeFilter.value === 'past') activeFilter.value = 'upcoming'
    if (requestedIntent.value === 'route' || requestedIntent.value === 'ai') {
      await router.replace({ name: 'Route', params: { tripId: created.id }, query: requestedIntent.value === 'ai' ? { panel: 'ai' } : {} })
    }
  } catch {
    createError.value = '여행을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }
}

function resetForm() {
  newTitle.value = ''
  newDestination.value = ''
  selectedRegion.value = null
  createError.value = ''
}

function closeCreateModal() {
  resetForm()
  createModal.close()
}

onMounted(() => {
  void loadTrips()
  if (route.query.create === '1') createModal.open()
})
watch(activeFilter, loadTrips)
watch(filteredTrips, () => {
  if (carouselIndex.value >= featuredTrips.value.length) carouselIndex.value = 0
})
</script>

<template>
  <div class="app-shell">
    <AppHeader />

    <main>
      <section class="section my-trips-dashboard">
        <div class="travel-page-head page-hero">
          <div class="page-hero__copy">
            <p class="page-hero__eyebrow">
              <span class="material-symbols-rounded" aria-hidden="true">luggage</span>
              Travel Dashboard
            </p>
            <h1 class="page-hero__title"><span class="page-hero__gradient">내 여행 준비</span>를 이어가세요</h1>
            <p class="page-hero__lead">다가오는 일정, 초대받은 여행을 한곳에서 확인하고 다음 계획으로 바로 이어가세요.</p>
          </div>
          <div class="page-hero__actions">
            <button class="btn primary" type="button" @click="createModal.open">
              <span class="material-symbols-rounded" aria-hidden="true">add</span>
              새 여행 만들기
            </button>
          </div>
        </div>
        <p v-if="intentMessage" class="trip-intent-guide" role="status"><span class="material-symbols-rounded">info</span>{{ intentMessage }}</p>

        <div class="trip-dashboard-layout">
          <div class="trip-dashboard-main">
            <section
              v-if="!tripStore.loading && !tripStore.error && featuredTrips.length > 0 && currentTrip"
              class="next-trip-panel boarding-pass-container"
              aria-label="다음 여행"
            >
              <BoardingPassCard
                :trip="currentTrip"
                :position="carouselIndex"
                :count="featuredTrips.length"
                @detail="goTripDetail(currentTrip.id)"
                @access="openTripAccess(currentTrip)"
                @settings="openTripSettings(currentTrip)"
              />
              <div v-if="false" class="boarding-pass-card boarding-pass-card--placeholder" aria-hidden="true">
                <div class="ticket-main">
                  <div class="ticket-header">
                    <div class="ticket-logo">
                      <img :src="logoUrl" alt="숨길 로고" class="logo-image">
                      <span class="logo-text">SOOMGIL AIR</span>
                    </div>
                    <span class="ticket-badge d-day-badge">{{ getTripStatus(currentTrip) }}</span>
                  </div>

                  <div class="ticket-route">
                    <div class="route-point departure">
                      <span class="airport-code">SEL</span>
                      <span class="city-name">서울 (SEOUL)</span>
                    </div>
                    <div class="route-path">
                      <span class="line"></span>
                      <span class="material-symbols-rounded plane-icon">flight</span>
                      <span class="line"></span>
                    </div>
                    <div class="route-point destination">
                      <span class="airport-code">{{ getDestCode(currentTrip) }}</span>
                      <span class="city-name">{{ getDestName(currentTrip) }}</span>
                    </div>
                  </div>

                  <div class="ticket-details">
                    <div class="detail-item">
                      <span class="label">PASSENGER</span>
                      <span class="value">{{ getPassengerText(currentTrip) }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">CREATED</span>
                      <span class="value">{{ formatCreatedAt(currentTrip.createdAt) }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">DESTINATIONS</span>
                      <span class="value">{{ getDestName(currentTrip) }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">FLIGHT</span>
                      <span class="value">{{ getFlight(currentTrip) }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">SEAT</span>
                      <span class="value">{{ getSeat(currentTrip) }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">GATE</span>
                      <span class="value">{{ getGate(currentTrip) }}</span>
                    </div>
                  </div>
                </div>

                <div class="ticket-divider">
                  <span class="punch-hole top"></span>
                  <span class="dashed-line"></span>
                  <span class="punch-hole bottom"></span>
                </div>

                <div class="ticket-stub">
                  <div class="stub-header">
                    <span class="stub-title-label">BOARDING PASS</span>
                    <h2 class="stub-title">{{ currentTrip.title }}</h2>
                    <p class="stub-date-info">{{ formatCreatedAt(currentTrip.createdAt) }} 생성</p>
                    <div class="ticket-members-wrapper" aria-label="여행 권한">
                      <span class="label">ROLE</span>
                      <div class="next-trip-members">
                        <span class="avatar">{{ currentTrip.myRole === 'OWNER' ? '방장' : '멤버' }}</span>
                      </div>
                    </div>
                  </div>

                  <div class="stub-actions">
                    <button v-if="currentTrip.myRole === 'OWNER'" class="stub-action-btn" type="button" @click.stop="openTripAccess(currentTrip)">
                      <span class="material-symbols-rounded" aria-hidden="true">group</span>
                      멤버 및 초대
                    </button>
                    <button v-if="currentTrip.myRole === 'OWNER'" class="stub-action-btn" type="button" @click.stop="openTripSettings(currentTrip)">
                      <span class="material-symbols-rounded" aria-hidden="true">settings</span>
                      설정
                    </button>
                  </div>

                  <a class="stub-detail-btn" href="#" @click.prevent="goTripDetail(currentTrip.id)">
                    <span>자세히 보기</span>
                    <span class="material-symbols-rounded">arrow_forward</span>
                  </a>

                  <div class="stub-controls">
                    <div class="next-trip-dots carousel-dots-container" aria-label="여행 개수와 현재 위치">
                      <span
                        v-for="i in carouselDots"
                        :key="i"
                        class="carousel-dot"
                        :class="{ active: i === carouselIndex }"
                      ></span>
                    </div>
                  </div>
                </div>
              </div>

              <div v-if="featuredTrips.length > 1" class="next-trip-nav">
                <button class="carousel-btn prev-btn" type="button" aria-label="이전 여행" @click="prevCarousel">
                  <span class="material-symbols-rounded">chevron_left</span>
                </button>
                <button class="carousel-btn next-btn" type="button" aria-label="다음 여행" @click="nextCarousel">
                  <span class="material-symbols-rounded">chevron_right</span>
                </button>
              </div>
            </section>

            <section>
              <div class="section-title compact-title trip-list-head">
                <div>
                  <p class="eyebrow">Trips</p>
                  <h2>여행 목록</h2>
                </div>
                <div class="trip-toolbar">
                  <div class="trip-tabs" aria-label="여행 필터">
                    <button
                      v-for="filter in filters"
                      :key="filter.value"
                      :class="{ active: activeFilter === filter.value }"
                      type="button"
                      :aria-pressed="activeFilter === filter.value"
                      @click="activeFilter = filter.value"
                    >
                      {{ filter.label }}
                    </button>
                  </div>
                  <div class="search-box trip-search" role="search">
                    <label class="sr-only" for="trip-search-input">여행 검색</label>
                    <span class="material-symbols-rounded" aria-hidden="true">search</span>
                    <input
                      id="trip-search-input"
                      v-model="searchQuery"
                      type="search"
                      placeholder="여행명 또는 목적지 검색"
                    >
                  </div>
                </div>
              </div>

              <LoadingState v-if="tripStore.loading" />
              <ErrorState
                v-else-if="tripStore.error"
                :message="tripStore.error"
                @retry="loadTrips"
              />
              <EmptyState
                v-else-if="filteredTrips.length === 0"
                icon="luggage"
                :message="emptyMessage"
              />
              <div v-else class="trip-view-panel active">
                <div class="my-trips-timeline-wrapper">
                  <button
                    v-if="filteredTrips.length > 2"
                    type="button"
                    class="timeline-scroll-btn timeline-scroll-btn--prev"
                    aria-label="이전 여행 보기"
                    @click="scrollTimeline(-1)"
                  >
                    <span class="material-symbols-rounded" aria-hidden="true">chevron_left</span>
                  </button>
                  <div ref="timelineEl" class="my-trips-timeline">
                    <article
                      v-for="trip in filteredTrips"
                      :key="trip.id"
                      class="timeline-card"
                      :class="[getStatusCls(trip), { 'has-actions': true }]"
                      tabindex="0"
                      role="button"
                      @click="goTripDetail(trip.id)"
                      @keydown.enter="goTripDetail(trip.id)"
                    >
                      <div class="timeline-card-header">
                        <div class="timeline-card-badges">
                          <span class="timeline-card-status-badge" :class="getStatusCls(trip)">{{ getTripStatus(trip) }}</span>
                          <span class="timeline-card-role">{{ trip.myRole === 'OWNER' ? '방장' : '멤버' }}</span>
                        </div>
                        <span class="timeline-route-badge">SEL → {{ getDestCode(trip) }}</span>
                      </div>
                      <div class="timeline-card-body">
                        <div class="timeline-card-avatar-wrapper timeline-card-avatar-wrapper--placeholder">
                          <span class="material-symbols-rounded" aria-hidden="true">travel_explore</span>
                        </div>
                        <div class="timeline-card-info">
                          <h3 class="timeline-card-title">{{ trip.title }}</h3>
                          <p class="timeline-card-destination">{{ getDestinationLabel(trip) }}</p>
                          <p class="timeline-card-date">
                            <span class="material-symbols-rounded">calendar_month</span>
                            <span>{{ formatCreatedAt(trip.createdAt) }} 생성</span>
                          </p>
                        </div>
                      </div>
                      <div class="timeline-card-actions" @click.stop>
                        <button class="timeline-card-open" type="button" @click="goTripDetail(trip.id)">
                          <span>계획 보기</span>
                          <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
                        </button>
                        <TripSettingsButton v-if="trip.myRole === 'OWNER'" label="설정" variant="icon" @click="openTripSettings(trip)" />
                      </div>
                    </article>
                  </div>
                  <button
                    v-if="filteredTrips.length > 2"
                    type="button"
                    class="timeline-scroll-btn timeline-scroll-btn--next"
                    aria-label="다음 여행 보기"
                    @click="scrollTimeline(1)"
                  >
                    <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
                  </button>
                </div>
              </div>

              <div v-if="tripStore.hasMoreTrips && !tripStore.loading" class="load-more-row">
                <div>
                  <p v-if="tripStore.loadMoreError" class="load-more-error" aria-live="polite">{{ tripStore.loadMoreError }}</p>
                  <button class="btn ghost" type="button" :disabled="tripStore.loadingMore" @click="tripStore.fetchNextPage">
                    {{ tripStore.loadingMore ? '불러오는 중...' : tripStore.loadMoreError ? '다시 시도' : '여행 더 보기' }}
                  </button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </section>
    </main>

    <div
      class="modal-overlay trip-create-modal"
      :class="{ show: createModal.isOpen.value }"
      :aria-hidden="!createModal.isOpen.value"
    >
      <div class="modal-card trip-create-card" role="dialog" aria-modal="true" aria-labelledby="trip-create-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">New Trip</p>
            <h3 id="trip-create-title">새 여행 만들기</h3>
          </div>
          <button class="icon-btn" type="button" aria-label="닫기" @click="closeCreateModal">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <form class="trip-create-form" @submit.prevent="handleCreateTrip">
          <label class="form-label">
            <span class="form-label-text">여행 이름</span>
            <input v-model="newTitle" class="field" type="text" name="title" maxlength="160" required>
          </label>
          <div class="form-label">
            <label class="form-label-text" for="trip-create-destination">표시 목적지</label>
            <LegalRegionCombobox
              id="trip-create-destination"
              v-model="newDestination"
              name="displayDestination"
              placeholder="예: 부산광역시"
              @select="selectedRegion = $event"
            />
          </div>

          <p v-if="createError" class="trip-create-error" aria-live="polite">{{ createError }}</p>

          <div class="trip-create-actions">
            <button class="btn ghost" type="button" @click="closeCreateModal">취소</button>
            <button class="btn primary" type="submit" :disabled="tripStore.creating">
              {{ tripStore.creating ? '만드는 중...' : '여행 만들기' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 여행 설정/접근 모달 통합 -->
    <TripSettingsModal
      :open="!!activeSettingsTrip"
      :trip="activeSettingsTrip"
      :default-tab="defaultSettingsTab"
      @close="closeTripSettings"
      @saved="loadTrips"
      @deleted="loadTrips"
    />
  </div>
</template>

<style scoped>
.trip-list-head {
  align-items: flex-end;
  display: flex;
  gap: 20px;
  justify-content: space-between;
  margin: 36px 0 24px;
}
.trip-intent-guide { display: flex; align-items: center; gap: 8px; margin: -12px 0 24px; padding: 12px 16px; border: 1px solid rgba(124, 58, 237, .18); border-radius: 14px; background: rgba(124, 58, 237, .05); color: var(--violet); font-size: 13px; font-weight: 750; }
.trip-intent-guide .material-symbols-rounded { font-size: 18px; }

.trip-toolbar {
  align-items: center;
  display: flex;
  gap: 16px;
  flex: 1;
  flex-wrap: nowrap;
}

.trip-search {
  margin-left: auto;
}

/* 보딩패스 placeholder 배경 (커버 이미지 없을 때) */
.boarding-pass-card--placeholder {
  background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(244, 249, 255, 0.98)) !important;
}

/* stub 내 액션 버튼 영역 */
.stub-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.stub-action-btn {
  align-items: center;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 800;
  gap: 4px;
  padding: 6px 10px;
  transition: background 160ms ease, border-color 160ms ease;
}

.stub-action-btn:hover {
  background: #fff;
  border-color: var(--violet);
}

.stub-action-btn .material-symbols-rounded {
  font-size: 15px;
}

/* 타임라인 카드 추가 요소 */
.timeline-card-meta-row {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
}

.timeline-card-badges {
  align-items: center;
  display: flex;
  gap: 6px;
  min-width: 0;
}

.timeline-card-date {
  align-items: center;
  display: flex;
  gap: 4px;
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.timeline-card-destination {
  color: var(--muted);
  font-size: 12px;
  font-weight: 750;
  line-height: 1.35;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-card-role {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.timeline-card-avatar-wrapper--placeholder {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  display: grid;
  place-items: center;
}

/* Removed past trip visual changes based on user request */


.my-trips-timeline-wrapper {
  position: relative;
}

.timeline-card-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-left: 12px;
  min-width: 0;
}

.timeline-card-avatar-wrapper--placeholder .material-symbols-rounded {
  font-size: 22px;
}

.timeline-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid rgba(227, 234, 244, 0.82);
  position: relative;
  z-index: 2;
}

.timeline-card-action {
  align-items: center;
  background: rgba(124, 58, 237, 0.06);
  border: 0;
  border-radius: 999px;
  color: var(--violet);
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 700;
  gap: 4px;
  height: 32px;
  justify-content: center;
  padding: 0;
  transition: background 160ms ease;
  width: 32px;
}

.timeline-card-action:hover {
  background: rgba(124, 58, 237, 0.14);
}

.timeline-card-action .material-symbols-rounded {
  font-size: 17px;
}

.timeline-card-open {
  align-items: center;
  background: var(--ink);
  border: 0;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  display: inline-flex;
  flex: 1 1 auto;
  font-size: 12px;
  font-weight: 850;
  gap: 4px;
  height: 32px;
  justify-content: center;
  min-width: 0;
  padding: 0 12px;
  transition: background 160ms ease, transform 160ms ease;
}

.timeline-card-open:hover {
  background: var(--violet);
  transform: translateY(-1px);
}

.timeline-card-open .material-symbols-rounded {
  font-size: 16px;
}

.load-more-row {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.load-more-row > div {
  text-align: center;
}

.load-more-error {
  color: #be123c;
  font-size: 13px;
  margin: 0 0 8px;
}

@media (max-width: 640px) {
  .trip-list-head {
    align-items: stretch;
    flex-direction: column;
  }

  .trip-toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}

.my-trips-dashboard ::-webkit-scrollbar {
  display: none;
}
.my-trips-dashboard {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
