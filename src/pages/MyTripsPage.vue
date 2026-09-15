<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import LegalRegionCombobox from '@/components/trip/LegalRegionCombobox.vue'
import TripSettingsModal from '@/components/trip/TripSettingsModal.vue'
import { useModal } from '@/composables/useModal'
import { useTripStore } from '@/stores/trip.store'
import { useAuthStore } from '@/stores/auth.store'
import { itineraryApi } from '@/api/itinerary.api'
import { tripApi } from '@/api/trip.api'
import { userApi } from '@/api/user.api'
import type { TripDetailMember, TripSummary } from '@/types/trip'
import type { LegalRegion } from '@/types/geo'
import type { UserSummary } from '@/types/auth'

const router = useRouter()
const route = useRoute()
const tripStore = useTripStore()
const authStore = useAuthStore()
const createModal = useModal()
type TripFilter = 'all' | 'upcoming' | 'past' | 'undecided'
const activeFilter = ref<TripFilter>('all')
const searchQuery = ref('')
const currentPage = ref(1)
const collectingTrips = ref(false)
let tripLoadSequence = 0
const newTitle = ref('')
const newDestination = ref('')
const selectedRegion = ref<LegalRegion | null>(null)
const newStartDate = ref('')
const newEndDate = ref('')
const companionQuery = ref('')
const companionResults = ref<UserSummary[]>([])
const selectedCompanions = ref<UserSummary[]>([])
const searchingCompanions = ref(false)
const companionSearchError = ref('')
const createError = ref('')
const activeSettingsTrip = ref<TripSummary | null>(null)
const defaultSettingsTab = ref<'tab-settings' | 'tab-members'>('tab-settings')
const failedCoverImages = ref<Set<string>>(new Set())
const membersByTrip = ref<Record<string, TripDetailMember[]>>({})
const failedMemberImages = ref(new Set<string>())
const pendingMembers = new Set<string>()

const requestedIntent = computed(() => typeof route.query.intent === 'string' ? route.query.intent : null)
const intentMessage = computed(() => requestedIntent.value === 'invite' || requestedIntent.value === 'share'
  ? '초대할 여행의 설정 버튼을 눌러 멤버 관리 탭에서 초대 링크를 만들거나 공유하세요.'
  : null)

const createDayCount = computed(() => {
  if (!newStartDate.value || !newEndDate.value) return 0
  const start = parseDateInput(newStartDate.value)
  const end = parseDateInput(newEndDate.value)
  if (!start || !end || end < start) return 0
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1
})

const createNightCount = computed(() => Math.max(0, createDayCount.value - 1))

function parseDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return null
  return new Date(year, month - 1, day)
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(date: Date, days: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

const filters: { label: string; value: TripFilter }[] = [
  { label: '전체', value: 'all' },
  { label: '진행 중', value: 'upcoming' },
  { label: '지난 여행', value: 'past' },
  { label: '미정', value: 'undecided' },
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
      (activeFilter.value === 'upcoming' && status === 'ACTIVE' && Boolean(trip.startDate && trip.endDate)) ||
      (activeFilter.value === 'undecided' && status === 'ACTIVE' && (!trip.startDate || !trip.endDate)) ||
      (activeFilter.value === 'past' && status === 'ARCHIVED')
    const matchesQuery =
      !query ||
      trip.title.toLowerCase().includes(query) ||
      trip.displayDestination?.toLowerCase().includes(query)

    return matchesStatus && matchesQuery
  })
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredTrips.value.length / 9)))
const paginatedTrips = computed(() => filteredTrips.value.slice((currentPage.value - 1) * 9, currentPage.value * 9))
const pageNumbers = computed(() => {
  const start = Math.max(1, Math.min(currentPage.value - 2, totalPages.value - 4))
  return Array.from({ length: Math.min(5, totalPages.value) }, (_, index) => start + index)
})
watch(searchQuery, () => { currentPage.value = 1 })
watch(totalPages, count => { currentPage.value = Math.min(currentPage.value, count) })
watch(() => paginatedTrips.value.map(trip => trip.id), async (ids) => {
  const queue = ids.filter(id => !(id in membersByTrip.value) && !pendingMembers.has(id))
  queue.forEach(id => pendingMembers.add(id))
  // 목록의 멤버 조회는 최대 4개씩 실행한다.
  await Promise.all(Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const id = queue.shift()!
      try { membersByTrip.value[id] = (await tripApi.getMembers(id)).filter(member => member.status === 'ACTIVE') }
      catch { /* 조회 실패를 동행자 0명으로 표시하지 않는다. */ }
      finally { pendingMembers.delete(id) }
    }
  }))
}, { immediate: true })

