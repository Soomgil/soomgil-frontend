<script setup lang="ts">
import { computed, ref } from 'vue'
import BaseAvatar from '@/components/common/BaseAvatar.vue'
import { mediaApi } from '@/api/media.api'

interface Attachment {
  key: string
  mediaFileId: string | null
  previewUrl: string
  uploading: boolean
  failed: boolean
}

const props = withDefaults(defineProps<{
  submitting?: boolean
  submitLabel?: string
  placeholder?: string
  maxLength?: number
  /** 작성자 표시용. 없으면 아바타를 숨긴다. */
  authorName?: string
  authorImageUrl?: string | null
  /** 이미지 첨부 허용 여부. 답글 작성에서는 끈다. */
  allowImages?: boolean
  /** 답글 대상 표시. 있으면 취소 버튼과 함께 보여준다. */
  replyTargetName?: string | null
}>(), {
  submitting: false,
  submitLabel: '게시',
  placeholder: '무슨 여행 이야기를 나눠볼까요?',
  maxLength: 500,
  authorName: '',
  authorImageUrl: null,
  allowImages: false,
  replyTargetName: null,
})

const emit = defineEmits<{
  submit: [content: string, mediaFileIds: string[]]
  cancelReply: []
  error: [message: string]
}>()

const MAX_IMAGES = 4
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

const content = ref('')
const attachments = ref<Attachment[]>([])
const fileInput = ref<HTMLInputElement | null>(null)

const trimmed = computed(() => content.value.trim())
const uploadingAny = computed(() => attachments.value.some((item) => item.uploading))
const canSubmit = computed(
  () =>
    trimmed.value.length >= 1 &&
    trimmed.value.length <= props.maxLength &&
    !props.submitting &&
    !uploadingAny.value,
)

function openFilePicker() {
  fileInput.value?.click()
}

function previewUrlOf(file: File) {
  try {
    return URL.createObjectURL(file)
  } catch {
    return ''
  }
}

/** 파일 선택·드롭·붙여넣기가 공유하는 첨부 경로. 업로드는 즉시 시작한다. */
async function addFiles(files: File[]) {
  const images = files.filter((file) => IMAGE_TYPES.includes(file.type))
  if (!images.length) return

  const room = MAX_IMAGES - attachments.value.length
  if (images.length > room) {
    emit('error', `이미지는 최대 ${MAX_IMAGES}장까지 붙일 수 있어요.`)
  }

  for (const file of images.slice(0, Math.max(room, 0))) {
    const attachment: Attachment = {
      key: `${file.name}-${file.size}-${attachments.value.length}-${Math.random().toString(36).slice(2, 8)}`,
      mediaFileId: null,
      previewUrl: previewUrlOf(file),
      uploading: true,
      failed: false,
    }
    attachments.value.push(attachment)
    try {
      const uploaded = await mediaApi.uploadFile(file, 'COMMUNITY_POST')
      attachment.mediaFileId = uploaded.id
    } catch {
      attachment.failed = true
      emit('error', '이미지를 올리지 못했습니다.')
    } finally {
      attachment.uploading = false
    }
  }
  // 업로드에 실패한 첨부는 제출 대상에서 제거한다.
  attachments.value = attachments.value.filter((item) => !item.failed)
}

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  await addFiles(files)
}

/* ── 드래그&드롭 첨부 ── */
const dragDepth = ref(0)
const dragActive = computed(() => props.allowImages && dragDepth.value > 0)

function onDragEnter() {
  if (!props.allowImages) return
  dragDepth.value += 1
}

