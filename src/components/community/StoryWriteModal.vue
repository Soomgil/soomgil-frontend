<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import http from '@/api/http'
import { communityApi } from '@/api/community.api'
import { mediaApi } from '@/api/media.api'
import StoryPostPreview from '@/components/community/StoryPostPreview.vue'
import type { CommunityPostDetail, PageMeta } from '@/types/community'
import type { TripRecordPhoto } from '@/types/media'
import { useToast } from '@/composables/useToast'

const emit = defineEmits<{ close: []; published: [post: CommunityPostDetail] }>()
const toast = useToast()

// Form state
const title = ref('')
const selectedTripId = ref('')
const tags = ref<string[]>([])
const tagDraft = ref('')
const tagInputRef = ref<HTMLInputElement | null>(null)

interface PublishableTrip {
  id: string
  title: string
  displayDestination: string | null
  itineraryVersion: number
}
const myTrips = ref<PublishableTrip[]>([])
const loadingTrips = ref(true)
const publishing = ref(false)
const content = ref('')
const recordPhotos = ref<TripRecordPhoto[]>([])
const customPhotos = ref<TripRecordPhoto[]>([])
const selectedMediaIds = ref<Set<string>>(new Set())
const loadingRecordPhotos = ref(false)
const previewImageIndex = ref(0)

interface SelectablePhoto {
  media: TripRecordPhoto['media']
  isCustom: boolean
}
const allPhotos = computed<SelectablePhoto[]>(() => [
  ...customPhotos.value.map((photo) => ({ media: photo.media, isCustom: true })),
  ...recordPhotos.value.map((photo) => ({ media: photo.media, isCustom: false })),
])
const selectedPhotos = computed(() => allPhotos.value.filter((photo) => selectedMediaIds.value.has(photo.media.id)))
const addedPhotos = computed(() => selectedPhotos.value.flatMap((photo) => photo.media.servingUrl ?? photo.media.publicUrl ? [photo.media.servingUrl ?? photo.media.publicUrl ?? ''] : []))

// Photo strip pagination (upload button occupies first slot → 3 photos per page)
const PHOTOS_PER_PAGE = 3
const photoPage = ref(0)
const totalPhotoPages = computed(() => Math.max(1, Math.ceil(allPhotos.value.length / PHOTOS_PER_PAGE)))
const pagePhotos = computed(() => {
  const start = photoPage.value * PHOTOS_PER_PAGE
  return allPhotos.value.slice(start, start + PHOTOS_PER_PAGE)
})
watch(totalPhotoPages, (total) => {
  if (photoPage.value > total - 1) photoPage.value = Math.max(0, total - 1)
})

// Char counter
const charCount = computed(() => content.value.length)

const previewTitle = computed(() => title.value.trim() || '여행의 제목을 입력하세요')
const previewSummary = computed(() => content.value.trim() || '본문 내용을 입력하세요.')
const previewRegion = computed(() => {
  const trip = myTrips.value.find(t => t.id === selectedTripId.value)
  return trip ? trip.title : '여행계획을 선택하세요'
})

const previewTags = computed(() => tags.value.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)))

// Tag chip handling
function commitTag() {
  const raw = tagDraft.value.trim()
  if (!raw) return
  const parts = raw.split(/[\s,]+/).map((p) => p.replace(/^#/, '').trim()).filter(Boolean)
  parts.forEach((part) => {
    if (!tags.value.some((t) => t.toLowerCase() === part.toLowerCase())) tags.value.push(part)
  })
  tagDraft.value = ''
}

function removeTag(index: number) {
  tags.value.splice(index, 1)
}

function onTagKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' || e.key === ',') {
    e.preventDefault()
    commitTag()
  } else if (e.key === 'Backspace' && tagDraft.value === '' && tags.value.length > 0) {
    tags.value.pop()
  }
}

// Custom photo upload
const uploadingPhoto = ref(false)
async function onCustomPhotosSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files ? Array.from(input.files) : []
  input.value = ''
  if (files.length === 0) return
  uploadingPhoto.value = true
  try {
    for (const file of files) {
      const mediaFile = await mediaApi.uploadFile(file, 'COMMUNITY_POST')
      customPhotos.value.push({
        tripId: '',
        tripTitle: null,
        recordId: '',
        itineraryDayId: null,
        dayNumber: null,
        itineraryItemId: null,
        media: mediaFile,
        uploadedBy: null,
        takenAt: null,
        createdAt: new Date().toISOString(),
      })
    }
    photoPage.value = 0
    toast.success(`${files.length}장의 사진을 추가했습니다.`)
  } catch {
    toast.error('사진 업로드에 실패했습니다.')
  } finally {
    uploadingPhoto.value = false
  }
}