const emptyMessage = computed(() => {
  if (searchQuery.value.trim()) return '검색 조건에 맞는 여행이 없습니다.'
  if (activeFilter.value === 'upcoming') return '진행 중인 여행이 없습니다.'
  if (activeFilter.value === 'past') return '지난 여행이 없습니다.'
  if (activeFilter.value === 'undecided') return '일정이 미정인 여행이 없습니다.'
  return '아직 만든 여행이 없습니다.'
})

function statusLabel(trip: TripSummary) {
  const status = effectiveStatus(trip)
  if (status === 'ARCHIVED') return '지난 여행'
  if (!trip.startDate || !trip.endDate) return '미정'
  if (status === 'DELETED') return '삭제됨'
  if (!trip.startDate || !trip.endDate) return '미정'
  return '진행 중'
}

function goTripDetail(tripId: string) {
  router.push({ name: 'Route', params: { tripId } })
}

/** 방장 전용. 투표 화면은 세션 유무에 따라 시작 설정·진행·결과를 스스로 보여준다. */
function goTripVote(tripId: string) {
  router.push({ name: 'TripVote', params: { tripId } })
}

function getTripStatus(trip: TripSummary): string {
  const status = effectiveStatus(trip)
  if (status === 'ARCHIVED') return '지난 여행'
  if (status === 'DELETED') return '삭제됨'
  if (!trip.startDate || !trip.endDate) return '미정'
  return '진행 중'
}

function getDestinationLabel(trip: TripSummary): string {
  return trip.displayDestination?.trim() || '목적지 미정'
}

function hasUsableCover(trip: TripSummary) {
  return Boolean(trip.coverImageUrl) && !failedCoverImages.value.has(trip.id)
}

function handleCoverError(tripId: string) {
  failedCoverImages.value = new Set([...failedCoverImages.value, tripId])
}

function getStatusCls(trip: TripSummary): string {
  const status = effectiveStatus(trip)
  if (status === 'ARCHIVED') return 'is-past'
  if (status === 'ACTIVE') return 'is-active'
  return ''
}

function formatTripDate(value: string | null | undefined): string {
  if (!value) return '미정'
  return value.replace(/-/g, '.')
}

function formatTripPeriod(trip: TripSummary): string {
  if (!trip.startDate && !trip.endDate) return '여행 기간 미정'
  if (trip.startDate && trip.endDate) return `${formatTripDate(trip.startDate)} - ${formatTripDate(trip.endDate)}`
  return formatTripDate(trip.startDate ?? trip.endDate)
}

async function loadTrips() {
  const sequence = ++tripLoadSequence
  currentPage.value = 1
  collectingTrips.value = true
  const status = undefined

  try {
    await tripStore.fetchTrips({ page: 0, size: 20, status, sort: ['createdAt,desc'] })
    // 서버 검색이 없는 목록 API이므로 모든 페이지를 모아 검색한 뒤 9개씩 표시한다.
    while (sequence === tripLoadSequence && tripStore.hasMoreTrips && tripStore.page) {
      const previousPage = tripStore.page.page
      await tripStore.fetchNextPage()
      if (tripStore.loadMoreError || tripStore.page.page === previousPage) break
    }
  } catch { /* store의 오류 상태로 재시도를 제공한다. */ }
  finally { if (sequence === tripLoadSequence) collectingTrips.value = false }
}

function openTripSettings(trip: TripSummary) {
  activeSettingsTrip.value = trip
  defaultSettingsTab.value = 'tab-settings'
}

function closeTripSettings() {
  activeSettingsTrip.value = null
}

async function searchCompanions() {
  const query = companionQuery.value.trim()
  if (!query) {
    companionResults.value = []
    companionSearchError.value = '함께 갈 사람의 이름을 입력해 주세요.'
    return
  }

  searchingCompanions.value = true
  companionSearchError.value = ''
  try {
    const response = await userApi.searchUsers(query, 0, 8)
    const selectedIds = new Set(selectedCompanions.value.map((user) => user.id))
    companionResults.value = response.items.filter(
      (user) => user.id !== authStore.user?.id && !selectedIds.has(user.id),
    )
    if (companionResults.value.length === 0) {
      companionSearchError.value = '추가할 수 있는 사용자를 찾지 못했습니다.'
    }
  } catch {
    companionResults.value = []
    companionSearchError.value = '사용자를 검색하지 못했습니다.'
  } finally {
    searchingCompanions.value = false
  }
}

function addCompanion(user: UserSummary) {
  if (selectedCompanions.value.some((selected) => selected.id === user.id)) return
  selectedCompanions.value.push(user)
  companionResults.value = companionResults.value.filter((candidate) => candidate.id !== user.id)
  companionQuery.value = ''
  companionSearchError.value = ''
}

