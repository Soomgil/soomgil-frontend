<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { mediaApi } from '@/api/media.api'
import { tripApi } from '@/api/trip.api'
import { useRecordPhotoUrlRefresh } from '@/composables/useRecordPhotoUrlRefresh'
import type { PagedItems } from '@/types/api'
import type { TripRecordPhoto } from '@/types/media'
import type { TripSummary } from '@/types/trip'

const route = useRoute()
const PHOTO_PAGE_SIZE = 30
const PHOTO_SUMMARY_BATCH_SIZE = 100
const routeTripId = typeof route.query.tripId === 'string' ? route.query.tripId : null
const selectedTripId = ref<string | null>(routeTripId)
const isUploadModalOpen = ref(false)
const uploadTripId = ref('')
const uploadFiles = ref<File[]>([])
const uploadPreviews = ref<string[]>([])
const uploadError = ref('')
const uploadingPhoto = ref(false)
const trips = ref<TripSummary[]>([])
const photos = ref<TripRecordPhoto[]>([])
const globalPhotoCount = ref(0)
const photoCounts = ref<Record<string, number>>({})
interface TripCover { mediaFileId: string; url: string; expiresAt: string | null }
const tripCovers = ref<Record<string, TripCover>>({})
const loading = ref(false)
const loadingMore = ref(false)
const hasMore = ref(true)
const nextPhotoPage = ref(0)
const error = ref<string | null>(null)
const loadMoreError = ref<string | null>(null)
const loadMoreSentinel = ref<HTMLElement | null>(null)
let requestSequence = 0
let tripMetadataSequence = 0
let loadMoreObserver: IntersectionObserver | null = null
const tripPhotoStateVersions: Record<string, number> = {}
const viewerOpen = ref(false)
const viewerSrc = ref('')
const viewerAlt = ref('')
const viewerMediaId = ref<string | null>(null)
const { refreshPhotoUrl, refreshPhotoUrlById } = useRecordPhotoUrlRefresh(photos, (refreshed) => {
  tripCovers.value = Object.fromEntries(Object.entries(tripCovers.value).map(([tripId, cover]) => [
    tripId,
    cover.mediaFileId === refreshed.mediaFileId
      ? { mediaFileId: refreshed.mediaFileId, url: refreshed.url, expiresAt: refreshed.expiresAt }
      : cover,
  ]))
  if (viewerMediaId.value === refreshed.mediaFileId) viewerSrc.value = refreshed.url
})
const sliderRef = ref<HTMLElement | null>(null)

function openViewer(photo: TripRecordPhoto) {
  viewerSrc.value = photoSource(photo)
  viewerAlt.value = photoLabel(photo)
  viewerMediaId.value = photo.media.id
  viewerOpen.value = true
}

function closeViewer() {
  viewerOpen.value = false
  viewerMediaId.value = null
}

function heightForPhoto(photo: TripRecordPhoto): number {
  const width = photo.media.width
  const height = photo.media.height
  if (!width || !height) return 280
  const ratio = width / height
  if (ratio > 1.2) return 220
  if (ratio < 0.8) return 340
  return 280
}

const avatarColors = ['var(--rose)', 'var(--blue)', 'var(--cyan)', 'var(--violet)']
const newestFirst = ref(true)
const viewMode = ref<'masonry' | 'grid'>('masonry')
const visiblePhotos = computed(() => photos.value
  .filter((photo) => Boolean(photoSource(photo)))
  .slice()
  .sort((a, b) => {
    const left = new Date(a.takenAt ?? a.createdAt).getTime()
    const right = new Date(b.takenAt ?? b.createdAt).getTime()
    return newestFirst.value ? right - left : left - right
  }))

function photoSource(photo: TripRecordPhoto): string {
  return photo.media.servingUrl ?? photo.media.publicUrl ?? ''
}

function photoLabel(photo: TripRecordPhoto): string {
  return photo.tripTitle || '여행 기록'
}

function uploaderName(photo: TripRecordPhoto): string {
  return photo.uploadedBy?.displayName || '여행 멤버'
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value))
}

function photoCountForTrip(tripId: string): number | null {
  return photoCounts.value[tripId] ?? null
}

function coverForTrip(tripId: string): string | null {
  return tripCovers.value[tripId]?.url ?? null
}

function rememberPhotoCovers(items: TripRecordPhoto[]) {
  const nextCovers = { ...tripCovers.value }
  for (const photo of items) {
    const source = photoSource(photo)
    if (!nextCovers[photo.tripId] && source) {
      nextCovers[photo.tripId] = {
        mediaFileId: photo.media.id,
        url: source,
        expiresAt: photo.media.servingUrlExpiresAt,
      }
      tripPhotoStateVersions[photo.tripId] = (tripPhotoStateVersions[photo.tripId] ?? 0) + 1
    }
  }
  tripCovers.value = nextCovers
}

