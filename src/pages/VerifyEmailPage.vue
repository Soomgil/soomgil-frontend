<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { authApi } from '@/api/auth.api'
import AppHeader from '@/components/layout/AppHeader.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuth()

const email = ref((route.query.email as string) || '')
const token = ref((route.query.token as string) || '')
const submitting = ref(false)
const resendMessage = ref('')
const verificationError = ref('')
const resendError = ref('')

async function handleVerify() {
  if (!token.value.trim()) return
  submitting.value = true
  verificationError.value = ''
  try {
    await auth.verifyEmail(token.value.trim())
    router.push({ path: '/login', query: { verified: '1' } })
  } catch {
    verificationError.value = '인증 링크가 만료되었거나 유효하지 않습니다. 인증 메일을 다시 받아주세요.'
  } finally {
    submitting.value = false
  }
}

async function handleResend() {
  if (!email.value) return
  resendError.value = ''
  resendMessage.value = ''
  try {
    await authApi.sendEmailVerification({ email: email.value })
    resendMessage.value = '인증 메일을 다시 발송했습니다.'
  } catch {
    resendError.value = '인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해주세요.'
  }
}

onMounted(() => {
  if (token.value) void handleVerify()
})
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="auth-page auth-modern-page">
      <section class="auth-card auth-modern-card" style="grid-template-columns: 1fr;">
        <form class="auth-form auth-modern-form" aria-label="이메일 인증" @submit.prevent="handleVerify">
          <div class="auth-form-head">
            <h2>이메일 인증</h2>
            <p>가입하신 이메일로 발송된 인증 토큰을 입력해 계정을 활성화하세요.</p>
          </div>

          <p v-if="email" class="small muted" style="margin-bottom: 12px;">
            <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle;">mail</span>
            {{ email }}
          </p>

          <label>
            <span class="small muted">인증 토큰</span>
            <span class="auth-field-wrap">
              <span class="material-symbols-rounded">vpn_key</span>
              <input v-model="token" class="field" type="text" placeholder="이메일에서 복사한 토큰" aria-label="인증 토큰">
            </span>
          </label>

          <button class="btn primary auth-main-action" type="submit" :disabled="submitting">
            <span class="material-symbols-rounded">verified</span>인증 완료
          </button>

          <p v-if="verificationError" class="auth-submit-error" role="alert">{{ verificationError }}</p>

          <div class="auth-form-options" style="justify-content: space-between;">
            <a href="#" @click.prevent="handleResend">인증 메일 다시 보내기</a>
            <a href="#" @click.prevent="router.push('/login')">로그인으로</a>
          </div>

          <p v-if="resendMessage" class="small" style="color: var(--blue);">{{ resendMessage }}</p>
          <p v-if="resendError" class="auth-submit-error" role="alert">{{ resendError }}</p>
        </form>
      </section>
    </main>
  </div>
</template>