function removeCompanion(userId: string) {
  selectedCompanions.value = selectedCompanions.value.filter((user) => user.id !== userId)
}

async function createInitialItinerary(tripId: string, baseVersion: number) {
  const start = parseDateInput(newStartDate.value)
  if (!start) throw new Error('INVALID_START_DATE')

  let version = baseVersion
  for (let index = 0; index < createDayCount.value; index += 1) {
    const response = await itineraryApi.createDay(tripId, {
      baseVersion: version,
      groupType: 'DAY',
      dayNumber: index + 1,
      date: formatDateInput(addDays(start, index)),
      sortOrder: index + 1,
    })
    version = response.itineraryVersion
  }

  await itineraryApi.createDay(tripId, {
    baseVersion: version,
    groupType: 'UNSCHEDULED',
    sortOrder: createDayCount.value + 1,
  })
}

async function handleCreateTrip() {
  const title = newTitle.value.trim()
  if (!title) {
    createError.value = '여행 이름을 입력해 주세요.'
    return
  }

  // 지역이 없으면 추천도 투표도 동작하지 않으므로 검색 결과에서 고른 지역을 필수로 받는다.
  if (!selectedRegion.value) {
    createError.value = '지역을 검색해서 선택해 주세요. 여행 지역이 있어야 추천과 투표가 동작합니다.'
    return
  }

  if (!newStartDate.value || !newEndDate.value) {
    createError.value = '여행 시작일과 종료일을 선택해 주세요.'
    return
  }

  if (createDayCount.value === 0) {
    createError.value = '종료 날짜는 시작 날짜 이후로 선택해 주세요.'
    return
  }

  createError.value = ''
  try {
    const created = await tripStore.createTrip({
      title,
      displayDestination: newDestination.value.trim() || undefined,
      legalRegionCodes: [selectedRegion.value.code],
      startDate: newStartDate.value,
      endDate: newEndDate.value,
    })

    await createInitialItinerary(created.id, created.itineraryVersion)
    await Promise.all(selectedCompanions.value.map((user) => (
      tripApi.createInvite(created.id, { inviteeUserId: user.id })
    )))

    if (activeFilter.value === 'past' || activeFilter.value === 'undecided') activeFilter.value = 'upcoming'
    resetForm()
    createModal.close()
    if (requestedIntent.value === 'route' || requestedIntent.value === 'ai') {
      await router.replace({ name: 'Route', params: { tripId: created.id }, query: requestedIntent.value === 'ai' ? { panel: 'ai' } : {} })
    } else {
      await router.push({ name: 'TripVote', params: { tripId: created.id } })
    }
  } catch {
    createError.value = '여행의 초기 설정을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.'
  }
}