// Markdown toolbar actions
function insertMarkdown(prefix: string, suffix: string, placeholder: string) {
  const textarea = document.querySelector('[data-content-editor]') as HTMLTextAreaElement
  if (!textarea) return
  const start = textarea.selectionStart
  const end = textarea.selectionEnd
  const selected = content.value.substring(start, end) || placeholder
  const before = content.value.substring(0, start)
  const after = content.value.substring(end)
  content.value = before + prefix + selected + suffix + after
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
  }, 0)
}

function handleSave() {
  toast.info('임시저장은 아직 백엔드 API에서 지원하지 않습니다.')
}

async function loadTrips() {
  try {
    const response = await http.get<{ items: PublishableTrip[]; page: PageMeta }>('/trips', {
      params: { page: 0, size: 100, status: 'ACTIVE' },
    })
    myTrips.value = response.data.items
  } catch {
    toast.error('내 여행계획을 불러오지 못했습니다.')
  } finally {
    loadingTrips.value = false
  }
}

async function loadRecordPhotos(tripId: string) {
  loadingRecordPhotos.value = true
  recordPhotos.value = []
  selectedMediaIds.value = new Set()
  previewImageIndex.value = 0
  photoPage.value = 0
  try {
    const response = await mediaApi.getRecordPhotos(tripId)
    recordPhotos.value = response.items.filter((photo) => Boolean(photo.media.servingUrl ?? photo.media.publicUrl))
  } catch {
    toast.error('선택한 여행의 기록 사진을 불러오지 못했습니다.')
  } finally {
    loadingRecordPhotos.value = false
  }
}

async function handlePublish() {
  const trip = myTrips.value.find((item) => item.id === selectedTripId.value)
  if (!trip || !title.value.trim() || selectedPhotos.value.length === 0) {
    toast.info('여행계획, 제목, 기록 사진을 한 장 이상 선택해주세요.')
    return
  }
  publishing.value = true
  try {
    const post = await communityApi.createPost({
      sourceTripId: trip.id,
      baseVersion: trip.itineraryVersion,
      visibility: 'PUBLIC',
      title: title.value.trim(),
      summary: content.value.trim() || null,
      hashtags: tags.value,
      mediaFileIds: selectedPhotos.value.map((photo) => photo.media.id),
      coverMediaFileId: selectedPhotos.value[0]?.media.id ?? null,
    })
    toast.success('여행기가 등록되었습니다.')
    emit('published', post)
    emit('close')
  } catch {
    toast.error('여행기를 등록하지 못했습니다. 여행계획 버전을 확인해주세요.')
  } finally {
    publishing.value = false
  }
}

function toggleRecordPhoto(photo: SelectablePhoto) {
  const next = new Set(selectedMediaIds.value)
  if (next.has(photo.media.id)) next.delete(photo.media.id)
  else next.add(photo.media.id)
  selectedMediaIds.value = next
  if (previewImageIndex.value >= addedPhotos.value.length) previewImageIndex.value = 0
}

function photoPagePrev() {
  if (totalPhotoPages.value <= 1) return
  photoPage.value = (photoPage.value - 1 + totalPhotoPages.value) % totalPhotoPages.value
}

function photoPageNext() {
  if (totalPhotoPages.value <= 1) return
  photoPage.value = (photoPage.value + 1) % totalPhotoPages.value
}

function carouselPrev() {
  if (addedPhotos.value.length < 2) return
  previewImageIndex.value = (previewImageIndex.value - 1 + addedPhotos.value.length) % addedPhotos.value.length
}

function carouselNext() {
  if (addedPhotos.value.length < 2) return
  previewImageIndex.value = (previewImageIndex.value + 1) % addedPhotos.value.length
}