function photoErrorMessage(cause: unknown): string {
  const status = typeof cause === 'object' && cause !== null && 'response' in cause
    ? (cause as { response?: { status?: number } }).response?.status
    : undefined
  if (status === 403) return '이 여행 기록을 볼 권한이 없습니다.'
  if (status === 404) return '요청한 여행을 찾을 수 없습니다.'
  return '여행 기록을 불러오지 못했습니다.'
}

function resetPhotoFeed() {
  photos.value = []
  loadingMore.value = false
  nextPhotoPage.value = 0
  hasMore.value = true
  loadMoreError.value = null
}

function fetchPhotoPage(tripId: string | null, page: number): Promise<PagedItems<TripRecordPhoto>> {
  return tripId
    ? mediaApi.getRecordPhotos(tripId, page, PHOTO_PAGE_SIZE)
    : mediaApi.getAllRecordPhotos(page, PHOTO_PAGE_SIZE)
}

function applyPhotoPage(result: PagedItems<TripRecordPhoto>, tripId: string | null, reset: boolean) {
  const knownIds = new Set((reset ? [] : photos.value).map((photo) => `${photo.recordId}-${photo.media.id}`))
  const nextItems = result.items.filter((photo) => !knownIds.has(`${photo.recordId}-${photo.media.id}`))
  photos.value = reset ? nextItems : [...photos.value, ...nextItems]
  nextPhotoPage.value = result.page.page + 1
  hasMore.value = nextPhotoPage.value < result.page.totalPages
  if (tripId) {
    photoCounts.value = { ...photoCounts.value, [tripId]: result.page.totalElements }
    tripPhotoStateVersions[tripId] = (tripPhotoStateVersions[tripId] ?? 0) + 1
  } else {
    globalPhotoCount.value = result.page.totalElements
  }
  rememberPhotoCovers(result.items)
}

async function loadTripPhotoMetadata(items: TripSummary[], metadataRequestId: number) {
  for (let index = 0; index < items.length; index += PHOTO_SUMMARY_BATCH_SIZE) {
    const batch = items.slice(index, index + PHOTO_SUMMARY_BATCH_SIZE)
    const stateVersions = new Map(batch.map((trip) => [trip.id, tripPhotoStateVersions[trip.id] ?? 0]))
    try {
      const summaries = await mediaApi.getRecordPhotoSummaries(batch.map((trip) => trip.id))
      if (metadataRequestId !== tripMetadataSequence) return
      const batchCounts: Record<string, number> = {}
      const nextCovers = { ...tripCovers.value }
      summaries.items.forEach((summary) => {
        if ((tripPhotoStateVersions[summary.tripId] ?? 0) !== stateVersions.get(summary.tripId)) return
        batchCounts[summary.tripId] = summary.photoCount
        if (summary.coverUrl && summary.coverMediaFileId) {
          nextCovers[summary.tripId] = {
            mediaFileId: summary.coverMediaFileId,
            url: summary.coverUrl,
            expiresAt: summary.coverUrlExpiresAt,
          }
        } else if (!summary.coverUrl) {
          delete nextCovers[summary.tripId]
        }
      })
      photoCounts.value = { ...photoCounts.value, ...batchCounts }
      tripCovers.value = nextCovers
    } catch {
      continue
    }
  }
}

async function fetchAllTrips(): Promise<TripSummary[]> {
  const tripsById = new Map<string, TripSummary>()
  let page = 0
  let totalPages = 1
  do {
    const result = await tripApi.getTrips({ page, size: 100 })
    result.items.forEach((trip) => tripsById.set(trip.id, trip))
    totalPages = result.page.totalPages
    page += 1
  } while (page < totalPages)
  return [...tripsById.values()]
}

