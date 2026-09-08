<script setup lang="ts">
import { ref, computed, unref, onMounted, watch, watchEffect } from 'vue'
import router from '@/router'
import AppShell from '@/components/layout/AppShell.vue'
import { useAuth } from '@/composables/useAuth'
import { userApi } from '@/api/user.api'
import type { UpdateUserSettingsRequest, UserProfileVisibility } from '@/types/auth'
import { useToast } from '@/composables/useToast'
import { useLocale } from '@/i18n'

const { logout, user, fetchUser } = useAuth()
const currentUser = computed(() => unref(user))
const toast = useToast()
const { t, setLocale } = useLocale()

const loading = ref(false)
const saving = ref(false)

const settingsForm = ref({
  displayLanguage: 'ko',
  tripInviteEmailOptIn: true,
})

const languages = [
  { value: 'ko', label: '한국어' },
  { value: 'en', label: 'English' },
]

const errorMessage = ref('')
const accountLoading = ref(false)

// 프로필 공개 범위 상태
const profileVisibility = ref<UserProfileVisibility>('PUBLIC')
const updatingVisibility = ref(false)

watchEffect(() => {
  if (currentUser.value?.profileVisibility) {
    profileVisibility.value = currentUser.value.profileVisibility
  }
})

watch(
  () => settingsForm.value.displayLanguage,
  (language) => setLocale(language),
)

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
      tripInviteEmailOptIn: settings.tripInviteEmailOptIn,
    }
    setLocale(settingsForm.value.displayLanguage)
  } catch {
    errorMessage.value = t('settings.loadError')
  } finally {
    loading.value = false
  }
})

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
    toast.success(newVisibility === 'PUBLIC' ? t('settings.publicChanged') : t('settings.privateChanged'))
  } catch (err: any) {
    profileVisibility.value = prev
    toast.error(t('settings.visibilityError'))
  } finally {
    updatingVisibility.value = false
  }
}

async function requestAccountDeletion() {
  if (!window.confirm(t('settings.deleteConfirm'))) return
  accountLoading.value = true
  errorMessage.value = ''
  try {
    await userApi.deleteMe()
    await logout()
    toast.success(t('settings.deleteSuccess'))
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.detail || t('settings.deleteError')
  } finally {
    accountLoading.value = false
  }
}

async function saveSettings() {
  saving.value = true
  errorMessage.value = ''
  try {
    const payload: UpdateUserSettingsRequest = {
      displayLanguage: settingsForm.value.displayLanguage,
      tripInviteEmailOptIn: settingsForm.value.tripInviteEmailOptIn,
    }
    await userApi.updateSettings(payload)
    if (fetchUser) await fetchUser()
    setLocale(settingsForm.value.displayLanguage)
    toast.success(t('settings.saved'))
  } catch {
    // 에러는 인터셉터에서 처리
  } finally {
    saving.value = false
  }
}

</script>