function resetForm() {
  newTitle.value = ''
  newDestination.value = ''
  selectedRegion.value = null
  newStartDate.value = ''
  newEndDate.value = ''
  companionQuery.value = ''
  companionResults.value = []
  selectedCompanions.value = []
  companionSearchError.value = ''
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
</script>

<template>
  <div class="app-shell travel-paper">
    <AppHeader />

    <main>
      <section class="section my-trips-dashboard page-with-hero">
        <div class="travel-page-head page-hero">
          <div class="page-hero__copy">
            <p class="page-hero__eyebrow">
              <span class="material-symbols-rounded" aria-hidden="true">luggage</span>
              MY TRAVEL COLLECTION
            </p>
            <h1 class="page-hero__title">내 여행</h1>
            <p class="page-hero__lead">떠날 날의 설렘부터, 오래 남을 풍경까지.</p>
          </div>

        </div>
        <p v-if="intentMessage" class="trip-intent-guide" role="status"><span class="material-symbols-rounded">info</span>{{ intentMessage }}</p>

        <div class="trip-dashboard-layout">
          <div class="trip-dashboard-main">
            <section class="trip-list-section">
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
                  <div class="trip-search-actions">
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
                  <button class="btn primary trip-create-button" type="button" @click="createModal.open"><span class="material-symbols-rounded" aria-hidden="true">add</span>새 여행 만들기</button>
                  </div>
                </div>
              </div>

              <LoadingState v-if="tripStore.loading || collectingTrips" />
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
                  <div class="my-trips-timeline">
                    <article
                      v-for="trip in paginatedTrips"
                      :key="trip.id"
                      class="timeline-card"
                      :class="[getStatusCls(trip), { 'has-actions': true }]"
                      tabindex="0"
                      role="button"
                      @click="goTripDetail(trip.id)"
                      @keydown.enter.self="goTripDetail(trip.id)"
                      @keydown.space.self.prevent="goTripDetail(trip.id)"
                    >
                      <div class="timeline-card-header">
                        <div class="timeline-card-badges">
                          <span class="timeline-card-status-badge" :class="getStatusCls(trip)">{{ getTripStatus(trip) }}</span>
                          <span class="timeline-card-role">{{ trip.myRole === 'OWNER' ? '방장' : '멤버' }}</span>
                        </div>
                      </div>
                      <div class="timeline-card-body">
                        <div
                          class="timeline-card-avatar-wrapper"
                          :class="{ 'timeline-card-avatar-wrapper--placeholder': !hasUsableCover(trip) }"
                        >
                          <img
                            v-if="hasUsableCover(trip)"
                            :src="trip.coverImageUrl!"
                            alt=""
                            @error="handleCoverError(trip.id)"
                          >
                          <span v-else class="material-symbols-rounded" aria-hidden="true">travel_explore</span>
                        </div>
                        <div class="timeline-card-info">
                          <h3 class="timeline-card-title">{{ trip.title }}</h3>
                          <p class="timeline-card-destination">{{ getDestinationLabel(trip) }}</p>
                          <p class="timeline-card-date">
                            <span class="material-symbols-rounded">calendar_month</span>
                            <span>{{ formatTripPeriod(trip) }}</span>
                          </p>
                        </div>
                      </div>
                      <div class="timeline-card-actions">
                        <div class="trip-members" :aria-label="membersByTrip[trip.id] ? `동행자 ${membersByTrip[trip.id]!.length}명` : '동행자 정보를 불러오지 못했거나 불러오는 중'">
                          <span v-for="member in (membersByTrip[trip.id] || []).slice(0, 3)" :key="member.id" class="trip-member-avatar" :title="member.user.displayName">
                            <img v-if="member.user.profileImageUrl && !failedMemberImages.has(member.id)" :src="member.user.profileImageUrl" :alt="member.user.displayName" @error="failedMemberImages.add(member.id)">
                            <span v-else class="material-symbols-rounded" role="img" :aria-label="member.user.displayName">person</span>
                          </span>
                          <span v-if="(membersByTrip[trip.id]?.length || 0) > 3" class="trip-member-overflow">+{{ membersByTrip[trip.id]!.length - 3 }}</span>
                          <span v-if="!membersByTrip[trip.id]" class="material-symbols-rounded" aria-hidden="true">group</span>
                        </div>
                        <button
                          v-if="trip.myRole === 'OWNER'"
                          class="timeline-card-vote"
                          type="button"
                          @click.stop="goTripVote(trip.id)"
                        >
                          <span class="material-symbols-rounded" aria-hidden="true">how_to_vote</span>
                          <span>투표</span>
                        </button>
                        <button class="trip-options" type="button" :aria-label="`${trip.title} 옵션`" title="여행 설정 · 멤버 관리" @click.stop="openTripSettings(trip)"><span class="material-symbols-rounded" aria-hidden="true">settings</span></button>
                      </div>
                    </article>
                  </div>
                </div>
              </div>

              <p v-if="tripStore.loadMoreError" role="alert">일부 여행을 불러오지 못했습니다. <button type="button" @click="loadTrips">다시 시도</button></p>
              <nav v-if="filteredTrips.length && !tripStore.loading && !collectingTrips" class="trip-pagination" aria-label="여행 목록 페이지">
                <button type="button" :disabled="currentPage === 1" @click="currentPage--">이전</button>
                <button v-for="page in pageNumbers" :key="page" type="button" :aria-current="page === currentPage ? 'page' : undefined" :aria-label="`${page}페이지`" @click="currentPage = page">{{ page }}</button>
                <button type="button" :disabled="currentPage === totalPages" @click="currentPage++">다음</button>
              </nav>
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
            <p class="eyebrow">Plan & Invite</p>
            <h3 id="trip-create-title">새 여행 만들기</h3>
            <p class="trip-create-intro">여행 정보와 동행자를 한 번에 정하고 바로 장소 투표를 시작하세요.</p>
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
            <label class="form-label-text" for="trip-create-destination">여행 지역</label>
            <LegalRegionCombobox
              id="trip-create-destination"
              v-model="newDestination"
              name="displayDestination"
              placeholder="예: 부산광역시, 제주시"
              @select="selectedRegion = $event"
            />
            <p class="trip-create-hint">검색 결과에서 지역을 고르면 그 지역으로 장소를 추천하고 투표 후보를 뽑습니다.</p>
          </div>

          <div class="trip-create-grid trip-create-date-grid">
            <label class="form-label">
              <span class="form-label-text">시작일</span>
              <input
                v-model="newStartDate"
                class="field"
                type="date"
                name="startDate"
                required
                data-testid="trip-create-start-date"
              >
            </label>
            <label class="form-label">
              <span class="form-label-text">종료일</span>
              <input
                v-model="newEndDate"
                class="field"
                type="date"
                name="endDate"
                :min="newStartDate"
                required
                data-testid="trip-create-end-date"
              >
            </label>
          </div>
          <p v-if="createDayCount" class="trip-create-duration" aria-live="polite">
            <span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>
            {{ createNightCount }}박 {{ createDayCount }}일 일정으로 만들어요.
          </p>

          <section class="trip-create-companions" aria-labelledby="trip-create-companions-title">
            <div class="trip-create-section-head">
              <div>
                <strong id="trip-create-companions-title">누구와 함께 가나요?</strong>
                <span>사용자를 선택하면 여행 생성과 동시에 초대를 보냅니다. 혼자라면 비워 두세요.</span>
              </div>
              <span v-if="selectedCompanions.length" class="companion-count">{{ selectedCompanions.length }}명 선택</span>
            </div>

            <div v-if="selectedCompanions.length" class="selected-companions" aria-label="선택한 동행자">
              <button
                v-for="user in selectedCompanions"
                :key="user.id"
                type="button"
                class="selected-companion-chip"
                :aria-label="`${user.displayName} 선택 해제`"
                @click="removeCompanion(user.id)"
              >
                <span class="companion-avatar" aria-hidden="true">
                  <img v-if="user.profileImageUrl" :src="user.profileImageUrl" alt="">
                  <template v-else>{{ user.displayName.charAt(0) }}</template>
                </span>
                <span>{{ user.displayName }}</span>
                <span class="material-symbols-rounded" aria-hidden="true">close</span>
              </button>
            </div>

            <div class="companion-search-row">
              <input
                v-model="companionQuery"
                class="field"
                type="search"
                name="companionSearch"
                placeholder="동행자 이름 검색"
                autocomplete="off"
                @keydown.enter.prevent="searchCompanions"
              >
              <button class="btn ghost companion-search-button" type="button" :disabled="searchingCompanions" @click="searchCompanions">
                {{ searchingCompanions ? '검색 중' : '검색' }}
              </button>
            </div>

            <div v-if="companionResults.length" class="companion-results" role="listbox" aria-label="동행자 검색 결과">
              <button
                v-for="user in companionResults"
                :key="user.id"
                class="companion-result"
                type="button"
                role="option"
                @click="addCompanion(user)"
              >
                <span class="companion-avatar" aria-hidden="true">
                  <img v-if="user.profileImageUrl" :src="user.profileImageUrl" alt="">
                  <template v-else>{{ user.displayName.charAt(0) }}</template>
                </span>
                <span>{{ user.displayName }}</span>
                <span class="material-symbols-rounded" aria-hidden="true">add_circle</span>
              </button>
            </div>
            <p v-if="companionSearchError" class="companion-search-error" aria-live="polite">{{ companionSearchError }}</p>
          </section>

          <div class="trip-create-next-step">
            <span class="material-symbols-rounded" aria-hidden="true">how_to_vote</span>
            <div>
              <strong>다음 단계는 장소 투표예요</strong>
              <span>여행을 만들면 방장용 투표 설정 화면으로 바로 이동합니다.</span>
            </div>
          </div>

          <p v-if="createError" class="trip-create-error" aria-live="polite">{{ createError }}</p>

          <div class="trip-create-actions">
            <button class="btn ghost" type="button" @click="closeCreateModal">취소</button>
            <button class="btn primary" type="submit" :disabled="tripStore.creating || !selectedRegion">
              {{ tripStore.creating ? '여행 준비 중...' : '여행 만들고 투표 시작' }}
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
  margin: 0;
}
.trip-intent-guide { display: flex; align-items: center; gap: 8px; margin: -12px 0 24px; padding: 12px 16px; border: 1px solid rgba(124, 58, 237, .18); border-radius: 14px; background: rgba(124, 58, 237, .05); color: var(--violet); font-size: 13px; font-weight: 750; }
.trip-intent-guide .material-symbols-rounded { font-size: 18px; }
.trip-create-hint { color: var(--muted); font-size: 12px; line-height: 1.5; margin: 6px 0 0; }
.trip-create-card { max-width: 720px; width: min(100%, 720px); }
.trip-create-intro { color: var(--muted); font-size: 13px; line-height: 1.55; margin: 6px 0 0; }
.trip-create-date-grid { align-items: end; }
.trip-create-duration {
  align-items: center;
  background: rgba(124, 58, 237, 0.07);
  border: 1px solid rgba(124, 58, 237, 0.14);
  border-radius: 12px;
  color: var(--violet);
  display: flex;
  font-size: 13px;
  font-weight: 800;
  gap: 7px;
  margin: -4px 0 0;
  padding: 10px 12px;
}
.trip-create-duration .material-symbols-rounded { font-size: 18px; }
.trip-create-companions {
  background: #fbfdff;
  border: 1px solid var(--line);
  border-radius: 18px;
  display: grid;
  gap: 12px;
  padding: 16px;
}
.trip-create-section-head {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  justify-content: space-between;
}
.trip-create-section-head > div { display: grid; gap: 4px; }
.trip-create-section-head strong { color: var(--ink); font-size: 14px; }
.trip-create-section-head span { color: var(--muted); font-size: 12px; line-height: 1.5; }
.trip-create-section-head .companion-count { color: var(--violet); flex: 0 0 auto; font-weight: 800; }
.selected-companions { display: flex; flex-wrap: wrap; gap: 8px; }
.selected-companion-chip,
.companion-result {
  align-items: center;
  border: 1px solid rgba(124, 58, 237, 0.16);
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 12px;
  font-weight: 800;
  gap: 8px;
}
.selected-companion-chip {
  background: rgba(124, 58, 237, 0.07);
  border-radius: 999px;
  padding: 5px 9px 5px 5px;
}
.selected-companion-chip > .material-symbols-rounded { color: var(--muted); font-size: 15px; }
.companion-avatar {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border-radius: 50%;
  color: #fff;
  display: grid;
  flex: 0 0 auto;
  font-size: 11px;
  height: 28px;
  overflow: hidden;
  place-items: center;
  width: 28px;
}
.companion-avatar img { height: 100%; object-fit: cover; width: 100%; }
.companion-search-row { display: grid; gap: 8px; grid-template-columns: minmax(0, 1fr) auto; }
.companion-search-button { min-width: 72px; }
.companion-results {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 14px;
  display: grid;
  gap: 4px;
  max-height: 176px;
  overflow-y: auto;
  padding: 6px;
}
.companion-result {
  background: transparent;
  border-color: transparent;
  border-radius: 10px;
  justify-content: flex-start;
  padding: 7px;
  text-align: left;
  width: 100%;
}
.companion-result:hover { background: rgba(124, 58, 237, 0.06); border-color: rgba(124, 58, 237, 0.12); }
.companion-result > .material-symbols-rounded { color: var(--violet); font-size: 19px; margin-left: auto; }
.companion-search-error { color: var(--muted); font-size: 12px; margin: 0; }
.trip-create-next-step {
  align-items: center;
  background: linear-gradient(135deg, rgba(0, 102, 255, 0.07), rgba(0, 209, 255, 0.05));
  border: 1px solid rgba(0, 102, 255, 0.14);
  border-radius: 16px;
  display: flex;
  gap: 12px;
  padding: 14px;
}
.trip-create-next-step > .material-symbols-rounded { color: var(--violet); font-size: 25px; }
.trip-create-next-step > div { display: grid; gap: 3px; }
.trip-create-next-step strong { color: var(--ink); font-size: 13px; }
.trip-create-next-step span { color: var(--muted); font-size: 12px; line-height: 1.45; }

