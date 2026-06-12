<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useTripStore } from '@/stores/trip.store'
import { useModal } from '@/composables/useModal'
import { mockTrips } from '@/mocks/mockTrips'
import { formatDDay, formatDateRange } from '@/utils/date'
import type { TripFilter } from '@/types/trip'

const router = useRouter()
const tripStore = useTripStore()

const logoImg = '/images/soomgil_logo_none_text.png'
const busanImg = '/images/랜딩페이지/busan.png'

/* ── Modal ───────────────────────────────────────────── */
const createModal = useModal()
const newTitle = ref('')
const newStartDate = ref('')
const newEndDate = ref('')
const creating = ref(false)
const createError = ref('')

/* ── Filter & Search ─────────────────────────────────── */
const activeFilter = ref<TripFilter>('all')
const searchQuery = ref('')

const filters: { label: string; value: TripFilter }[] = [
  { label: '전체', value: 'all' },
  { label: '예정', value: 'upcoming' },
  { label: '지난 여행', value: 'past' },
]

/* ── Data ────────────────────────────────────────────── */
const trips = computed(() => {
  const source = tripStore.trips.length > 0 ? tripStore.trips : mockTrips
  let filtered = source

  if (activeFilter.value !== 'all') {
    const today = new Date()
    if (activeFilter.value === 'upcoming') {
      filtered = filtered.filter((t) => {
        if (!t.startDate) return true
        return new Date(t.startDate.replace(/\./g, '-')) >= today
      })
    } else if (activeFilter.value === 'past') {
      filtered = filtered.filter((t) => {
        if (!t.endDate) return false
        return new Date(t.endDate.replace(/\./g, '-')) < today
      })
    }
  }

  if (searchQuery.value.trim()) {
    const q = searchQuery.value.trim().toLowerCase()
    filtered = filtered.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.destinationName?.toLowerCase().includes(q) ||
        (t.places ?? []).some((p) => p.toLowerCase().includes(q)),
    )
  }

  return filtered
})

const upcomingTrips = computed(() => mockTrips.filter((t) => t.status === 'ACTIVE'))

/* ── Carousel state ──────────────────────────────────── */
const carouselIndex = ref(0)
const currentTrip = computed(() => upcomingTrips.value[carouselIndex.value] || upcomingTrips.value[0])

function nextCarousel() {
  if (upcomingTrips.value.length === 0) return
  carouselIndex.value = (carouselIndex.value + 1) % upcomingTrips.value.length
}
function prevCarousel() {
  if (upcomingTrips.value.length === 0) return
  carouselIndex.value = (carouselIndex.value - 1 + upcomingTrips.value.length) % upcomingTrips.value.length
}

/* ── Carousel dots ───────────────────────────────────── */
const carouselDots = computed(() => {
  return upcomingTrips.value.map((_, i) => i)
})

/* ── Trip detail helpers ─────────────────────────────── */
function getPassengerText(trip: typeof currentTrip.value) {
  const count = trip.passengerCount || (trip.members ?? []).length
  if ((trip.members ?? []).length <= 1) return (trip.members ?? [])[0]?.displayName || `${count}명`
  return `${(trip.members ?? [])[0]?.displayName || ''} 외 ${count - 1}명`
}

function getChecklistDisplay(trip: typeof currentTrip.value) {
  return trip.checklistProgress || '0 / 0'
}

function getDestCount(trip: typeof currentTrip.value) {
  return `${trip.placeCount || (trip.places ?? []).length}곳`
}

function getDateDisplay(trip: typeof currentTrip.value) {
  return `${(trip.startDate ?? '').replace(/-/g, '.')} ~ ${(trip.endDate ?? '').replace(/-/g, '.')} · ${(trip.members ?? []).length}명`
}

function getDestCode(title: string): string {
  if (title.includes('대전')) return 'DJN'
  if (title.includes('부산')) return 'PUS'
  if (title.includes('제주')) return 'CJU'
  if (title.includes('강릉')) return 'KAG'
  if (title.includes('경주')) return 'KYJ'
  if (title.includes('여수')) return 'YSU'
  return 'SMG'
}

function getTripStatus(trip: (typeof mockTrips)[number]): string {
  if (trip.status === 'ARCHIVED') return '지난 여행'
  const today = new Date()
  if (!trip.startDate || !trip.endDate) return '예정'
  const start = new Date(trip.startDate.replace(/\./g, '-'))
  const end = new Date(trip.endDate.replace(/\./g, '-'))
  if (today >= start && today <= end) return '진행 중'
  if (today > end) return '지난 여행'
  return '예정'
}

function getStatusCls(status: string): string {
  if (status === '진행 중') return 'is-active'
  if (status === '지난 여행') return 'is-past'
  return ''
}

