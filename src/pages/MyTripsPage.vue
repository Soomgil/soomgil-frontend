<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useModal } from '@/composables/useModal'
import { useTripStore } from '@/stores/trip.store'
import type { TripFilter, TripSummary } from '@/types/trip'

const router = useRouter()
const tripStore = useTripStore()
const createModal = useModal()
const activeFilter = ref<TripFilter>('all')
const searchQuery = ref('')
const newTitle = ref('')
const newDestination = ref('')
const createError = ref('')

const filters: { label: string; value: TripFilter }[] = [
  { label: '전체', value: 'all' },
  { label: '진행 중', value: 'upcoming' },
  { label: '보관됨', value: 'past' },
]

const filteredTrips = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  return tripStore.trips.filter((trip) => {
    const matchesStatus =
      activeFilter.value === 'all' ||
      (activeFilter.value === 'upcoming' && trip.status === 'ACTIVE') ||
      (activeFilter.value === 'past' && trip.status === 'ARCHIVED')
    const matchesQuery =
      !query ||
      trip.title.toLowerCase().includes(query) ||
      trip.displayDestination?.toLowerCase().includes(query)

    return matchesStatus && matchesQuery
  })
})

function formatCreatedAt(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(new Date(value))
}

function statusLabel(trip: TripSummary) {
  if (trip.status === 'ARCHIVED') return '보관됨'
  if (trip.status === 'DELETED') return '삭제됨'
  return '진행 중'
}

function goTripDetail(tripId: string) {
  router.push({ name: 'Route', params: { tripId } })
}

async function loadTrips() {
  await tripStore.fetchTrips({ page: 0, size: 20, sort: ['createdAt,desc'] }).catch(() => undefined)
}

async function handleCreateTrip() {
  const title = newTitle.value.trim()
  if (!title) {
    createError.value = '여행 이름을 입력해 주세요.'
    return
  }

  createError.value = ''
  try {
    await tripStore.createTrip({
      title,
      displayDestination: newDestination.value.trim() || undefined,
    })
    resetForm()
    createModal.close()
  } catch {
    createError.value = '여행을 만들지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }
}

function resetForm() {
  newTitle.value = ''
  newDestination.value = ''
  createError.value = ''
}

function closeCreateModal() {
  resetForm()
  createModal.close()
}

onMounted(loadTrips)
</script>

<template>
  <div class="app-shell">
    <AppHeader />

    <main>
      <section class="section my-trips-dashboard">
        <div class="travel-page-head">
          <div>
            <p class="eyebrow">Trips</p>
            <h1>내 여행</h1>
            <p class="lead">진행 중인 여행과 보관한 여행을 확인하세요.</p>
          </div>
          <button class="btn primary" type="button" @click="createModal.open">
            <span class="material-symbols-rounded" aria-hidden="true">add</span>
            새 여행 만들기
          </button>
        </div>

        <div class="section-title compact-title trip-list-head">
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
            <input
              id="trip-search-input"
              v-model="searchQuery"
              type="search"
              placeholder="여행명 또는 목적지 검색"
            >
            <span class="material-symbols-rounded" aria-hidden="true">search</span>
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
          :message="tripStore.trips.length === 0 ? '아직 만든 여행이 없습니다.' : '조건에 맞는 여행이 없습니다.'"
        />
        <div v-else class="trip-card-grid">
          <button
            v-for="trip in filteredTrips"
            :key="trip.id"
            class="travel-card"
            type="button"
            @click="goTripDetail(trip.id)"
          >
            <div class="travel-card__body">
              <div class="travel-card__header">
                <span class="timeline-card-status-badge" :class="{ 'is-past': trip.status === 'ARCHIVED' }">
                  {{ statusLabel(trip) }}
                </span>
                <span class="travel-card__role">{{ trip.myRole === 'OWNER' ? '방장' : '멤버' }}</span>
              </div>
              <h2>{{ trip.title }}</h2>
              <p>{{ trip.displayDestination || '목적지 미정' }}</p>
              <span class="travel-card__date">{{ formatCreatedAt(trip.createdAt) }} 생성</span>
            </div>
            <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
          </button>
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
          <button class="icon-btn" type="button" aria-label="닫기" @click="closeCreateModal">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
        <form class="trip-create-form" @submit.prevent="handleCreateTrip">
          <label class="form-label">
            <span class="form-label-text">여행 이름</span>
            <input v-model="newTitle" class="field" type="text" name="title" maxlength="100" required>
          </label>
          <label class="form-label">
            <span class="form-label-text">표시 목적지</span>
            <input v-model="newDestination" class="field" type="text" name="displayDestination" maxlength="100" placeholder="예: 부산광역시">
          </label>

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
  </div>
</template>

<style scoped>
.trip-list-head {
  align-items: center;
  display: flex;
  gap: 20px;
  justify-content: space-between;
  margin: 36px 0 24px;
}

.trip-card-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.travel-card {
  align-items: center;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #111827;
  cursor: pointer;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  min-height: 180px;
  padding: 24px;
  text-align: left;
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
  width: 100%;
}

.travel-card:hover,
.travel-card:focus-visible {
  border-color: #7c3aed;
  box-shadow: 0 8px 24px rgb(17 24 39 / 10%);
  outline: none;
  transform: translateY(-2px);
}

.travel-card__body {
  min-width: 0;
}

.travel-card__header {
  align-items: center;
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.travel-card__role {
  color: #6b7280;
  font-size: 13px;
  font-weight: 600;
}

.travel-card h2 {
  font-size: 20px;
  letter-spacing: 0;
  margin: 0 0 8px;
  overflow-wrap: anywhere;
}

.travel-card p {
  color: #4b5563;
  margin: 0 0 18px;
  overflow-wrap: anywhere;
}

.travel-card__date {
  color: #9ca3af;
  font-size: 13px;
}

@media (max-width: 960px) {
  .trip-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .trip-list-head {
    align-items: stretch;
    flex-direction: column;
  }

  .trip-card-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .travel-card {
    min-height: 156px;
    padding: 20px;
  }
}
</style>
