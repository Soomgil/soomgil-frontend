<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '@/api/auth.api'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useLocale } from '@/i18n'

const router = useRouter()
const route = useRoute()
const { tr } = useLocale()

const initialToken = (route.query.token as string) || ''
const step = ref<'request' | 'confirm'>(initialToken ? 'confirm' : 'request')
const email = ref((route.query.email as string) || '')
const token = ref(initialToken)
const newPassword = ref('')
const submitting = ref(false)
const requestMessage = ref('')
const submitError = ref('')

async function handleRequest() {
  if (!email.value.trim()) return
  submitting.value = true
  submitError.value = ''
  try {
    await authApi.requestPasswordReset(email.value.trim())
    requestMessage.value = tr('재설정 메일을 발송했습니다. 메일의 링크를 열거나 토큰을 입력해주세요.', 'Reset email sent. Open the link or enter the token from the email.')
    step.value = 'confirm'
  } catch {
    submitError.value = tr('재설정 메일을 발송하지 못했습니다. 잠시 후 다시 시도해주세요.', 'Could not send the reset email. Please try again later.')
  } finally {
    submitting.value = false
  }
}

async function handleReset() {
  if (!token.value.trim() || !newPassword.value) return
  submitting.value = true
  submitError.value = ''
  try {
    await authApi.resetPassword({
      token: token.value.trim(),
      newPassword: newPassword.value,
    })
    router.push({ path: '/login', query: { reset: '1' } })
  } catch {
    submitError.value = tr('재설정 링크가 만료되었거나 새 비밀번호를 사용할 수 없습니다.', 'The reset link expired or the new password cannot be used.')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="auth-page auth-modern-page">
      <section class="auth-card auth-modern-card" style="grid-template-columns: 1fr;">
        <form class="auth-form auth-modern-form" @submit.prevent="step === 'request' ? handleRequest() : handleReset()">
          <div class="auth-form-head">
            <h2>{{ tr('비밀번호 재설정', 'Reset password') }}</h2>
            <p v-if="step === 'request'">{{ tr('가입하신 이메일을 입력하면 재설정 토큰을 발송합니다.', 'Enter your account email to receive a reset token.') }}</p>
            <p v-else>{{ tr('이메일로 받은 토큰과 새 비밀번호를 입력하세요.', 'Enter the token from your email and a new password.') }}</p>
          </div>

          <template v-if="step === 'request'">
            <label>
              <span class="small muted">{{ tr('이메일', 'Email') }}</span>
              <span class="auth-field-wrap">
                <span class="material-symbols-rounded">mail</span>
                <input v-model="email" class="field" type="email" :aria-label="tr('이메일', 'Email')">
              </span>
            </label>
            <button class="btn primary auth-main-action" type="submit" :disabled="submitting">
              <span class="material-symbols-rounded">send</span>{{ tr('재설정 메일 발송', 'Send reset email') }}
            </button>
          </template>

          <p v-if="submitError" class="auth-submit-error" role="alert">{{ submitError }}</p>

          <template v-else>
            <p v-if="requestMessage" class="small" style="color: var(--blue); margin-bottom: 8px;">{{ requestMessage }}</p>
            <label>
              <span class="small muted">{{ tr('재설정 토큰', 'Reset token') }}</span>
              <span class="auth-field-wrap">
                <span class="material-symbols-rounded">vpn_key</span>
                <input v-model="token" class="field" type="text" :aria-label="tr('재설정 토큰', 'Reset token')">
              </span>
            </label>
            <label>
              <span class="small muted">{{ tr('새 비밀번호', 'New password') }}</span>
              <span class="auth-field-wrap">
                <span class="material-symbols-rounded">lock</span>
                <input v-model="newPassword" class="field" type="password" :aria-label="tr('새 비밀번호', 'New password')">
              </span>
            </label>
            <button class="btn primary auth-main-action" type="submit" :disabled="submitting">
              <span class="material-symbols-rounded">lock_reset</span>{{ tr('비밀번호 재설정', 'Reset password') }}
            </button>
          </template>

          <p class="small muted auth-switch">
            <a href="#" @click.prevent="router.push('/login')">{{ tr('로그인으로 돌아가기', 'Back to login') }}</a>
          </p>
        </form>
      </section>
    </main>
  </div>
</template>