@media (max-width: 640px) {
  .trip-create-date-grid { grid-template-columns: 1fr; }
  .trip-create-section-head { flex-direction: column; }
  .companion-search-row { grid-template-columns: 1fr; }
}

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

.trip-list-section {
  display: grid;
  gap: 24px;
}

.trip-dashboard-main { gap: 0; }

.trip-view-panel {
  min-width: 0;
}

.my-trips-timeline-wrapper {
  display: block;
  max-width: none;
  overflow: visible;
  padding: 0;
  width: 100%;
}

.my-trips-timeline {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  margin: 0;
  overflow: visible;
  width: 100%;
}

.timeline-card {
  background: #fff;
  border: 1px solid rgba(227, 234, 244, 0.95);
  border-radius: 20px;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.045);
  box-sizing: border-box;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  height: auto;
  min-height: 220px;
  padding: 20px;
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
  user-select: none;
  width: auto;
}

.timeline-card::before,
.timeline-card::after {
  display: none;
}

.timeline-card:hover,
.timeline-card:focus-visible {
  border-color: rgba(0, 102, 255, 0.24);
  box-shadow: 0 14px 34px rgba(0, 102, 255, 0.09);
  outline: none;
  transform: translateY(-3px);
}

.timeline-card-header {
  align-items: center;
  border: 0;
  display: flex;
  justify-content: flex-start;
  margin: 0 0 18px;
  padding: 0;
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
  gap: 5px;
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.timeline-card-date .material-symbols-rounded { font-size: 16px; }

.timeline-card-destination {
  color: var(--muted);
  font-size: 13px;
  font-weight: 750;
  line-height: 1.35;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-card-role {
  background: var(--surface-2);
  border-radius: 999px;
  color: var(--ink);
  font-size: 11px;
  font-weight: 800;
  padding: 4px 9px;
}

.timeline-card-avatar-wrapper {
  border: 0;
  border-radius: 16px;
  flex: 0 0 72px;
  height: 72px;
  overflow: hidden;
  width: 72px;
}

.timeline-card-avatar-wrapper img {
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.timeline-card-avatar-wrapper--placeholder {
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.92), rgba(0, 102, 255, 0.88));
  color: #fff;
  display: grid;
  place-items: center;
}

.timeline-card-body {
  align-items: center;
  display: flex;
  gap: 14px;
}

.timeline-card-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  gap: 3px;
  margin-left: 0;
  min-width: 0;
}

