<script setup lang="ts">
import { ref, computed, unref, onMounted, watchEffect } from 'vue'
import router from '@/router'
import AppShell from '@/components/layout/AppShell.vue'
import { useAuth } from '@/composables/useAuth'
import { userApi } from '@/api/user.api'
import { mediaApi } from '@/api/media.api'
import type { UpdateUserSettingsRequest, UserProfileVisibility } from '@/types/auth'
import { useToast } from '@/composables/useToast'

const { logout, user, fetchUser } = useAuth()
const currentUser = computed(() => unref(user))
const toast = useToast()

const loading = ref(false)
const saving = ref(false)

const settingsForm = ref({
  displayLanguage: 'ko',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
  marketingEmailOptIn: false,
  tripInviteEmailOptIn: true,
})

const timezones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul']
const languages = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
  { value: 'ja', label: '日本語' },
  { value: 'zh-CN', label: '简体中文' },
]

const message = ref('')
const errorMessage = ref('')
const accountLoading = ref(false)

// 프로필 이미지 변경 상태
const photoInput = ref<HTMLInputElement | null>(null)
const uploadingPhoto = ref(false)
const avatarPreviewUrl = ref<string | null>(null)

// 프로필 공개 범위 상태
const profileVisibility = ref<UserProfileVisibility>('PUBLIC')
const updatingVisibility = ref(false)

watchEffect(() => {
  if (currentUser.value?.profileVisibility) {
    profileVisibility.value = currentUser.value.profileVisibility
  }
})

const userAvatar = computed(() => {
  if (currentUser.value?.displayName) {
    return currentUser.value.displayName.charAt(0).toUpperCase()
  }
  return '?'
})

onMounted(async () => {
  loading.value = true
  try {
    const settings = await userApi.getSettings()
    settingsForm.value = {
      displayLanguage: settings.displayLanguage || 'ko',
      timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      marketingEmailOptIn: settings.marketingEmailOptIn,
      tripInviteEmailOptIn: settings.tripInviteEmailOptIn,
    }
  } catch {
    errorMessage.value = '계정 설정을 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
})

function triggerPhotoPicker() {
  photoInput.value?.click()
}

async function onPhotoSelected(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    toast.error('이미지 파일만 선택할 수 있습니다.')
    input.value = ''
    return
  }

  uploadingPhoto.value = true
  if (avatarPreviewUrl.value) {
    URL.revokeObjectURL(avatarPreviewUrl.value)
  }
  avatarPreviewUrl.value = URL.createObjectURL(file)

  try {
    const mediaFile = await mediaApi.uploadFile(file, 'PROFILE_IMAGE')
    if (userApi.updateMe) {
      await userApi.updateMe({ profileMediaFileId: mediaFile.id })
    }
    if (fetchUser) {
      await fetchUser()
    }
    toast.success('프로필 사진이 변경되었습니다.')
  } catch (err: any) {
    toast.error(err?.message || '프로필 사진을 변경하지 못했습니다.')
  } finally {
    uploadingPhoto.value = false
    input.value = ''
  }
}

async function updateProfileVisibility(newVisibility: UserProfileVisibility) {
  if (profileVisibility.value === newVisibility || updatingVisibility.value) return
  updatingVisibility.value = true
  const prev = profileVisibility.value
  profileVisibility.value = newVisibility
  try {
    if (userApi.updateMe) {
      await userApi.updateMe({ profileVisibility: newVisibility })
    }
    if (fetchUser) {
      await fetchUser()
    }
    toast.success(newVisibility === 'PUBLIC' ? '공개 프로필로 변경되었습니다.' : '비공개 계정으로 변경되었습니다.')
  } catch (err: any) {
    profileVisibility.value = prev
    toast.error('프로필 공개 범위를 변경하지 못했습니다.')
  } finally {
    updatingVisibility.value = false
  }
}

