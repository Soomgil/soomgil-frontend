<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AppHeader from '@/components/layout/AppHeader.vue'
import OAuthButtons from '@/components/auth/OAuthButtons.vue'
import { getAuthErrorMessage } from '@/utils/auth-error'

const router = useRouter()
const { login, loginWithOAuth } = useAuth()

const email = ref('')
const password = ref('')
const rememberMe = ref(true)
const submitting = ref(false)
const submitError = ref<string | null>(null)

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
            <h1>함께 만들던 여행을 바로 이어가세요</h1>
            <p>초대받은 여행방, 저장한 루트, 멤버 취향 분석이 계정에 안전하게 동기화되어 있습니다.</p>
          </div>
        </div>

        <form class="auth-form auth-modern-form" aria-label="로그인" @submit.prevent="handleLogin">
          <div class="auth-form-head">
            <h2>로그인</h2>
            <p>내 여행 대시보드로 돌아가 계획을 계속 정리하세요.</p>
          </div>

          <OAuthButtons mode="signin" :disabled="submitting" @select="handleOAuthLogin" />

          <div class="divider"><span>또는 이메일로 로그인</span></div>

          <label>
            <span class="small muted">이메일</span>
            <span class="auth-field-wrap"><span class="material-symbols-rounded">mail</span><input v-model="email" class="field" type="email" aria-label="이메일"></span>
          </label>
          <label>
            <span class="small muted">비밀번호</span>
            <span class="auth-field-wrap"><span class="material-symbols-rounded">lock</span><input v-model="password" class="field" type="password" aria-label="비밀번호"></span>
          </label>
          <div class="auth-form-options">
            <label class="auth-check"><input v-model="rememberMe" type="checkbox"> 로그인 유지</label>
            <a href="#" @click.prevent="router.push('/reset-password')">비밀번호 찾기</a>
          </div>

          <p v-if="submitError" class="auth-submit-error" role="alert">{{ submitError }}</p>

          <button class="btn primary auth-main-action" type="submit" :disabled="submitting">
            <span class="material-symbols-rounded">login</span>로그인
          </button>
          <p class="small muted auth-switch">계정이 없나요? <a href="#" @click.prevent="router.push('/register')">회원가입</a></p>
        </form>
      </section>
    </main>
  </div>
</template>