function onDragLeave() {
  if (!props.allowImages) return
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

async function onDrop(event: DragEvent) {
  dragDepth.value = 0
  if (!props.allowImages) return
  await addFiles(Array.from(event.dataTransfer?.files ?? []))
}

/** 클립보드에 이미지가 있으면 첨부로 받는다. 텍스트 붙여넣기는 그대로 둔다. */
async function onPaste(event: ClipboardEvent) {
  if (!props.allowImages) return
  const files = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file')
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  if (files.length) {
    event.preventDefault()
    await addFiles(files)
  }
}

function removeAttachment(key: string) {
  attachments.value = attachments.value.filter((item) => item.key !== key)
}

function submit() {
  if (!canSubmit.value) return
  emit(
    'submit',
    trimmed.value,
    attachments.value
      .map((item) => item.mediaFileId)
      .filter((id): id is string => Boolean(id)),
  )
}

/** 부모가 submitting을 끝냈을 때 폼을 비운다. 실패 시 부모가 내용 유지를 원하면 reset을 직접 부르지 않는다. */
function reset() {
  content.value = ''
  attachments.value = []
}

defineExpose({ reset })
</script>

<template>
  <form
    class="thread-composer"
    :class="{ 'thread-composer--dragging': dragActive }"
    data-testid="thread-composer"
    @submit.prevent="submit"
    @dragenter.prevent="onDragEnter"
    @dragover.prevent
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div v-if="dragActive" class="thread-composer__drop-hint" aria-hidden="true">
      <span class="material-symbols-rounded">add_photo_alternate</span>
      이미지를 놓으면 첨부돼요
    </div>

    <div v-if="replyTargetName" class="thread-composer__reply-target" data-testid="reply-target">
      <span class="material-symbols-rounded" aria-hidden="true">subdirectory_arrow_right</span>
      <span><strong>{{ replyTargetName }}</strong>님에게 답글</span>
      <button type="button" data-testid="reply-target-cancel" @click="emit('cancelReply')">취소</button>
    </div>

    <div class="thread-composer__row">
      <BaseAvatar
        v-if="authorName"
        :src="authorImageUrl ?? undefined"
        :name="authorName"
        size="sm"
        class="thread-composer__avatar"
      />

      <div class="thread-composer__main">
        <textarea
          v-model="content"
          class="thread-composer__input"
          data-testid="thread-composer-input"
          :placeholder="placeholder"
          :maxlength="maxLength"
          rows="2"
          @paste="onPaste"
        />

        <div v-if="attachments.length" class="thread-composer__previews" data-testid="composer-previews">
          <div
            v-for="attachment in attachments"
            :key="attachment.key"
            class="thread-composer__preview"
            data-testid="composer-preview"
          >
            <img v-if="attachment.previewUrl" :src="attachment.previewUrl" alt="첨부 이미지 미리보기" />
            <span v-if="attachment.uploading" class="thread-composer__preview-loading" aria-label="업로드 중"></span>
            <button
              type="button"
              class="thread-composer__preview-remove"
              data-testid="composer-preview-remove"
              aria-label="첨부 삭제"
              @click="removeAttachment(attachment.key)"
            >
              <span class="material-symbols-rounded" aria-hidden="true">close</span>
            </button>
          </div>
        </div>

        <div class="thread-composer__bar">
          <button
            v-if="allowImages"
            type="button"
            class="thread-composer__attach"
            data-testid="composer-attach"
            :disabled="attachments.length >= MAX_IMAGES"
            @click="openFilePicker"
          >
            <span class="material-symbols-rounded" aria-hidden="true">image</span>
            사진
            <span v-if="attachments.length" class="thread-composer__attach-count">{{ attachments.length }}/{{ MAX_IMAGES }}</span>
          </button>
          <input
            v-if="allowImages"
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            data-testid="composer-file-input"
            @change="onFilesSelected"
          />

          <span class="thread-composer__spacer"></span>

          <span
            v-if="trimmed.length > 0"
            class="thread-composer__counter"
            data-testid="thread-composer-counter"
          >
            {{ trimmed.length }} / {{ maxLength }}
          </span>

          <button
            type="submit"
            class="thread-composer__submit"
            data-testid="thread-composer-submit"
            :disabled="!canSubmit"
          >
            {{ uploadingAny ? '업로드 중…' : submitLabel }}
          </button>
        </div>
      </div>
    </div>
  </form>
</template>

<style scoped>
.thread-composer {
  border-radius: 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 18px 20px 14px;
  position: relative;
}

/* 드래그 중 강조 */
.thread-composer--dragging {
  outline: 2px dashed var(--violet);
  outline-offset: -8px;
}

.thread-composer__drop-hint {
  align-items: center;
  background: rgba(244, 249, 255, 0.92);
  border-radius: 20px;
  color: var(--violet);
  display: flex;
  font-size: 15px;
  font-weight: 800;
  gap: 8px;
  inset: 0;
  justify-content: center;
  pointer-events: none;
  position: absolute;
  z-index: 5;
}

.thread-composer__drop-hint .material-symbols-rounded {
  font-size: 26px;
}

.thread-composer__reply-target {
  align-items: center;
  background: rgba(0, 102, 255, 0.06);
  border-radius: 12px;
  color: var(--muted);
  display: flex;
  font-size: 13px;
  gap: 6px;
  padding: 8px 12px;
}

.thread-composer__reply-target strong {
  color: var(--violet);
}

.thread-composer__reply-target .material-symbols-rounded {
  color: var(--violet);
  font-size: 16px;
}

.thread-composer__reply-target button {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  margin-left: auto;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.thread-composer__row {
  display: flex;
  gap: 12px;
}

.thread-composer__avatar {
  flex: 0 0 auto;
  margin-top: 2px;
}

.thread-composer__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.thread-composer__input {
  background: transparent;
  border: none;
  color: var(--ink);
  font-family: inherit;
  font-size: 16px;
  line-height: 1.6;
  min-height: 56px;
  outline: none;
  padding: 6px 0 0;
  resize: none;
}

.thread-composer__input::placeholder {
  color: var(--muted);
}

.thread-composer__previews {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
}

.thread-composer__preview {
  aspect-ratio: 4 / 3;
  border-radius: 12px;
  overflow: hidden;
  position: relative;
}

.thread-composer__preview img {
  display: block;
  height: 100%;
  object-fit: cover;
  width: 100%;
}

.thread-composer__preview-loading {
  animation: composer-spin 0.8s linear infinite;
  border: 3px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  border-top-color: #fff;
  height: 26px;
  left: 50%;
  margin: -13px 0 0 -13px;
  position: absolute;
  top: 50%;
  width: 26px;
}

@keyframes composer-spin {
  to {
    transform: rotate(360deg);
  }
}

.thread-composer__preview-remove {
  align-items: center;
  background: rgba(10, 22, 44, 0.6);
  border: none;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  display: flex;
  height: 26px;
  justify-content: center;
  position: absolute;
  right: 6px;
  top: 6px;
  transition: background 0.15s ease;
  width: 26px;
}

.thread-composer__preview-remove:hover {
  background: rgba(10, 22, 44, 0.85);
}

.thread-composer__preview-remove .material-symbols-rounded {
  font-size: 16px;
}

.thread-composer__bar {
  align-items: center;
  border-top: 1px solid var(--line);
  display: flex;
  gap: 10px;
  padding-top: 10px;
}

/* 라벨형 사진 첨부 칩 */
.thread-composer__attach {
  align-items: center;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--violet);
  cursor: pointer;
  display: flex;
  font-size: 13px;
  font-weight: 800;
  gap: 5px;
  padding: 7px 14px;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.thread-composer__attach:hover:not(:disabled) {
  background: rgba(0, 102, 255, 0.06);
  border-color: rgba(0, 102, 255, 0.3);
}

.thread-composer__attach:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.thread-composer__attach .material-symbols-rounded {
  font-size: 18px;
}

.thread-composer__attach-count {
  color: var(--muted);
  font-weight: 700;
}

.thread-composer__spacer {
  flex: 1;
}

.thread-composer__counter {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.thread-composer__submit {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: none;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  padding: 9px 22px;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}

.thread-composer__submit:hover:not(:disabled) {
  box-shadow: 0 10px 22px rgba(0, 102, 255, 0.28);
  transform: translateY(-1px);
}

.thread-composer__submit:disabled {
  background: var(--surface-2);
  box-shadow: none;
  color: var(--muted);
  cursor: not-allowed;
}
</style>