async function requestAccountDeletion() {
  if (!window.confirm('계정을 즉시 탈퇴할까요? 개인정보와 로그인 수단이 삭제되며 되돌릴 수 없습니다. 소유한 여행방은 다음 구성원에게 이전되고, 혼자 있는 여행방은 삭제됩니다.')) return
  accountLoading.value = true
  errorMessage.value = ''
  try {
    await userApi.deleteMe()
    await logout()
    toast.success('회원 탈퇴가 완료되었습니다.')
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.detail || '계정을 탈퇴하지 못했습니다.'
  } finally {
    accountLoading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  message.value = ''
  errorMessage.value = ''
  try {
    const payload: UpdateUserSettingsRequest = {
      displayLanguage: settingsForm.value.displayLanguage,
      timezone: settingsForm.value.timezone,
      marketingEmailOptIn: settingsForm.value.marketingEmailOptIn,
      tripInviteEmailOptIn: settingsForm.value.tripInviteEmailOptIn,
    }
    await userApi.updateSettings(payload)
    message.value = '설정을 저장했습니다.'
    toast.success('설정을 저장했습니다.')
  } catch {
    // 에러는 인터셉터에서 처리
  } finally {
    saving.value = false
  }
}

function goToProfile() {
  if (!currentUser.value?.id) return
  if (router?.push) {
    router.push(`/mypage/${currentUser.value.id}`)
  } else {
    window.location.href = `/mypage/${currentUser.value.id}`
  }
}
</script>

<template>
  <AppShell>
    <div class="settings-page profile-settings-page page-with-hero max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- 헤더 (Page Hero) -->
      <header class="settings-heading page-hero">
        <div class="page-hero__copy">
          <p class="page-hero__eyebrow">
            <span class="material-symbols-rounded" aria-hidden="true">tune</span> Preferences
          </p>
          <h1 class="page-hero__title">
            <span class="page-hero__gradient">서비스 환경</span>을 관리하세요
          </h1>
          <p class="page-hero__lead">
            표시 언어, 표준 시간대 및 알림 수신 환경을 나에게 맞게 설정하세요.
          </p>
        </div>
        <div class="page-hero__actions">
          <a
            v-if="currentUser?.id"
            :href="`/mypage/${currentUser.id}`"
            class="btn ghost settings-hero-link"
            @click.prevent="goToProfile"
          >
            <span class="material-symbols-rounded" aria-hidden="true">badge</span>
            내 프로필 바로가기
            <span class="material-symbols-rounded arrow-icon" aria-hidden="true">arrow_forward</span>
          </a>
        </div>
      </header>

      <!-- 로딩 상태 알림 -->
      <div v-if="loading" class="settings-loading-card">
        <span class="material-symbols-rounded animate-spin">progress_activity</span>
        <p class="text-muted">불러오는 중…</p>
      </div>

      <!-- 메인 2열 레이아웃 -->
      <div v-else class="settings-layout">
        <!-- 좌측: 프로필 요약 카드 -->
        <aside class="settings-summary">
          <div class="settings-summary__cover">
            <div class="summary-cover-art" />
          </div>

          <!-- 상단 중앙에 더 크게 배치된 아바타 및 사진 변경 기능 -->
          <div class="settings-summary__avatar-wrap">
            <div class="settings-summary__avatar">
              <img
                v-if="avatarPreviewUrl || currentUser?.profileImageUrl"
                :src="avatarPreviewUrl || currentUser?.profileImageUrl || ''"
                :alt="currentUser?.displayName || 'User'"
              />
              <span v-else>{{ userAvatar }}</span>

              <!-- 사진 업로드 진행 중 스피너 -->
              <div v-if="uploadingPhoto" class="avatar-upload-overlay">
                <span class="material-symbols-rounded animate-spin">progress_activity</span>
              </div>
            </div>

            <!-- 프로필 이미지 변경 버튼 -->
            <button
              type="button"
              class="avatar-change-btn"
              :disabled="uploadingPhoto"
              title="프로필 이미지 변경"
              aria-label="프로필 이미지 변경"
              @click="triggerPhotoPicker"
            >
              <span class="material-symbols-rounded" aria-hidden="true">photo_camera</span>
            </button>

            <input
              ref="photoInput"
              type="file"
              accept="image/*"
              style="display: none;"
              @change="onPhotoSelected"
            />
          </div>

          <div class="settings-summary__profile">
            <h2 class="settings-summary__name">{{ currentUser?.displayName || '여행자' }}</h2>
            <p class="settings-summary__email">{{ currentUser?.email || '이메일 없음' }}</p>
            <p v-if="currentUser?.bio" class="settings-summary__bio">{{ currentUser.bio }}</p>

            <!-- 공개 프로필 변경 기능 -->
            <div class="settings-visibility-section">
              <div class="settings-visibility-header">
                <span class="settings-visibility-title">프로필 공개 범위</span>
                <span
                  class="settings-summary__badge"
                  :class="profileVisibility === 'PRIVATE' ? 'badge--private' : 'badge--public'"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">{{ profileVisibility === 'PRIVATE' ? 'lock' : 'public' }}</span>
                  {{ profileVisibility === 'PRIVATE' ? '비공개' : '공개' }}
                </span>
              </div>

              <div class="visibility-segmented-control">
                <button
                  type="button"
                  class="visibility-segment-btn"
                  :class="{ 'is-active': profileVisibility === 'PUBLIC' }"
                  :disabled="updatingVisibility"
                  @click="updateProfileVisibility('PUBLIC')"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">public</span>
                  공개
                </button>
                <button
                  type="button"
                  class="visibility-segment-btn"
                  :class="{ 'is-active': profileVisibility === 'PRIVATE' }"
                  :disabled="updatingVisibility"
                  @click="updateProfileVisibility('PRIVATE')"
                >
                  <span class="material-symbols-rounded" aria-hidden="true">lock</span>
                  비공개
                </button>
              </div>
              <small class="settings-visibility-hint">
                {{ profileVisibility === 'PUBLIC' ? '모든 사용자가 내 프로필을 확인할 수 있습니다.' : '승인된 팔로워만 내 프로필을 볼 수 있습니다.' }}
              </small>
            </div>
          </div>

          <div class="settings-summary__actions">
            <a
              v-if="currentUser?.id"
              :href="`/mypage/${currentUser.id}`"
              class="settings-summary__link-btn"
              @click.prevent="goToProfile"
            >
              <span class="material-symbols-rounded" aria-hidden="true">person</span>
              내 프로필 보기
              <span class="material-symbols-rounded arrow-icon" aria-hidden="true">arrow_forward</span>
            </a>
          </div>
        </aside>

        <!-- 우측: 설정 패널 목록 -->
        <div class="settings-form">
          <!-- 1. 환경 설정, 알림 설정, 설정 저장을 하나의 카드로 합치고 구분선으로 구분 -->
          <section class="settings-panel settings-panel--unified">
            <!-- 1-1. 환경 설정 영역 -->
            <div class="settings-section">
              <div class="settings-panel__head">
                <div class="panel-head-title-group">
                  <div class="panel-head-icon panel-head-icon--violet">
                    <span class="material-symbols-rounded" aria-hidden="true">language</span>
                  </div>
                  <div>
                    <h2>환경 설정</h2>
                    <p>서비스 표시 방식과 표준 시간대를 선택합니다.</p>
                  </div>
                </div>
                <span class="settings-panel__badge settings-panel__badge--info">기본 환경</span>
              </div>

              <div class="settings-field-grid">
                <!-- 표시 언어 -->
                <label class="settings-field">
                  <span class="settings-field__label">
                    <span class="material-symbols-rounded" aria-hidden="true">translate</span>
                    표시 언어
                  </span>
                  <div class="settings-select-wrap">
                    <select v-model="settingsForm.displayLanguage" class="field settings-select">
                      <option v-for="language in languages" :key="language.value" :value="language.value">
                        {{ language.label }}
                      </option>
                    </select>
                    <span class="material-symbols-rounded select-chevron" aria-hidden="true">expand_more</span>
                  </div>
                  <small>서비스 메뉴, 안내 및 시스템 메시지에 적용될 언어입니다.</small>
                </label>

                <!-- 타임존 -->
                <label class="settings-field">
                  <span class="settings-field__label">
                    <span class="material-symbols-rounded" aria-hidden="true">schedule</span>
                    타임존
                  </span>
                  <div class="settings-select-wrap">
                    <select v-model="settingsForm.timezone" class="field settings-select">
                      <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
                    </select>
                    <span class="material-symbols-rounded select-chevron" aria-hidden="true">expand_more</span>
                  </div>
                  <small>여행 일정과 공유 기록의 기준 시간대로 사용됩니다.</small>
                </label>
              </div>
            </div>

            <!-- 구분선 1 -->
            <hr class="settings-divider" />

            <!-- 1-2. 알림 설정 영역 -->
            <div class="settings-section">
              <div class="settings-panel__head">
                <div class="panel-head-title-group">
                  <div class="panel-head-icon panel-head-icon--emerald">
                    <span class="material-symbols-rounded" aria-hidden="true">notifications</span>
                  </div>
                  <div>
                    <h2>알림 설정</h2>
                    <p>중요한 여행 알림 및 소식 수신 여부를 선택합니다.</p>
                  </div>
                </div>
                <span class="settings-panel__badge">이메일 알림</span>
              </div>

              <div class="settings-toggle-list">
                <!-- 마케팅 이메일 수신 (checkbox 0 for test compatibility) -->
                <div
                  class="settings-toggle"
                  @click="settingsForm.marketingEmailOptIn = !settingsForm.marketingEmailOptIn"
                >
                  <div class="settings-toggle__info">
                    <strong>마케팅 이메일 수신</strong>
                    <small>숨길의 신규 여행지 추천, 특가 혜택 및 이벤트 소식을 이메일로 받아봅니다.</small>
                  </div>
                  <label class="switch-control" @click.stop>
                    <input type="checkbox" v-model="settingsForm.marketingEmailOptIn" />
                    <span class="switch-track" />
                  </label>
                </div>

                <!-- 여행 초대 이메일 수신 (checkbox 1 for test compatibility) -->
                <div
                  class="settings-toggle"
                  @click="settingsForm.tripInviteEmailOptIn = !settingsForm.tripInviteEmailOptIn"
                >
                  <div class="settings-toggle__info">
                    <strong>여행 초대 이메일 수신</strong>
                    <small>동행자나 친구가 새로운 여행 일정에 나를 초대했을 때 이메일 알림을 받습니다.</small>
                  </div>
                  <label class="switch-control" @click.stop>
                    <input type="checkbox" v-model="settingsForm.tripInviteEmailOptIn" />
                    <span class="switch-track" />
                  </label>
                </div>
              </div>
            </div>

            <!-- 구분선 2 -->
            <hr class="settings-divider" />

            <!-- 1-3. 설정 저장 영역 -->
            <div class="settings-section settings-section--actions">
              <div class="settings-actions-status">
                <p v-if="message" class="settings-save-status text-brand-violet">{{ message }}</p>
                <p v-else-if="errorMessage" class="settings-save-status error-status text-brand-rose">{{ errorMessage }}</p>
                <p v-else class="text-sm text-muted">선택한 변경사항을 서비스에 반영하려면 저장하세요.</p>
              </div>
              <div class="settings-actions-buttons">
                <button
                  class="btn primary settings-save-btn"
                  type="button"
                  :disabled="saving"
                  @click="saveSettings"
                >
                  설정 저장
                </button>
              </div>
            </div>
          </section>

          <!-- 2. 계정 관리 및 위험 구역 (로그아웃 제거, 계정 탈퇴만 유지) -->
          <section class="settings-panel settings-panel--danger">
            <div class="settings-panel__head">
              <div class="panel-head-title-group">
                <div class="panel-head-icon panel-head-icon--orange">
                  <span class="material-symbols-rounded" aria-hidden="true">shield</span>
                </div>
                <div>
                  <h2>계정 관리</h2>
                  <p>계정 삭제와 관련된 민감한 작업입니다.</p>
                </div>
              </div>
              <span class="settings-panel__badge settings-panel__badge--warning">보안</span>
            </div>

            <!-- 계정 삭제 카드 -->
            <div class="settings-danger-card">
              <div class="settings-danger-card__head">
                <div class="settings-danger-card__title-wrap">
                  <span class="material-symbols-rounded text-brand-rose" aria-hidden="true">warning</span>
                  <h2 class="settings-danger-title">계정 삭제</h2>
                </div>
              </div>
              <p class="settings-danger-desc">
                탈퇴 즉시 개인정보와 로그인 수단이 삭제되고 모든 기기에서 로그아웃됩니다. 소유한 여행방은 다음 구성원에게 이전되며, 다른 구성원이 없으면 함께 삭제됩니다.
              </p>
              <div class="settings-danger-card__footer">
                <button
                  type="button"
                  class="btn danger-action-btn"
                  :disabled="accountLoading"
                  @click="requestAccountDeletion"
                >
                  계정 탈퇴
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.settings-page {
  position: relative;
}

/* 로딩 상태 */
.settings-loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 24px;
  background: rgba(255, 255, 255, 0.7);
  border-radius: 24px;
  border: 1px solid var(--line);
  backdrop-filter: blur(16px);
}

