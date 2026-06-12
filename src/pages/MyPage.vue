<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import '@/styles/mypage.css'
import AppShell from '@/components/layout/AppShell.vue'
import { mockUser, mockFollowers, mockFollowing } from '@/mocks/mockUser'
import type { FollowUser } from '@/mocks/mockUser'
import { mockPlaces } from '@/mocks/mockPlaces'
import { mockCommunityStories } from '@/mocks/mockCommunity'
import { useModal } from '@/composables/useModal'
import LikedPlacesModal from '@/components/mypage/LikedPlacesModal.vue'
import MyStoriesModal from '@/components/mypage/MyStoriesModal.vue'
import FollowListModal from '@/components/common/FollowListModal.vue'

const router = useRouter()

// Search for liked places
const placeSearchQuery = ref('')

const likedPlaces = computed(() => {
  if (!placeSearchQuery.value.trim()) return mockPlaces
  const q = placeSearchQuery.value.trim().toLowerCase()
  return mockPlaces.filter((p) =>
    p.placeName.toLowerCase().includes(q) ||
    (p.address ?? '').toLowerCase().includes(q) ||
    (p.tags ?? []).some(t => t.toLowerCase().includes(q))
  )
})

// My stories
const myStories = computed(() => mockCommunityStories.slice(0, 6))

// Places slider
const placesSliderRef = ref<HTMLElement | null>(null)
function scrollPlaces(direction: 'prev' | 'next') {
  if (!placesSliderRef.value) return
  const slider = placesSliderRef.value
  const card = slider.querySelector('.mypage-place-card--slider') as HTMLElement | null
  if (!card) return
  const cardWidth = card.offsetWidth + 18 // card width + gap
  slider.scrollBy({
    left: direction === 'next' ? cardWidth : -cardWidth,
    behavior: 'smooth',
  })
}

// Modals
const likedPlacesModal = useModal()
const myStoriesModal = useModal()
const followersModal = useModal()
const followingModal = useModal()

const followingIds = ref(new Set(mockFollowing.map(f => f.userId)))
const showDeletePreferenceConfirm = ref(false)
const profileEditModal = useModal()
const profileForm = ref({
  displayName: mockUser.displayName,
  intro: '여행의 즐거움을 찾아 떠나는 것을 좋아합니다. 자연과 카페, 문화공간을 사랑합니다.',
  visibility: 'public',
  emailNotifications: true,
  pushNotifications: true,
})

// Stats for profile card
const profileStats = [
  { icon: 'luggage', value: '12', label: '내 여행' },
  { icon: 'favorite', value: '248', label: '좋아요' },
  { icon: 'auto_stories', value: '8', label: '여행기' },
  { icon: 'group', value: String(mockFollowers.length), label: '팔로워' },
  { icon: 'person_add', value: String(mockFollowing.length), label: '팔로잉' },
]

