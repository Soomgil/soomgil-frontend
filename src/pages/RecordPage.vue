<script setup lang="ts">
import { ref, computed } from 'vue'
import { mockRecords } from '@/mocks/mockRecords'
import { mockTrips } from '@/mocks/mockTrips'
import AppShell from '@/components/layout/AppShell.vue'

const selectedTripId = ref<string | null>(null)
const isUploadModalOpen = ref(false)
const uploadTripId = ref('')
const uploadPreview = ref<string | null>(null)
const uploadError = ref('')

const trips = mockTrips
const sliderRef = ref<HTMLElement | null>(null)

// Photo viewer modal
const viewerOpen = ref(false)
const viewerSrc = ref('')
const viewerAlt = ref('')

function openViewer(src: string, alt: string) {
  viewerSrc.value = src
  viewerAlt.value = alt
  viewerOpen.value = true
}
function closeViewer() {
  viewerOpen.value = false
}

function heightForAspect(ratio: string): number {
  switch (ratio) {
    case 'portrait': return 340
    case 'landscape': return 220
    case 'square': return 280
    default: return 280
  }
}

const avatarColors = ['var(--rose)', 'var(--blue)', 'var(--cyan)', 'var(--violet)']

const filteredRecords = computed(() => {
  if (!selectedTripId.value) return mockRecords
  return mockRecords.filter((r) => r.tripId === selectedTripId.value)
})

function selectTrip(tripId: string | null) {
  selectedTripId.value = selectedTripId.value === tripId ? null : tripId
}

function scrollSlider(direction: 'prev' | 'next') {
  if (!sliderRef.value) return
  const scrollAmount = 200
  sliderRef.value.scrollBy({
    left: direction === 'next' ? scrollAmount : -scrollAmount,
    behavior: 'smooth',
  })
}

function openUploadModal() {
  uploadPreview.value = null
  uploadError.value = ''
  uploadTripId.value = ''
  isUploadModalOpen.value = true
}

function closeUploadModal() {
  isUploadModalOpen.value = false
  uploadPreview.value = null
  uploadError.value = ''
}

function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files && input.files[0]) {
    const file = input.files[0]
    if (!file.type.startsWith('image/')) {
      uploadError.value = '이미지 파일만 업로드할 수 있습니다.'
      return
    }
    uploadPreview.value = URL.createObjectURL(file)
    uploadError.value = ''
  }
}

function removePreview() {
  uploadPreview.value = null
}
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
              <button class="btn ghost icon-btn record-action-icon" type="button" aria-label="정렬">
                <span class="material-symbols-rounded">sort</span>
              </button>
              <button class="btn ghost icon-btn record-action-icon" type="button" aria-label="보기 전환">
                <span class="material-symbols-rounded">grid_view</span>
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
              <div
                class="record-trip-card is-all"
                :class="{ 'is-selected': selectedTripId === null }"
                @click="selectTrip(null)"
              >
                <div class="record-trip-card-body">
                  <span class="material-symbols-rounded">photo_library</span>
                  <h3>전체 기록</h3>
                  <p>{{ mockRecords.length }}장</p>
                </div>
              </div>
              <!-- Trip cards -->
              <div
                v-for="trip in trips"
                :key="trip.id"
                class="record-trip-card"
                :class="{ 'is-selected': selectedTripId === trip.id }"
                @click="selectTrip(trip.id)"
              >
                <img class="record-trip-card-cover" :src="trip.coverImageUrl" :alt="trip.title" />
                <div class="record-trip-card-body">
                  <h3>{{ trip.title }}</h3>
                  <p>{{ trip.startDate }}</p>
                  <div class="record-trip-card-meta">
                    <span class="material-symbols-rounded">photo_camera</span>
                    {{ mockRecords.filter(r => r.tripId === trip.id).length }}장
                  </div>
                  <div class="record-trip-card-avatars">
                    <div
                      v-for="(member, idx) in (trip.members ?? [])"
                      :key="member.id"
                      class="avatar"
                      :style="{ background: 'var(--violet)', zIndex: (trip.members ?? []).length - idx }"
                    >
                      {{ member.displayName?.charAt(0) ?? '?' }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button class="record-trip-slider-btn next" type="button" aria-label="다음 기록 카드" @click="scrollSlider('next')">
              <span class="material-symbols-rounded">chevron_right</span>
            </button>
          </div>

          <!-- Divider -->
          <hr class="record-divider">

          <!-- 3. Masonry photo feed -->
          <div class="record-masonry" data-record-masonry>
            <button
              v-for="(record, i) in filteredRecords"
              :key="record.id"
              class="record-masonry-item"
              type="button"
              :aria-label="record.location + ' 사진 확대 보기'"
              @click="openViewer(record.src, record.location)"
            >
              <img :src="record.src" :alt="record.location" loading="lazy" :style="{ height: heightForAspect(record.aspectRatio) + 'px' }" />
              <div class="record-masonry-overlay">
                <p class="overlay-schedule">{{ record.scheduleName }}</p>
                <p class="overlay-uploader">
                  <span class="avatar" :style="{ width: '20px', height: '20px', fontSize: '9px', background: avatarColors[i % avatarColors.length] }">{{ record.uploader.avatar }}</span>
                  {{ record.uploader.name }}
                </p>
              </div>
            </button>
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
          <button class="icon-btn" type="button" @click="closeUploadModal" aria-label="닫기">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>

        <form class="record-photo-form" @submit.prevent>
          <label class="form-label">
            <span class="form-label-text">여행 선택</span>
            <select class="field" v-model="uploadTripId" required>
              <option value="" disabled>여행을 선택하세요</option>
              <option v-for="trip in trips" :key="trip.id" :value="trip.id">{{ trip.title }}</option>
            </select>
          </label>

          <label class="record-upload-zone" role="button" tabindex="0" aria-label="사진 파일 선택">
            <input class="sr-only" type="file" accept="image/*" @change="handleFileSelect" />
            <span class="material-symbols-rounded record-upload-icon">add_photo_alternate</span>
            <span class="record-upload-title">사진을 선택하거나 여기에 끌어오세요</span>
            <span class="record-upload-helper">JPG, PNG, WebP 이미지를 사용할 수 있습니다.</span>
          </label>

          <div v-if="uploadPreview" class="record-photo-preview">
            <img :src="uploadPreview" alt="선택한 사진 미리보기" />
            <button class="preview-remove-btn" type="button" @click="removePreview" aria-label="사진 삭제">
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>

          <p class="trip-create-error" aria-live="polite">{{ uploadError }}</p>

          <div class="trip-create-actions">
            <button class="btn ghost" type="button" @click="closeUploadModal">취소</button>
            <button class="btn primary" type="submit">
              <span class="material-symbols-rounded">check</span>사진 추가
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
    <img class="record-viewer-img" :src="viewerSrc" :alt="viewerAlt" @click.stop />
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
}
.record-trip-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
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

@media (max-width: 1024px) { .record-masonry { column-count: 3; } }
@media (max-width: 768px) {
  .record-masonry { column-count: 2; }
  .record-page-toolbar { gap: 10px; }
  .record-actions { gap: 6px; }
  .record-actions .btn.primary { padding-inline: 12px; }
  .record-trip-slider-btn.prev { left: 4px; }
  .record-trip-slider-btn.next { right: 4px; }
}
@media (max-width: 480px) { .record-masonry { column-count: 1; } }

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
.record-photo-preview {
  position: relative;
  width: 100%;
  max-height: 240px;
  border-radius: 20px;
  overflow: hidden;
  margin-bottom: 20px;
  box-shadow: 0 12px 28px rgba(0,0,0,0.1);
}
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