.settings-loading-card .material-symbols-rounded {
  font-size: 36px;
  color: var(--violet);
}

/* 히어로 액션 버튼 */
.settings-hero-link {
  height: 44px;
  padding: 0 18px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  border: 1px solid var(--line);
  color: var(--ink);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.03);
  transition: all 0.25s ease;
}

.settings-hero-link:hover {
  border-color: rgba(99, 102, 241, 0.3);
  color: var(--violet);
  transform: translateY(-1px);
}

.settings-hero-link .arrow-icon {
  font-size: 16px;
  transition: transform 0.2s ease;
}

.settings-hero-link:hover .arrow-icon {
  transform: translateX(3px);
}

/* 프로필 요약 카드 아트 */
.summary-cover-art {
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.3) 0%, rgba(0, 209, 255, 0.2) 50%, rgba(255, 200, 87, 0.15) 100%);
}

.settings-summary__avatar-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  margin: -60px auto 12px;
  width: 120px;
  height: 120px;
  z-index: 2;
}

.settings-summary__avatar {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 4px solid #fff;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 38px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 12px 28px rgba(0, 102, 255, 0.25), 0 0 0 1px rgba(0, 102, 255, 0.08);
}

.settings-summary__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-upload-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  border-radius: 50%;
}

.avatar-change-btn {
  position: absolute;
  bottom: 2px;
  right: 2px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--violet, #0066ff);
  color: #fff;
  border: 2.5px solid #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0, 102, 255, 0.35);
  transition: all 0.2s ease;
  z-index: 3;
}

