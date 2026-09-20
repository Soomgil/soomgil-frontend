<script setup lang="ts">
import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import http from '@/api/http'
import { communityApi } from '@/api/community.api'
import { mediaApi } from '@/api/media.api'
import StoryPostPreview from '@/components/community/StoryPostPreview.vue'
import ConfirmDialog from '@/components/common/ConfirmDialog.vue'
import type { CommunityMediaFile, CommunityPostDetail, PageMeta } from '@/types/community'
import type { MediaFile } from '@/types/media'
import { useToast } from '@/composables/useToast'
import {
  COMMUNITY_POST_HASHTAG_MAX_COUNT,
  COMMUNITY_POST_HASHTAG_NAME_MAX,
  COMMUNITY_POST_SUMMARY_MAX,
} from '@/constants/community'

const props = defineProps<{ post?: CommunityPostDetail | null }>()
const emit = defineEmits<{
  close: []
  published: [post: CommunityPostDetail]
  updated: [post: CommunityPostDetail]
}>()
const toast = useToast()
const isEditMode = computed(() => Boolean(props.post))

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
type StoryMedia = MediaFile | CommunityMediaFile
const customPhotos = ref<StoryMedia[]>([])
const selectedMediaIds = ref<Set<string>>(new Set())
const previewImageIndex = ref(0)

