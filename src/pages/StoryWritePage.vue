<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'

const router = useRouter()

// Form state
const title = ref('성심당만 보고 갔다가 대전에 반하고 온 여행')
const selectedTripId = ref('')
const tagsInput = ref('#대전여행 #성심당 #빵지순례')

// 내 여행계획 목록 (mock)
const myTrips = [
  { id: 'trip_1', title: '대전 2박 3일 힐링 코스', date: '2026.05.20 ~ 05.22' },
  { id: 'trip_2', title: '부산 바다 여행', date: '2026.06.10 ~ 06.12' },
  { id: 'trip_3', title: '제주도 3박 4일 완전정복', date: '2026.07.01 ~ 07.04' },
]
const content = ref('성심당문화원에서 커피 마시고 은행동 거리를 걷는데 분위기가 진짜 좋았습니다. 저녁에는 중앙시장까지 걸어갔는데 사람도 많고 먹거리도 다양해서 예상보다 훨씬 재밌었어요.')
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
  router.push('/community/stories')
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
  <AppShell>
    <main>
      <section class="section write-page" style="padding-top: 40px;">
        <div class="detail-topline" style="margin-bottom: 32px;">
          <a class="btn ghost" href="#" style="border-radius: 999px;" @click.prevent="router.back()">
            <span class="material-symbols-rounded" style="font-size: 18px;">arrow_back</span> 커뮤니티
          </a>
          <div style="display: flex; gap: 10px;">
            <button class="btn ghost" type="button" style="border-radius: 999px;" @click="handleSave">임시저장</button>
            <button class="btn primary" type="button" style="border-radius: 999px; padding: 0 24px;" @click="handlePublish">게시하기</button>
          </div>
        </div>

        <div class="content-container">
          <div class="write-layout">
            <div class="write-main">
              <div class="section-title" style="margin-bottom: 40px;">
                <div>
                  <p class="eyebrow" style="color: var(--violet)">Create Story</p>
                  <h1 style="font-size: 38px; margin-bottom: 12px; font-weight: 850;">당신의 여행을 들려주세요</h1>
                  <p class="lead" style="font-size: 17px; color: var(--muted);">사진과 글, 그리고 당신만의 감성을 자유롭게 담아보세요.</p>
                </div>
              </div>

              <!-- Hidden file upload input -->
              <input type="file" id="photo-upload-input" style="display:none;" accept="image/*" multiple @change="onPhotoSelect">

              <form class="write-form" aria-label="여행기 작성 폼" style="border: 0; background: transparent; padding: 0; box-shadow: none; display: grid; gap: 28px;">
                <div class="form-group" style="display: grid; gap: 10px;">
                  <label for="story-title" style="font-weight: 800; font-size: 15px; color: var(--ink);">제목</label>
                  <input id="story-title" class="field" placeholder="여행의 제목을 입력하세요" v-model="title">
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                  <div class="form-group" style="display: grid; gap: 10px;">
                    <label for="story-trip-select" style="font-weight: 800; font-size: 15px; color: var(--ink);">내가 간 여행계획 선택하기</label>
                    <div class="form-group-icon-wrap">
                      <span class="material-symbols-rounded">flight</span>
                      <select id="story-trip-select" class="field" v-model="selectedTripId" style="padding-left: 48px !important; appearance: auto;">
                        <option value="" disabled>여행계획을 선택하세요</option>
                        <option v-for="trip in myTrips" :key="trip.id" :value="trip.id">{{ trip.title }} ({{ trip.date }})</option>
                      </select>
                    </div>
                  </div>
                  <div class="form-group" style="display: grid; gap: 10px;">
                    <label for="story-tags" style="font-weight: 800; font-size: 15px; color: var(--ink);">태그</label>
                    <div class="form-group-icon-wrap">
                      <span class="material-symbols-rounded">tag</span>
                      <input id="story-tags" class="field" v-model="tagsInput">
                    </div>
                  </div>
                </div>

                <div class="form-group" style="display: grid; gap: 10px;">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label for="story-content" style="font-weight: 800; font-size: 15px; color: var(--ink);">본문</label>
                    <span class="small muted" style="font-weight: 750;">글자 수: {{ charCount }}자</span>
                  </div>
                  <div style="position: relative; border: 1.5px solid rgba(227, 234, 244, 0.9); border-radius: 20px; background: #fff; overflow: hidden; box-shadow: var(--soft-shadow);">
                    <div class="editor-toolbar" style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1.5px solid rgba(227, 234, 244, 0.9); background: #fbfcfe;">
                      <div style="display: flex; gap: 8px;">
                        <button type="button" class="btn ghost" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center;" title="굵게" @click="insertMarkdown('**', '**', 'bold')"><span class="material-symbols-rounded" style="font-size: 20px;">format_bold</span></button>
                        <button type="button" class="btn ghost" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center;" title="기울임" @click="insertMarkdown('*', '*', 'italic')"><span class="material-symbols-rounded" style="font-size: 20px;">format_italic</span></button>
                        <button type="button" class="btn ghost" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center;" title="리스트" @click="insertMarkdown('- ', '', '항목')"><span class="material-symbols-rounded" style="font-size: 20px;">format_list_bulleted</span></button>
                        <div style="width: 1px; height: 18px; background: rgba(227, 234, 244, 0.9); margin: 6px 4px;"></div>
                        <button type="button" class="btn ghost" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center;" title="링크 추가" @click="insertMarkdown('[', '](url)', '링크')"><span class="material-symbols-rounded" style="font-size: 20px;">link</span></button>
                        <button type="button" class="btn ghost" style="min-height: 32px; width: 32px; padding: 0; border: 0; background: transparent; display: inline-flex; align-items: center; justify-content: center;" title="이미지 추가" @click="insertMarkdown('![alt](', 'img_url)', '설명')"><span class="material-symbols-rounded" style="font-size: 20px;">image</span></button>
                      </div>
                      <div style="display: flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; font-weight: 800;">
                        <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" style="vertical-align: middle;"><path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.7c0 .63.52 1.15 1.15 1.15h13.7c.63 0 1.15-.52 1.15-1.15v-7.7C16 3.52(15.48 3 14.85 3zM9 11H7V5L4.5 7.5 2 5v6H0V4h2l2.5 2.5L7 4h2v7zm7 0h-2V7h-2l3-3 3 3h-2v4z"/></svg>
                        Markdown 지원
                      </div>
                    </div>
                    <textarea id="story-content" data-content-editor class="field text-area" style="border: 0 !important; border-radius: 0 !important; box-shadow: none !important; min-height: 300px; padding: 20px;" v-model="content"></textarea>
                  </div>
                </div>

                <div class="form-group" style="display: grid; gap: 10px;">
                  <label style="font-weight: 800; font-size: 15px; color: var(--ink);">커버 및 갤러리</label>
                  <div class="upload-grid" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
                    <!-- Upload trigger -->
                    <label for="photo-upload-input" class="upload-box" style="height: 120px; min-height: 0; border-radius: 16px; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; color: var(--muted);">
                      <span class="material-symbols-rounded" style="font-size: 28px; margin-bottom: 4px;">add_photo_alternate</span>
                      <span class="small" style="font-weight: 750;">사진 추가</span>
                    </label>
                    <!-- Uploaded photo cards -->
                    <div
                      v-for="(photo, idx) in photoPreviews"
                      :key="idx"
                      style="position: relative; height: 120px; border-radius: 16px; overflow: hidden; box-shadow: var(--soft-shadow); cursor: pointer;"
                      @click="setRepresentative(idx)"
                    >
                      <img :src="photo.url" :alt="`업로드한 여행 사진 ${idx + 1}`" style="width: 100%; height: 100%; object-fit: cover;" />
                      <div v-if="representativePhoto === photo.url" style="position: absolute; top: 8px; left: 8px; padding: 4px 8px; background: var(--violet); color: #fff; border-radius: 8px; font-size: 10px; font-weight: 900; z-index: 2;">대표</div>
                      <button type="button" style="position: absolute; top: 8px; right: 8px; width: 24px; height: 24px; border-radius: 999px; border: 0; background: rgba(0,0,0,0.5); color: #fff; display: grid; place-items: center; cursor: pointer; transition: background 0.2s; z-index: 3;" @click.stop="removePhoto(idx)">
                        <span class="material-symbols-rounded" style="font-size: 14px;">close</span>
                      </button>
                    </div>
                  </div>
                </div>
              </form>
            </div>

            <!-- Preview panel container centered vertically and horizontally -->
            <aside class="write-preview-sidebar" style="height: 100%; display: flex; flex-direction: column;">
              <div style="position: sticky; top: 112px; display: flex; flex-direction: column; gap: 20px; height: 100%; min-height: 720px; justify-content: center; align-items: center;">
                <h3 style="font-size: 16px; color: var(--muted); margin: 0; font-weight: 800; align-self: flex-start; flex-shrink: 0;">작성 미리보기</h3>

                <!-- Wrapper matching exact feed card dimensions (496px width, 650px height) -->
                <div style="width: 496px; height: 650px; flex-shrink: 0; display: flex; justify-content: center; align-items: center;">

                  <!-- Preview card inherits styles.css rules (width: 100%, height: 100%) -->
                  <div class="story-post" style="border: 1px solid rgba(227, 231, 244, 0.6); margin: 0;">

                    <!-- Unified feed story post header format -->
                    <div class="story-post-head" style="padding:16px 20px; flex-direction:column; align-items:flex-start; gap:12px; flex-shrink: 0; display: flex;">
                      <div style="display:flex; align-items:center; justify-content:space-between; width:100%">
                        <div class="story-author" style="display:flex; align-items:center; gap:12px;">
                          <span class="avatar" style="width:40px; height:40px; background:var(--rose); font-weight: 800; color: #fff; font-size: 15px; display: flex; align-items: center; justify-content: center; border-radius: 50%;">나</span>
                          <div>
                            <strong style="font-size:15px; color: var(--ink); display: block;">나</strong>
                            <span class="small muted" style="display: block; font-size: 12px; margin-top: 2px;">{{ previewRegion }}</span>
                          </div>
                        </div>
                        <button type="button" class="btn ghost" style="border:0; padding:0; min-height:0; background: transparent; cursor: pointer; color: var(--muted); display: inline-flex; align-items: center; justify-content: center;"><span class="material-symbols-rounded">more_horiz</span></button>
                      </div>
                    </div>

                    <!-- Carousel frame -->
                    <div class="feed-photo-frame" v-if="addedPhotos.length > 0" style="position: relative; overflow: hidden; display: block;">
                      <button class="feed-photo-nav carousel-btn prev-btn prev" type="button" aria-label="이전 사진" :disabled="addedPhotos.length < 2" @click="carouselPrev"><span class="material-symbols-rounded">chevron_left</span></button>

                      <button class="feed-photo-open" type="button" aria-label="사진 확대">
                        <img alt="여행기 미리보기 사진" :src="addedPhotos[previewImageIndex]">
                      </button>

                      <button class="feed-photo-nav carousel-btn next-btn next" type="button" aria-label="다음 사진" :disabled="addedPhotos.length < 2" @click="carouselNext"><span class="material-symbols-rounded">chevron_right</span></button>
                      <span class="feed-photo-count">{{ previewImageIndex + 1 }} / {{ addedPhotos.length }}</span>
                    </div>

                    <!-- Story preview card body -->
                    <div class="story-body" style="padding: 22px 24px; display: flex; flex-direction: column; height: auto; flex: 1;">
                      <h3 style="font-size: 20px; line-height: 1.4; margin: 0 0 12px; font-weight: 850; color: var(--ink); flex-shrink: 0;">{{ previewTitle }}</h3>
                      <div class="story-preview-body-content" style="max-height: 180px; overflow-y: auto; margin-bottom: 16px;" v-html="previewHtml"></div>
                      <div class="tag-row" style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: auto; flex-shrink: 0;">
                        <span v-for="tag in previewTags" :key="tag" class="tag">{{ tag }}</span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
            </aside>
          </div>
        </div>
      </section>
    </main>
  </AppShell>