.avatar-change-btn:hover:not(:disabled) {
  transform: scale(1.1);
  background: #0052cc;
}

.avatar-change-btn .material-symbols-rounded {
  font-size: 18px;
}

.settings-summary__profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 0 24px 20px;
  text-align: center;
}

.settings-summary__name {
  margin: 0;
  font-size: 20px;
  font-weight: 800;
  color: var(--ink);
  letter-spacing: -0.01em;
}

.settings-summary__email {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
}

.settings-summary__bio {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.5;
  word-break: keep-all;
}

/* 공개 프로필 토글 섹션 */
.settings-visibility-section {
  width: 100%;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid var(--line);
  border-radius: 16px;
  display: grid;
  gap: 10px;
  margin-top: 14px;
  text-align: left;
}

.settings-visibility-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-visibility-title {
  font-size: 13px;
  font-weight: 800;
  color: var(--ink);
}

.visibility-segmented-control {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  padding: 3px;
  background: rgba(0, 0, 0, 0.04);
  border-radius: 12px;
}

.visibility-segment-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  border-radius: 9px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.visibility-segment-btn.is-active {
  background: #fff;
  color: var(--violet);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  font-weight: 800;
}

.visibility-segment-btn .material-symbols-rounded {
  font-size: 16px;
}

.settings-visibility-hint {
  font-size: 11.5px;
  color: var(--muted);
  line-height: 1.45;
}

