<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { mockCommunityStories } from '@/mocks/mockCommunity'
import { getProfileByAuthorName } from '@/mocks/mockUser'
import type { Story } from '@/types/community'
import AppShell from '@/components/layout/AppShell.vue'
import StoryWriteModal from '@/components/community/StoryWriteModal.vue'
import { useModal } from '@/composables/useModal'

const router = useRouter()

const searchQuery = ref('')
const currentPage = ref(1)
const selectedStory = ref<Story | null>(null)
const storyWriteModal = useModal()

function openUserProfile(authorName: string) {
  const profile = getProfileByAuthorName(authorName)
  if (profile) router.push(`/mypage/${profile.id}`)
}

const PER_PAGE = 6

const filteredStories = computed(() => {
  if (!searchQuery.value) return mockCommunityStories
  const q = searchQuery.value.toLowerCase()
  return mockCommunityStories.filter(
    (s) =>
      s.title.toLowerCase().includes(q) ||
      s.author.toLowerCase().includes(q) ||
      s.tags.some((t) => t.toLowerCase().includes(q)),
  )
})

const popularStories = computed(() =>
  [...mockCommunityStories].sort((a, b) => b.likes - a.likes).slice(0, 3),
)

const popularIndex = ref(0)

const totalPages = computed(() => Math.ceil(filteredStories.value.length / PER_PAGE))

const pagedStories = computed(() => {
  const start = (currentPage.value - 1) * PER_PAGE
  return filteredStories.value.slice(start, start + PER_PAGE)
})

function openStory(story: Story) {
  selectedStory.value = story
}

function closeModal() {
  selectedStory.value = null
}

function goPage(page: number) {
  if (page < 1 || page > totalPages.value) return
  currentPage.value = page
}

function prevPopular() {
  popularIndex.value =
    (popularIndex.value - 1 + popularStories.value.length) % popularStories.value.length
}

function nextPopular() {
  popularIndex.value = (popularIndex.value + 1) % popularStories.value.length
}

const comments = [
  { id: 'c1', avatar: 'MJ', name: '민지', color: 'var(--rose)', time: '2분 전', text: '성심당 여행기 너무 좋아요! 저도 다음주에 대전 가는데 참고할게요 😊', featured: true, likes: 3 },
  { id: 'c2', avatar: 'SY', name: '서연', color: 'var(--blue)', time: '15분 전', text: '한밭수목원 장미가 정말 예쁘더라고요. 사진도 잘 나와요!', replyTo: { author: '현서', text: '저도 주말 오전에 갔는데 사람 적어서 산책하기 좋았어요.' }, likes: 7 },
  { id: 'c3', avatar: 'DW', name: '동우', color: 'var(--cyan)', time: '32분 전', text: '빵지순례 코스 추천 감사합니다! 튀소가 진짜 맛있었어요 🍞', likes: 12 },
  { id: 'c4', avatar: 'JH', name: '지훈', color: 'var(--violet)', time: '1시간 전', text: '대전 중앙시장 야시장도 꼭 가보세요. 분위기 최고입니다!', likes: 5 },
  { id: 'c5', avatar: 'HS', name: '현서', color: 'var(--rose)', time: '2시간 전', text: '은행동 카페거리 사진 보니까 바로 가고 싶어졌어요 ☕', likes: 2 },
]

const overlayComment = ref('')
const reportModal = ref(false)
const reportReason = ref('')
const reportDetail = ref('')
const reportReasons = [
  { value: 'spam', label: '스팸 또는 광고' },
  { value: 'inappropriate', label: '부적절한 콘텐츠' },
  { value: 'misinformation', label: '허위/오해의 소지가 있는 정보' },
  { value: 'copyright', label: '저작권 침해' },
  { value: 'harassment', label: '괴롭힘 또는 혐오 발언' },
  { value: 'other', label: '기타' },
]

