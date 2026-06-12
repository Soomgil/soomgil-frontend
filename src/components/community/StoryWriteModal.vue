<script setup lang="ts">
import { ref, computed } from 'vue'

defineEmits<{ close: [] }>()

// Form state
const title = ref('')
const selectedTripId = ref('')
const tagsInput = ref('')

// 내 여행계획 목록 (mock)
const myTrips = [
  { id: 'trip_1', title: '대전 2박 3일 힐링 코스', date: '2026.05.20 ~ 05.22' },
  { id: 'trip_2', title: '부산 바다 여행', date: '2026.06.10 ~ 06.12' },
  { id: 'trip_3', title: '제주도 3박 4일 완전정복', date: '2026.07.01 ~ 07.04' },
]
const content = ref('')
const photoPreviews = ref<{ file?: File; url: string }[]>([])

// Photo state
const addedPhotos = ref<string[]>([])
const representativePhoto = ref('')
const previewImageIndex = ref(0)

// Char counter
const charCount = computed(() => content.value.length)

// Parse markdown for preview
function parseMarkdown(text: string): string {
  if (!text) return ''
  let html = text
  html = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>')
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>')
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>')
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>')
  html = html.replace(/^\s*-\s+(.*$)/gim, '<li>$1</li>')
  html = html.replace(/^\s*\*\s+(.*$)/gim, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>)/gim, '<ul>$1</ul>')
  html = html.replace(/<\/ul>\s*<ul>/g, '')
  html = html.replace(/\n/g, '<br>')
  return html
}

const previewHtml = computed(() => {
  const parsed = parseMarkdown(content.value)
  return parsed || '<span style="color: var(--muted)">본문 내용을 입력하세요.</span>'
})

const previewTitle = computed(() => title.value.trim() || '여행의 제목을 입력하세요')
const previewRegion = computed(() => {
  const trip = myTrips.find(t => t.id === selectedTripId.value)
  return trip ? trip.title : '여행계획을 선택하세요'
})

const previewTags = computed(() => {
  const tagsText = tagsInput.value.trim() || ''
  return tagsText.split(/\s+/).filter((t) => t.startsWith('#'))
})

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
  alert('임시 저장되었습니다.')
}

function handlePublish() {
  alert('여행기가 성공적으로 등록되었습니다!')
}

// Photo upload
function onPhotoSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  for (const file of Array.from(input.files)) {
    if (photoPreviews.value.length >= 6) break
    const url = URL.createObjectURL(file)
    photoPreviews.value.push({ file, url })
    addedPhotos.value.push(url)
  }
  if (!representativePhoto.value && addedPhotos.value.length > 0) {
    representativePhoto.value = addedPhotos.value[0]
    previewImageIndex.value = 0
  }
  input.value = ''
}

function removePhoto(index: number) {
  const removed = photoPreviews.value.splice(index, 1)
  addedPhotos.value.splice(index, 1)
  if (removed[0]?.url) URL.revokeObjectURL(removed[0].url)
  if (representativePhoto.value === removed[0]?.url) {
    representativePhoto.value = addedPhotos.value[0] || ''
  }
  if (previewImageIndex.value >= addedPhotos.value.length) {
    previewImageIndex.value = Math.max(0, addedPhotos.value.length - 1)
  }
}

function setRepresentative(index: number) {
  representativePhoto.value = addedPhotos.value[index]
  previewImageIndex.value = index
}

function carouselPrev() {
  if (addedPhotos.value.length < 2) return
  previewImageIndex.value = (previewImageIndex.value - 1 + addedPhotos.value.length) % addedPhotos.value.length
}