async function loadPage() {
  const requestId = ++requestSequence
  const metadataRequestId = ++tripMetadataSequence
  resetPhotoFeed()
  loading.value = true
  error.value = null
  try {
    const tripId = selectedTripId.value
    const [tripItems, photoResult, globalResult] = await Promise.all([
      fetchAllTrips(),
      fetchPhotoPage(tripId, 0),
      tripId ? mediaApi.getAllRecordPhotos(0, 1) : Promise.resolve(null),
    ])
    if (requestId !== requestSequence) return
    trips.value = tripItems
    applyPhotoPage(photoResult, tripId, true)
    if (globalResult) globalPhotoCount.value = globalResult.page.totalElements
    void loadTripPhotoMetadata(tripItems, metadataRequestId)
  } catch (cause) {
    if (requestId === requestSequence) error.value = photoErrorMessage(cause)
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

async function showTrip(nextTripId: string | null) {
  selectedTripId.value = nextTripId
  const requestId = ++requestSequence
  resetPhotoFeed()
  loading.value = true
  error.value = null
  try {
    const result = await fetchPhotoPage(nextTripId, 0)
    if (requestId !== requestSequence) return
    applyPhotoPage(result, nextTripId, true)
  } catch (cause) {
    if (requestId === requestSequence) error.value = photoErrorMessage(cause)
  } finally {
    if (requestId === requestSequence) loading.value = false
  }
}

async function selectTrip(tripId: string | null) {
  await showTrip(selectedTripId.value === tripId ? null : tripId)
}

async function loadNextPhotoPage() {
  if (loading.value || loadingMore.value || !hasMore.value) return
  const requestId = requestSequence
  const tripId = selectedTripId.value
  const page = nextPhotoPage.value
  loadingMore.value = true
  loadMoreError.value = null
  try {
    const result = await fetchPhotoPage(tripId, page)
    if (requestId !== requestSequence || tripId !== selectedTripId.value) return
    applyPhotoPage(result, tripId, false)
  } catch {
    if (requestId === requestSequence) loadMoreError.value = '사진을 더 불러오지 못했습니다.'
  } finally {
    if (requestId === requestSequence) loadingMore.value = false
  }
}

function scrollSlider(direction: 'prev' | 'next') {
  if (!sliderRef.value) return
  sliderRef.value.scrollBy({ left: direction === 'next' ? 200 : -200, behavior: 'smooth' })
}

function clearUploadSelection() {
  uploadPreviews.value.forEach((url) => URL.revokeObjectURL(url))
  uploadPreviews.value = []
  uploadFiles.value = []
}

function openUploadModal() {
  clearUploadSelection()
  uploadError.value = ''
  uploadTripId.value = ''
  isUploadModalOpen.value = true
}

function closeUploadModal() {
  if (uploadingPhoto.value) return
  isUploadModalOpen.value = false
  clearUploadSelection()
  uploadError.value = ''
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = [...(input.files ?? [])]
  if (selected.some((file) => !file.type.startsWith('image/'))) {
    uploadError.value = '이미지 파일만 업로드할 수 있습니다.'
    input.value = ''
    return
  }
  const remaining = Math.max(0, 10 - uploadFiles.value.length)
  const accepted = selected.slice(0, remaining)
  uploadFiles.value = [...uploadFiles.value, ...accepted]
  uploadPreviews.value = [...uploadPreviews.value, ...accepted.map((file) => URL.createObjectURL(file))]
  uploadError.value = selected.length > remaining ? '사진은 한 번에 최대 10장까지 추가할 수 있습니다.' : ''
  input.value = ''
}

function removePreview(index: number) {
  URL.revokeObjectURL(uploadPreviews.value[index])
  uploadPreviews.value = uploadPreviews.value.filter((_, itemIndex) => itemIndex !== index)
  uploadFiles.value = uploadFiles.value.filter((_, itemIndex) => itemIndex !== index)
}

async function submitPhoto() {
  if (!uploadTripId.value || uploadFiles.value.length === 0 || uploadingPhoto.value) {
    uploadError.value = '여행과 사진을 모두 선택해주세요.'
    return
  }
  uploadingPhoto.value = true
  uploadError.value = ''
  const uploadedMediaIds: string[] = []
  try {
    for (const file of uploadFiles.value) {
      const media = await mediaApi.uploadFile(file, 'TRIP_RECORD')
      uploadedMediaIds.push(media.id)
    }
    const idempotencyKey = crypto.randomUUID()
    try {
      await mediaApi.createRecord(uploadTripId.value, { mediaFileIds: uploadedMediaIds }, idempotencyKey)
    } catch (cause) {
      const status = typeof cause === 'object' && cause !== null && 'response' in cause
        ? (cause as { response?: { status?: number } }).response?.status
        : undefined
      if (status != null && status < 500) throw cause
      await mediaApi.createRecord(uploadTripId.value, { mediaFileIds: uploadedMediaIds }, idempotencyKey)
    }
    const tripId = uploadTripId.value
    uploadingPhoto.value = false
    closeUploadModal()
    selectedTripId.value = tripId
    await loadPage()
  } catch (cause) {
    const status = typeof cause === 'object' && cause !== null && 'response' in cause
      ? (cause as { response?: { status?: number } }).response?.status
      : undefined
    if (uploadedMediaIds.length && status != null && status < 500) {
      await Promise.all(uploadedMediaIds.map((mediaId) => mediaApi.delete(mediaId).catch(() => undefined)))
    }
    uploadError.value = '사진을 추가하지 못했습니다. 잠시 후 다시 시도해주세요.'
  } finally {
    uploadingPhoto.value = false
  }
}

watch(loadMoreSentinel, (current, previous) => {
  if (previous) loadMoreObserver?.unobserve(previous)
  if (current) loadMoreObserver?.observe(current)
})

watch(() => route.query.tripId, (value) => {
  const nextTripId = typeof value === 'string' ? value : null
  if (nextTripId === selectedTripId.value) return
  if (trips.value.length === 0) {
    selectedTripId.value = nextTripId
    void loadPage()
    return
  }
  void showTrip(nextTripId)
})

onMounted(() => {
  if (typeof IntersectionObserver !== 'undefined') {
    loadMoreObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) void loadNextPhotoPage()
    }, { rootMargin: '300px' })
    if (loadMoreSentinel.value) loadMoreObserver.observe(loadMoreSentinel.value)
  }
  void loadPage()
})