.settings-summary__badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 700;
}

.settings-summary__badge .material-symbols-rounded {
  font-size: 13px;
}

.settings-summary__badge.badge--public {
  background: rgba(0, 224, 209, 0.1);
  color: #008f86;
  border: 1px solid rgba(0, 224, 209, 0.25);
}

.settings-summary__badge.badge--private {
  background: rgba(255, 92, 141, 0.1);
  color: var(--rose);
  border: 1px solid rgba(255, 92, 141, 0.25);
}

.settings-summary__actions {
  padding: 0 24px 24px;
}

.settings-summary__link-btn {
  width: 100%;
  height: 42px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--line);
  color: var(--ink);
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  text-decoration: none;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.02);
  transition: all 0.25s ease;
}

.settings-summary__link-btn:hover {
  background: rgba(99, 102, 241, 0.05);
  border-color: rgba(99, 102, 241, 0.3);
  color: var(--violet);
  transform: translateY(-1px);
}

.settings-summary__link-btn .arrow-icon {
  font-size: 15px;
  transition: transform 0.2s ease;
}

.settings-summary__link-btn:hover .arrow-icon {
  transform: translateX(3px);
}

/* 필드 라벨 & 셀렉트 커스텀 */
.settings-field__label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 800;
  color: var(--ink);
}

