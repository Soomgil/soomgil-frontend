<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

interface Story {
  id: string; title: string; summary: string; image: string; author: string
  authorProfileImageUrl: string | null; avatar: string; likes: number; comments: number
}
const props = defineProps<{ stories: Story[]; fallbackImage: string }>()
const emit = defineEmits<{ open: [id: string] }>()
const index = ref(0)
const playing = ref(false)
const hovered = ref(false)
const failedImages = ref(new Set<string>())
const story = computed(() => props.stories[index.value])
let timer: ReturnType<typeof setInterval> | undefined
function move(direction: number) {
  if (!props.stories.length) return
  index.value = (index.value + direction + props.stories.length) % props.stories.length
}
function navigate(direction: number) { playing.value = false; move(direction) }
watch(() => props.stories.map(item => item.id).join(','), () => { index.value = 0 })
onMounted(() => {
  playing.value = !(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false)
  timer = setInterval(() => {
    if (playing.value && !hovered.value && !document.hidden && props.stories.length > 1) move(1)
  }, 6000)
})
onBeforeUnmount(() => clearInterval(timer))
</script>

<template>
  <div v-if="story" class="popular-carousel" role="region" aria-roledescription="캐러셀" aria-label="인기 여행기" @mouseenter="hovered = true" @mouseleave="hovered = false" @focusin="playing = false">
    <Transition name="popular-slide" mode="out-in">
    <div :key="story.id" class="featured-story" :aria-live="playing ? 'off' : 'polite'" aria-atomic="true">
      <button class="featured-polaroid" type="button" :aria-label="`${story.title} 여행기 보기`" @click="emit('open', story.id)">
        <div :key="story.id" class="featured-photo">
          <img v-if="story.image !== fallbackImage && !failedImages.has(story.image)" :src="story.image" :alt="story.title" @error="failedImages.add(story.image)" />
          <span v-else class="material-symbols-rounded" aria-hidden="true">auto_stories</span>
        </div>
        <span class="photo-caption">{{ story.author }}의 여행 한 장</span>
      </button>
      <div class="featured-copy">
        <div class="popular-heading">
          <p class="featured-label">POPULAR STORIES</p>
          <h2 id="popular-stories-title">여행자들이 좋아한 이야기</h2>
        </div>
        <h3>{{ story.title }}</h3>
        <p class="featured-summary">{{ story.summary || '사진 속 여행의 순간을 만나보세요.' }}</p>
        <div class="featured-author"><span class="author-avatar"><img v-if="story.authorProfileImageUrl" :src="story.authorProfileImageUrl" alt="" /><span v-else>{{ story.avatar }}</span></span>{{ story.author }}</div>
        <div class="featured-stats"><span><span class="material-symbols-rounded" aria-hidden="true">favorite</span>좋아요 {{ story.likes }}</span><span><span class="material-symbols-rounded" aria-hidden="true">chat_bubble</span>댓글 {{ story.comments }}</span></div>
        <button class="read-story" type="button" @click="emit('open', story.id)">여행기 읽기 <span aria-hidden="true">↗</span></button>
      </div>
    </div>
    </Transition>
    <div class="carousel-controls">
      <span class="slide-count" aria-label="현재 게시물">{{ String(index + 1).padStart(2, '0') }} <span>/ {{ String(stories.length).padStart(2, '0') }}</span></span>
      <button type="button" aria-label="이전 인기 게시물" :disabled="stories.length < 2" @click="navigate(-1)"><span class="material-symbols-rounded" aria-hidden="true">arrow_back</span></button>
      <button type="button" aria-label="다음 인기 게시물" :disabled="stories.length < 2" @click="navigate(1)"><span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span></button>
      <button v-if="stories.length > 1" type="button" :aria-label="playing ? '자동재생 일시정지' : '자동재생 시작'" @mousedown.prevent @click="playing = !playing"><span class="material-symbols-rounded" aria-hidden="true">{{ playing ? 'pause' : 'play_arrow' }}</span></button>
    </div>
  </div>
</template>

