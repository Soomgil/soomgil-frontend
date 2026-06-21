<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AppHeader from '@/components/layout/AppHeader.vue'

const router = useRouter()
const { login, loginWithOAuth } = useAuth()

const email = ref('')
const password = ref('')
const rememberMe = ref(true)

const heroImg = '/images/랜딩페이지/korea_hero.png'

async function handleLogin() {
  try {
    await login(email.value, password.value, rememberMe.value)
  } catch {
    // 에러는 인터셉터에서 처리
  }
}

// OAuth — Kakao/Google은 백엔드 지원.
async function handleOAuthLogin(provider: 'kakao' | 'google') {
  try {
    await loginWithOAuth(provider)
  } catch {
    // 에러는 인터셉터에서 처리 (예: 백엔드에 client_id 미설정 → OAUTH_NOT_CONFIGURED)
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

          <div class="oauth-row" aria-label="간편 로그인">
            <button class="oauth-btn google" type="button" @click="handleOAuthLogin('google')"><span>G</span>Google</button>
            <button class="oauth-btn kakao" type="button" @click="handleOAuthLogin('kakao')"><span>K</span>Kakao</button>
          </div>

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

          <button class="btn primary auth-main-action" type="submit">
            <span class="material-symbols-rounded">login</span>로그인
          </button>
          <p class="small muted auth-switch">계정이 없나요? <a href="#" @click.prevent="router.push('/register')">회원가입</a></p>
        </form>
      </section>
    </main>
  </div>
</template>