function openReport() {
  reportReason.value = ''
  reportDetail.value = ''
  reportModal.value = true
}
const scrollGuideVisible = ref(true)
const visibleStoryIdx = ref(0)

const visibleStory = computed(() => mockCommunityStories[visibleStoryIdx.value] || mockCommunityStories[0])

function onFeedScroll(e: Event) {
  const el = e.target as HTMLElement
  if (scrollGuideVisible.value && el.scrollTop > 30) {
    scrollGuideVisible.value = false
  }
  // Determine which story is visible based on scroll position
  const articles = el.querySelectorAll('.story-post')
  const centerY = el.scrollTop + el.clientHeight / 2
  articles.forEach((article, idx) => {
    const top = (article as HTMLElement).offsetTop
    const bottom = top + (article as HTMLElement).offsetHeight
    if (centerY >= top && centerY < bottom) {
      visibleStoryIdx.value = idx
    }
  })
}
</script>

<template>
  <AppShell>
    <main>
      <section class="section community-page">
        <div
          class="section-title community-hero-header"
          style="margin-bottom: 48px; display: flex; justify-content: space-between; align-items: flex-end; gap: 24px;"
        >
          <div>
            <p class="eyebrow">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle">explore</span>
              Trip Community
            </p>
            <h1 style="max-width: 100%; word-break: keep-all; font-size: clamp(36px, 4vw, 56px); margin-bottom: 18px;">
              <span style="background: linear-gradient(135deg, var(--violet), var(--blue)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">여행의 기록</span>을 나누고,<br />
              새로운 루트를 발견하세요
            </h1>
            <p class="lead" style="max-width: 100%; word-break: keep-all; margin-top: 16px">
              전 세계 여행자들이 직접 다녀온 생생한 여행기와 검증된 루트를 탐색할 수 있습니다.
            </p>
          </div>
        </div>

        <div class="community-content-container" style="background: linear-gradient(145deg, rgba(255, 255, 255, 0.95), rgba(246, 249, 255, 0.85)); backdrop-filter: blur(24px); border: 1px solid rgba(227, 231, 244, 0.8); border-radius: 40px; box-shadow: 0 32px 64px rgba(0, 50, 150, 0.08), 0 8px 24px rgba(0, 102, 255, 0.04), inset 0 2px 4px rgba(255, 255, 255, 0.8);">

          <!-- 인기 여행기 (Popular Travelogues) Carousel Section -->
          <section class="popular-stories-section" style="margin-bottom: 56px; border-bottom: 1px solid var(--line); padding-bottom: 56px;">
            <div class="popular-story-column" style="width: 100%; height: 560px; position: relative;">
              <div class="popular-story-card-wrapper" style="height: 100%;">
                <a
                  v-if="popularStories[popularIndex]"
                  class="popular-feature-story"
                  href="#"
                  style="height: 100%; text-decoration: none; display: block; background: #f0f0f0; border-radius: 24px; overflow: hidden; position: relative;"
                  @click.prevent="openStory(popularStories[popularIndex])"
                >
                  <img :src="popularStories[popularIndex].image" :alt="popularStories[popularIndex].title" style="width: 100%; height: 100%; object-fit: cover;" />
                  <div style="padding:24px; position:absolute; bottom:0; left:0; right:0; background: linear-gradient(transparent, rgba(0,0,0,0.65)); color:#fff;">
                    <div class="popular-story-badges">
                      <span class="popular-story-label"><span class="material-symbols-rounded">local_fire_department</span>인기 게시물</span>
                      <span class="post-type story" style="background:var(--rose)">TOP STORY</span>
                    </div>
                    <h3 style="font-size:24px; margin-bottom:8px; color:#fff;">{{ popularStories[popularIndex].title }}</h3>
                    <p style="opacity:0.9; margin:0;">{{ popularStories[popularIndex].author }} · 좋아요 {{ popularStories[popularIndex].likes }} · 댓글 {{ popularStories[popularIndex].comments }}</p>
                  </div>
                </a>
                <div class="story-carousel-controls" style="position: absolute; top: 50%; left: -22px; right: -22px; transform: translateY(-50%); display: flex; justify-content: space-between; pointer-events: none; z-index: 5;">
                  <button class="carousel-btn prev-btn" type="button" aria-label="이전 여행기" style="pointer-events: auto; cursor: pointer;" @click="prevPopular">
                    <span class="material-symbols-rounded">chevron_left</span>
                  </button>
                  <button class="carousel-btn next-btn" type="button" aria-label="다음 여행기" style="pointer-events: auto; cursor: pointer;" @click="nextPopular">
                    <span class="material-symbols-rounded">chevron_right</span>
                  </button>
                </div>
              </div>
            </div>
          </section>

          <!-- 전체 여행기 (All Travelogue Posts) Grid Section -->
          <section class="all-stories-section">
            <div class="section-title compact-title" style="margin-bottom: 24px;">
              <div>
                <p class="eyebrow" style="color: var(--rose)">All Stories</p>
                <h2 style="font-size: 28px">
                  <span class="material-symbols-rounded" style="vertical-align: middle; color: var(--rose); margin-right: 6px">dynamic_feed</span>전체 여행기
                </h2>
              </div>
              <div class="community-story-actions">
                <button class="btn primary" style="border-radius: 999px; font-size: 14px; padding: 10px 20px; display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; white-space: nowrap;" @click="storyWriteModal.open">
                  <span class="material-symbols-rounded" style="font-size: 20px;">edit_note</span> 여행기 작성
                </button>
                <label class="search-box community-story-search">
                  <input v-model="searchQuery" type="search" placeholder="여행기 검색" aria-label="여행기 검색" />
                  <button class="search-box__button community-story-search-btn" type="button" aria-label="여행기 검색">
                    <span class="material-symbols-rounded" aria-hidden="true">search</span>
                  </button>
                </label>
              </div>
            </div>

            <div class="story-list-grid" data-stories-list>
              <a
                v-for="story in pagedStories"
                :key="story.id"
                class="story-list-card"
                href="#"
                @click.prevent="openStory(story)"
              >
                <img class="story-card-thumb" :alt="story.title" :src="story.image" />
                <div class="story-card-body">
                  <div style="display:flex; flex-wrap:wrap; gap:6px;">
                    <span v-for="tag in story.tags" :key="tag" style="font-size:12px; color:var(--violet); font-weight:700;">{{ tag }}</span>
                  </div>
                  <h3>{{ story.title }}</h3>
                  <p class="story-card-summary">{{ story.summary }}</p>
                  <p class="muted"><a href="#" style="color:var(--violet); font-weight:700; text-decoration:none;" @click.prevent.stop="openUserProfile(story.author)">{{ story.author }}</a> · 좋아요 {{ story.likes }} · 댓글 {{ story.comments }}</p>
                </div>
              </a>
            </div>

            <div class="pagination-container" id="stories-pagination">
              <button
                class="pagination-btn"
                :disabled="currentPage === 1"
                @click="goPage(currentPage - 1)"
              >
                <span class="material-symbols-rounded">chevron_left</span>
              </button>
              <button
                v-for="page in totalPages"
                :key="page"
                class="pagination-btn"
                :class="{ active: page === currentPage }"
                @click="goPage(page)"
              >
                {{ page }}
              </button>
              <button
                class="pagination-btn"
                :disabled="currentPage === totalPages"
                @click="goPage(currentPage + 1)"
              >
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </div>
          </section>
        </div>
      </section>
    </main>

    <!-- Story detail overlay -->
    <div
      v-if="selectedStory"
      class="story-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="여행기 상세"
    >
      <div class="story-overlay-backdrop" @click="closeModal"></div>
      <div class="story-overlay-panel">
        <button class="story-overlay-close" type="button" aria-label="닫기" @click="closeModal">
          <span class="material-symbols-rounded">close</span>
        </button>
        <div class="feed-layout" id="overlay-feed-layout">
          <section class="story-feed" aria-label="여행기 피드">
            <div class="section-title compact-title">
              <div>
                <p class="eyebrow" style="color: var(--rose)">Feed</p>
                <h2 style="font-size: 24px">
                  <span class="material-symbols-rounded" style="vertical-align: middle; color: var(--rose); margin-right: 6px">dynamic_feed</span>최신 여행 이야기
                </h2>
              </div>
            </div>

            <div class="story-feed-window" aria-label="스크롤 가능한 여행기 피드" id="overlay-feed-stories" @scroll="onFeedScroll">
              <article
                v-for="story in mockCommunityStories"
                :key="story.id"
                class="story-post"
                style="margin-bottom: 32px;"
              >
                <div class="story-post-head" style="padding:16px 20px; display:flex; flex-direction:column; align-items:flex-start; gap:12px">
                  <div style="display:flex; align-items:center; justify-content:space-between; width:100%">
                    <div class="story-author" style="display:flex; align-items:center; gap:10px; cursor:pointer;" @click="openUserProfile(story.author)">
                      <div class="fc-avatar" style="width:40px; height:40px; background:var(--violet)">{{ story.avatar }}</div>
                      <div>
                        <strong style="font-size:15px; color:var(--violet)">{{ story.author }}</strong>
                        <span class="small muted" style="display:block">{{ story.location }}</span>
                      </div>
                    </div>
                    <button type="button" class="story-report-btn" aria-label="게시글 신고" title="신고" @click.stop="openReport">
                      <span class="material-symbols-rounded">campaign</span>
                    </button>
                  </div>
                </div>
                <div style="overflow:hidden; display:block">
                  <img :alt="story.title" :src="story.image" style="width: 100%; transition: transform 0.5s ease;" />
                </div>
                <div class="story-body" style="padding:22px 24px">
                  <h3 style="font-size:20px; line-height:1.4; margin:0 0 12px">{{ story.title }}</h3>
                  <p class="muted" style="font-size:15px; line-height:1.7; margin:0 0 16px">{{ story.summary }}</p>
                  <div class="tag-row" style="margin-bottom:12px">
                    <span v-for="tag in story.tags" :key="tag" class="tag">{{ tag }}</span>
                  </div>
                  <p style="font-size:14px; line-height:1.7; color:var(--muted)">{{ story.content }}</p>
                  <div style="margin-top:16px; display:flex; align-items:center; gap:20px; color:var(--muted); font-size:14px;">
                    <span style="display:flex; align-items:center; gap:4px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--rose)">favorite</span> {{ story.likes }}</span>
                    <span style="display:flex; align-items:center; gap:4px;"><span class="material-symbols-rounded" style="font-size:20px; color:var(--violet)">chat_bubble</span> {{ story.comments }}</span>
                  </div>
                </div>
              </article>
            </div>

            <div v-show="scrollGuideVisible" class="feed-scroll-guide" data-scroll-guide>
              <div class="feed-scroll-guide-pill">
                <div class="swipe-track-container">
                  <div class="swipe-track-line"></div>
                  <div class="swipe-ripple"></div>
                  <span class="material-symbols-rounded animated-finger">swipe_up</span>
                </div>
                <span class="guide-text" style="font-weight: 800; font-size: 16px; letter-spacing: -0.02em;">위로 스와이프하여 탐색</span>
              </div>
            </div>
          </section>

          <aside class="feed-sidebar" aria-label="사이드바 정보 패널">
            <div class="widget-card feed-comment-widget">
              <div class="feed-comment-header">
                <h3>
                  <span class="material-symbols-rounded" style="font-size:20px; color:var(--violet)">forum</span>
                  댓글
                  <span class="comment-count-badge">{{ visibleStory.comments }}</span>
                </h3>
                <p class="muted" style="font-size:12px; margin:4px 0 0; line-height:1.4; display:flex; align-items:center; gap:8px;">
                  <span style="display:flex; align-items:center; gap:3px;"><span class="material-symbols-rounded" style="font-size:14px; color:var(--rose)">favorite</span> {{ visibleStory.likes }}</span>
                  <span>{{ visibleStory.title }}</span>
                </p>
              </div>

              <div class="feed-comment-scroll" id="overlay-comment-scroll">
                <div
                  v-for="comment in comments"
                  :key="comment.id"
                  class="fc-item"
                  :class="{ 'is-featured': comment.featured }"
                >
                  <div class="fc-avatar" :style="{ background: comment.color }">{{ comment.avatar }}</div>
                  <div class="fc-body">
                    <div class="fc-meta">
                      <div>
                        <span class="fc-name" style="cursor:pointer;" @click="openUserProfile(comment.name)">{{ comment.name }}</span>
                        <span v-if="comment.featured" class="fc-author-badge">인기</span>
                      </div>
                      <span class="fc-time">{{ comment.time }}</span>
                    </div>
                    <p class="fc-text">{{ comment.text }}</p>
                    <div v-if="comment.replyTo" class="fc-reply">
                      <strong>{{ comment.replyTo.author }}</strong> {{ comment.replyTo.text }}
                    </div>
                    <div class="fc-actions">
                      <button>
                        <span class="material-symbols-rounded">favorite</span><span>{{ comment.likes }}</span>
                      </button>
                      <button>
                        <span class="material-symbols-rounded">reply</span>답글
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div class="feed-comment-input-area">
                <div class="feed-comment-composer">
                  <div class="feed-comment-input-wrap">
                    <input v-model="overlayComment" type="text" placeholder="댓글을 남겨보세요..." />
                    <button class="comment-submit-btn" type="button" aria-label="댓글 등록">
                      <span class="material-symbols-rounded" style="font-size:16px">send</span>
                      <span class="submit-label">등록</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>

    <!-- Report Modal -->
    <div v-if="reportModal" class="story-overlay" role="dialog" aria-modal="true" aria-label="게시글 신고">
      <div class="story-overlay-backdrop" @click="reportModal = false"></div>
      <div class="story-overlay-panel" style="width: min(96vw, 520px); max-height: 92vh;">
        <button class="story-overlay-close" type="button" aria-label="닫기" @click="reportModal = false">
          <span class="material-symbols-rounded">close</span>
        </button>
        <div style="padding: 36px 32px; overflow-y: auto; max-height: calc(92vh - 20px);">
          <h2 style="font-size: 20px; font-weight: 850; color: var(--ink); margin: 0 0 8px; display: flex; align-items: center; gap: 8px;">
            <span class="material-symbols-rounded" style="font-size: 24px; color: var(--rose);">campaign</span>게시글 신고
          </h2>
          <p style="font-size: 13px; color: var(--muted); margin: 0 0 24px; line-height: 1.5;">신고 사유를 선택해주세요. 검토 후 조치됩니다.</p>

          <div style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 24px;">
            <label
              v-for="reason in reportReasons"
              :key="reason.value"
              class="report-reason-option"
              :class="{ active: reportReason === reason.value }"
            >
              <input type="radio" v-model="reportReason" :value="reason.value" style="accent-color: var(--violet); width: 16px; height: 16px;" />
              <span>{{ reason.label }}</span>
            </label>
          </div>

          <div style="margin-bottom: 28px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">상세 내용 (선택)</label>
            <textarea
              v-model="reportDetail"
              rows="4"
              placeholder="구체적인 사유를 적어주시면 더 빠르게 처리할 수 있습니다."
              style="width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 12px 16px; font-size: 14px; outline: none; resize: vertical; font-family: inherit; line-height: 1.6; box-sizing: border-box; transition: border-color 0.2s;"
              onfocus="this.style.borderColor='var(--violet)'"
              onblur="this.style.borderColor='var(--line)'"
            ></textarea>
          </div>

          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" style="padding: 12px 24px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 14px; font-weight: 700; cursor: pointer; color: var(--ink); transition: all 0.2s;" @click="reportModal = false">취소</button>
            <button
              type="button"
              :disabled="!reportReason"
              :style="{
                padding: '12px 28px',
                borderRadius: '999px',
                border: 'none',
                background: reportReason ? 'var(--rose)' : 'var(--line)',
                color: reportReason ? '#fff' : 'var(--muted)',
                fontSize: '14px',
                fontWeight: 800,
                cursor: reportReason ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s',
                boxShadow: reportReason ? '0 6px 18px rgba(255, 92, 141, 0.3)' : 'none',
              }"
              @click="reportModal = false"
            >
              신고하기
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Story write modal -->
    <StoryWriteModal v-if="storyWriteModal.isOpen.value" @close="storyWriteModal.close()" />
  </AppShell>