onBeforeUnmount(() => {
  requestSequence += 1
  tripMetadataSequence += 1
  loadMoreObserver?.disconnect()
  clearUploadSelection()
})
</script>

<template>
  <AppShell>
    <main>
      <section class="section record-page">

        <!-- 1. Page header -->
        <div class="record-page-head">
          <div class="record-page-title">
            <p class="eyebrow">
              <span class="material-symbols-rounded" style="font-size:16px; vertical-align:middle">photo_library</span>
              Travel Memories
            </p>
            <h1><span>여행의 기록</span>을 한눈에 모아보세요</h1>
          </div>
          <div class="record-page-toolbar">
            <p class="lead">함께 남긴 사진과 순간을 여행별로 정리하고, 다시 보고 싶은 추억을 빠르게 찾아보세요.</p>
            <div class="record-actions" aria-label="기록 보기 도구">
              <button class="btn primary" type="button" @click="openUploadModal">
                <span class="material-symbols-rounded">add_a_photo</span>사진 추가
              </button>
              <button class="btn ghost icon-btn record-action-icon" type="button" :aria-label="newestFirst ? '오래된 사진부터 보기' : '최신 사진부터 보기'" @click="newestFirst = !newestFirst">
                <span class="material-symbols-rounded">sort</span>
              </button>
              <button class="btn ghost icon-btn record-action-icon" type="button" :aria-label="viewMode === 'masonry' ? '격자 보기' : '자유 배치 보기'" :aria-pressed="viewMode === 'grid'" @click="viewMode = viewMode === 'masonry' ? 'grid' : 'masonry'">
                <span class="material-symbols-rounded">{{ viewMode === 'masonry' ? 'grid_view' : 'view_quilt' }}</span>
              </button>
            </div>
          </div>
        </div>

        <div class="content-container">
          <!-- 2. Trip slider -->
          <div class="record-trip-slider-container">
            <button class="record-trip-slider-btn prev" type="button" aria-label="이전 기록 카드" @click="scrollSlider('prev')">
              <span class="material-symbols-rounded">chevron_left</span>
            </button>
            <div class="record-trip-slider" ref="sliderRef" data-record-trip-slider>
              <!-- "전체 보기" card -->
              <button
                class="record-trip-card is-all"
                type="button"
                :class="{ 'is-selected': selectedTripId === null }"
                @click="selectTrip(null)"
              >
                <div class="record-trip-card-body">
                  <span class="material-symbols-rounded">photo_library</span>
                  <h3>전체 기록</h3>
                  <p>{{ globalPhotoCount }}장</p>
                </div>
              </button>
              <!-- Trip cards -->
              <button
                v-for="trip in trips"
                :key="trip.id"
                class="record-trip-card"
                type="button"
                :class="{ 'is-selected': selectedTripId === trip.id }"
                @click="selectTrip(trip.id)"
              >
                <img
                  v-if="coverForTrip(trip.id)"
                  class="record-trip-card-cover"
                  :src="coverForTrip(trip.id) || ''"
                  :alt="trip.title"
                  @error="tripCovers[trip.id] && refreshPhotoUrlById(tripCovers[trip.id].mediaFileId, tripCovers[trip.id].url)"
                />
                <div v-else class="record-trip-card-cover record-trip-card-cover-placeholder" aria-hidden="true">
                  <span class="material-symbols-rounded">landscape</span>
                </div>
                <div class="record-trip-card-body">
                  <h3>{{ trip.title }}</h3>
                  <p>{{ trip.displayDestination || formatDate(trip.createdAt) }}</p>
                  <div class="record-trip-card-meta">
                    <span class="material-symbols-rounded">photo_camera</span>
                    {{ photoCountForTrip(trip.id) == null ? '기록 보기' : `${photoCountForTrip(trip.id)}장` }}
                  </div>
                </div>
              </button>
            </div>
            <button class="record-trip-slider-btn next" type="button" aria-label="다음 기록 카드" @click="scrollSlider('next')">
              <span class="material-symbols-rounded">chevron_right</span>
            </button>
          </div>

          <!-- Divider -->
          <hr class="record-divider">

          <!-- 3. Masonry photo feed -->
          <LoadingState v-if="loading" />
          <ErrorState v-else-if="error" :message="error" @retry="loadPage" />
          <EmptyState
            v-else-if="visiblePhotos.length === 0"
            icon="photo_library"
            message="아직 등록된 여행 기록 사진이 없습니다."
          />
          <div v-else class="record-masonry" :class="{ 'is-uniform': viewMode === 'grid' }" data-record-masonry>
            <button
              v-for="(photo, i) in visiblePhotos"
              :key="`${photo.recordId}-${photo.media.id}`"
              class="record-masonry-item"
              type="button"
              :aria-label="photoLabel(photo) + ' 사진 확대 보기'"
              @click="openViewer(photo)"
            >
              <img
                :src="photoSource(photo)"
                :alt="photoLabel(photo)"
                loading="lazy"
                :style="{ height: (viewMode === 'grid' ? 260 : heightForPhoto(photo)) + 'px' }"
                @error="refreshPhotoUrl(photo)"
              />
              <div class="record-masonry-overlay">
                <p class="overlay-schedule">{{ photoLabel(photo) }}</p>
                <p class="overlay-uploader">
                  <span class="avatar" :style="{ width: '20px', height: '20px', fontSize: '9px', background: avatarColors[i % avatarColors.length] }">{{ uploaderName(photo).charAt(0) }}</span>
                  {{ uploaderName(photo) }}
                </p>
              </div>
            </button>
            <button
              class="record-masonry-item record-masonry-add"
              type="button"
              aria-label="사진 추가"
              @click="openUploadModal"
            >
              <span class="material-symbols-rounded record-masonry-add-icon">add_a_photo</span>
              <span class="record-masonry-add-text">사진 추가</span>
            </button>
          </div>
          <div
            v-if="!loading && !error && hasMore"
            ref="loadMoreSentinel"
            class="record-load-more-sentinel"
            aria-hidden="true"
          />
          <p v-if="loadingMore" class="record-load-more-status" role="status">사진을 더 불러오는 중입니다.</p>
          <div v-if="loadMoreError" class="record-load-more-error" role="alert">
            <span>{{ loadMoreError }}</span>
            <button class="btn ghost" type="button" @click="loadNextPhotoPage">다시 불러오기</button>
          </div>
        </div>

      </section>
    </main>

    <!-- Upload Modal -->
    <div
      class="modal-overlay record-photo-modal"
      :class="{ show: isUploadModalOpen }"
      :aria-hidden="!isUploadModalOpen"
      @click.self="closeUploadModal"
    >
      <div class="modal-card record-photo-card" role="dialog" aria-modal="true" aria-labelledby="record-photo-title">
        <div class="modal-header">
          <div>
            <p class="eyebrow">New Moment</p>
            <h3 id="record-photo-title">사진 추가</h3>
          </div>
          <button class="icon-btn" type="button" :disabled="uploadingPhoto" @click="closeUploadModal" aria-label="닫기">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <form class="record-photo-form" @submit.prevent="submitPhoto">
          <label class="form-label">
            <span class="form-label-text">여행 선택</span>
            <select class="field" v-model="uploadTripId" required>
              <option value="" disabled>여행을 선택하세요</option>
              <option v-for="trip in trips" :key="trip.id" :value="trip.id">{{ trip.title }}</option>
            </select>
          </label>

          <label class="record-upload-zone" role="button" tabindex="0" aria-label="사진 파일 선택">
            <input class="sr-only" type="file" accept="image/*" multiple @change="handleFileSelect" />
            <span class="material-symbols-rounded record-upload-icon">add_photo_alternate</span>
            <span class="record-upload-title">사진을 여러 장 선택하세요</span>
            <span class="record-upload-helper">JPG, PNG, WebP · 최대 10장 · 선택 후에도 사진을 더 추가할 수 있어요.</span>
          </label>

          <div v-if="uploadPreviews.length" class="record-photo-preview-grid" aria-label="선택한 사진">
            <div v-for="(preview, index) in uploadPreviews" :key="preview" class="record-photo-preview">
              <img :src="preview" :alt="`선택한 사진 ${index + 1}`" />
              <span class="record-photo-number">{{ index + 1 }}</span>
              <button class="preview-remove-btn" type="button" @click="removePreview(index)" :aria-label="`${index + 1}번째 사진 삭제`">
                <span class="material-symbols-rounded">close</span>
              </button>
            </div>
          </div>

          <p class="trip-create-error" aria-live="polite">{{ uploadError }}</p>

          <div class="trip-create-actions">
            <button class="btn ghost" type="button" :disabled="uploadingPhoto" @click="closeUploadModal">취소</button>
            <button class="btn primary" type="submit" :disabled="uploadingPhoto">
              <span class="material-symbols-rounded">check</span>{{ uploadingPhoto ? '사진 업로드 중...' : uploadFiles.length ? `${uploadFiles.length}장 추가` : '사진 추가' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </AppShell>

  <!-- Photo Viewer Modal -->
  <div v-if="viewerOpen" class="record-viewer-overlay" role="dialog" aria-modal="true" @click.self="closeViewer">
    <button class="record-viewer-close" type="button" aria-label="닫기" @click="closeViewer">
      <span class="material-symbols-rounded">close</span>
    </button>
    <img
      class="record-viewer-img"
      :src="viewerSrc"
      :alt="viewerAlt"
      @error="viewerMediaId && refreshPhotoUrlById(viewerMediaId, viewerSrc)"
      @click.stop
    />
  </div>
</template>

<style scoped>
.record-page-head {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 40px;
}
.record-page-title {
  width: 100%;
}
.record-page-head h1 {
  max-width: 820px;
  margin: 0;
  font-size: clamp(36px, 4vw, 56px);
  color: var(--ink);
  line-height: 1.18;
  word-break: keep-all;
}
.record-page-head h1 span {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}
.record-page-head .eyebrow {
  color: var(--violet);
}
.record-page-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
  min-width: 0;
}
.record-page-toolbar .lead {
  margin: 0;
  max-width: 760px;
  min-width: 0;
  color: var(--muted);
  word-break: keep-all;
}
.record-actions {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}
.record-action-icon {
  width: 40px;
  height: 40px;
  padding: 0;
  border-radius: 12px;
}
.record-page .content-container {
  width: 100%;
  margin: 0;
}

/* Trip slider container */
.record-trip-slider-container {
  position: relative;
  margin-bottom: 8px;
}
.record-trip-slider-btn {
  position: absolute;
  top: calc(50% - 10px);
  transform: translateY(-50%);
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  box-shadow: var(--soft-shadow);
  transition: transform 0.2s ease, opacity 0.2s ease, background-color 0.2s ease;
}
.record-trip-slider-btn:hover {
  transform: translateY(-50%) scale(1.05);
  background: #fff;
  box-shadow: var(--shadow);
}
.record-trip-slider-btn.prev {
  left: -20px;
}
.record-trip-slider-btn.next {
  right: -20px;
}

/* Trip slider */
.record-trip-slider {
  display: flex;
  gap: 16px;
  overflow-x: auto;
  padding: 10px 4px 20px 4px;
  scroll-behavior: smooth;
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.record-trip-slider::-webkit-scrollbar {
  display: none;
}

/* Trip cards */
.record-trip-card {
  position: relative;
  flex: 0 0 180px;
  width: 180px;
  height: 210px;
  background: #ffffff;
  border-radius: 18px;
  border: 1px solid var(--line);
  box-shadow: var(--soft-shadow);
  overflow: hidden;
  cursor: pointer;
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  user-select: none;
  padding: 0;
  color: inherit;
  font: inherit;
  text-align: left;
}
.record-trip-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
}
.record-trip-card:focus-visible {
  outline: 3px solid rgba(124, 58, 237, 0.38);
  outline-offset: 3px;
}
.record-trip-card-cover {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 108px;
  object-fit: cover;
  border-radius: 18px 18px 0 0;
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 1;
}
.record-trip-card-cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(124, 58, 237, 0.18), rgba(37, 99, 235, 0.24));
  color: var(--violet);
}
.record-trip-card-cover-placeholder .material-symbols-rounded {
  font-size: 34px;
}
.record-trip-card-body {
  position: absolute;
  top: 108px;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  transition: all 0.6s cubic-bezier(0.16, 1, 0.3, 1);
  z-index: 2;
}
.record-trip-card-body h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.4s ease;
}
.record-trip-card-body p {
  margin: 2px 0 0 0;
  font-size: 10px;
  color: var(--muted);
  transition: color 0.4s ease;
}
.record-trip-card-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  font-weight: 700;
  color: var(--violet);
  margin-top: auto;
  transition: color 0.4s ease;
}
.record-trip-card-meta .material-symbols-rounded {
  font-size: 14px;
}
.record-trip-card-avatars {
  display: flex;
  align-items: center;
  margin-top: 4px;
}
.record-trip-card-avatars .avatar {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9px;
  font-weight: 800;
  color: #fff;
  margin-left: -5px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.record-trip-card-avatars .avatar:first-child {
  margin-left: 0;
}

/* "전체 보기" card special style */
.record-trip-card.is-all {
  background: rgba(15, 23, 42, 0.9) !important;
  backdrop-filter: blur(12px) !important;
  -webkit-backdrop-filter: blur(12px) !important;
  border: none !important;
  color: rgba(255, 255, 255, 0.9) !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  width: 180px !important;
  flex: 0 0 180px !important;
  height: 210px !important;
  text-align: center !important;
}
.record-trip-card.is-all:hover {
  background: rgba(15, 23, 42, 0.95) !important;
  transform: translateY(-4px);
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
}
.record-trip-card.is-all .record-trip-card-body {
  position: relative !important;
  top: 0 !important;
  left: 0 !important;
  width: 100% !important;
  padding: 0 !important;
  display: flex !important;
  flex-direction: column !important;
  align-items: center !important;
  justify-content: center !important;
  height: auto !important;
}
.record-trip-card.is-all .material-symbols-rounded {
  font-size: 36px !important;
  color: #ffffff !important;
  margin-bottom: 8px !important;
  transition: transform 0.3s ease;
}
.record-trip-card.is-all:hover .material-symbols-rounded {
  transform: scale(1.15) rotate(5deg);
}
.record-trip-card.is-all h3 {
  text-align: center !important;
  color: #ffffff !important;
  margin: 0 0 4px !important;
  font-size: 14px !important;
  font-weight: 800 !important;
}
.record-trip-card.is-all p {
  color: rgba(255, 255, 255, 0.55) !important;
  margin: 0 !important;
  font-size: 11px !important;
  text-align: center !important;
}

/* Selected state (not is-all) */
.record-trip-card.is-selected:not(.is-all) {
  flex: 0 0 180px;
  width: 180px;
  border-color: var(--violet);
  border-width: 2px;
  box-shadow: var(--shadow);
}
.record-trip-card.is-selected:not(.is-all) .record-trip-card-cover {
  width: 100%;
  height: 100%;
  border-radius: 16px;
}
.record-trip-card.is-selected:not(.is-all) .record-trip-card-body {
  top: 0;
  left: 0;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 16px 12px;
  text-align: center;
  background: linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.8) 50%, rgba(0,0,0,0.65) 100%);
  color: #ffffff;
}
.record-trip-card.is-selected:not(.is-all) .record-trip-card-body h3 {
  max-width: 100%;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.3;
  color: #ffffff;
  white-space: normal;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
  text-align: center;
}
.record-trip-card.is-selected:not(.is-all) .record-trip-card-body p {
  margin: 0;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  font-size: 12px;
}
.record-trip-card.is-selected:not(.is-all) .record-trip-card-meta {
  justify-content: center;
  margin-top: 4px;
  color: #d1bfff;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
  font-size: 13px;
}
.record-trip-card.is-selected:not(.is-all) .record-trip-card-meta .material-symbols-rounded {
  font-size: 16px;
}
.record-trip-card.is-selected:not(.is-all) .record-trip-card-avatars {
  justify-content: center;
  margin-top: 6px;
}
.record-trip-card.is-selected:not(.is-all) .record-trip-card-avatars .avatar {
  width: 26px;
  height: 26px;
  font-size: 11px;
  border-color: rgba(255,255,255,0.35);
}

