<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AppHeader from '@/components/layout/AppHeader.vue'
import OAuthButtons from '@/components/auth/OAuthButtons.vue'
import { getAuthErrorMessage } from '@/utils/auth-error'
import { useLocale } from '@/i18n'

const router = useRouter()
const route = useRoute()
const { login, loginWithOAuth } = useAuth()
const { t } = useLocale()

const email = ref('')
const password = ref('')
const rememberMe = ref(true)
const submitting = ref(false)
const submitError = ref<string | null>(null)
const completionMessage = computed(() => {
  if (route.query.verified === '1') return '이메일 인증이 완료됐습니다. 로그인해주세요.'
  if (route.query.reset === '1') return '비밀번호가 변경됐습니다. 새 비밀번호로 로그인해주세요.'
  return ''
})

const heroImg = '/images/랜딩페이지/korea_hero.png'

async function handleLogin() {
  if (submitting.value) return
  submitting.value = true
  submitError.value = null
  try {
    await login(email.value, password.value, rememberMe.value)
  } catch (error) {
    submitError.value = getAuthErrorMessage(error, 'login')
  } finally {
    submitting.value = false
  }
}

// OAuth — Kakao/Google은 백엔드 지원.
async function handleOAuthLogin(provider: 'kakao' | 'google') {
  submitError.value = null
  try {
    await loginWithOAuth(provider)
  } catch (error) {
    submitError.value = getAuthErrorMessage(error, 'oauth')
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
            :style="{ backgroundImage: `linear-gradient(180deg, rgba(9, 18, 34, 0.05), rgba(9, 18, 34, 0.72)), url(${heroImg})` }"
          ></div>
          <div class="auth-visual-content">
            <p class="eyebrow">Welcome Back</p>
            <h1>{{ t('login.hero') }}</h1>
            <p>{{ t('login.heroDesc') }}</p>
          </div>
        </div>

        <form class="auth-form auth-modern-form" aria-label="로그인" @submit.prevent="handleLogin">
          <div class="auth-form-head">
            <h2>{{ t('auth.login') }}</h2>
            <p>{{ t('login.desc') }}</p>
          </div>

          <OAuthButtons mode="signin" :disabled="submitting" @select="handleOAuthLogin" />
          <div class="divider"><span>{{ t('login.emailOption') }}</span></div>

          <label>
            <span class="small muted">{{ t('login.email') }}</span>
            <span class="auth-field-wrap"><span class="material-symbols-rounded">mail</span><input v-model="email" class="field" type="email" aria-label="이메일"></span>
          </label>
          <label>
            <span class="small muted">{{ t('login.password') }}</span>
            <span class="auth-field-wrap"><span class="material-symbols-rounded">lock</span><input v-model="password" class="field" type="password" aria-label="비밀번호"></span>
          </label>
          <div class="auth-form-options">
            <label class="auth-check"><input v-model="rememberMe" type="checkbox"> {{ t('login.remember') }}</label>
            <a href="#" @click.prevent="router.push('/reset-password')">{{ t('login.forgot') }}</a>
          </div>

          <div class="auth-feedback-slot" data-testid="auth-feedback" aria-live="polite">
            <p v-if="completionMessage" class="auth-success-message" role="status">{{ completionMessage }}</p>
            <p v-if="submitError" class="auth-submit-error" role="alert">{{ submitError }}</p>
          </div>

          <button class="btn primary auth-main-action" type="submit" :disabled="submitting">
            <span class="material-symbols-rounded">login</span>{{ t('auth.login') }}
          </button>

          <p class="small muted auth-switch">{{ t('login.noAccount') }} <a href="#" @click.prevent="router.push('/register')">{{ t('auth.register') }}</a></p>
        </form>
      </section>
    </main>
  </div>
</template>