</template>

<style scoped>
.community-content-container {
  padding: 48px;
}
@media (max-width: 1024px) {
  .section-title.compact-title {
    flex-direction: column !important;
    align-items: flex-start !important;
    gap: 16px;
  }
  .community-story-actions {
    width: 100%;
  }
  .community-story-search {
    flex: 1;
    width: unset;
    max-width: 320px;
  }
  .story-overlay-panel .feed-layout {
    grid-template-columns: 1fr;
    padding: 24px;
  }
  .story-list-grid {
    grid-template-columns: 1fr !important;
  }
  .story-list-card .story-card-thumb {
    width: 220px;
    min-width: 220px;
  }
}
@media (max-width: 768px) {
  .community-content-container {
    padding: 24px 16px;
    border-radius: 28px !important;
  }
  .story-list-card {
    flex-direction: column !important;
  }
  .story-list-card .story-card-thumb {
    width: 100%;
    min-width: unset;
    height: 180px !important;
    min-height: unset;
    border-radius: 22px 22px 0 0;
  }
}
@media (max-width: 480px) {
  .community-story-actions {
    gap: 8px;
  }
  .community-story-search {
    flex: 1 1 0;
    width: auto;
    min-width: 0;
    max-width: none;
  }
  .community-story-actions .btn {
    justify-content: center;
    flex: 0 0 auto;
    padding-inline: 14px !important;
  }
}
.story-list-card {
  display: flex !important;
  flex-direction: row !important;
  min-height: 200px;
  text-decoration: none;
  color: inherit;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid var(--line);
  background: #fff;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}
.story-list-card:hover {
  transform: translateY(-4px);
  box-shadow: var(--shadow);
}
.story-list-card .story-card-thumb {
  width: 260px;
  min-width: 260px;
  height: auto !important;
  min-height: 200px;
  object-fit: cover;
  display: block;
  border-radius: 22px 0 0 22px;
}
.story-list-card .story-card-body {
  flex: 1;
  display: flex !important;
  flex-direction: column;
  justify-content: center;
  padding: 24px !important;
  gap: 10px !important;
}
.story-list-card .story-card-body h3 {
  font-size: 17px !important;
  min-height: unset !important;
  -webkit-line-clamp: 2;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
  font-weight: 800;
  color: var(--ink);
}
.story-list-card .story-card-body .story-card-summary {
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin: 0;
}
.pagination-container {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-top: 40px;
  align-items: center;
}
.pagination-btn {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--text);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}
.pagination-btn:hover {
  border-color: var(--violet);
  background: var(--surface-2);
  color: var(--violet);
}
.pagination-btn.active {
  background: var(--violet);
  border-color: var(--violet);
  color: #fff;
}
.pagination-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.community-story-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  width: auto;
  min-width: 0;
  max-width: 100%;
  flex: 0 0 auto;
}
.community-story-search {
  flex: 1 1 0;
  min-width: 0;
  max-width: 320px;
}