function getQRUrl(tripId: string) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&margin=2&color=1f2937&bgcolor=ffffff&data=https%3A%2F%2Fsoomgil.com%2Finvite%2F${tripId}`
}

/* ── Actions ─────────────────────────────────────────── */
function goTripDetail(tripId: string) {
  router.push({ name: 'Route', params: { tripId } })
}

async function handleCreateTrip() {
  if (!newTitle.value.trim() || !newStartDate.value || !newEndDate.value) {
    createError.value = '모든 항목을 입력해 주세요.'
    return
  }
  if (newStartDate.value > newEndDate.value) {
    createError.value = '도착일은 출발일 이후여야 합니다.'
    return
  }
  creating.value = true
  createError.value = ''
  try {
    const trip = await tripStore.createTrip(
      newTitle.value.trim(),
    )
    createModal.close()
    resetForm()
    router.push({ name: 'Route', params: { tripId: trip.id } })
  } catch {
    createModal.close()
    resetForm()
  } finally {
    creating.value = false
  }
}

function resetForm() {
  newTitle.value = ''
  newStartDate.value = ''
  newEndDate.value = ''
  createError.value = ''
}

/* ── Lifecycle ───────────────────────────────────────── */
onMounted(() => {
  tripStore.fetchTrips().catch(() => {})
})
</script>

<template>
  <div class="app-shell">
    <AppHeader />

    <main>
      <section class="section my-trips-dashboard">
        <div class="travel-page-head">
          <div>
            <p class="eyebrow">Travel Dashboard</p>
            <h1><span>내 여행 준비</span>를 이어가세요</h1>
            <p class="lead">다가오는 일정, 초대받은 여행을 한곳에서 확인하고 다음 계획으로 바로 이어가세요.</p>
          </div>
          <button class="btn primary" type="button" @click="createModal.open">
            <span class="material-symbols-rounded">add</span>새 여행 만들기
          </button>
        </div>
        <div class="trip-dashboard-layout">
          <div class="trip-dashboard-main">
            <section v-if="upcomingTrips.length > 0" class="next-trip-panel boarding-pass-container" aria-label="다음 여행">
              <div
                class="boarding-pass-card"
                :style="{ backgroundImage: `linear-gradient(135deg, rgba(255, 255, 255, 0.95), rgba(244, 249, 255, 0.98)), url(${currentTrip.coverImageUrl})` }"
              >
                <!-- 왼쪽 메인 티켓 -->
                <div class="ticket-main">
                  <div class="ticket-header">
                    <div class="ticket-logo">
                      <img :src="logoImg" alt="숨길 로고" class="logo-image">
                      <span class="logo-text">SOOMGIL AIR</span>
                    </div>
                    <span class="ticket-badge d-day-badge">{{ formatDDay(currentTrip.startDate ?? '') }}</span>
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
                      <span class="airport-code">{{ currentTrip.destinationCode || 'PUS' }}</span>
                      <span class="city-name">{{ currentTrip.destinationName || '부산 (BUSAN)' }}</span>
                    </div>
                  </div>

                  <div class="ticket-details">
                    <div class="detail-item">
                      <span class="label">PASSENGER</span>
                      <span class="value">{{ getPassengerText(currentTrip) }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">DATE</span>
                      <span class="value">{{ (currentTrip.startDate ?? '').replace(/-/g, '.') }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">END DATE</span>
                      <span class="value">{{ (currentTrip.endDate ?? '').replace(/-/g, '.') }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">DESTINATIONS</span>
                      <span class="value">{{ getDestCount(currentTrip) }}</span>
                    </div>
                    <div class="detail-item">
                      <span class="label">CHECKLIST</span>
                      <span class="value">{{ getChecklistDisplay(currentTrip) }}</span>
                    </div>
                  </div>

                  <div class="ticket-members-wrapper" aria-label="여행 참가자">
                    <span class="label">COMPANIONS</span>
                    <div class="next-trip-members">
                      <template v-for="(m, idx) in (currentTrip.members ?? []).slice(0, 3)" :key="m.id">
                        <span class="avatar">{{ (m.displayName ?? '?').charAt(0) }}</span>
                      </template>
                      <span v-if="(currentTrip.members ?? []).length > 3" class="avatar">+{{ (currentTrip.members ?? []).length - 3 }}</span>
                    </div>
                  </div>
                </div>

                <!-- 절취선 및 반원 구멍 -->
                <div class="ticket-divider">
                  <span class="punch-hole top"></span>
                  <span class="dashed-line"></span>
                  <span class="punch-hole bottom"></span>
                </div>

                <!-- 오른쪽 스터브 (Stub) -->
                <div class="ticket-stub">
                  <div class="stub-header">
                    <span class="stub-title-label">BOARDING PASS</span>
                    <h2 class="stub-title">{{ currentTrip.title }}</h2>
                    <p class="stub-date-info">{{ getDateDisplay(currentTrip) }}</p>
                  </div>

                  <!-- QR 초대 링크 영역 -->
                  <div class="stub-qr-area" title="스캔해서 여행에 초대하세요">
                    <div class="stub-qr-frame">
                      <img class="qr-code-img" alt="여행 초대 링크 QR 코드" :src="getQRUrl(currentTrip.id)" />
                    </div>
                    <div class="stub-qr-text">
                      <span class="qr-label">초대 링크 QR</span>
                      <span class="qr-sublabel">스캔해서 함께 여행해요</span>
                    </div>
                  </div>

                  <!-- 자세히 보기 버튼 -->
                  <a class="stub-detail-btn" href="#" @click.prevent="goTripDetail(currentTrip.id)">
                    <span>자세히 보기</span>
                    <span class="material-symbols-rounded">arrow_forward</span>
                  </a>

                  <!-- 캐러셀 위치 닷 -->
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

              <!-- 캐러셀 제어 버튼 -->
              <div class="next-trip-nav">
                <button class="carousel-btn prev-btn" type="button" aria-label="이전 여행" @click="prevCarousel">
                  <span class="material-symbols-rounded">chevron_left</span>
                </button>
                <button class="carousel-btn next-btn" type="button" aria-label="다음 여행" @click="nextCarousel">
                  <span class="material-symbols-rounded">chevron_right</span>
                </button>
              </div>
            </section>

            <section>
              <div class="section-title compact-title trip-list-head" style="margin-bottom: 24px;">
                <div>
                  <p class="eyebrow">Trips</p>
                  <h2>여행 목록</h2>
                </div>
                <div class="trip-toolbar">
                  <div class="trip-tabs" aria-label="여행 필터">
                    <button
                      v-for="f in filters"
                      :key="f.value"
                      :class="{ active: activeFilter === f.value }"
                      type="button"
                      :aria-pressed="activeFilter === f.value"
                      @click="activeFilter = f.value"
                    >
                      {{ f.label }}
                    </button>
                  </div>
                  <div class="search-box trip-search" role="search">
                    <label class="sr-only" for="trip-search-input">여행명 검색</label>
                    <input id="trip-search-input" v-model="searchQuery" type="search" placeholder="여행명 검색">
                    <button class="search-box__button trip-search-button" type="button" aria-label="여행명 검색">
                      <span class="material-symbols-rounded" aria-hidden="true">search</span>
                    </button>
                  </div>
                </div>
              </div>

              <div class="trip-view-panel active">
                <div class="my-trips-timeline-wrapper">
                  <button class="timeline-prev-btn" type="button" aria-label="이전 여행 목록">
                    <span class="material-symbols-rounded">chevron_left</span>
                  </button>
                  <div class="my-trips-timeline">
                    <div
                      v-for="(trip, i) in trips"
                      :key="trip.id"
                      class="timeline-card"
                      :class="{ 'is-active-timeline': i === carouselIndex }"
                      @click="goTripDetail(trip.id)"
                    >
                      <div class="timeline-card-header">
                        <span class="timeline-card-dday" :class="{ active: i === carouselIndex }">D-{{ formatDDay(trip.startDate ?? '').replace('D-', '') }}</span>
                        <span class="timeline-card-status-badge" :class="getStatusCls(getTripStatus(trip))">{{ getTripStatus(trip) }}</span>
                      </div>
                      <div class="timeline-card-body">
                        <div class="timeline-card-avatar-wrapper">
                          <img class="timeline-card-avatar" :src="trip.coverImageUrl" alt="">
                        </div>
                        <div class="timeline-card-info">
                          <h3 class="timeline-card-title">{{ trip.title }}</h3>
                          <div class="timeline-card-meta-row">
                            <span class="timeline-route-badge">SEL ✈ {{ getDestCode(trip.title) }}</span>
                            <p class="timeline-card-date">
                              <span class="material-symbols-rounded">calendar_month</span>
                              <span>{{ trip.startDate?.split('-')[0].trim() ?? '' }}</span>
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <button class="timeline-next-btn" type="button" aria-label="다음 여행 목록">
                    <span class="material-symbols-rounded">chevron_right</span>
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
      :class="{ active: createModal.isOpen.value }"
      :aria-hidden="!createModal.isOpen.value"
    >
      <div class="modal-card trip-create-card" role="dialog" aria-modal="true" aria-labelledby="trip-create-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">New Trip</p>
            <h3 id="trip-create-title">새 여행 만들기</h3>
          </div>
          <button class="icon-btn" type="button" aria-label="닫기" @click="createModal.close">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <form class="trip-create-form" @submit.prevent="handleCreateTrip">
          <label class="form-label">
            <span class="form-label-text">여행 이름</span>
            <input v-model="newTitle" class="field" type="text" name="title" placeholder="예: 오늘 떠나는 즉흥 여행" required>
          </label>

          <div class="trip-create-grid">
            <label class="form-label">
              <span class="form-label-text">출발일</span>
              <input v-model="newStartDate" class="field" type="date" name="startDate" required>
            </label>
            <label class="form-label">
              <span class="form-label-text">도착일</span>
              <input v-model="newEndDate" class="field" type="date" name="endDate" required>
            </label>
          </div>

          <p v-if="createError" class="trip-create-error" aria-live="polite">{{ createError }}</p>

          <div class="trip-create-actions">
            <button class="btn ghost" type="button" @click="createModal.close">취소</button>
            <button class="btn primary" type="submit">
              <span class="material-symbols-rounded">check</span>여행 추가
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