<template>
  <AppShell>
    <div class="settings-page profile-settings-page page-with-hero max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- 로딩 상태 알림 -->
      <div v-if="loading" class="settings-loading-card">
        <div class="loading-spinner-wrap">
          <span class="material-symbols-rounded animate-spin">progress_activity</span>
        </div>
        <p class="loading-text">{{ t('common.loading') }}</p>
      </div>

      <!-- 메인 2열 그리드 레이아웃 -->
      <div v-else class="settings-layout">
        <!-- 1열 1행: 프로필 요약 카드 (호버 효과 제거, 환경설정 카드와 높이 일치) -->
        <aside class="settings-summary">
          <div class="settings-summary__cover">
            <div class="summary-cover-art" />
          </div>

          <!-- 상단 중앙 아바타 -->
          <div class="settings-summary__avatar-wrap">
            <div class="settings-summary__avatar-outer">
              <div class="settings-summary__avatar">
                <img
                  v-if="currentUser?.profileImageUrl"
                  :src="currentUser.profileImageUrl"
                  :alt="currentUser?.displayName || 'User'"
                />
                <span v-else class="avatar-fallback">{{ userAvatar }}</span>
              </div>
            </div>
          </div>

          <div class="settings-summary__profile">
            <h2 class="settings-summary__name" :data-no-translate="currentUser?.displayName ? '' : undefined">{{ currentUser?.displayName || '여행자' }}</h2>

            <!-- 계정 이메일 정보 -->
            <div class="settings-summary__email-section">
              <div class="settings-summary__email-pill">
                <span class="material-symbols-rounded email-icon" aria-hidden="true">mail</span>
                <span :data-no-translate="currentUser?.email ? '' : undefined">{{ currentUser?.email || t('settings.emailMissing') }}</span>
              </div>
            </div>

            <!-- 소개문구 영역 (정적 텍스트 표시) -->
            <div class="settings-summary__bio-section">
              <p class="settings-summary__bio" :data-no-translate="currentUser?.bio ? '' : undefined">
                {{ currentUser?.bio || t('settings.bioMissing') }}
              </p>
            </div>
          </div>
        </aside>

        <!-- 2열: 환경설정 카드 + 계정관리 카드 (붙어있도록 단일 그룹으로 구성) -->
        <div class="settings-cards-group">
          <!-- 환경 설정 카드 -->
          <section class="settings-panel settings-panel--unified">
            <!-- 카드 헤더 (설명 및 뱃지 제거) -->
            <div class="settings-panel__head">
              <div class="panel-head-title-group">
                <div class="panel-head-icon panel-head-icon--violet">
                  <span class="material-symbols-rounded" aria-hidden="true">tune</span>
                </div>
                <div>
                  <h2>{{ t('settings.environment') }}</h2>
                </div>
              </div>
            </div>

            <!-- 환경 및 알림, 공개 범위 설정 항목 목록 -->
            <div class="settings-items-list">
              <!-- 1. 표시 언어 항목 -->
              <div class="settings-item-card">
                <div class="settings-item__icon-wrap">
                  <span class="material-symbols-rounded" aria-hidden="true">translate</span>
                </div>
                <div class="settings-item__info">
                  <label for="settings-lang-select" class="settings-item__title">
                    {{ t('settings.language') }}
                  </label>
                  <p class="settings-item__desc">
                    {{ t('settings.languageHint') }}
                  </p>
                </div>
                <div class="settings-item__control">
                  <div class="settings-select-wrap">
                    <select
                      id="settings-lang-select"
                      v-model="settingsForm.displayLanguage"
                      class="field settings-select"
                    >
                      <option v-for="language in languages" :key="language.value" :value="language.value">
                        {{ language.label }}
                      </option>
                    </select>
                    <span class="material-symbols-rounded select-chevron" aria-hidden="true">expand_more</span>
                  </div>
                </div>
              </div>

              <!-- 2. 프로필 공개 범위 항목 ("공개" 텍스트 적절한 설명으로 개선) -->
              <div class="settings-item-card">
                <div class="settings-item__icon-wrap">
                  <span class="material-symbols-rounded" aria-hidden="true">visibility</span>
                </div>
                <div class="settings-item__info">
                  <span class="settings-item__title">{{ t('settings.visibility') }}</span>
                  <p class="settings-item__desc">
                    {{ profileVisibility === 'PUBLIC' ? t('settings.publicHint') : t('settings.privateHint') }}
                  </p>
                </div>
                <div class="settings-item__control">
                  <div class="visibility-segmented-control">
                    <button
                      type="button"
                      class="visibility-segment-btn"
                      :class="{ 'is-active': profileVisibility === 'PUBLIC' }"
                      :disabled="updatingVisibility"
                      @click="updateProfileVisibility('PUBLIC')"
                    >
                      <span class="material-symbols-rounded" aria-hidden="true">public</span>
                      <span>{{ t('settings.public') }}</span>
                    </button>
                    <button
                      type="button"
                      class="visibility-segment-btn"
                      :class="{ 'is-active': profileVisibility === 'PRIVATE' }"
                      :disabled="updatingVisibility"
                      @click="updateProfileVisibility('PRIVATE')"
                    >
                      <span class="material-symbols-rounded" aria-hidden="true">lock</span>
                      <span>{{ t('settings.private') }}</span>
                    </button>
                  </div>
                </div>
              </div>

              <!-- 3. 여행 초대 이메일 수신 토글 항목 -->
              <div
                class="settings-item-card settings-item-card--toggle"
                role="button"
                tabindex="0"
                @click="settingsForm.tripInviteEmailOptIn = !settingsForm.tripInviteEmailOptIn"
                @keydown.enter.prevent="settingsForm.tripInviteEmailOptIn = !settingsForm.tripInviteEmailOptIn"
                @keydown.space.prevent="settingsForm.tripInviteEmailOptIn = !settingsForm.tripInviteEmailOptIn"
              >
                <div class="settings-item__icon-wrap">
                  <span class="material-symbols-rounded" aria-hidden="true">mark_email_unread</span>
                </div>
                <div class="settings-item__info">
                  <strong class="settings-item__title">{{ t('settings.tripEmail') }}</strong>
                  <p class="settings-item__desc">{{ t('settings.tripEmailHint') }}</p>
                </div>
                <div class="settings-item__control">
                  <label class="switch-control" @click.stop>
                    <input type="checkbox" v-model="settingsForm.tripInviteEmailOptIn" />
                    <span class="switch-track" />
                  </label>
                </div>
              </div>
            </div>

            <!-- 하단 액션 영역 -->
            <div class="settings-section settings-section--actions">
              <div class="settings-actions-status">
                <p v-if="errorMessage" class="settings-save-status error-status text-brand-rose">
                  <span class="material-symbols-rounded" aria-hidden="true">error</span>
                  <span>{{ errorMessage }}</span>
                </p>
              </div>
              <div class="settings-actions-buttons">
                <button
                  class="btn primary settings-save-btn"
                  type="button"
                  :disabled="saving"
                  @click="saveSettings"
                >{{ t('common.save') }}</button>
              </div>
            </div>
          </section>

          <!-- 2열 2행: 회원 정보 삭제 카드 (환경설정 카드 바로 아래 붙어서 표시) -->
          <section class="settings-panel settings-panel--danger">
            <div class="settings-panel__head">
              <div class="panel-head-title-group">
                <div class="panel-head-icon panel-head-icon--orange">
                  <span class="material-symbols-rounded" aria-hidden="true">shield</span>
                </div>
                <div>
                  <h2>{{ t('settings.account') }}</h2>
                </div>
              </div>
            </div>

            <!-- 계정 탈퇴 안내 및 액션 행 (설명 텍스트 2행 표시) -->
            <div class="settings-danger-row">
              <div class="settings-danger-bullet-list">
                <div class="danger-bullet-item">
                  <span class="material-symbols-rounded bullet-icon" aria-hidden="true">cancel</span>
                  <span>{{ t('settings.deleteData') }}</span>
                </div>
                <div class="danger-bullet-item">
                  <span class="material-symbols-rounded bullet-icon" aria-hidden="true">cancel</span>
                  <span>{{ t('settings.deleteTrips') }}</span>
                </div>
              </div>

              <div class="settings-danger-action">
                <button
                  type="button"
                  class="btn danger-action-btn"
                  :disabled="accountLoading"
                  @click="requestAccountDeletion"
                >{{ t('settings.withdraw') }}</button>
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
  width: 100%;
  box-sizing: border-box;
  min-height: 80vh;
}