function onStatClick(label: string) {
  if (label === '팔로워') followersModal.open()
  else if (label === '팔로잉') followingModal.open()
  else if (label === '좋아요') {
    document.getElementById('section-liked-places-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else if (label === '여행기') {
    document.getElementById('section-my-stories-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  } else if (label === '내 여행') {
    router.push('/my-trips')
  }
}
</script>

<template>
  <AppShell>
    <main>
      <section class="section mypage-shell" aria-labelledby="mypage-title">
        <div class="mypage-page-heading">
          <p class="eyebrow"><span class="material-symbols-rounded" aria-hidden="true">person</span> My Page</p>
          <h1 id="mypage-title"><span class="gradient-text">나의 여행 프로필</span></h1>
        </div>

        <!-- 프로필 히어로 영역 -->
        <div class="mypage-hero" data-mypage-hero>
          <div class="mypage-hero__content">
            <div class="mypage-profile-card">
              <!-- Avatar + Info -->
              <div class="profile-card-left-group">
                <div class="mypage-hero__avatar-container">
                  <span class="mypage-hero__avatar-ring">
                    <span
                      class="mypage-hero__avatar"
                      :style="{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: 'var(--violet)',
                        color: '#fff',
                        fontWeight: 800,
                        fontSize: '28px',
                      }"
                    >{{ mockUser.displayName.charAt(0) }}</span>
                  </span>
                  <span class="avatar-link-badge">
                    <span class="material-symbols-rounded">link</span>
                  </span>
                </div>
                <div class="profile-card-details">
                  <div class="mypage-hero__name-col">
                    <div class="mypage-hero__name-row">
                      <h2 class="mypage-hero__name">{{ mockUser.displayName }}</h2>
                      <span class="material-symbols-rounded verified-check-badge">verified</span>
                    </div>
                    <span class="mypage-hero__email">{{ mockUser.email }}</span>
                  </div>
                  <p class="mypage-hero__intro">여행의 즐거움을 찾아 떠나는 것을 좋아합니다. 자연과 카페, 문화공간을 사랑합니다.</p>
                  <ul class="mypage-hero__tags">
                    <li class="mypage-hero__tag">#호수</li>
                    <li class="mypage-hero__tag">#온천</li>
                    <li class="mypage-hero__tag">#산책</li>
                    <li class="mypage-hero__tag">#카페</li>
                    <li class="mypage-hero__tag">#전시</li>
                  </ul>
                </div>
              </div>

              <!-- Stats -->
              <div class="mypage-profile-minimal-stats">
                <div v-for="stat in profileStats" :key="stat.label" class="minimal-stat-item"
                  style="cursor: pointer;"
                  @click="onStatClick(stat.label)">
                  <span class="material-symbols-rounded minimal-stat-icon">{{ stat.icon }}</span>
                  <span class="minimal-stat-value">{{ stat.value }}</span>
                  <span class="minimal-stat-label">{{ stat.label }}</span>
                </div>
              </div>

              <!-- Actions -->
              <div class="mypage-profile-actions">
                <button type="button" class="mypage-profile-btn edit" @click="profileEditModal.open">
                  <span class="material-symbols-rounded">edit</span>프로필 수정
                </button>
                <button type="button" class="mypage-profile-btn share">
                  <span class="material-symbols-rounded">share</span>공유하기
                </button>
              </div>
            </div>
          </div>
        </div>

        <div class="mypage-glass-container">
          <!-- 개인 아카이브 콘텐츠 영역 -->
          <div class="mypage-body-container">

        <!-- 1. 좋아요한 장소 섹션 -->
        <section class="mypage-section" aria-labelledby="section-liked-places-title">
          <div class="mypage-section-header">
            <h2 id="section-liked-places-title" class="mypage-section-title">
              <span class="material-symbols-rounded section-icon section-icon--rose" aria-hidden="true">favorite</span>좋아요한 장소
            </h2>
            <div class="mypage-header-search-row">
              <div class="mypage-search-inline">
                <span class="material-symbols-rounded">search</span>
                <input type="search" v-model="placeSearchQuery" placeholder="장소명, 지역, 태그로 검색" />
              </div>
              <span class="mypage-search-count">{{ likedPlaces.length }}곳</span>
              <a href="#" class="mypage-more-link" @click.prevent="likedPlacesModal.open()">모두 보기 ›</a>
            </div>
          </div>

          <div class="mypage-section-content liked-places-layout">
            <div class="mypage-places-slider-wrapper">
              <button v-if="likedPlaces.length > 3" type="button" class="places-slider-btn prev" aria-label="이전 장소" @click="scrollPlaces('prev')">
                <span class="material-symbols-rounded">chevron_left</span>
              </button>
              <div class="mypage-places-slider" ref="placesSliderRef">
                <div v-for="place in likedPlaces" :key="place.externalPlaceId" class="mypage-place-card mypage-place-card--slider">
                  <div class="place-img-wrap">
                    <img :src="(place.thumbnailUrl ?? '')" :alt="place.placeName" />
                    <button type="button" class="place-heart-btn" aria-label="좋아요 취소">
                      <span class="material-symbols-rounded">favorite</span>
                    </button>
                  </div>
                  <div class="place-info-wrap">
                    <span class="place-region-category">{{ place.address }}</span>
                    <h3 class="place-title-h3">{{ place.placeName }}</h3>
                    <p class="place-desc-text">{{ place.summary }}</p>
                    <div class="place-tag-row">
                      <span v-for="tag in (place.tags ?? []).slice(0, 3)" :key="tag" class="place-tag-pill">#{{ tag }}</span>
                    </div>
                  </div>
                </div>
              </div>
              <button v-if="likedPlaces.length > 3" type="button" class="places-slider-btn next" aria-label="다음 장소" @click="scrollPlaces('next')">
                <span class="material-symbols-rounded">chevron_right</span>
              </button>
            </div>
          </div>
        </section>

        <!-- 2. 내 여행기 섹션 -->
        <section class="mypage-section" aria-labelledby="section-my-stories-title">
          <div class="mypage-section-header">
            <h2 id="section-my-stories-title" class="mypage-section-title">
              <span class="material-symbols-rounded section-icon section-icon--violet" aria-hidden="true">auto_stories</span>내 여행기
            </h2>
            <a href="#" class="mypage-more-link" @click.prevent="myStoriesModal.open()">모두 보기 ›</a>
          </div>

          <div class="mypage-stories-magazine" data-mypage-stories-list>
            <div v-for="story in myStories" :key="story.id" class="mypage-story-magazine-item">
              <img class="story-magazine-thumb" :src="story.image" :alt="story.title" />
              <div class="story-magazine-body">
                <h3 class="story-magazine-title">
                  <a href="#">{{ story.title }}</a>
                </h3>
                <div class="story-magazine-meta">
                  <span class="story-date">{{ story.location }}</span>
                  <div class="story-stats-row">
                    <span>
                      <span class="material-symbols-rounded">favorite</span> {{ story.likes }}
                    </span>
                    <span>
                      <span class="material-symbols-rounded">chat_bubble</span> {{ story.comments }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- 4. 하단 분석 통계 위젯 영역 (내 여행 지도 & 여행 취향) -->
        <section class="mypage-insights-section" aria-labelledby="section-insights-title">
          <div class="mypage-insights-grid">
            <!-- 좌측: 내 여행 지도 -->
            <article class="insight-card map-insight-card">
              <div class="insight-card-header">
                <h3 id="section-insights-title">내 여행 지도</h3>
                <p class="insight-subtitle">방문한 지역 <strong>18곳</strong> <span class="divider">|</span> 국내 여행 15</p>
              </div>
              <div class="map-insight-content">
                <div class="korea-map-container" data-map-visual>
                  <!-- SVG 한국 지도 그래픽 placeholder -->
                  <span class="material-symbols-rounded" style="font-size:80px; color:var(--muted); opacity:0.3;">public</span>
                </div>
                <div class="map-stats-panel">
                  <ol class="map-stats-list">
                    <li><span class="rank-num">1</span> <span class="rank-city">대전</span> <span class="rank-count">6회</span></li>
                    <li><span class="rank-num">2</span> <span class="rank-city">부산</span> <span class="rank-count">3회</span></li>
                    <li><span class="rank-num">3</span> <span class="rank-city">제주</span> <span class="rank-count">2회</span></li>
                    <li><span class="rank-num">4</span> <span class="rank-city">서울</span> <span class="rank-count">2회</span></li>
                    <li><span class="rank-num">5</span> <span class="rank-city">울릉</span> <span class="rank-count">1회</span></li>
                  </ol>
                  <button type="button" class="btn-more-map">지도로 더 보기</button>
                </div>
              </div>
            </article>

            <!-- 우측: 여행 취향 -->
            <article class="insight-card preference-insight-card">
              <div class="insight-card-header" style="display:flex; align-items:flex-start; justify-content:space-between;">
                <div>
                  <h3>여행 취향</h3>
                  <p class="insight-subtitle">데이터 기반 나의 여행 스타일</p>
                </div>
                <button type="button" class="preference-delete-btn" @click="showDeletePreferenceConfirm = true">
                  <span class="material-symbols-rounded">restart_alt</span>초기화
                </button>
              </div>
              <div class="preference-insight-content">
                <div class="preference-charts-row">
                  <div class="preference-chart-item">
                    <div class="circular-progress-bar" style="--percent: 42%; --color: var(--violet)">
                      <div class="progress-inner">42%</div>
                    </div>
                    <span class="preference-label-badge nature">자연</span>
                  </div>
                  <div class="preference-chart-item">
                    <div class="circular-progress-bar" style="--percent: 28%; --color: var(--yellow)">
                      <div class="progress-inner">28%</div>
                    </div>
                    <span class="preference-label-badge cafe">카페</span>
                  </div>
                  <div class="preference-chart-item">
                    <div class="circular-progress-bar" style="--percent: 18%; --color: var(--blue)">
                      <div class="progress-inner">18%</div>
                    </div>
                    <span class="preference-label-badge city">도시</span>
                  </div>
                  <div class="preference-chart-item">
                    <div class="circular-progress-bar" style="--percent: 12%; --color: var(--rose)">
                      <div class="progress-inner">12%</div>
                    </div>
                    <span class="preference-label-badge culture">문화</span>
                  </div>
                </div>

                <div class="preference-keywords-row">
                  <span class="preference-keyword-pill">#호수</span>
                  <span class="preference-keyword-pill">#온천</span>
                  <span class="preference-keyword-pill">#산책</span>
                  <span class="preference-keyword-pill">#카페</span>
                  <span class="preference-keyword-pill">#전시</span>
                </div>

                <!-- 파스텔톤 여행 밴 일러스트 영역 -->
                <div class="van-illustration-wrap">
                  <!-- SVG 또는 정교한 CSS 일러스트레이션 -->
                </div>
              </div>
            </article>
          </div>
        </section>

          </div>
        </div>
      </section>
    </main>

    <!-- Modals -->
    <LikedPlacesModal v-if="likedPlacesModal.isOpen.value" :places="mockPlaces" @close="likedPlacesModal.close()" />
    <MyStoriesModal v-if="myStoriesModal.isOpen.value" :stories="mockCommunityStories" @close="myStoriesModal.close()" />
    <FollowListModal v-if="followersModal.isOpen.value" title="팔로워" :users="mockFollowers" :followingIds="followingIds" @close="followersModal.close()" />
    <FollowListModal v-if="followingModal.isOpen.value" title="팔로잉" :users="mockFollowing" :followingIds="followingIds" @close="followingModal.close()" />

    <!-- 프로필 수정 모달 -->
    <div v-if="profileEditModal.isOpen.value" class="story-overlay" role="dialog" aria-modal="true" aria-label="프로필 수정">
      <div class="story-overlay-backdrop" @click="profileEditModal.close()"></div>
      <div class="story-overlay-panel" style="width: min(96vw, 580px); max-height: 92vh;">
        <button class="story-overlay-close" type="button" aria-label="닫기" @click="profileEditModal.close()">
          <span class="material-symbols-rounded">close</span>
        </button>
        <div style="padding: 40px 32px; overflow-y: auto; max-height: calc(92vh - 20px);">
          <h2 style="font-size: 22px; font-weight: 850; color: var(--ink); margin: 0 0 28px; display: flex; align-items: center; gap: 10px;">
            <span class="material-symbols-rounded" style="font-size: 26px; color: var(--violet);">person_edit</span>프로필 수정
          </h2>

          <!-- 아바타 변경 -->
          <div style="display: flex; align-items: center; gap: 16px; margin-bottom: 28px;">
            <div style="width: 72px; height: 72px; border-radius: 50%; background: var(--violet); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 28px; font-weight: 800; flex-shrink: 0;">{{ mockUser.displayName.charAt(0) }}</div>
            <div>
              <button type="button" style="padding: 8px 16px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 13px; font-weight: 700; cursor: pointer; color: var(--ink); transition: all 0.2s;">
                <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">photo_camera</span>사진 변경
              </button>
            </div>
          </div>

          <!-- 이름 -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">이름</label>
            <input v-model="profileForm.displayName" type="text" style="width: 100%; height: 44px; border: 1px solid var(--line); border-radius: 14px; padding: 0 16px; font-size: 14px; outline: none; transition: border-color 0.2s; box-sizing: border-box;" onfocus="this.style.borderColor='var(--violet)'" onblur="this.style.borderColor='var(--line)'" />
          </div>

          <!-- 소개 -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 8px;">소개</label>
            <textarea v-model="profileForm.intro" rows="3" style="width: 100%; border: 1px solid var(--line); border-radius: 14px; padding: 12px 16px; font-size: 14px; outline: none; resize: vertical; transition: border-color 0.2s; font-family: inherit; line-height: 1.6; box-sizing: border-box;" onfocus="this.style.borderColor='var(--violet)'" onblur="this.style.borderColor='var(--line)'"></textarea>
          </div>

          <!-- 게시글 공개 범위 -->
          <div style="margin-bottom: 20px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 10px;">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">visibility</span>게시글 공개 범위
            </label>
            <div style="display: flex; gap: 10px;">
              <label style="flex: 1; display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 14px; border: 2px solid; cursor: pointer; transition: all 0.2s;"
                :style="{
                  borderColor: profileForm.visibility === 'public' ? 'var(--violet)' : 'var(--line)',
                  background: profileForm.visibility === 'public' ? 'rgba(0, 102, 255, 0.04)' : '#fff',
                }">
                <input type="radio" v-model="profileForm.visibility" value="public" style="accent-color: var(--violet);" />
                <div>
                  <strong style="font-size: 14px; display: block;">전체 공개</strong>
                  <span style="font-size: 12px; color: var(--muted);">모든 사용자가 볼 수 있습니다</span>
                </div>
              </label>
              <label style="flex: 1; display: flex; align-items: center; gap: 10px; padding: 14px 16px; border-radius: 14px; border: 2px solid; cursor: pointer; transition: all 0.2s;"
                :style="{
                  borderColor: profileForm.visibility === 'followers' ? 'var(--violet)' : 'var(--line)',
                  background: profileForm.visibility === 'followers' ? 'rgba(0, 102, 255, 0.04)' : '#fff',
                }">
                <input type="radio" v-model="profileForm.visibility" value="followers" style="accent-color: var(--violet);" />
                <div>
                  <strong style="font-size: 14px; display: block;">팔로워만</strong>
                  <span style="font-size: 12px; color: var(--muted);">팔로워만 볼 수 있습니다</span>
                </div>
              </label>
            </div>
          </div>

          <!-- 알림 설정 -->
          <div style="margin-bottom: 28px;">
            <label style="display: block; font-size: 13px; font-weight: 800; color: var(--ink); margin-bottom: 12px;">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">notifications</span>알림 설정
            </label>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--line); background: #fff; cursor: pointer;">
                <span style="font-size: 14px; font-weight: 600;">이메일 알림</span>
                <input type="checkbox" v-model="profileForm.emailNotifications" style="accent-color: var(--violet); width: 18px; height: 18px;" />
              </label>
              <label style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-radius: 12px; border: 1px solid var(--line); background: #fff; cursor: pointer;">
                <span style="font-size: 14px; font-weight: 600;">푸시 알림</span>
                <input type="checkbox" v-model="profileForm.pushNotifications" style="accent-color: var(--violet); width: 18px; height: 18px;" />
              </label>
            </div>
          </div>

          <!-- 저장 버튼 -->
          <div style="display: flex; gap: 12px; justify-content: flex-end;">
            <button type="button" style="padding: 12px 24px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 14px; font-weight: 700; cursor: pointer; color: var(--ink); transition: all 0.2s;" @click="profileEditModal.close()">취소</button>
            <button type="button" style="padding: 12px 28px; border-radius: 999px; border: none; background: linear-gradient(135deg, var(--violet), var(--blue)); color: #fff; font-size: 14px; font-weight: 800; cursor: pointer; transition: all 0.2s; box-shadow: 0 6px 18px rgba(0, 102, 255, 0.25);" @click="profileEditModal.close()">
              <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">save</span>저장
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 취향 정보 삭제 확인 모달 -->
    <div v-if="showDeletePreferenceConfirm" class="story-overlay" role="dialog" aria-modal="true" aria-label="취향 정보 삭제 확인">
      <div class="story-overlay-backdrop" @click="showDeletePreferenceConfirm = false"></div>
      <div class="story-overlay-panel" style="width: min(92vw, 420px); max-height: auto;">
        <button class="story-overlay-close" type="button" aria-label="닫기" @click="showDeletePreferenceConfirm = false">
          <span class="material-symbols-rounded">close</span>
        </button>
        <div style="padding: 40px 32px; text-align: center;">
          <span class="material-symbols-rounded" style="font-size: 48px; color: var(--rose); display: block; margin-bottom: 16px;">restart_alt</span>
          <h2 style="font-size: 20px; font-weight: 800; margin: 0 0 12px; color: var(--ink);">취향 정보를 초기화하시겠습니까?</h2>
          <p style="font-size: 14px; color: var(--muted); line-height: 1.6; margin: 0 0 28px;">
            초기화된 취향 데이터는 복구할 수 없습니다.<br>스와이프 기록과 취향 분석이 모두 초기화됩니다.
          </p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button type="button" style="padding: 12px 28px; border-radius: 999px; border: 1px solid var(--line); background: #fff; font-size: 14px; font-weight: 700; cursor: pointer; color: var(--ink); transition: all 0.2s;" @click="showDeletePreferenceConfirm = false">취소</button>
            <button type="button" style="padding: 12px 28px; border-radius: 999px; border: none; background: var(--rose); color: #fff; font-size: 14px; font-weight: 700; cursor: pointer; transition: all 0.2s; box-shadow: 0 6px 18px rgba(255, 92, 141, 0.3);" @click="showDeletePreferenceConfirm = false">초기화</button>
          </div>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.preference-delete-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 92, 141, 0.2);
  background: rgba(255, 92, 141, 0.06);
  color: var(--rose);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  white-space: nowrap;
  flex-shrink: 0;
}
.preference-delete-btn:hover {
  background: var(--rose);
  color: #fff;
  border-color: var(--rose);
  box-shadow: 0 4px 12px rgba(255, 92, 141, 0.25);
}
.preference-delete-btn .material-symbols-rounded {
  font-size: 18px;
}

