<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { useAuthStore } from '@/stores/auth.store'
import { authApi } from '@/api/auth.api'
import type { PolicyDocument } from '@/types/auth'
import AppHeader from '@/components/layout/AppHeader.vue'
import OAuthButtons from '@/components/auth/OAuthButtons.vue'
import { getAuthErrorMessage } from '@/utils/auth-error'

const router = useRouter()
const route = useRoute()
const { register, loginWithOAuth } = useAuth()
const authStore = useAuthStore()

const name = ref('')
const email = ref('')
const password = ref('')
const submitting = ref(false)
const policies = ref<PolicyDocument[]>([])
const acceptedIds = ref<Set<string>>(new Set())
const submitError = ref<string | null>(null)
const policyError = ref<string | null>(null)
const loadingPolicies = ref(true)

const heroImg = '/images/랜딩페이지/jeonju.png'

const isOAuthOnboarding = computed(() => route.query.oauth === '1')

// 소셜 로그인인 경우 이미 발급된 정보(예: 닉네임)가 있다면 기본값 지정
onMounted(() => {
  if (isOAuthOnboarding.value && authStore.user) {
    name.value = authStore.user.displayName || ''
  }
})

const allAccepted = computed(() =>
  policies.value.length > 0 && policies.value.every(p => acceptedIds.value.has(p.id)),
)

function togglePolicy(id: string, checked: boolean) {
  if (checked) acceptedIds.value.add(id)
  else acceptedIds.value.delete(id)
}

function toggleAll(checked: boolean) {
  if (checked) {
    policies.value.forEach(p => acceptedIds.value.add(p.id))
  } else {
    acceptedIds.value.clear()
  }
}

async function loadPolicies() {
  loadingPolicies.value = true
  policyError.value = null
  try {
    policies.value = await authApi.getPolicyDocuments('ko', true)
  } catch {
    policies.value = []
    policyError.value = '약관을 불러오지 못했습니다. 서버 연결을 확인하고 다시 시도해 주세요.'
  } finally {
    loadingPolicies.value = false
  }
}

onMounted(loadPolicies)

async function handleOAuthLogin(provider: 'kakao' | 'google') {
  submitError.value = null
  try {
    await loginWithOAuth(provider)
  } catch (error) {
    submitError.value = getAuthErrorMessage(error, 'oauth')
  }
}

async function handleRegister() {
  if (!allAccepted.value || submitting.value) return
  submitting.value = true
  submitError.value = null
  try {
    if (isOAuthOnboarding.value) {
      await authStore.onboard(name.value, Array.from(acceptedIds.value))
      router.push('/home')
    } else {
      await register({
        displayName: name.value,
        email: email.value,
        password: password.value,
        acceptedPolicyDocumentIds: Array.from(acceptedIds.value),
      })
    }
  } catch (error) {
    submitError.value = getAuthErrorMessage(error, isOAuthOnboarding.value ? 'oauth' : 'register')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="app-shell">
    <AppHeader />

    <main class="auth-page auth-modern-page">
      <section class="auth-card auth-modern-card">
        <div class="auth-visual-panel">
          <div
            class="auth-visual-image"
            :style="{ backgroundImage: `linear-gradient(180deg, rgba(9, 18, 34, 0.04), rgba(9, 18, 34, 0.72)), url(${heroImg})` }"
          ></div>
          <div class="auth-visual-content">
            <p class="eyebrow">Create Account</p>
            <h1>친구들과 여행 취향부터 맞춰보세요</h1>
            <p>가입 후 개인 취향을 먼저 수집하고, 여행방에서는 멤버들의 취향을 합친 장소 추천을 받을 수 있습니다.</p>
          </div>
        </div>

        <form class="auth-form auth-modern-form" aria-label="회원가입" @submit.prevent="handleRegister">
          <div class="auth-form-head">
            <h2>{{ isOAuthOnboarding ? '가입 완료' : '회원가입' }}</h2>
            <p>{{ isOAuthOnboarding ? '소셜 로그인을 위해 닉네임과 필수 약관에 동의해주세요.' : '그룹 여행 설계를 시작할 계정을 만들어보세요.' }}</p>
          </div>

          <template v-if="!isOAuthOnboarding">
            <OAuthButtons mode="signup" :disabled="submitting" @select="handleOAuthLogin" />

            <div class="divider"><span>또는 이메일로 가입</span></div>
          </template>

          <label>
            <span class="small muted">닉네임</span>
            <span class="auth-field-wrap"><span class="material-symbols-rounded">person</span><input v-model="name" class="field" type="text" aria-label="닉네임"></span>
          </label>

          <template v-if="!isOAuthOnboarding">
            <label>
              <span class="small muted">이메일</span>
              <span class="auth-field-wrap"><span class="material-symbols-rounded">mail</span><input v-model="email" class="field" type="email" aria-label="이메일"></span>
            </label>
            <label>
              <span class="small muted">비밀번호</span>
              <span class="auth-field-wrap"><span class="material-symbols-rounded">lock</span><input v-model="password" class="field" type="password" aria-label="비밀번호"></span>
            </label>
          </template>

          <div class="auth-policy-slot">
            <div v-if="policies.length" class="auth-terms-check" style="margin-top: 12px;">
              <label class="auth-check">
                <input type="checkbox" :checked="allAccepted" @change="toggleAll(($event.target as HTMLInputElement).checked)">
                <strong>전체 약관 동의</strong>
              </label>
              <div style="margin-top: 8px; display: flex; flex-direction: column; gap: 8px;">
                <label v-for="p in policies" :key="p.id" class="auth-check">
                  <input
                    type="checkbox"
                    :checked="acceptedIds.has(p.id)"
                    @change="togglePolicy(p.id, ($event.target as HTMLInputElement).checked)"
                  >
                  <a v-if="p.contentUrl" :href="p.contentUrl" target="_blank" style="text-decoration: underline;">{{ p.title }}</a>
                  <span v-else>{{ p.title }}</span>
                  <span class="small muted" style="margin-left: 4px;">(필수)</span>
                </label>
              </div>
            </div>
            <p v-else-if="loadingPolicies" class="small muted" style="margin-top: 12px;">약관을 불러오는 중...</p>
            <div v-else-if="policyError" class="auth-submit-error" role="alert">
              <span>{{ policyError }}</span>
              <button data-testid="retry-policies" class="auth-error-retry" type="button" @click="loadPolicies">다시 시도</button>
            </div>
          </div>

          <div class="auth-feedback-slot" data-testid="auth-feedback" aria-live="polite">
            <p v-if="submitError" class="auth-submit-error" role="alert">{{ submitError }}</p>
          </div>

          <button class="btn primary auth-main-action" type="submit" :disabled="submitting || !allAccepted">
            <span class="material-symbols-rounded">arrow_forward</span>{{ isOAuthOnboarding ? '동의하고 시작하기' : '가입하고 취향 수집 시작' }}
          </button>

          <p v-if="!isOAuthOnboarding" class="small muted auth-switch">이미 계정이 있나요? <a href="#" @click.prevent="router.push('/login')">로그인</a></p>
        </form>
      </section>
    </main>
  </div>
</template>