<style scoped>
.popular-carousel { padding: 28px 32px 20px; background: linear-gradient(135deg,#f5faff,#fff 75%); border: 1px solid #e6eff7; border-radius: 24px; }
.featured-story { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,1fr); align-items: center; gap: 60px; max-width: 960px; margin: auto; }
.featured-polaroid { width: 100%; padding: 12px 12px 20px; background: white; border: 1px solid #e9eff5; box-shadow: 0 10px 28px #33597d14; transform: rotate(-2deg); cursor: pointer; color: #506880; }
.featured-photo { aspect-ratio: 4/3; overflow: hidden; background: #eaf4ff; display: grid; place-items: center; animation: photo-arrive .35s ease-out; }
.featured-photo img { width: 100%; height: 100%; object-fit: cover; }
.featured-photo > span { font-size: 56px; color: #8aaac7; }
.photo-caption { display: block; padding-top: 18px; font-size: 14px; }
.featured-label { margin: 0 0 4px; color: #647c92; font-size: 11px; letter-spacing: .14em; font-weight: 700; }
.popular-heading h2 { margin: 0; color: #427ead; font-family: 'Noto Serif KR',Batang,serif; font-size: 26px; font-weight: 500; line-height: 1.45; letter-spacing: -.02em; }
.featured-copy h3 { font-family: 'Noto Serif KR',serif; font-size: clamp(24px,2.6vw,34px); line-height: 1.5; color: #35465a; margin: 14px 0; overflow-wrap: anywhere; }
.featured-summary { color: #647c92; font-size: 15px; line-height: 1.85; white-space: pre-line; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; min-height: 3.7em; }
.featured-author { display: flex; align-items: center; gap: 9px; margin-top: 22px; color: #506880; font-size: 13px; }
.author-avatar { width: 30px; height: 30px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: #eaf4ff; }
.author-avatar img { width: 100%; height: 100%; object-fit: cover; }
.featured-stats,.featured-stats > span { display: flex; align-items: center; gap: 6px; }
.featured-stats { gap: 16px; margin-top: 14px; font-size: 12px; color: #71889c; }
.featured-stats .material-symbols-rounded { font-size: 16px; }
.read-story { display: inline-flex; gap: 24px; align-items: center; border: none; border-bottom: 1px solid #abcbe5; padding: 12px 0 8px; margin-top: 16px; color: #3579b0; background: transparent; font-weight: 700; cursor: pointer; }
.carousel-controls { display: flex; justify-content: flex-end; align-items: center; gap: 8px; margin-top: 26px; }
.slide-count { font-variant-numeric: tabular-nums; font-size: 13px; color: #35465a; margin-right: 12px; }.slide-count span { color: #8a9eb0; }
.carousel-controls button { width: 44px; height: 44px; display: grid; place-items: center; border: 1px solid #dce8f2; border-radius: 50%; background: white; color: #4e7da4; cursor: pointer; }
.carousel-controls button:hover { background: #eaf4ff; }.carousel-controls button:disabled { opacity: .4; cursor: default; }
button:focus-visible { outline: 3px solid #77b9ee; outline-offset: 5px; }
.popular-slide-enter-active,.popular-slide-leave-active { transition: opacity .38s ease, transform .38s cubic-bezier(.22,1,.36,1); }
.popular-slide-enter-from { opacity:0; transform:translateX(28px) scale(.985); }
.popular-slide-leave-to { opacity:0; transform:translateX(-28px) scale(.985); }
@keyframes photo-arrive { from { opacity: .3; } to { opacity: 1; } }
@media(max-width: 700px) { .popular-carousel { padding: 24px 20px 18px; }.featured-story { grid-template-columns: minmax(0,1fr); gap: 30px; }.featured-polaroid { max-width: 400px; margin: auto; }.featured-copy h3 { font-size: 25px; }.featured-summary { min-height: 0; }.carousel-controls { justify-content: center; } }
@media(prefers-reduced-motion: reduce) { .featured-photo { animation: none; }.popular-slide-enter-active,.popular-slide-leave-active { transition-duration:.01ms; } }
</style>