</template>

<style scoped>
/* Premium Glassmorphism Container */
.write-page .content-container {
  padding: 48px;
  background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(246, 249, 255, 0.85));
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  border: 1px solid rgba(227, 231, 244, 0.8);
  border-radius: 40px;
  box-shadow: 0 32px 64px rgba(0, 50, 150, 0.08), 0 8px 24px rgba(0, 102, 255, 0.04), inset 0 2px 4px rgba(255, 255, 255, 0.8);
}

/* Form Elements Tuning */
.write-form .field {
  border: 1.5px solid rgba(227, 234, 244, 0.9) !important;
  border-radius: 16px !important;
  background: #fff !important;
  font-size: 15px !important;
  font-weight: 600 !important;
  transition: all 0.25s ease !important;
  outline: none !important;
  box-shadow: none !important;
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
}
.write-form .field:focus {
  border-color: var(--violet) !important;
  box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.08) !important;
}
.write-form #story-title {
  font-size: 22px !important;
  font-weight: 800 !important;
  min-height: 60px !important;
  border-radius: 18px !important;
  padding: 0 24px !important;
}
.write-form #story-title::placeholder {
  color: var(--muted) !important;
  font-weight: 700 !important;
}

/* Font Uniformity for textarea */
textarea#story-content {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
  font-size: 15px !important;
  line-height: 1.8 !important;
}