/* Places slider */
.mypage-places-slider-wrapper {
  position: relative;
  overflow: hidden;
}
.mypage-places-slider {
  display: flex;
  gap: 18px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scroll-behavior: smooth;
  padding-bottom: 8px;
  scrollbar-width: none;
}
.mypage-places-slider::-webkit-scrollbar {
  display: none;
}
.mypage-place-card--slider {
  flex: 0 0 calc((100% - 36px) / 3);
  min-width: calc((100% - 36px) / 3);
  max-width: calc((100% - 36px) / 3);
  scroll-snap-align: start;
}
.places-slider-btn {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 36px;
  height: 36px;
  border-radius: 50%;
  border: 1px solid var(--line);
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(8px);
  color: var(--ink);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  box-shadow: var(--soft-shadow);
  transition: transform 0.2s, box-shadow 0.2s;
}
.places-slider-btn:hover {
  transform: translateY(-50%) scale(1.05);
  box-shadow: var(--shadow);
}
.places-slider-btn.prev { left: 0; }
.places-slider-btn.next { right: 0; }
.places-slider-btn .material-symbols-rounded { font-size: 20px; }
@media (max-width: 1024px) {
  .places-slider-btn.prev { left: 4px; }
  .places-slider-btn.next { right: 4px; }
  .mypage-place-card--slider {
    flex: 0 0 calc((100% - 18px) / 2);
    min-width: calc((100% - 18px) / 2);
    max-width: calc((100% - 18px) / 2);
  }
}
@media (max-width: 768px) {
  .mypage-place-card--slider {
    flex: 0 0 85%;
    min-width: 85%;
    max-width: 85%;
  }
}
@media (max-width: 480px) {
  .mypage-place-card--slider {
    flex: 0 0 92%;
    min-width: 92%;
    max-width: 92%;
  }
}
</style>