.timeline-card-status-badge {
  background: rgba(100, 116, 139, 0.09);
  border-radius: 999px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 850;
  padding: 4px 9px;
}

.timeline-card-status-badge.is-active {
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
}

.timeline-card-avatar-wrapper--placeholder .material-symbols-rounded {
  font-size: 28px;
}

.timeline-card-title {
  color: var(--ink);
  font-size: 16px;
  font-weight: 850;
  line-height: 1.4;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.timeline-card-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: 20px;
  border-top: 0;
  position: relative;
  z-index: 2;
}

.timeline-card-vote {
  align-items: center;
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 850;
  gap: 4px;
  height: 32px;
  justify-content: center;
  padding: 0 12px;
  transition: border-color 160ms ease, color 160ms ease;
}

.timeline-card-vote:hover {
  border-color: rgba(0, 102, 255, 0.28);
  color: var(--violet);
}

.timeline-card-vote .material-symbols-rounded {
  font-size: 16px;
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

@media (max-width: 1024px) {
  /* original.css가 1024px 이하에서 .travel-page-head를 세로 배치로 바꾸지만, main.css의
     .page-hero 규칙(align-items: flex-end, copy의 flex-basis 480px)이 더 높은 우선순위로 남아
     세로 축에서 480px 빈 공간과 우측 정렬을 만든다. 세로 배치에서는 폭 기준 basis를 해제한다. */
  .travel-page-head.page-hero.page-hero.page-hero {
    align-items: stretch;
  }

  .travel-page-head .page-hero__copy {
    flex: 1 1 auto;
    width: 100%;
  }

  .travel-page-head .page-hero__actions {
    justify-content: flex-start;
    width: 100%;
  }

  /* 여행 목록 헤드는 original.css와 같은 1024px에서 세로로 전환한다. 640px까지 미루면
     641~1024px 구간에서 flex-end만 남아 제목과 툴바가 오른쪽으로 쏠린다. */
  .trip-list-head {
    align-items: stretch;
    flex-direction: column;
  }

  .trip-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .trip-search {
    margin-left: 0;
    width: 100%;
  }

  .my-trips-timeline-wrapper {
    padding: 0;
  }
}

@media (max-width: 640px) {
  .my-trips-timeline { grid-template-columns: 1fr; }
  .timeline-card { min-height: 0; }
}

.my-trips-dashboard ::-webkit-scrollbar {
  display: none;
}
.my-trips-dashboard {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.travel-paper { --ink: #2f4437; --muted: #788372; --line: #e0e6d9; --surface-2: #edf2e7; background: #fafaf7; min-height: 100vh; }
.travel-paper .my-trips-dashboard { max-width: 1200px; margin: auto; padding: 48px 32px; background: transparent; }
.travel-paper .travel-page-head { background: transparent; border: 0; box-shadow: none; padding: 0; margin-bottom: 36px; min-height: 0; }
.travel-paper .page-hero__eyebrow { background: none; border: 0; padding: 0; color: #829078; font-size: 11px; letter-spacing: .13em; }
.travel-paper .page-hero__eyebrow .material-symbols-rounded { display: none; }
.travel-paper .page-hero__title { font-family: 'Noto Serif KR', Batang, serif; font-size: 40px; font-weight: 500; color: #2f4437; }
.travel-paper .page-hero__lead { color: #788372; font-size: 14px; }
.travel-paper .trip-list-section { padding: 0; border: 0; border-radius: 0; box-shadow: none; background: transparent; }
.travel-paper .trip-list-head > div:first-child { display: none; }
.travel-paper .trip-list-head { display: block; border-bottom: 1px solid #dfe5d8; padding-bottom: 16px; }
.travel-paper .trip-toolbar { width: 100%; flex-wrap: wrap; justify-content: space-between; }
.travel-paper .trip-tabs { background: none; border: 0; padding: 0; gap: 22px; }
.travel-paper .trip-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; border-radius: 0; color: #788372; padding: 12px 0; box-shadow: none; }
.travel-paper .trip-tabs button.active { color: #36563b; border-bottom-color: #36563b; }
.trip-search-actions { display: flex; align-items: center; gap: 12px; margin-left: auto; }
.travel-paper .trip-search { width: 260px; min-width: 0; background: white; border-color: #dbe3d4; box-shadow: none; }
.travel-paper .trip-create-button { white-space: nowrap; font-size: 13px; }
.travel-paper .my-trips-timeline { grid-template-columns: repeat(3,minmax(0,1fr)); gap: 30px; }
.travel-paper .timeline-card { padding: 0; background: transparent; border: 0; box-shadow: none; border-radius: 0; gap: 0; }
.travel-paper .timeline-card:hover { box-shadow: none; }
.travel-paper .timeline-card:focus-visible { outline: 2px solid #759367; outline-offset: 6px; }
.travel-paper .timeline-card-header { order: 2; margin: 14px 0 10px; }
.travel-paper .timeline-card-body { display: contents; }
.travel-paper .timeline-card-avatar-wrapper { order: 1; flex: auto; width: 100%; height: auto; aspect-ratio: 4/3; border-radius: 16px 16px 0 0;  }
.travel-paper .timeline-card-avatar-wrapper--placeholder { background: #e7edde; color: #7a906b; }
.travel-paper .timeline-card-info { order: 3; gap: 8px; }
.travel-paper .timeline-card-title { font-family: 'Noto Serif KR', Batang, serif; font-size: 23px; font-weight: 500; white-space: normal; overflow-wrap: anywhere; }
.travel-paper .timeline-card-status-badge.is-active { background: #eaf0e2; color: #526e45; }
.travel-paper .timeline-card-actions { order: 4; border-top: 1px solid #e0e6d8; padding-top: 14px; margin-top: 22px; gap: 8px; flex-wrap: wrap; }
.trip-members { display: flex; align-items: center; margin-right: auto; }
.trip-member-avatar, .trip-member-overflow { width: 32px; height: 32px; border-radius: 50%; border: 2px solid #fafaf7; background: #e3ebda; color: #597449; display: grid; place-items: center; overflow: hidden; font-size: 11px; margin-left: -7px; }
.trip-member-avatar:first-child { margin-left: 0; }
.trip-member-avatar img { width: 100%; height: 100%; object-fit: cover; }
.trip-options { width: 40px; height: 40px; display: grid; place-items: center; border: 1px solid #dce4d3; border-radius: 50%; background: transparent; color: #526848; cursor: pointer; }
.travel-paper .timeline-card-open, .travel-paper .timeline-card-vote { color: #526848; background: transparent; border-color: #d6e0cd; }
@media(max-width:1024px) { .travel-paper .my-trips-timeline { grid-template-columns: repeat(2,minmax(0,1fr)); } }
@media(max-width:600px) { .travel-paper .my-trips-dashboard { padding: 28px 20px; } .travel-paper .my-trips-timeline { grid-template-columns: 1fr; } .trip-search-actions { width: 100%; gap: 8px; } .travel-paper .trip-search { width: auto; flex: 1; } .travel-paper .trip-create-button { padding: 10px 12px; font-size: 12px; } .travel-paper .trip-create-button .material-symbols-rounded { display: none; } .travel-paper .page-hero__title { font-size: 32px; } }

.travel-paper .timeline-card { background: #fff; border: 1px solid #e0e6d9; border-radius: 16px; overflow: hidden; }
.travel-paper .timeline-card-header, .travel-paper .timeline-card-info { margin-left: 18px; margin-right: 18px; }
.travel-paper .timeline-card-actions { border-top: 1px solid #dce4d4; border-bottom: 0; margin: auto 18px 14px; padding: 14px 0 0; }
.travel-paper .timeline-card-info { padding-bottom: 8px; }
.trip-pagination { display: flex; justify-content: center; gap: 6px; margin-top: 24px; }
.trip-pagination button { min-width: 40px; height: 40px; border: 0; border-radius: 50%; background: transparent; color: #607353; cursor: pointer; }
.trip-pagination button[aria-current=page] { background: #e7eede; color: #38542c; font-weight: 700; }
.trip-pagination button:disabled { opacity: .35; cursor: default; }

:global(body:has(.travel-paper)) { background: #fafaf7; }
.travel-paper .trip-dashboard-layout { padding: 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; }
.travel-paper .timeline-card-open { flex: 0 0 auto; }
.travel-paper .timeline-card-actions { flex-wrap: nowrap; }
</style>