/* 로딩 상태 카드 */
.settings-loading-card {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  padding: 80px 24px;
  background: rgba(255, 255, 255, 0.75);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px);
}

.loading-spinner-wrap {
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: rgba(0, 102, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading-spinner-wrap .material-symbols-rounded {
  font-size: 28px;
  color: var(--violet, #0066ff);
}

.loading-text {
  font-size: 14px;
  font-weight: 700;
  color: var(--muted, #68718a);
  margin: 0;
}

/* 메인 2열 그리드 레이아웃 (1열: 프로필 카드, 2열: 환경설정+계정관리 카드 그룹) */
.settings-layout {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: minmax(300px, 336px) minmax(0, 1fr);
  gap: 24px;
  align-items: start;
}

/* ==========================================================================
   좌측 1열: 프로필 요약 카드 (상단 위치 일치, 호버 효과 제거)
   ========================================================================== */
.settings-summary {
  position: relative !important;
  top: 0 !important;
  margin-top: 0 !important;
  height: fit-content;
  align-self: start;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 16px 36px rgba(0, 102, 255, 0.04),
              0 1px 3px rgba(0, 0, 0, 0.02);
  transform: none !important;
  transition: none !important;
}

.settings-summary:hover {
  transform: none !important;
  box-shadow: 0 16px 36px rgba(0, 102, 255, 0.04),
              0 1px 3px rgba(0, 0, 0, 0.02) !important;
}

/* 상단 커버 아트 배너 */
.settings-summary__cover {
  position: relative;
  height: 96px;
  background: #0f172a;
  overflow: hidden;
  flex-shrink: 0;
}

.settings-summary__cover img {
  transform: none !important;
  transition: none !important;
}

.settings-summary:hover .settings-summary__cover img {
  transform: none !important;
}

.summary-cover-art {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, #1e3a8a 0%, #0066ff 100%);
}

/* 상단 중앙 아바타 (하단 여백 축소: 0) */
.settings-summary__avatar-wrap {
  position: relative;
  display: flex;
  justify-content: center;
  margin: -20px auto 0;
  z-index: 2;
  flex-shrink: 0;
}

.settings-summary__avatar-outer {
  position: relative;
  width: 104px;
  height: 104px;
}

/* 프로필 이미지 호버링 효과 완전 제거 */
.settings-summary__avatar {
  position: relative;
  width: 104px;
  height: 104px;
  border-radius: 50%;
  overflow: hidden;
  border: 4px solid #ffffff;
  background: linear-gradient(135deg, var(--violet, #0066ff) 0%, var(--blue, #00d1ff) 100%);
  color: #ffffff;
  font-size: 32px;
  font-weight: 900;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 6px 18px rgba(0, 102, 255, 0.14);
  cursor: default;
  pointer-events: none;
  transform: none !important;
  transition: none !important;
}

.settings-summary:hover .settings-summary__avatar,
.settings-summary__avatar:hover {
  transform: none !important;
  box-shadow: 0 6px 18px rgba(0, 102, 255, 0.14) !important;
}

.settings-summary__avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  transform: none !important;
  transition: none !important;
}

.avatar-fallback {
  user-select: none;
}

/* 프로필 텍스트 정보 (아바타와의 상단 여백 축소) */
.settings-summary__profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 8px 24px 24px;
  text-align: center;
}

.settings-summary__name {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--ink, #1a2033);
  letter-spacing: -0.02em;
}

/* 계정 이메일 정보 */
.settings-summary__email-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.settings-summary__email-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.03);
  border: 1px solid rgba(0, 0, 0, 0.05);
  font-size: 12px;
  color: var(--muted, #68718a);
  font-weight: 500;
}

.settings-summary__email-pill span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-summary__email-pill .email-icon {
  font-size: 14px;
  color: var(--muted, #68718a);
}

/* 소개문구 영역 (정적 텍스트 표시) */
.settings-summary__bio-section {
  width: 100%;
  margin-top: 8px;
}

.settings-summary__bio {
  margin: 0;
  font-size: 12.5px;
  color: var(--muted, #68718a);
  line-height: 1.5;
  word-break: keep-all;
  text-align: center;
  padding: 12px 14px;
  border-radius: 12px;
  background: rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(0, 0, 0, 0.04);
}

/* ==========================================================================
   우측 2열: 카드 그룹 (환경설정과 계정관리 카드가 붙어있도록 구성)
   ========================================================================== */
.settings-cards-group {
  display: flex;
  flex-direction: column;
  gap: 0;
  margin-top: 0;
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 16px 36px rgba(0, 102, 255, 0.04),
              0 1px 3px rgba(0, 0, 0, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.75);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.settings-panel {
  display: flex;
  flex-direction: column;
  justify-content: flex-start;
  gap: 18px;
  padding: 24px;
  background: transparent;
  border: none;
  border-radius: 0;
  box-shadow: none;
}

.settings-panel--unified {
  border-bottom: 1px solid rgba(227, 234, 244, 0.8);
}

/* 패널 헤더 */
.settings-panel__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.panel-head-title-group {
  display: flex;
  align-items: center;
  gap: 10px;
}

.panel-head-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  flex-shrink: 0;
  transform: none;
  transition: none;
}

.settings-panel:hover .panel-head-icon {
  transform: none;
}

.panel-head-icon--violet {
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet, #0066ff);
  border: 1px solid rgba(0, 102, 255, 0.16);
}

.panel-head-icon--orange {
  background: rgba(255, 92, 141, 0.08);
  color: var(--rose, #ff5c8d);
  border: 1px solid rgba(255, 92, 141, 0.18);
}

.panel-head-icon .material-symbols-rounded {
  font-size: 20px;
}

.panel-head-title-group h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 800;
  color: var(--ink, #1a2033);
  letter-spacing: -0.02em;
}

/* ==========================================================================
   통합 환경설정 카드 내부 항목 (Items List - 슬림화)
   ========================================================================== */
.settings-items-list {
  display: grid;
  gap: 12px;
}

.settings-item-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  min-height: 72px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.65);
  border: 1px solid rgba(227, 234, 244, 0.85);
  border-radius: 14px;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.settings-item-card:hover {
  background: #ffffff;
  border-color: rgba(0, 102, 255, 0.25);
}

.settings-item-card--toggle {
  cursor: pointer;
}

.settings-item__icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: rgba(0, 102, 255, 0.06);
  border: 1px solid rgba(0, 102, 255, 0.1);
  color: var(--violet, #0066ff);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.settings-item__icon-wrap .material-symbols-rounded {
  font-size: 19px;
}

.settings-item__info {
  flex: 1;
  min-width: 0;
}

.settings-item__title {
  display: block;
  font-size: 14px;
  font-weight: 800;
  color: var(--ink, #1a2033);
  margin-bottom: 2px;
  letter-spacing: -0.01em;
}

.settings-item__desc {
  margin: 0;
  font-size: 12px;
  color: var(--muted, #68718a);
  line-height: 1.35;
  word-break: keep-all;
}

.settings-item__control {
  flex-shrink: 0;
}

/* 셀렉트 드롭다운 */
.settings-select-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}

.settings-select {
  min-width: 100px;
  height: 40px;
  min-height: 40px;
  padding: 0 30px 0 12px;
  border-radius: 10px;
  background: #ffffff;
  border: 1.5px solid var(--line, #e3eaf4);
  color: var(--ink, #1a2033);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  appearance: none;
  -webkit-appearance: none;
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.settings-select:hover {
  border-color: rgba(0, 102, 255, 0.35);
}

.settings-select:focus {
  outline: none;
  border-color: var(--violet, #0066ff);
  box-shadow: 0 0 0 3px rgba(0, 102, 255, 0.12);
}

.select-chevron {
  position: absolute;
  right: 10px;
  color: var(--muted, #68718a);
  pointer-events: none;
  font-size: 16px;
}

/* 세그먼트 컨트롤 */
.visibility-segmented-control {
  display: inline-grid;
  grid-template-columns: auto auto;
  gap: 2px;
  padding: 2px;
  background: rgba(0, 0, 0, 0.05);
  border-radius: 10px;
  border: 1px solid rgba(0, 0, 0, 0.04);
}

.visibility-segment-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 34px;
  min-height: 34px;
  padding: 0 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  color: var(--muted, #68718a);
  font-size: 11.5px;
  font-weight: 700;
  cursor: pointer;
  transition: color 0.2s ease, background-color 0.2s ease;
  white-space: nowrap;
}

.visibility-segment-btn:hover:not(.is-active):not(:disabled) {
  color: var(--ink, #1a2033);
}

.visibility-segment-btn.is-active {
  background: #ffffff;
  color: var(--violet, #0066ff);
  font-weight: 800;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.06);
}

.visibility-segment-btn .material-symbols-rounded {
  font-size: 14px;
}

.visibility-segment-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* 토글 스위치 컴포넌트 */
.switch-control {
  position: relative;
  display: inline-block;
  width: 40px;
  height: 24px;
  flex-shrink: 0;
  cursor: pointer;
}

.switch-control input {
  opacity: 0;
  width: 0;
  height: 0;
  position: absolute;
}

.switch-track {
  position: absolute;
  inset: 0;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 34px;
  transition: background-color 0.25s ease;
}

.switch-track::after {
  content: "";
  position: absolute;
  height: 18px;
  width: 18px;
  left: 3px;
  bottom: 3px;
  background-color: #ffffff;
  border-radius: 50%;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.18);
  transition: transform 0.25s ease;
}

.switch-control input:checked + .switch-track {
  background: var(--violet, #0066ff);
}

.switch-control input:checked + .switch-track::after {
  transform: translateX(16px);
}

/* 하단 액션 영역 (저장 바) */
.settings-section--actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 2px;
  min-height: 38px;
}

.settings-actions-status {
  flex: 1;
  min-width: 0;
}

.settings-save-status {
  margin: 0;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 700;
}

.settings-save-status .material-symbols-rounded {
  font-size: 16px;
}

.error-status {
  color: var(--rose, #ff5c8d);
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(255, 92, 141, 0.08);
  border: 1px solid rgba(255, 92, 141, 0.2);
}

.settings-actions-buttons {
  margin-left: auto;
}

/* 저장 버튼 */
.settings-save-btn {
  height: 40px;
  min-height: 40px;
  padding: 0 20px;
  border-radius: 10px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
  border: none;
  background: var(--violet, #0066ff);
  color: #ffffff;
  box-shadow: 0 3px 10px rgba(0, 102, 255, 0.18);
  transition: background-color 0.2s ease;
}

.settings-save-btn:hover:not(:disabled) {
  background: #0052cc;
}

.settings-save-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* ==========================================================================
   2. 회원 정보 삭제 카드 (환경설정 카드 바로 아래 부착)
   ========================================================================== */
.settings-panel--danger {
  background: rgba(255, 92, 141, 0.02);
}

.settings-danger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

/* 계정관리 설명 텍스트 2행 표시 */
.settings-danger-bullet-list {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.danger-bullet-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  color: var(--ink, #1a2033);
  font-weight: 600;
  line-height: 1.35;
}

.danger-bullet-item .bullet-icon {
  font-size: 15px;
  color: var(--rose, #ff5c8d);
  flex-shrink: 0;
}

.settings-danger-action {
  flex-shrink: 0;
}

.danger-action-btn {
  height: 40px;
  min-height: 40px;
  padding: 0 18px;
  border-radius: 10px;
  border: 1.5px solid rgba(255, 92, 141, 0.35);
  background: #ffffff;
  color: var(--rose, #ff5c8d);
  font-size: 12.5px;
  font-weight: 800;
  cursor: pointer;
  transition: all 0.2s ease;
}

.danger-action-btn:hover:not(:disabled) {
  background: var(--rose, #ff5c8d);
  color: #ffffff;
  border-color: var(--rose, #ff5c8d);
}

.danger-action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ==========================================================================
   반응형 모바일 미디어 쿼리 (Responsive)
   ========================================================================== */
@media (max-width: 900px) {
  .settings-layout {
    grid-template-columns: 1fr;
    gap: 16px;
  }

  .settings-summary {
    width: 100%;
  }

  .settings-cards-group {
    width: 100%;
  }

  .settings-panel {
    padding: 16px 14px;
  }

  .settings-item-card {
    padding: 10px 12px;
    gap: 10px;
  }

  .settings-section--actions {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .settings-actions-buttons,
  .settings-save-btn {
    width: 100%;
  }

  .settings-danger-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .settings-danger-bullet-list {
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
  }

  .danger-action-btn {
    width: 100%;
  }
}
</style>