onMounted(loadTrips)
watch(selectedTripId, (tripId) => {
  if (tripId) void loadRecordPhotos(tripId)
})
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" aria-label="여행기 작성">
    <div class="story-overlay-backdrop" @click="$emit('close')"></div>
    <div class="story-overlay-panel" style="width: min(98vw, 1400px); max-height: 96vh; overflow-y: auto;">
      <button class="story-overlay-close" type="button" aria-label="닫기" @click="$emit('close')">
        <span class="material-symbols-rounded">close</span>
      </button>

      <div style="padding: 32px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
          <div>
            <p style="color: var(--violet); font-size: 13px; font-weight: 800; margin: 0 0 4px;">Create Story</p>
            <h1 style="font-size: 32px; margin: 0 0 8px; font-weight: 850;">당신의 여행을 들려주세요</h1>
            <p style="font-size: 15px; color: var(--muted); margin: 0;">사진과 글, 그리고 당신만의 감성을 자유롭게 담아보세요.</p>
          </div>
          <div style="display: flex; gap: 10px;">
            <button class="btn ghost" type="button" style="border-radius: 999px;" @click="handleSave">임시저장</button>
            <button class="btn primary" type="button" :disabled="publishing" style="border-radius: 999px; padding: 0 24px;" @click="handlePublish">{{ publishing ? '게시 중...' : '게시하기' }}</button>
          </div>
        </div>

        <div style="display: grid; grid-template-columns: minmax(0, 1fr) 500px; gap: 48px;">
          <div>
            <form aria-label="여행기 작성 폼" style="display: grid; gap: 28px;">
              <div style="display: grid; gap: 10px;">
                <label for="modal-story-title" style="font-weight: 800; font-size: 15px; color: var(--ink);">제목</label>
                <input id="modal-story-title" class="field" placeholder="여행의 제목을 입력하세요" v-model="title" style="border: 1.5px solid rgba(227, 234, 244, 0.9); border-radius: 16px; background: #fff; font-size: 22px; font-weight: 800; min-height: 60px; border-radius: 18px; padding: 0 24px; outline: none;">
              </div>

              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div style="display: grid; gap: 10px;">
                  <label for="modal-story-trip-select" style="font-weight: 800; font-size: 15px; color: var(--ink);">내가 간 여행계획 선택하기</label>
                  <div style="position: relative;">
                    <span class="material-symbols-rounded" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 20px;">flight</span>
                    <select id="modal-story-trip-select" class="field" v-model="selectedTripId" style="padding-left: 48px; appearance: auto; border: 1.5px solid rgba(227, 234, 244, 0.9); border-radius: 16px; background: #fff; font-size: 15px; font-weight: 600; outline: none; width: 100%;">
                      <option value="" disabled>{{ loadingTrips ? '여행계획을 불러오는 중...' : '여행계획을 선택하세요' }}</option>
                      <option v-for="trip in myTrips" :key="trip.id" :value="trip.id">{{ trip.title }}{{ trip.displayDestination ? ` (${trip.displayDestination})` : '' }}</option>
                    </select>
                  </div>
                </div>
                <div style="display: grid; gap: 10px;">
                  <label for="modal-story-tags" style="font-weight: 800; font-size: 15px; color: var(--ink);">태그</label>
                  <div class="tag-chip-input" @click="tagInputRef?.focus()">
                    <span class="material-symbols-rounded tag-chip-input__icon">tag</span>
                    <span v-for="(tag, idx) in tags" :key="`${tag}-${idx}`" class="tag-chip">
                      {{ tag.startsWith('#') ? tag : `#${tag}` }}
                      <button type="button" class="tag-chip__remove" :aria-label="`태그 ${tag} 삭제`" @click.stop="removeTag(idx)"><span class="material-symbols-rounded">close</span></button>
                    </span>
                    <input
                      ref="tagInputRef"
                      id="modal-story-tags"
                      v-model="tagDraft"
                      class="tag-chip-input__field"
                      :placeholder="tags.length === 0 ? '태그를 입력하고 Enter 또는 쉼표' : ''"
                      @keydown="onTagKeydown"
                      @blur="commitTag"
                    />
                  </div>
                </div>
              </div>

              <div style="display: grid; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <label for="modal-story-content" style="font-weight: 800; font-size: 15px; color: var(--ink);">본문</label>
                  <span style="font-weight: 750; font-size: 12px; color: var(--muted);">글자 수: {{ charCount }}자</span>
                </div>
                <div style="position: relative; border: 1.5px solid rgba(227, 234, 244, 0.9); border-radius: 20px; background: #fff; overflow: hidden; box-shadow: var(--soft-shadow);">
                  <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1.5px solid rgba(227, 234, 244, 0.9); background: #fbfcfe;">
                    <div style="display: flex; gap: 8px;">
                      <button type="button" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;" title="굵게" @click="insertMarkdown('**', '**', 'bold')"><span class="material-symbols-rounded" style="font-size: 20px;">format_bold</span></button>
                      <button type="button" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;" title="기울임" @click="insertMarkdown('*', '*', 'italic')"><span class="material-symbols-rounded" style="font-size: 20px;">format_italic</span></button>
                      <button type="button" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;" title="리스트" @click="insertMarkdown('- ', '', '항목')"><span class="material-symbols-rounded" style="font-size: 20px;">format_list_bulleted</span></button>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 800;">
                      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style="vertical-align: middle;"><path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.7c0 .63.52 1.15 1.15 1.15h13.7c.63 0 1.15-.52 1.15-1.15v-7.7C16 3.52 15.48 3 14.85 3zM9 11H7V5L4.5 7.5 2 5v6H0V4h2l2.5 2.5L7 4h2v7zm7 0h-2V7h-2l3-3 3 3h-2v4z"/></svg>
                      Markdown 지원
                    </div>
                  </div>
                  <textarea id="modal-story-content" data-content-editor class="field" style="border: 0; border-radius: 0; box-shadow: none; min-height: 300px; padding: 20px; font-size: 15px; line-height: 1.8; outline: none; resize: vertical; width: 100%;" v-model="content"></textarea>
                </div>
              </div>

              <div style="display: grid; gap: 10px;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                  <label style="font-weight: 800; font-size: 15px; color: var(--ink);">사진 선택</label>
                  <span style="font-size:12px; color:var(--muted);">{{ selectedPhotos.length }}장 선택 · 첫 사진이 커버</span>
                </div>
                <div class="photo-strip">
                  <button
                    type="button"
                    class="photo-strip__nav photo-strip__nav--prev"
                    :disabled="totalPhotoPages <= 1"
                    aria-label="이전 사진"
                    @click="photoPagePrev"
                  ><span class="material-symbols-rounded">chevron_left</span></button>
                  <div class="photo-strip__viewport">
                    <div class="photo-strip__row">
                      <label class="photo-strip__upload" :class="{ 'is-busy': uploadingPhoto }">
                        <input type="file" accept="image/*" multiple hidden @change="onCustomPhotosSelected" />
                        <span class="material-symbols-rounded" style="font-size: 28px;">add_photo_alternate</span>
                        <span style="font-size: 12px; font-weight: 800;">직접 추가</span>
                      </label>
                      <template v-if="!selectedTripId && customPhotos.length === 0">
                        <div class="photo-strip__empty">여행계획을 선택하거나 직접 사진을 추가하세요.</div>
                      </template>
                      <template v-else-if="loadingRecordPhotos">
                        <div class="photo-strip__empty">기록 사진을 불러오는 중...</div>
                      </template>
                      <template v-else-if="allPhotos.length === 0">
                        <div class="photo-strip__empty">선택할 수 있는 사진이 없습니다. 직접 추가해보세요.</div>
                      </template>
                      <template v-else>
                        <button
                          v-for="(photo, idx) in pagePhotos"
                          :key="photo.media.id"
                          type="button"
                          :aria-pressed="selectedMediaIds.has(photo.media.id)"
                          class="photo-strip__item"
                          :class="{ 'is-selected': selectedMediaIds.has(photo.media.id) }"
                          @click="toggleRecordPhoto(photo)"
                        >
                          <img :src="photo.media.servingUrl ?? photo.media.publicUrl ?? ''" :alt="`여행 사진 ${photoPage * PHOTOS_PER_PAGE + idx + 1}`" />
                          <span v-if="selectedMediaIds.has(photo.media.id)" class="photo-strip__check"><span class="material-symbols-rounded" style="font-size:18px;">check</span></span>
                          <span v-if="selectedPhotos[0]?.media.id === photo.media.id" class="photo-strip__cover">커버</span>
                        </button>
                      </template>
                    </div>
                  </div>
                  <button
                    type="button"
                    class="photo-strip__nav photo-strip__nav--next"
                    :disabled="totalPhotoPages <= 1"
                    aria-label="다음 사진"
                    @click="photoPageNext"
                  ><span class="material-symbols-rounded">chevron_right</span></button>
                </div>
                <p v-if="totalPhotoPages > 1" style="margin:0; font-size:12px; color:var(--muted); text-align:right;">{{ photoPage + 1 }} / {{ totalPhotoPages }} 페이지</p>
              </div>
            </form>
          </div>

          <!-- Preview panel -->
          <aside style="height: 100%; display: flex; flex-direction: column;">
            <div style="display: flex; flex-direction: column; gap: 20px; height: 100%; min-height: 720px; justify-content: center; align-items: center;">
              <h3 style="font-size: 16px; color: var(--muted); margin: 0; font-weight: 800; align-self: flex-start; flex-shrink: 0;">작성 미리보기</h3>

              <div class="write-preview-feed-frame">
                <StoryPostPreview
                  :title="previewTitle"
                  :location="previewRegion"
                  :summary="previewSummary"
                  :tags="previewTags"
                  :photos="addedPhotos"
                  :photo-index="previewImageIndex"
                  @prev="carouselPrev"
                  @next="carouselNext"
                />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.write-preview-feed-frame {
  aspect-ratio: 10 / 16;
  width: min(100%, 456px);
  height: auto;
  max-height: 730px;
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  align-items: center;
}