function carouselNext() {
  if (addedPhotos.value.length < 2) return
  previewImageIndex.value = (previewImageIndex.value + 1) % addedPhotos.value.length
}
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
            <button class="btn primary" type="button" style="border-radius: 999px; padding: 0 24px;" @click="handlePublish">게시하기</button>
          </div>
        </div>

        <input type="file" id="modal-photo-upload-input" style="display:none;" accept="image/*" multiple @change="onPhotoSelect">

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
                      <option value="" disabled>여행계획을 선택하세요</option>
                      <option v-for="trip in myTrips" :key="trip.id" :value="trip.id">{{ trip.title }} ({{ trip.date }})</option>
                    </select>
                  </div>
                </div>
                <div style="display: grid; gap: 10px;">
                  <label for="modal-story-tags" style="font-weight: 800; font-size: 15px; color: var(--ink);">태그</label>
                  <div style="position: relative;">
                    <span class="material-symbols-rounded" style="position: absolute; left: 16px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 20px;">tag</span>
                    <input id="modal-story-tags" class="field" v-model="tagsInput" style="padding-left: 48px; border: 1.5px solid rgba(227, 234, 244, 0.9); border-radius: 16px; background: #fff; font-size: 15px; font-weight: 600; outline: none; width: 100%;">
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
                      <div style="width: 1px; height: 18px; background: rgba(227, 234, 244, 0.9); margin: 6px 4px;"></div>
                      <button type="button" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;" title="링크 추가" @click="insertMarkdown('[', '](url)', '링크')"><span class="material-symbols-rounded" style="font-size: 20px;">link</span></button>
                      <button type="button" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; border-radius: 8px;" title="이미지 추가" @click="insertMarkdown('![alt](', 'img_url)', '설명')"><span class="material-symbols-rounded" style="font-size: 20px;">image</span></button>
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
                <label style="font-weight: 800; font-size: 15px; color: var(--ink);">커버 및 갤러리</label>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
                  <label for="modal-photo-upload-input" style="height: 120px; border-radius: 16px; border: 2px dashed rgba(124, 58, 237, 0.2); background: rgba(248, 250, 255, 0.6); display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: var(--muted); transition: all 0.25s;">
                    <span class="material-symbols-rounded" style="font-size: 28px; margin-bottom: 4px;">add_photo_alternate</span>
                    <span style="font-size: 12px; font-weight: 750;">사진 추가</span>
                  </label>
                  <div
                    v-for="(photo, idx) in photoPreviews"
                    :key="idx"
                    style="position: relative; height: 120px; border-radius: 16px; overflow: hidden; box-shadow: var(--soft-shadow); cursor: pointer;"
                    @click="setRepresentative(idx)"
                  >
                    <img :src="photo.url" :alt="`업로드한 여행 사진 ${idx + 1}`" style="width: 100%; height: 100%; object-fit: cover;" />
                    <div v-if="representativePhoto === photo.url" style="position: absolute; top: 8px; left: 8px; padding: 4px 8px; background: var(--violet); color: #fff; border-radius: 8px; font-size: 10px; font-weight: 900; z-index: 2;">대표</div>
                    <button type="button" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 999px; border: 0; background: rgba(0,0,0,0.5); color: #fff; display: grid; place-items: center; cursor: pointer; z-index: 3;" @click.stop="removePhoto(idx)">
                      <span class="material-symbols-rounded" style="font-size: 14px;">close</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>

          <!-- Preview panel -->
          <aside style="height: 100%; display: flex; flex-direction: column;">
            <div style="display: flex; flex-direction: column; gap: 20px; height: 100%; min-height: 720px; justify-content: center; align-items: center;">
              <h3 style="font-size: 16px; color: var(--muted); margin: 0; font-weight: 800; align-self: flex-start; flex-shrink: 0;">작성 미리보기</h3>

              <div style="width: 496px; height: 650px; flex-shrink: 0; display: flex; justify-content: center; align-items: center;">
                <div class="story-post" style="border: 1px solid rgba(227, 231, 244, 0.6); margin: 0;">
                  <div class="story-post-head" style="padding:16px 20px; flex-direction:column; align-items:flex-start; gap:12px; flex-shrink: 0; display: flex;">
                    <div style="display:flex; align-items:center; justify-content:space-between; width:100%">
                      <div class="story-author" style="display:flex; align-items:center; gap:12px;">
                        <span class="avatar" style="width:40px; height:40px; background:var(--rose); font-weight: 800; color: #fff; font-size: 15px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">나</span>
                        <div>
                          <strong style="font-size:15px; color: var(--ink); display: block;">나</strong>
                          <span style="display: block; font-size: 12px; margin-top: 2px; color: var(--muted);">{{ previewRegion }}</span>
                        </div>
                      </div>
                      <button type="button" style="border:0; padding:0; min-height:0; background: transparent; cursor: pointer; color: var(--muted); display: inline-flex; align-items: center; justify-content: center;"><span class="material-symbols-rounded">more_horiz</span></button>
                    </div>
                  </div>

                  <div class="feed-photo-frame" v-if="addedPhotos.length > 0" style="position: relative; overflow: hidden; display: block;">
                    <button class="feed-photo-nav carousel-btn prev-btn prev" type="button" aria-label="이전 사진" :disabled="addedPhotos.length < 2" @click="carouselPrev"><span class="material-symbols-rounded">chevron_left</span></button>
                    <button class="feed-photo-open" type="button" aria-label="사진 확대">
                      <img alt="여행기 미리보기 사진" :src="addedPhotos[previewImageIndex]">
                    </button>
                    <button class="feed-photo-nav carousel-btn next-btn next" type="button" aria-label="다음 사진" :disabled="addedPhotos.length < 2" @click="carouselNext"><span class="material-symbols-rounded">chevron_right</span></button>
                    <span class="feed-photo-count">{{ previewImageIndex + 1 }} / {{ addedPhotos.length }}</span>
                  </div>

                  <div class="story-body" style="padding: 22px 24px; display: flex; flex-direction: column; height: auto; flex: 1;">
                    <h3 style="font-size: 20px; line-height: 1.4; margin: 0 0 12px; font-weight: 850; color: var(--ink); flex-shrink: 0;">{{ previewTitle }}</h3>
                    <div style="max-height: 180px; overflow-y: auto; margin-bottom: 16px; font-size: 15px; line-height: 1.7; color: var(--muted);" v-html="previewHtml"></div>
                    <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; flex-shrink: 0;">
                      <span v-for="tag in previewTags" :key="tag" class="tag">{{ tag }}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.story-preview-body-content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--muted);
  overflow-y: auto;
  scrollbar-width: thin;
}
</style>