/* Upload & Image Boxes */
.upload-box {
  border: 2px dashed rgba(124, 58, 237, 0.2) !important;
  background: rgba(248, 250, 255, 0.6) !important;
  transition: all 0.25s ease !important;
}
.upload-box:hover {
  border-color: var(--violet) !important;
  background: rgba(248, 250, 255, 0.95) !important;
  transform: translateY(-2px);
}

/* Layout definition overrides */
.write-layout {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 500px !important;
  gap: 48px !important;
}

@media (max-width: 1024px) {
  .write-layout {
    grid-template-columns: 1fr !important;
    gap: 40px !important;
  }
  .write-page .content-container {
    padding: 24px !important;
    border-radius: 24px !important;
  }
}

/* Toolbar buttons */
.editor-toolbar button {
  border-radius: 8px !important;
  transition: all 0.2s !important;
}
.editor-toolbar button:hover {
  background: rgba(124, 58, 237, 0.08) !important;
  color: var(--violet) !important;
}

/* Input icon placement alignment */
.form-group-icon-wrap {
  position: relative;
}
.form-group-icon-wrap .material-symbols-rounded {
  position: absolute;
  left: 16px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
  font-size: 20px;
}
.form-group-icon-wrap input {
  padding-left: 48px !important;
  width: 100%;
}

/* Auto-save / publishing alignment */
.detail-topline {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

/* Preview Markdown Styling */
.story-preview-body-content {
  font-size: 15px;
  line-height: 1.7;
  color: var(--muted);
  overflow-y: auto;
  scrollbar-width: thin;
}
.story-preview-body-content h1,
.story-preview-body-content h2,
.story-preview-body-content h3 {
  margin: 12px 0 6px 0;
  color: var(--ink);
  font-weight: 800;
}
.story-preview-body-content h1 { font-size: 18px; }
.story-preview-body-content h2 { font-size: 16px; }
.story-preview-body-content h3 { font-size: 14px; }
.story-preview-body-content p {
  margin: 0 0 10px 0;
}
.story-preview-body-content ul {
  margin: 0 0 10px 0;
  padding-left: 20px;
}
.story-preview-body-content li {
  margin-bottom: 4px;
}
.story-preview-body-content strong {
  color: var(--ink);
  font-weight: 800;
}
.story-preview-body-content em {
  font-style: italic;
}
</style>