/* Tag chip input */
.tag-chip-input {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 48px;
  padding: 8px 14px;
  border: 1.5px solid rgba(227, 234, 244, 0.9);
  border-radius: 16px;
  background: #fff;
  cursor: text;
}
.tag-chip-input__icon {
  color: var(--muted);
  font-size: 20px;
  margin-right: 2px;
  flex-shrink: 0;
}
.tag-chip-input__field {
  flex: 1 1 80px;
  min-width: 80px;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 15px;
  font-weight: 600;
  padding: 4px 0;
}
.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 6px 4px 10px;
  border-radius: 999px;
  background: rgba(109, 74, 255, 0.12);
  color: var(--violet);
  font-size: 13px;
  font-weight: 800;
}
.tag-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border: 0;
  border-radius: 50%;
  background: rgba(109, 74, 255, 0.2);
  color: var(--violet);
  cursor: pointer;
  padding: 0;
}
.tag-chip__remove .material-symbols-rounded {
  font-size: 14px;
}

/* Photo strip carousel */
.photo-strip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
}
.photo-strip__viewport {
  flex: 1 1 auto;
  overflow: hidden;
}
.photo-strip__row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.photo-strip__upload {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 120px;
  border: 2px dashed var(--line);
  border-radius: 16px;
  background: #fbfcfe;
  color: var(--violet);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}
