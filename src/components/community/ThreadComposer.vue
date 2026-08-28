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

async function onFilesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  input.value = ''
  if (!files.length) return

  const room = MAX_IMAGES - attachments.value.length
  if (files.length > room) {
    emit('error', `이미지는 최대 ${MAX_IMAGES}장까지 붙일 수 있어요.`)
  }

  for (const file of files.slice(0, Math.max(room, 0))) {
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
  <form class="thread-composer" data-testid="thread-composer" @submit.prevent="submit">
    <div v-if="replyTargetName" class="thread-composer__reply-target" data-testid="reply-target">
      <span class="material-symbols-rounded">subdirectory_arrow_right</span>
      <span><strong>{{ replyTargetName }}</strong>님에게 답글</span>
      <button type="button" data-testid="reply-target-cancel" @click="emit('cancelReply')">취소</button>
    </div>

    <div class="thread-composer__body">
      <BaseAvatar
        v-if="authorName"
        :src="authorImageUrl ?? undefined"
        :name="authorName"
        size="md"
      />
      <div class="thread-composer__main">
        <textarea
          v-model="content"
          class="thread-composer__input"
          data-testid="thread-composer-input"
          :placeholder="placeholder"
          :maxlength="maxLength"
          rows="3"
        />

        <div v-if="attachments.length" class="thread-composer__previews" data-testid="composer-previews">
          <div
            v-for="item in attachments"
            :key="item.key"
            class="thread-composer__preview"
            :class="{ uploading: item.uploading }"
            data-testid="composer-preview"
          >
            <img v-if="item.previewUrl" :src="item.previewUrl" alt="첨부 이미지 미리보기" />
            <span v-if="item.uploading" class="thread-composer__preview-spinner" aria-label="업로드 중" />
            <button
              type="button"
              class="thread-composer__preview-remove"
              data-testid="composer-preview-remove"
              aria-label="첨부 이미지 제거"
              @click="removeAttachment(item.key)"
            >
              <span class="material-symbols-rounded">close</span>
            </button>
          </div>
        </div>

        <div class="thread-composer__footer">
          <button
            v-if="allowImages"
            type="button"
            class="thread-composer__attach"
            data-testid="composer-attach"
            :disabled="attachments.length >= MAX_IMAGES"
            aria-label="이미지 첨부"
            @click="openFilePicker"
          >
            <span class="material-symbols-rounded">image</span>
            <span v-if="attachments.length">{{ attachments.length }}/{{ MAX_IMAGES }}</span>
          </button>
          <input
            v-if="allowImages"
            ref="fileInput"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            class="hidden"
            data-testid="composer-file-input"
            @change="onFilesSelected"
          />

          <span
            class="thread-composer__counter"
            :class="{ over: trimmed.length > maxLength }"
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
            {{ uploadingAny ? '이미지 올리는 중…' : submitLabel }}
          </button>
        </div>
      </div>
    </div>
  </form>
</template>

<style scoped>
.thread-composer {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 22px;
  box-shadow: var(--soft-shadow);
  display: flex;
  flex-direction: column;
  padding: 20px 22px;
}

.thread-composer__reply-target {
  align-items: center;
  background: var(--surface-2);
  border-radius: 12px;
  color: var(--muted);
  display: flex;
  font-size: 13px;
  gap: 6px;
  margin-bottom: 12px;
  padding: 8px 12px;
}

.thread-composer__reply-target strong {
  color: var(--ink);
}

.thread-composer__reply-target .material-symbols-rounded {
  font-size: 17px;
}

.thread-composer__reply-target button {
  background: none;
  border: none;
  color: var(--violet);
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  margin-left: auto;
}

.thread-composer__body {
  display: flex;
  gap: 12px;
}

.thread-composer__main {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10px;
  min-width: 0;
}

.thread-composer__input {
  background: var(--bg);
  border: 1px solid var(--line);
  border-radius: 16px;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.6;
  padding: 12px 14px;
  resize: vertical;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
  width: 100%;
}

.thread-composer__input::placeholder {
  color: var(--muted);
}

.thread-composer__input:focus {
  border-color: var(--violet);
  box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.12);
  outline: none;
}

.thread-composer__previews {
  display: grid;
  gap: 8px;
  grid-template-columns: repeat(4, 1fr);
}

.thread-composer__preview {
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  position: relative;
}

.thread-composer__preview img {
  aspect-ratio: 1;
  display: block;
  object-fit: cover;
  width: 100%;
}

.thread-composer__preview.uploading img {
  filter: brightness(0.7);
}

.thread-composer__preview-spinner {
  animation: composer-spin 0.9s linear infinite;
  border: 2.5px solid rgba(255, 255, 255, 0.4);
  border-radius: 999px;
  border-top-color: #fff;
  height: 22px;
  left: 50%;
  margin: -11px 0 0 -11px;
  position: absolute;
  top: 50%;
  width: 22px;
}

@keyframes composer-spin {
  to {
    transform: rotate(360deg);
  }
}

.thread-composer__preview-remove {
  align-items: center;
  background: rgba(26, 32, 51, 0.65);
  border: none;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  display: flex;
  height: 22px;
  justify-content: center;
  position: absolute;
  right: 6px;
  top: 6px;
  width: 22px;
}

.thread-composer__preview-remove .material-symbols-rounded {
  font-size: 14px;
}

.thread-composer__footer {
  align-items: center;
  display: flex;
  gap: 10px;
}

.thread-composer__attach {
  align-items: center;
  background: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--violet);
  cursor: pointer;
  display: flex;
  font-size: 12px;
  font-weight: 700;
  gap: 4px;
  height: 34px;
  padding: 0 10px;
  transition: background 0.2s ease;
}

.thread-composer__attach:hover {
  background: var(--surface-2);
}

.thread-composer__attach:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.thread-composer__attach .material-symbols-rounded {
  font-size: 19px;
}

.thread-composer__counter {
  color: var(--muted);
  font-size: 12px;
  margin-left: auto;
}

.thread-composer__counter.over {
  color: var(--rose);
}

.thread-composer__submit {
  background: linear-gradient(135deg, var(--violet), var(--blue));
  border: none;
  border-radius: 999px;
  box-shadow: 0 10px 26px rgba(0, 102, 255, 0.28);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
  padding: 10px 22px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.thread-composer__submit:hover:not(:disabled) {
  box-shadow: 0 14px 32px rgba(0, 102, 255, 0.34);
  transform: translateY(-1px);
}

.thread-composer__submit:disabled {
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.5;
}

.hidden {
  display: none;
}

@media (max-width: 640px) {
  .thread-composer {
    border-radius: 18px;
    padding: 16px;
  }

  .thread-composer__previews {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