interface SelectablePhoto {
  media: StoryMedia
  isCustom: boolean
}
const allPhotos = computed<SelectablePhoto[]>(() => [
  ...customPhotos.value.map((photo) => ({ media: photo, isCustom: true })),
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
const isContentNearLimit = computed(() => charCount.value >= COMMUNITY_POST_SUMMARY_MAX * 0.9)

const previewTitle = computed(() => title.value.trim() || '여행의 제목을 입력하세요')
const previewSummary = computed(() => content.value.trim() || '본문 내용을 입력하세요.')
const previewRegion = computed(() => {
  const trip = myTrips.value.find(t => t.id === selectedTripId.value)
  return trip ? trip.title : '여행계획을 선택하세요'
})

const previewTags = computed(() => tags.value.map((tag) => (tag.startsWith('#') ? tag : `#${tag}`)))
const selectedTrip = computed(() => myTrips.value.find((trip) => trip.id === selectedTripId.value) ?? null)
const isPublishReady = computed(() => Boolean(
  (isEditMode.value || selectedTrip.value) && title.value.trim() && selectedPhotos.value.length,
))
const completionCount = computed(() => [selectedTrip.value, selectedPhotos.value.length > 0, title.value.trim()].filter(Boolean).length)
const draftStatus = ref<'idle' | 'saving' | 'saved'>('idle')
const closeConfirmOpen = ref(false)
const resetConfirmOpen = ref(false)
const draftKey = computed(() => props.post
  ? `soomgil:community-story-edit-draft:${props.post.id}`
  : 'soomgil:community-story-draft')
let draftTimer: ReturnType<typeof setTimeout> | undefined
let draftReady = false
let initialFormSignature = ''
const hasFormContent = computed(() => Boolean(
  title.value.trim()
  || selectedTripId.value
  || content.value.trim()
  || tags.value.length
  || selectedPhotos.value.length,
))

function getFormSignature() {
  return JSON.stringify({
    title: title.value,
    selectedTripId: selectedTripId.value,
    tags: tags.value,
    content: content.value,
    selectedMediaIds: [...selectedMediaIds.value],
  })
}

// Tag chip handling
function commitTag() {
  const raw = tagDraft.value.trim()
  if (!raw) return
  const parts = raw.split(/[\s,]+/).map((p) => p.replace(/^#/, '').trim()).filter(Boolean)
  let hasLongTag = false
  let reachedCountLimit = false
  parts.forEach((part) => {
    if (part.length > COMMUNITY_POST_HASHTAG_NAME_MAX) {
      hasLongTag = true
      return
    }
    if (tags.value.some((t) => t.toLowerCase() === part.toLowerCase())) return
    if (tags.value.length >= COMMUNITY_POST_HASHTAG_MAX_COUNT) {
      reachedCountLimit = true
      return
    }
    tags.value.push(part)
  })
  if (hasLongTag) toast.info(`태그 하나는 최대 ${COMMUNITY_POST_HASHTAG_NAME_MAX}자까지 입력할 수 있습니다.`)
  else if (reachedCountLimit) toast.info(`태그는 최대 ${COMMUNITY_POST_HASHTAG_MAX_COUNT}개까지 추가할 수 있습니다.`)
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
      customPhotos.value.push(mediaFile)
      selectedMediaIds.value = new Set([...selectedMediaIds.value, mediaFile.id])
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
  const nextContent = before + prefix + selected + suffix + after
  if (nextContent.length > COMMUNITY_POST_SUMMARY_MAX) {
    toast.info(`본문은 최대 ${COMMUNITY_POST_SUMMARY_MAX.toLocaleString()}자까지 작성할 수 있습니다.`)
    return
  }
  content.value = nextContent
  setTimeout(() => {
    textarea.focus()
    textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length)
  }, 0)
}

function persistDraft() {
  try {
    localStorage.setItem(draftKey.value, JSON.stringify({
      title: title.value,
      selectedTripId: selectedTripId.value,
      tags: tags.value,
      content: content.value,
      customPhotos: customPhotos.value,
      selectedMediaIds: [...selectedMediaIds.value],
    }))
    draftStatus.value = 'saved'
  } catch {
    draftStatus.value = 'idle'
  }
}

function restoreDraft() {
  try {
    const raw = localStorage.getItem(draftKey.value)
    if (!raw) return
    const draft = JSON.parse(raw) as {
      title?: string
      selectedTripId?: string
      tags?: string[]
      content?: string
      customPhotos?: StoryMedia[]
      selectedMediaIds?: string[]
    }
    title.value = draft.title ?? ''
    selectedTripId.value = draft.selectedTripId ?? ''
    tags.value = Array.isArray(draft.tags) ? draft.tags : []
    content.value = (draft.content ?? '').slice(0, COMMUNITY_POST_SUMMARY_MAX)
    customPhotos.value = Array.isArray(draft.customPhotos) ? draft.customPhotos : []
    selectedMediaIds.value = new Set(draft.selectedMediaIds ?? [])
    draftStatus.value = 'saved'
  } catch {
    localStorage.removeItem(draftKey.value)
  }
}

function initializeFromPost() {
  const post = props.post
  if (!post) return
  title.value = post.title
  selectedTripId.value = post.sourceTripId ?? ''
  tags.value = [...(post.hashtags ?? [])]
  content.value = post.summary ?? ''

  const coverId = post.coverMedia?.id
  const postMedia = [...post.media]
  if (post.coverMedia && !postMedia.some((media) => media.id === post.coverMedia?.id)) {
    postMedia.unshift(post.coverMedia)
  }
  customPhotos.value = postMedia.sort((left, right) => {
    if (left.id === coverId) return -1
    if (right.id === coverId) return 1
    return 0
  })
  selectedMediaIds.value = new Set(customPhotos.value.map((media) => media.id))
}

function requestClose() {
  const shouldConfirm = isEditMode.value ? getFormSignature() !== initialFormSignature : hasFormContent.value
  if (shouldConfirm) {
    closeConfirmOpen.value = true
    return
  }
  emit('close')
}

function requestReset() {
  if (!hasFormContent.value) return
  resetConfirmOpen.value = true
}

function resetForm() {
  if (draftTimer) clearTimeout(draftTimer)
  draftReady = false
  title.value = ''
  selectedTripId.value = ''
  tags.value = []
  tagDraft.value = ''
  content.value = ''
  customPhotos.value = []
  selectedMediaIds.value = new Set()
  previewImageIndex.value = 0
  photoPage.value = 0
  localStorage.removeItem(draftKey.value)
  draftStatus.value = 'idle'
  resetConfirmOpen.value = false
  initialFormSignature = getFormSignature()
  draftReady = true
  toast.success('작성 내용을 초기화했습니다.')
}

function keepWriting() {
  closeConfirmOpen.value = false
}

function saveDraftAndClose() {
  if (draftTimer) clearTimeout(draftTimer)
  persistDraft()
  draftReady = false
  closeConfirmOpen.value = false
  emit('close')
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

async function handlePublish() {
  const trip = myTrips.value.find((item) => item.id === selectedTripId.value)
  if ((!isEditMode.value && !trip) || !title.value.trim() || selectedPhotos.value.length === 0) {
    toast.info('여행계획, 제목, 사진을 한 장 이상 선택해주세요.')
    return
  }
  if (content.value.length > COMMUNITY_POST_SUMMARY_MAX || tags.value.length > COMMUNITY_POST_HASHTAG_MAX_COUNT) {
    toast.info('본문 또는 태그 입력 제한을 확인해주세요.')
    return
  }
  publishing.value = true
  try {
    const commonFields = {
      title: title.value.trim(),
      summary: content.value.trim() || null,
      hashtags: tags.value,
      mediaFileIds: selectedPhotos.value.map((photo) => photo.media.id),
      coverMediaFileId: selectedPhotos.value[0]?.media.id ?? null,
    }
    const post = props.post
      ? await communityApi.updatePost(props.post.id, commonFields)
      : await communityApi.createPost({
          ...commonFields,
          sourceTripId: trip!.id,
          baseVersion: trip!.itineraryVersion,
          visibility: 'PUBLIC',
        })
    toast.success(isEditMode.value ? '여행기를 수정했습니다.' : '여행기가 등록되었습니다.')
    draftReady = false
    if (draftTimer) clearTimeout(draftTimer)
    localStorage.removeItem(draftKey.value)
    if (isEditMode.value) emit('updated', post)
    else emit('published', post)
    emit('close')
  } catch {
    toast.error(isEditMode.value
      ? '여행기를 수정하지 못했습니다.'
      : '여행기를 등록하지 못했습니다. 여행계획 버전을 확인해주세요.')
  } finally {
    publishing.value = false
  }
}

function togglePhoto(photo: SelectablePhoto) {
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

watch(
  () => ({
    title: title.value,
    selectedTripId: selectedTripId.value,
    tags: [...tags.value],
    content: content.value,
    customPhotos: customPhotos.value,
    selectedMediaIds: [...selectedMediaIds.value],
  }),
  () => {
    if (!draftReady) return
    draftStatus.value = 'saving'
    if (draftTimer) clearTimeout(draftTimer)
    draftTimer = setTimeout(persistDraft, 450)
  },
  { deep: true },
)

onMounted(() => {
  initializeFromPost()
  restoreDraft()
  initialFormSignature = getFormSignature()
  draftReady = true
  void loadTrips()
})
onBeforeUnmount(() => {
  if (draftTimer) clearTimeout(draftTimer)
  if (draftReady && draftStatus.value === 'saving') persistDraft()
})
</script>

<template>
  <div class="story-overlay" role="dialog" aria-modal="true" :aria-label="isEditMode ? '여행기 수정' : '여행기 작성'">
    <div class="story-overlay-backdrop" @click="requestClose"></div>
    <section class="story-overlay-panel story-write-panel">
      <header class="story-write-header">
        <div>
          <p class="story-write-eyebrow">TRAVEL JOURNAL</p>
          <h1>{{ isEditMode ? '여행기 수정' : '여행기 작성' }}</h1>
          <p>{{ isEditMode ? '기존 여행의 장면과 이야기를 다듬어보세요.' : '여행의 장면과 이야기를 하나의 기록으로 남겨보세요.' }}</p>
        </div>
        <div class="story-write-header__meta">
          <span class="story-write-progress"><strong>{{ completionCount }}</strong>/3 준비됨</span>
          <button class="story-write-close" type="button" :aria-label="isEditMode ? '여행기 수정 닫기' : '여행기 작성 닫기'" @click="requestClose">
            <span class="material-symbols-rounded">close</span>
          </button>
        </div>
      </header>

      <div class="story-write-workspace">
        <div class="story-write-editor">
          <form id="story-write-form" class="story-write-form" aria-label="여행기 작성 폼" @submit.prevent="handlePublish">
            <section class="write-section">
              <div class="write-section__heading">
                <span class="write-section__number">1</span>
                <div><h2>기록할 여행 <span class="required-mark" aria-label="필수">*</span></h2><p>여행계획을 연결하면 장소와 일정이 함께 공유돼요.</p></div>
              </div>
              <label class="sr-only" for="modal-story-trip-select">여행계획 선택</label>
              <div class="trip-select-wrap">
                <span class="material-symbols-rounded" aria-hidden="true">luggage</span>
                <select id="modal-story-trip-select" v-model="selectedTripId" :disabled="isEditMode">
                  <option value="" disabled>{{ loadingTrips ? '여행계획을 불러오는 중...' : '여행계획을 선택하세요' }}</option>
                  <option v-if="isEditMode && selectedTripId && !selectedTrip" :value="selectedTripId">기존에 연결된 여행</option>
                  <option v-for="trip in myTrips" :key="trip.id" :value="trip.id">{{ trip.title }}{{ trip.displayDestination ? ` · ${trip.displayDestination}` : '' }}</option>
                </select>
                <span class="material-symbols-rounded trip-select-wrap__arrow" aria-hidden="true">expand_more</span>
              </div>
              <p v-if="selectedTrip || (isEditMode && selectedTripId)" class="selection-note"><span class="material-symbols-rounded">check_circle</span>{{ selectedTrip?.title ?? '기존에 연결된 여행' }}{{ isEditMode ? '의 일정 정보는 그대로 유지돼요.' : ' 여행을 기록하고 있어요.' }}</p>
            </section>

            <section class="write-section">
              <div class="write-section__heading">
                <span class="write-section__number">2</span>
                <div><h2>사진 구성 <span class="required-mark" aria-label="필수">*</span></h2><p>첫 사진이 커버가 돼요 · {{ selectedPhotos.length }}장 선택</p></div>
              </div>
              <div class="photo-strip">
                <button type="button" class="photo-strip__nav" :disabled="totalPhotoPages <= 1" aria-label="이전 사진" @click="photoPagePrev"><span class="material-symbols-rounded">chevron_left</span></button>
                <div class="photo-strip__viewport">
                  <div class="photo-strip__row">
                    <label class="photo-strip__upload" :class="{ 'is-busy': uploadingPhoto }">
                      <input type="file" accept="image/*" multiple hidden @change="onCustomPhotosSelected" />
                      <span class="material-symbols-rounded">add_photo_alternate</span>
                      <strong>{{ uploadingPhoto ? '업로드 중' : '사진 추가' }}</strong>
                      <small>여러 장 선택 가능</small>
                    </label>
                    <div v-if="allPhotos.length === 0" class="photo-strip__empty">여행을 보여줄 사진을 추가해주세요.</div>
                    <template v-else>
                      <button
                        v-for="(photo, idx) in pagePhotos"
                        :key="photo.media.id"
                        type="button"
                        :aria-pressed="selectedMediaIds.has(photo.media.id)"
                        class="photo-strip__item"
                        :class="{ 'is-selected': selectedMediaIds.has(photo.media.id) }"
                        @click="togglePhoto(photo)"
                      >
                        <img :src="photo.media.servingUrl ?? photo.media.publicUrl ?? ''" :alt="`여행 사진 ${photoPage * PHOTOS_PER_PAGE + idx + 1}`" />
                        <span v-if="selectedMediaIds.has(photo.media.id)" class="photo-strip__check"><span class="material-symbols-rounded">check</span></span>
                        <span v-if="selectedPhotos[0]?.media.id === photo.media.id" class="photo-strip__cover">커버</span>
                      </button>
                    </template>
                  </div>
                </div>
                <button type="button" class="photo-strip__nav" :disabled="totalPhotoPages <= 1" aria-label="다음 사진" @click="photoPageNext"><span class="material-symbols-rounded">chevron_right</span></button>
              </div>
              <p v-if="totalPhotoPages > 1" class="photo-page-count">{{ photoPage + 1 }} / {{ totalPhotoPages }}</p>
            </section>

            <section class="write-section">
              <div class="write-section__heading">
                <span class="write-section__number">3</span>
                <div><h2>이야기 작성</h2><p>기억하고 싶은 순간을 나만의 문장으로 들려주세요.</p></div>
              </div>

              <div class="write-field">
                <label for="modal-story-title">제목 <span class="required-mark" aria-label="필수">*</span></label>
                <input id="modal-story-title" v-model="title" maxlength="80" placeholder="여행을 한 문장으로 표현해보세요" />
                <span class="field-count">{{ title.length }}/80</span>
              </div>

              <div class="write-field">
                <div class="write-field__label"><label for="modal-story-content">본문</label><span :class="{ 'is-near-limit': isContentNearLimit }">{{ charCount.toLocaleString() }}/{{ COMMUNITY_POST_SUMMARY_MAX.toLocaleString() }}자</span></div>
                <div class="story-editor">
                  <div class="story-editor__toolbar">
                    <div>
                      <button type="button" title="굵게" aria-label="굵게" @click="insertMarkdown('**', '**', '강조할 문장')"><span class="material-symbols-rounded">format_bold</span></button>
                      <button type="button" title="기울임" aria-label="기울임" @click="insertMarkdown('*', '*', '강조할 문장')"><span class="material-symbols-rounded">format_italic</span></button>
                      <button type="button" title="목록" aria-label="목록" @click="insertMarkdown('- ', '', '여행의 순간')"><span class="material-symbols-rounded">format_list_bulleted</span></button>
                    </div>
                    <span>Markdown</span>
                  </div>
                  <textarea id="modal-story-content" v-model="content" data-content-editor :maxlength="COMMUNITY_POST_SUMMARY_MAX" placeholder="어디에서 무엇을 보고 느꼈는지 자유롭게 적어보세요."></textarea>
                </div>
              </div>

              <div class="write-field">
                <div class="write-field__label"><label for="modal-story-tags">태그</label><span :class="{ 'is-near-limit': tags.length >= COMMUNITY_POST_HASHTAG_MAX_COUNT }">{{ tags.length }}/{{ COMMUNITY_POST_HASHTAG_MAX_COUNT }}개 · Enter 또는 쉼표로 추가</span></div>
                <div class="tag-chip-input" @click="tagInputRef?.focus()">
                  <span class="material-symbols-rounded tag-chip-input__icon">tag</span>
                  <span v-for="(tag, idx) in tags" :key="`${tag}-${idx}`" class="tag-chip">
                    {{ tag.startsWith('#') ? tag : `#${tag}` }}
                    <button type="button" class="tag-chip__remove" :aria-label="`태그 ${tag} 삭제`" @click.stop="removeTag(idx)"><span class="material-symbols-rounded">close</span></button>
                  </span>
                  <input ref="tagInputRef" id="modal-story-tags" v-model="tagDraft" class="tag-chip-input__field" :disabled="tags.length >= COMMUNITY_POST_HASHTAG_MAX_COUNT" :placeholder="tags.length >= COMMUNITY_POST_HASHTAG_MAX_COUNT ? '태그를 모두 추가했어요' : tags.length === 0 ? '예: 제주여행, 바다산책' : ''" @keydown="onTagKeydown" @blur="commitTag" />
                </div>
              </div>
            </section>
          </form>
        </div>

        <aside class="story-write-preview">
          <div class="write-preview-feed-frame">
            <StoryPostPreview :title="previewTitle" :location="previewRegion" :summary="previewSummary" :tags="previewTags" :photos="addedPhotos" :photo-index="previewImageIndex" @prev="carouselPrev" @next="carouselNext" />
          </div>
        </aside>
      </div>

      <footer class="story-write-footer">
        <span class="draft-state" :class="`is-${draftStatus}`">
          <span class="material-symbols-rounded">{{ draftStatus === 'saving' ? 'sync' : draftStatus === 'saved' ? 'cloud_done' : 'edit_note' }}</span>
          {{ draftStatus === 'saving' ? '임시 저장 중...' : draftStatus === 'saved' ? '이 브라우저에 임시 저장됨' : '입력 내용은 자동 저장됩니다' }}
        </span>
        <div>
          <button v-if="!isEditMode" class="write-reset-button" type="button" :disabled="!hasFormContent" @click="requestReset"><span class="material-symbols-rounded" aria-hidden="true">restart_alt</span>내용 초기화</button>
          <button class="write-cancel-button" type="button" @click="requestClose">취소</button>
          <button class="write-publish-button" type="submit" form="story-write-form" :disabled="!isPublishReady || publishing"><span class="material-symbols-rounded">{{ isEditMode ? 'save' : 'publish' }}</span>{{ publishing ? (isEditMode ? '수정 중...' : '게시 중...') : (isEditMode ? '수정하기' : '작성하기') }}</button>
        </div>
      </footer>
    </section>

    <div
      v-if="closeConfirmOpen"
      class="draft-close-confirm"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="draft-close-title"
      aria-describedby="draft-close-description"
    >
      <button class="draft-close-confirm__backdrop" type="button" aria-label="계속 작성하기" @click="keepWriting"></button>
      <section class="draft-close-confirm__card">
        <span class="draft-close-confirm__icon material-symbols-rounded" aria-hidden="true">edit_note</span>
        <div>
          <h2 id="draft-close-title">{{ isEditMode ? '수정 중인 내용을 남겨둘까요?' : '작성 중인 내용을 남겨둘까요?' }}</h2>
          <p id="draft-close-description">
            작성 중인 내용은 임시 저장돼요.<br />
            다음에 이어서 작성할 수 있습니다.
          </p>
        </div>
        <div class="draft-close-confirm__actions">
          <button type="button" class="draft-close-confirm__continue" @click="keepWriting">계속 {{ isEditMode ? '수정하기' : '작성하기' }}</button>
          <button type="button" class="draft-close-confirm__save" @click="saveDraftAndClose">
            <span class="material-symbols-rounded" aria-hidden="true">save</span>
            저장하고 닫기
          </button>
        </div>
      </section>
    </div>
    <ConfirmDialog
      v-if="resetConfirmOpen"
      title="작성 내용을 초기화할까요?"
      message="입력한 여행, 사진, 제목, 본문과 태그가 모두 삭제되며 되돌릴 수 없습니다."
      confirm-label="초기화하기"
      cancel-label="계속 작성하기"
      tone="danger"
      @cancel="resetConfirmOpen = false"
      @confirm="resetForm"
    />
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

/* Guided travel-journal editor */
.story-overlay { --write-ink:#35465a; --write-muted:#6c8194; --write-line:#dfeaf2; --write-blue:#427ead; --write-blue-soft:#edf5fa; }
.story-write-panel { width:min(1120px,calc(100vw - 40px)); height:min(860px,calc(100dvh - 40px)); max-height:calc(100dvh - 40px); display:grid; grid-template-rows:auto minmax(0,1fr) auto; overflow:hidden; border:1px solid #dce7ef; border-radius:24px; background:#f8fbfd; box-shadow:0 30px 80px rgb(38 65 87 / 24%); color:var(--write-ink); }
.story-write-header { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:22px 26px; border-bottom:1px solid var(--write-line); background:#fff; }
.story-write-eyebrow { margin:0 0 4px; color:var(--write-blue); font:700 10px/1.4 Inter,sans-serif; letter-spacing:.14em; }
.story-write-header h1 { margin:0; color:var(--write-ink); font-family:'Noto Serif KR',Batang,serif; font-size:26px; font-weight:600; line-height:1.35; letter-spacing:-.02em; }
.story-write-header p:last-child { margin:4px 0 0; color:var(--write-muted); font-size:13px; }
.story-write-header__meta { display:flex; align-items:center; gap:14px; }
.story-write-progress { padding:7px 11px; border-radius:999px; background:var(--write-blue-soft); color:#5c758a; font-size:11px; font-weight:650; white-space:nowrap; }
.story-write-progress strong { color:var(--write-blue); }
.story-write-close { width:38px; height:38px; display:grid; place-items:center; padding:0; border:1px solid var(--write-line); border-radius:50%; background:#fff; color:#667d91; cursor:pointer; }
.story-write-close:hover { background:#f3f8fb; color:#c85f66; }
.story-write-workspace { min-height:0; display:grid; grid-template-columns:minmax(0,1.45fr) minmax(330px,.82fr); }
.story-write-editor { min-width:0; overflow-y:auto; padding:24px 28px 32px; background:#fff; scrollbar-width:none; }
.story-write-editor::-webkit-scrollbar,.story-write-preview::-webkit-scrollbar { display:none; }
.story-write-form { display:grid; gap:16px; }
.write-section { display:grid; gap:16px; padding:20px; border:1px solid var(--write-line); border-radius:18px; background:#fff; box-shadow:0 5px 18px rgb(53 70 90 / 5%); }
.write-section__heading { display:grid; grid-template-columns:30px minmax(0,1fr); align-items:start; gap:11px; }
.write-section__number { width:28px; height:28px; display:grid; place-items:center; border-radius:50%; background:var(--write-blue-soft); color:var(--write-blue); font-size:12px; font-weight:800; }
.write-section__heading h2 { margin:0; color:var(--write-ink); font-size:15px; font-weight:750; line-height:1.45; }
.write-section__heading p { margin:3px 0 0; color:var(--write-muted); font-size:11px; line-height:1.55; }
.required-mark { margin-left:2px; color:#c46d67; font-family:Inter,sans-serif; font-size:.9em; font-weight:800; }
.trip-select-wrap { position:relative; display:flex; align-items:center; }
.trip-select-wrap > .material-symbols-rounded:first-child { position:absolute; left:15px; z-index:1; color:var(--write-blue); font-size:20px; pointer-events:none; }
.trip-select-wrap select { width:100%; min-height:50px; padding:0 45px; appearance:none; border:1px solid #d6e3ec; border-radius:13px; outline:none; background:#fbfdff; color:var(--write-ink); font-size:13px; font-weight:600; cursor:pointer; }
.trip-select-wrap select:disabled { background:#f1f5f8; color:#718596; cursor:not-allowed; }
.trip-select-wrap select:focus,.write-field > input:focus,.tag-chip-input:focus-within { border-color:#7eacd0; box-shadow:0 0 0 3px rgb(66 126 173 / 10%); }
.trip-select-wrap__arrow { position:absolute; right:14px; color:#71879a; pointer-events:none; }
.selection-note { display:flex; align-items:center; gap:6px; margin:-4px 2px 0; color:#4f718a; font-size:11px; }
.selection-note .material-symbols-rounded { font-size:16px; }
.write-field { position:relative; display:grid; gap:8px; }
.write-field > label,.write-field__label label { color:var(--write-ink); font-size:12px; font-weight:700; }
.write-field__label { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.write-field__label span,.field-count { color:#8193a3; font-size:10px; }
.write-field__label span.is-near-limit { color:#c45f67; font-weight:700; }
.write-field > input { width:100%; min-height:52px; padding:0 52px 0 15px; border:1px solid #d6e3ec; border-radius:13px; outline:none; background:#fbfdff; color:var(--write-ink); font-family:'Noto Serif KR',Batang,serif; font-size:17px; font-weight:600; }
.field-count { position:absolute; right:13px; top:43px; }
.story-editor { overflow:hidden; border:1px solid #d6e3ec; border-radius:13px; background:#fff; }
.story-editor:focus-within { border-color:#7eacd0; box-shadow:0 0 0 3px rgb(66 126 173 / 10%); }
.story-editor__toolbar { display:flex; align-items:center; justify-content:space-between; padding:7px 10px; border-bottom:1px solid #e7eef4; background:#f7fafc; }
.story-editor__toolbar > div { display:flex; gap:2px; }
.story-editor__toolbar button { width:30px; height:30px; display:grid; place-items:center; padding:0; border:0; border-radius:7px; background:transparent; color:#61778b; cursor:pointer; }
.story-editor__toolbar button:hover { background:#e9f2f8; color:var(--write-blue); }
.story-editor__toolbar .material-symbols-rounded { font-size:19px; }
.story-editor__toolbar > span { color:#8a9baa; font-size:9px; font-weight:650; letter-spacing:.04em; }
.story-editor textarea { width:100%; min-height:190px; display:block; padding:15px; resize:vertical; border:0; outline:0; background:#fff; color:var(--write-ink); font:400 13px/1.75 Inter,'Pretendard Variable',sans-serif; }
.story-write-preview { min-width:0; display:flex; align-items:flex-start; justify-content:center; padding:24px; overflow-y:auto; border-left:1px solid var(--write-line); background:#f3f8fb; scrollbar-width:none; }
.write-preview-feed-frame { width:min(100%,400px); height:auto; min-height:0; max-height:none; aspect-ratio:auto; align-items:flex-start; margin:0 auto; }
.tag-chip-input { min-height:48px; padding:7px 12px; border:1px solid #d6e3ec; border-radius:13px; background:#fbfdff; }
.tag-chip { border:1px solid #d7e6f0; background:#edf5fa; color:#4f718a; font-size:11px; font-weight:700; }
.tag-chip__remove { background:#dcebf4; color:#4f718a; }
.photo-strip__row { gap:9px; }
.photo-strip__upload { height:104px; border:1.5px dashed #a9c4d8; border-radius:13px; background:#f5faff; color:var(--write-blue); }
.photo-strip__upload:hover { border-color:var(--write-blue); background:#edf6fc; }
.photo-strip__upload > .material-symbols-rounded { font-size:25px; }
.photo-strip__upload strong { font-size:11px; }
.photo-strip__upload small { color:#8497a7; font-size:9px; }
.photo-strip__item { height:104px; border:2px solid transparent; border-radius:13px; }
.photo-strip__item.is-selected { border-color:var(--write-blue); }
.photo-strip__check { background:var(--write-blue); }
.photo-strip__check .material-symbols-rounded { font-size:17px; }
.photo-strip__empty { height:104px; border:1px dashed #cbdbe6; border-radius:13px; }
.photo-strip__nav { border-color:var(--write-line); color:var(--write-ink); box-shadow:0 3px 10px rgb(53 70 90 / 7%); }
.photo-strip__nav:hover:not(:disabled) { background:var(--write-blue-soft); }
.photo-page-count { margin:-8px 0 0; color:#8294a3; font-size:10px; text-align:right; }
.story-write-footer { display:flex; align-items:center; justify-content:space-between; gap:20px; padding:14px 24px; border-top:1px solid var(--write-line); background:#fff; }
.draft-state { display:flex; align-items:center; gap:6px; color:#778c9d; font-size:11px; }
.draft-state .material-symbols-rounded { color:#5d88a8; font-size:17px; }
.draft-state.is-saving .material-symbols-rounded { animation:draft-spin 1s linear infinite; }
.story-write-footer > div { display:flex; gap:8px; }
.write-reset-button,.write-cancel-button,.write-publish-button { min-height:42px; padding:0 17px; border-radius:999px; font-size:12px; font-weight:700; cursor:pointer; }
.write-reset-button { display:inline-flex; align-items:center; gap:5px; border:1px solid #efcfd2; background:#fff; color:#b7505a; }
.write-reset-button:hover:not(:disabled) { background:#fff4f5; border-color:#e4afb4; }
.write-reset-button:disabled { opacity:.42; cursor:not-allowed; }
.write-reset-button .material-symbols-rounded { font-size:17px; }
.write-cancel-button { border:1px solid var(--write-line); background:#fff; color:#61778a; }
.write-publish-button { display:inline-flex; align-items:center; gap:6px; border:1px solid #3f78a3; background:#427ead; color:#fff; box-shadow:0 7px 18px rgb(66 126 173 / 20%); }
.write-publish-button .material-symbols-rounded { font-size:18px; }
.write-publish-button:disabled { border-color:#cfdce5; background:#dce6ed; color:#91a1ae; box-shadow:none; cursor:not-allowed; }
.draft-close-confirm { position:fixed; inset:0; z-index:20; display:grid; place-items:center; padding:20px; }
.draft-close-confirm__backdrop { position:absolute; inset:0; width:100%; height:100%; padding:0; border:0; background:rgb(28 43 56 / 42%); backdrop-filter:blur(3px); cursor:default; }
.draft-close-confirm__card { position:relative; z-index:1; width:min(100%,430px); display:grid; grid-template-columns:44px minmax(0,1fr); gap:16px; padding:24px; border:1px solid #dce7ef; border-radius:20px; background:#fff; box-shadow:0 24px 70px rgb(31 55 73 / 24%); }
.draft-close-confirm__icon { width:44px; height:44px; display:grid; place-items:center; border-radius:14px; background:var(--write-blue-soft); color:var(--write-blue); font-size:24px; }
.draft-close-confirm__card h2 { margin:1px 0 7px; color:var(--write-ink); font-family:'Noto Serif KR',Batang,serif; font-size:19px; font-weight:600; line-height:1.45; letter-spacing:-.02em; }
.draft-close-confirm__card p { margin:0; color:var(--write-muted); font-size:12px; line-height:1.75; word-break:keep-all; }
.draft-close-confirm__actions { grid-column:1 / -1; display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }
.draft-close-confirm__actions button { min-height:42px; padding:0 16px; border-radius:999px; font-size:12px; font-weight:700; cursor:pointer; }
.draft-close-confirm__continue { border:1px solid var(--write-line); background:#fff; color:#61778a; }
.draft-close-confirm__continue:hover { background:#f4f8fb; }
.draft-close-confirm__save { display:inline-flex; align-items:center; justify-content:center; gap:6px; border:1px solid #3f78a3; background:var(--write-blue); color:#fff; box-shadow:0 7px 18px rgb(66 126 173 / 18%); }
.draft-close-confirm__save:hover { background:#356f9c; }
.draft-close-confirm__save .material-symbols-rounded { font-size:17px; }
.sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
@keyframes draft-spin { to { transform:rotate(360deg); } }
@media(max-width:900px) {
  .story-write-panel { width:calc(100vw - 24px); height:calc(100dvh - 24px); max-height:calc(100dvh - 24px); }
  .story-write-workspace { display:block; overflow-y:auto; }
  .story-write-editor { overflow:visible; }
  .story-write-preview { border-top:1px solid var(--write-line); border-left:0; }
  .write-preview-feed-frame { width:min(100%,390px); }
}
@media(max-width:600px) {
  .story-write-panel { width:100vw; height:100dvh; max-height:100dvh; border:0; border-radius:0; }
  .story-write-header { padding:17px 16px; }
  .story-write-header h1 { font-size:22px; }
  .story-write-header p:last-child,.story-write-progress { display:none; }
  .story-write-editor { padding:16px; }
  .write-section { padding:16px; border-radius:15px; }
  .write-section__heading { grid-template-columns:28px minmax(0,1fr); }
  .photo-strip__row { grid-template-columns:repeat(2,minmax(0,1fr)); }
  .photo-strip__empty { grid-column:auto; }
  .photo-strip__nav { width:30px; height:30px; }
  .story-write-preview { padding:18px 16px 24px; }
  .story-write-footer { padding:11px 14px; }
  .draft-state { max-width:130px; }
  .write-cancel-button { display:none; }
  .write-reset-button { padding-inline:12px; }
  .write-publish-button { min-height:40px; padding-inline:14px; }
  .draft-close-confirm { padding:16px; }
  .draft-close-confirm__card { grid-template-columns:38px minmax(0,1fr); gap:13px; padding:20px; border-radius:18px; }
  .draft-close-confirm__icon { width:38px; height:38px; border-radius:12px; font-size:21px; }
  .draft-close-confirm__card h2 { font-size:17px; }
  .draft-close-confirm__actions { display:grid; grid-template-columns:1fr 1fr; }
  .draft-close-confirm__actions button { padding-inline:10px; }
}
@media(prefers-reduced-motion:reduce) { .draft-state.is-saving .material-symbols-rounded { animation:none; } }
</style>