/* Story overlay */
.story-overlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.story-overlay-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
}
.story-overlay-panel {
  position: relative;
  width: min(98vw, 1200px);
  max-height: 94vh;
  background: #fff;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 32px 64px rgba(0, 50, 150, 0.15);
  z-index: 1;
}
.story-overlay-panel .feed-layout {
  border-radius: 0;
  border: none;
  box-shadow: none;
  padding: 40px;
}
.story-overlay-close {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  transition: background 0.2s, box-shadow 0.2s;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}
.story-overlay-close:hover {
  background: var(--surface-2);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
}
.story-overlay .story-post {
  border: 1px solid var(--line);
  border-radius: 18px;
  overflow: hidden;
  background: #fff;
}
.story-overlay .story-feed-window {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
  max-height: calc(94vh - 160px);
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 102, 255, 0.18) transparent;
}
.story-overlay .story-feed-window::-webkit-scrollbar { width: 6px; }
.story-overlay .story-feed-window::-webkit-scrollbar-track { background: transparent; }
.story-overlay .story-feed-window::-webkit-scrollbar-thumb { background: rgba(0, 102, 255, 0.16); border-radius: 10px; }
.story-overlay .feed-sidebar {
  --feed-panel-offset: 82px;
  --feed-list-height: min(760px, calc(100vh - 190px));
  height: var(--feed-list-height);
  min-height: 650px;
  padding-top: var(--feed-panel-offset);
}