/* Selected state for is-all */
.record-trip-card.is-all.is-selected {
  background: rgba(15, 23, 42, 0.95) !important;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25) !important;
  width: 180px !important;
  flex: 0 0 180px !important;
  height: 210px !important;
  border: 2px solid var(--violet) !important;
}

/* Divider */
.record-divider {
  border: 0;
  height: 1px;
  background-color: var(--line);
  margin: clamp(24px, 4vw, 40px) 0;
}

/* Masonry feed */
.record-masonry {
  column-count: 4;
  column-gap: 16px;
}
.record-masonry.is-uniform {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  column-count: unset;
}
.record-masonry.is-uniform .record-masonry-item { margin-bottom: 0; }
.record-load-more-sentinel {
  width: 100%;
  height: 1px;
}
.record-load-more-status {
  margin: 20px 0 0;
  color: var(--muted);
  text-align: center;
}
.record-load-more-error {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-top: 20px;
  color: var(--muted);
}
.record-masonry-item {
  break-inside: avoid;
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  margin-bottom: 16px;
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
  color: inherit;
  text-align: left;
  box-shadow: var(--soft-shadow);
  position: relative;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
  backface-visibility: hidden;
  transform: translate3d(0, 0, 0);
  animation: masonryFadeIn 0.4s ease both;
  text-decoration: none;
}
.record-masonry-item:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
}
.record-masonry-item:focus-visible {
  outline: 3px solid rgba(0, 102, 255, 0.45);
  outline-offset: 4px;
}
.record-masonry-item img {
  width: 100%;
  object-fit: cover;
  display: block;
}
.record-masonry-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  padding: 32px 16px;
  background: rgba(0, 0, 0, 0.03);
  border: 2px dashed rgba(0, 0, 0, 0.15);
  box-shadow: none;
  color: var(--muted);
  gap: 8px;
}
.record-masonry-add:hover {
  background: rgba(123, 104, 238, 0.08);
  border-color: var(--violet);
  color: var(--violet);
  transform: translateY(-2px);
}
.record-masonry-add-icon {
  font-size: 44px;
  color: var(--violet);
}
.record-masonry-add-text {
  font-size: 14px;
  font-weight: 800;
}
.record-masonry-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 40px 16px 16px;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.5));
  color: #fff;
  opacity: 0;
  transition: opacity 0.3s ease;
  pointer-events: none;
}
.record-masonry-item:hover .record-masonry-overlay {
  opacity: 1;
}
.record-masonry-overlay p {
  margin: 0;
}
.record-masonry-overlay .overlay-schedule {
  font-size: 13px;
  font-weight: 700;
}
.record-masonry-overlay .overlay-uploader {
  font-size: 12px;
  opacity: 0.85;
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 6px;
}