.settings-field__label .material-symbols-rounded {
  font-size: 16px;
  color: var(--violet);
}

.settings-select-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.settings-select {
  width: 100%;
  appearance: none;
  -webkit-appearance: none;
  padding-right: 40px !important;
  cursor: pointer;
}

.select-chevron {
  position: absolute;
  right: 14px;
  color: var(--muted);
  pointer-events: none;
  font-size: 20px;
}

/* 하나의 카드로 합쳐진 패널 & 섹션 & 구분선 */
.settings-panel--unified {
  display: grid;
  gap: 24px;
}

.settings-section {
  display: grid;
  gap: 20px;
}

.settings-section--actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-top: 4px;
}

.settings-divider {
  border: none;
  height: 1px;
  background: var(--line, #e3eaf4);
  margin: 0;
  opacity: 0.8;
}

/* 스위치 정보 텍스트 */
.settings-toggle__info {
  flex: 1;
  min-width: 0;
}

/* 저장 액션 바 버튼 */
.settings-save-btn {
  height: 46px;
  padding: 0 26px;
  border-radius: 14px;
  font-size: 14px;
  font-weight: 800;
  cursor: pointer;
  border: none;
}

.settings-save-status.error-status::before {
  content: "⚠️";
}

/* 계정 관리 */
.settings-panel--danger {
  border-color: rgba(255, 92, 141, 0.2);
}

.settings-panel__badge--warning {
  background: rgba(249, 115, 22, 0.1);
  border: 1px solid rgba(249, 115, 22, 0.2);
  color: #ea580c;
}

/* 위험 구역 카드 */
.settings-danger-card {
  padding: 22px;
  border-radius: 18px;
  background: rgba(255, 92, 141, 0.04);
  border: 1.5px dashed rgba(255, 92, 141, 0.25);
  display: grid;
  gap: 12px;
}

.settings-danger-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.settings-danger-card__title-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
}

.settings-danger-title {
  margin: 0;
  font-size: 16px;
  font-weight: 800;
  color: var(--rose, #ff5c8d);
}

.settings-danger-desc {
  margin: 0;
  font-size: 13px;
  color: var(--muted);
  line-height: 1.6;
}

.settings-danger-card__footer {
  display: flex;
  justify-content: flex-end;
}

.danger-action-btn {
  height: 40px;
  padding: 0 20px;
  border-radius: 12px;
  border: 1.5px solid rgba(255, 92, 141, 0.35);
  background: #fff;
  color: var(--rose, #ff5c8d);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.25s ease;
}

.danger-action-btn:hover:not(:disabled) {
  background: var(--rose, #ff5c8d);
  color: #fff;
  border-color: var(--rose, #ff5c8d);
  box-shadow: 0 6px 18px rgba(255, 92, 141, 0.25);
  transform: translateY(-1px);
}

.danger-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 반응형 */
@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }

  .settings-summary {
    position: static;
  }

  .settings-section--actions {
    flex-direction: column;
    align-items: stretch;
    gap: 14px;
  }

  .settings-actions-buttons,
  .settings-actions-buttons .btn {
    width: 100%;
  }
}
</style>