.photo-strip__upload:hover {
  border-color: var(--violet);
  background: rgba(109, 74, 255, 0.06);
}
.photo-strip__upload.is-busy {
  opacity: 0.6;
  pointer-events: none;
}
.photo-strip__item {
  position: relative;
  height: 120px;
  padding: 0;
  border-radius: 16px;
  border: 3px solid transparent;
  overflow: hidden;
  box-shadow: var(--soft-shadow);
  cursor: pointer;
  background: #fff;
}
.photo-strip__item.is-selected {
  border-color: var(--violet);
}
.photo-strip__item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}
.photo-strip__check {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--violet);
  color: #fff;
  display: grid;
  place-items: center;
}
.photo-strip__cover {
  position: absolute;
  left: 8px;
  bottom: 8px;
  padding: 4px 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 10px;
  font-weight: 900;
}
.photo-strip__empty {
  grid-column: 2 / -1;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 120px;
  border: 2px dashed var(--line);
  border-radius: 16px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  padding: 0 16px;
}
.photo-strip__nav {
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  border: 1px solid var(--line);
  border-radius: 50%;
  background: #fff;
  color: var(--ink);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: var(--soft-shadow);
  transition: background 0.2s, opacity 0.2s;
}
.photo-strip__nav:hover:not(:disabled) {
  background: rgba(109, 74, 255, 0.08);
}
.photo-strip__nav:disabled {
  opacity: 0.35;
  cursor: default;
}
.photo-strip__nav .material-symbols-rounded {
  font-size: 22px;
}
</style>