/* Comment styles */
.feed-comment-header {
  padding: 18px 20px 14px;
  background: #f8fbff;
  border-bottom: 1px solid var(--line);
}
.feed-comment-header h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 800;
  margin: 0;
  color: var(--ink);
}
.feed-comment-header .comment-count-badge {
  display: inline-grid;
  place-items: center;
  min-width: 26px;
  height: 22px;
  background: linear-gradient(135deg, var(--violet), var(--rose));
  color: #fff;
  font-size: 11px;
  font-weight: 800;
  padding: 0 8px;
  border-radius: 999px;
  box-shadow: 0 8px 18px rgba(255, 92, 141, 0.2);
}
.feed-comment-input-area {
  padding: 14px 16px;
  border-top: 1px solid var(--line);
  background: #ffffff;
}
.feed-comment-composer {
  display: block;
}
.feed-comment-input-wrap {
  position: relative;
}
.feed-comment-input-area input {
  width: 100%;
  min-height: 42px;
  border: 1px solid rgba(227, 234, 244, 0.95);
  border-radius: 999px;
  padding: 11px 52px 11px 14px;
  font-size: 13px;
  outline: none;
  transition: all 0.25s ease;
  background: #fff;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
.feed-comment-input-area input:focus {
  border-color: var(--violet);
  box-shadow: 0 0 0 4px rgba(0, 102, 255, 0.08);
}
.feed-comment-input-area .comment-submit-btn {
  position: absolute;
  top: 50%;
  right: 5px;
  transform: translateY(-50%);
  width: 34px;
  height: 34px;
  min-height: 34px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  border: none;
  border-radius: 50%;
  padding: 0;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}
.feed-comment-input-area .comment-submit-btn .submit-label {
  display: none;
}
.feed-comment-input-area .comment-submit-btn:hover {
  transform: translateY(-50%) scale(1.04);
  box-shadow: 0 8px 18px rgba(0, 102, 255, 0.2);
}
.feed-comment-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  background: #fbfdff;
  scrollbar-width: thin;
  scrollbar-color: rgba(0, 102, 255, 0.18) transparent;
}
.feed-comment-scroll::-webkit-scrollbar { width: 5px; }
.feed-comment-scroll::-webkit-scrollbar-track { background: transparent; }
.feed-comment-scroll::-webkit-scrollbar-thumb { background: rgba(0, 102, 255, 0.16); border-radius: 10px; }
.feed-comment-scroll::-webkit-scrollbar-thumb:hover { background: rgba(0, 102, 255, 0.3); }
.fc-item {
  display: flex;
  gap: 10px;
  padding: 12px;
  border: 1px solid rgba(227, 234, 244, 0.8);
  border-radius: 14px;
  background: #ffffff;
  box-shadow: 0 4px 12px rgba(0, 102, 255, 0.03);
  transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}