@keyframes masonryFadeIn {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 1024px) { .record-masonry { column-count: 3; } .record-masonry.is-uniform { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
@media (max-width: 768px) {
  .record-masonry { column-count: 2; }
  .record-masonry.is-uniform { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .record-page-toolbar { gap: 10px; }
  .record-actions { gap: 6px; }
  .record-actions .btn.primary { padding-inline: 12px; }
  .record-trip-slider-btn.prev { left: 4px; }
  .record-trip-slider-btn.next { right: 4px; }
}
@media (max-width: 480px) { .record-masonry { column-count: 1; } .record-masonry.is-uniform { grid-template-columns: 1fr; } }

/* Upload modal */
.record-photo-card {
  max-width: 480px !important;
  background: rgba(255, 255, 255, 0.96) !important;
  border: 1px solid rgba(255, 255, 255, 0.8) !important;
  backdrop-filter: blur(24px) !important;
  -webkit-backdrop-filter: blur(24px) !important;
  box-shadow: 0 32px 80px rgba(15, 23, 42, 0.18), 0 8px 24px rgba(0, 102, 255, 0.04), inset 0 1px 1px #fff !important;
  border-radius: 32px !important;
  padding: 36px 32px 32px !important;
  transform: translateY(24px) scale(0.96);
  transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.4s ease;
}
.modal-overlay.show .record-photo-card {
  transform: translateY(0) scale(1);
}
.record-photo-card .modal-header {
  margin-bottom: 28px;
}
.record-photo-card .modal-header h3 {
  font-size: 24px;
  font-weight: 850;
  color: var(--ink);
  margin-top: 4px;
}
.record-photo-card .form-label {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 18px;
}
.record-photo-card .form-label-text {
  font-size: 13px;
  font-weight: 800;
  color: var(--ink);
  letter-spacing: -0.01em;
}
.record-photo-card .field {
  width: 100%;
  min-height: 48px;
  padding: 10px 16px;
  border-radius: 14px;
  border: 1px solid rgba(227, 234, 244, 0.95);
  background: #ffffff;
  font-size: 14px;
  color: var(--ink);
  outline: none;
  transition: all 0.25s ease;
  box-shadow: inset 0 1px 2px rgba(0,0,0,0.01);
}
.record-photo-card select.field {
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='%23596379' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 14px center;
  background-size: 16px;
  padding-right: 40px;
}
.record-photo-card .field:focus {
  border-color: var(--violet);
  box-shadow: 0 0 0 4px rgba(139, 92, 246, 0.12), inset 0 1px 1px rgba(0,0,0,0.02);
  background: #ffffff;
}
.record-upload-zone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 180px;
  border: 2px dashed rgba(139, 92, 246, 0.24);
  border-radius: 20px;
  background: rgba(139, 92, 246, 0.02);
  cursor: pointer;
  padding: 24px;
  text-align: center;
  margin-bottom: 20px;
  transition: all 0.3s ease;
  outline: none;
}
.record-upload-zone:hover, .record-upload-zone:focus-visible {
  border-color: var(--violet);
  background: rgba(139, 92, 246, 0.05);
  transform: scale(0.99);
}
.record-upload-icon {
  font-size: 38px !important;
  color: var(--violet);
  background: rgba(139, 92, 246, 0.08);
  width: 64px;
  height: 64px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  margin-bottom: 4px;
  transition: transform 0.3s ease;
}
.record-upload-zone:hover .record-upload-icon {
  transform: translateY(-4px) scale(1.04);
}
.record-upload-title {
  font-size: 14px;
  font-weight: 800;
  color: var(--ink);
}
.record-upload-helper {
  font-size: 11px;
  color: var(--muted);
}
.record-photo-preview-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  max-height: 330px;
  overflow-y: auto;
}
.record-photo-preview {
  position: relative;
  width: 100%;
  max-height: 240px;
  border-radius: 20px;
  overflow: hidden;
  margin-bottom: 20px;
  box-shadow: 0 12px 28px rgba(0,0,0,0.1);
}
.record-photo-number { position: absolute; left: 9px; bottom: 9px; display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; background: rgba(15, 23, 42, .72); color: #fff; font-size: 11px; font-weight: 850; }
.record-photo-preview img {
  width: 100%;
  height: 240px;
  object-fit: cover;
  display: block;
}
.preview-remove-btn {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  color: #ffffff;
  display: grid;
  place-items: center;
  cursor: pointer;
  transition: all 0.2s ease;
  box-shadow: 0 4px 10px rgba(0,0,0,0.15);
}
.preview-remove-btn:hover {
  background: rgba(239, 68, 68, 0.9);
  transform: scale(1.08);
}
.preview-remove-btn .material-symbols-rounded {
  font-size: 18px;
}
.trip-create-error {
  font-size: 12px;
  color: var(--rose);
  font-weight: 700;
  margin: -6px 0 14px;
  min-height: 18px;
}
.trip-create-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 10px;
}
.trip-create-actions .btn {
  min-height: 48px;
  border-radius: 14px;
  padding: 0 20px;
  font-size: 14px;
  font-weight: 800;
}

/* Photo viewer overlay */
.record-viewer-overlay {
  position: fixed;
  inset: 0;
  z-index: 2000;
  background: rgba(0, 0, 0, 0.88);
  backdrop-filter: blur(12px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 32px;
  animation: viewerFadeIn 0.25s ease;
}
@keyframes viewerFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}
.record-viewer-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  transition: background 0.2s;
}
.record-viewer-close:hover {
  background: rgba(255, 255, 255, 0.25);
}
.record-viewer-close .material-symbols-rounded {
  font-size: 24px;
}
.record-viewer-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 16px;
  box-shadow: 0 32px 64px rgba(0, 0, 0, 0.5);
  user-select: none;
}
</style>
