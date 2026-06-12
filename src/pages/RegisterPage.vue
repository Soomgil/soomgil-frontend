<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import AppHeader from '@/components/layout/AppHeader.vue'

const router = useRouter()
const { register } = useAuth()

const name = ref('김여행')
const email = ref('traveler@tripmates.kr')
const password = ref('tripmates')
const agreeTerms = ref(true)

const heroImg = '/images/랜딩페이지/jeonju.png'

async function handleRegister() {
  if (!agreeTerms.value) return
  try {
    await register(name.value, email.value, password.value)
  } catch {
    // 에러는 인터셉터에서 처리
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
            <p>가입 후 여행방을 만들고 멤버를 초대하면 취향 수집, 경로 관리, 커뮤니티 저장까지 한 번에 시작할 수 있습니다.</p>
          </div>
        </div>

        <form class="auth-form auth-modern-form" aria-label="회원가입" @submit.prevent="handleRegister">
          <div class="auth-form-head">
            <h2>회원가입</h2>
            <p>그룹 여행 설계를 시작할 계정을 만들어보세요.</p>
          </div>

          <div class="oauth-row" aria-label="간편 가입">
            <button class="oauth-btn google" type="button"><span>G</span>Google</button>
            <button class="oauth-btn kakao" type="button"><span>K</span>Kakao</button>
            <button class="oauth-btn naver" type="button"><span>N</span>Naver</button>
          </div>

          <div class="divider"><span>또는 이메일로 가입</span></div>

          <label>
            <span class="small muted">이름</span>
            <span class="auth-field-wrap"><span class="material-symbols-rounded">person</span><input v-model="name" class="field" type="text" aria-label="이름"></span>
          </label>
          <label>
            <span class="small muted">이메일</span>
            <span class="auth-field-wrap"><span class="material-symbols-rounded">mail</span><input v-model="email" class="field" type="email" aria-label="이메일"></span>
          </label>
          <label>
            <span class="small muted">비밀번호</span>
            <span class="auth-field-wrap"><span class="material-symbols-rounded">lock</span><input v-model="password" class="field" type="password" aria-label="비밀번호"></span>
          </label>

          <label class="auth-check auth-terms-check">
            <input v-model="agreeTerms" type="checkbox">
            서비스 약관과 개인정보 처리방침에 동의합니다.
          </label>

          <button class="btn primary auth-main-action" type="submit">
            <span class="material-symbols-rounded">arrow_forward</span>가입하고 취향 수집 시작
          </button>
          <p class="small muted auth-switch">이미 계정이 있나요? <a href="#" @click.prevent="router.push('/login')">로그인</a></p>
        </form>
      </section>
    </main>
  </div>
</template>