.fc-item + .fc-item { margin-top: 10px; }
.fc-item:hover {
  border-color: rgba(0, 102, 255, 0.18);
  box-shadow: 0 6px 16px rgba(0, 102, 255, 0.06);
}
.fc-item.is-featured {
  border-color: rgba(255, 92, 141, 0.18);
  background: #fff8fb;
}
.fc-avatar {
  width: 34px; height: 34px; min-width: 34px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 900; color: #fff;
  border: 2px solid #fff;
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.08);
}
.fc-body { flex: 1; min-width: 0; }
.fc-meta {
  display: flex; justify-content: space-between; align-items: center;
  gap: 8px; margin-bottom: 6px;
}
.fc-name { font-size: 13px; font-weight: 850; color: var(--ink); }
.fc-author-badge {
  display: inline-flex; align-items: center; min-height: 16px;
  margin-left: 5px; padding: 0 6px; border-radius: 999px;
  color: var(--rose); background: rgba(255, 92, 141, 0.1);
  font-size: 10px; font-weight: 900;
}
.fc-time { font-size: 11px; color: var(--muted); white-space: nowrap; }
.fc-text { margin: 0; font-size: 13px; line-height: 1.6; color: #3f4658; word-break: break-word; }
.fc-actions { display: flex; gap: 8px; margin-top: 8px; }
.fc-actions button {
  min-height: 24px; background: #fff; border: 1px solid var(--line);
  border-radius: 999px; padding: 0 8px; font-size: 11px;
  color: var(--muted); cursor: pointer; display: flex;
  align-items: center; gap: 3px; font-weight: 800; transition: all 0.2s;
}
.fc-actions button:hover {
  color: var(--violet); border-color: rgba(0, 102, 255, 0.18);
  background: var(--surface-2);
}
.fc-actions button .material-symbols-rounded { font-size: 14px; }
.fc-reply {
  margin-top: 10px;
  padding: 10px 12px;
  border-left: 3px solid rgba(0, 102, 255, 0.18);
  border-radius: 0 12px 12px 0;
  background: rgba(235, 244, 255, 0.62);
  color: #4b5570;
  font-size: 12px;
  line-height: 1.55;
}
.fc-reply strong {
  color: var(--violet);
  font-weight: 900;
}

/* Popular story badges */
.popular-story-badges {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}
.popular-story-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  font-weight: 800;
  color: #fff;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  padding: 4px 10px;
  border-radius: 999px;
}
.popular-story-label .material-symbols-rounded {
  font-size: 16px;
  color: var(--yellow, #ffc857);
}

/* Story report button */
.story-report-btn {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
  flex-shrink: 0;
}
.story-report-btn:hover {
  background: rgba(255, 92, 141, 0.08);
  color: var(--rose);
}
.story-report-btn .material-symbols-rounded {
  font-size: 20px;
}

/* Report reason options */
.report-reason-option {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  border-radius: 12px;
  border: 1px solid var(--line);
  background: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  transition: all 0.2s ease;
}
.report-reason-option:hover {
  border-color: rgba(0, 102, 255, 0.25);
  background: rgba(0, 102, 255, 0.02);
}
.report-reason-option.active {
  border-color: var(--violet);
  background: rgba(0, 102, 255, 0.04);
  color: var(--violet);
}
</style>
