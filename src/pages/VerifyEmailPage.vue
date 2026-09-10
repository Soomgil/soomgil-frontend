<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { authApi } from '@/api/auth.api'
import AppHeader from '@/components/layout/AppHeader.vue'
import { useLocale } from '@/i18n'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const { tr } = useLocale()

const email = ref((route.query.email as string) || '')
const token = ref((route.query.token as string) || '')
const submitting = ref(false)
const resendMessage = ref('')
const verificationError = ref('')
const resendError = ref('')
const verificationSucceeded = ref(false)

const VERIFICATION_EVENT_KEY = 'soomgil.email-verification.completed'
const VERIFICATION_EVENT_MAX_AGE_MS = 10 * 60 * 1000
let verificationChannel: BroadcastChannel | null = null

interface VerificationEvent {
  email: string
  completedAt: number
}

function parseVerificationEvent(raw: string | null): VerificationEvent | null {
  if (!raw) return null
  try {
    const event = JSON.parse(raw) as Partial<VerificationEvent>
    if (typeof event.email !== 'string' || typeof event.completedAt !== 'number') return null
    return { email: event.email, completedAt: event.completedAt }
  } catch {
    return null
  }
}

function applyExternalVerification(event: VerificationEvent | null) {
  if (!event || !email.value || token.value || verificationSucceeded.value) return
  if (Date.now() - event.completedAt > VERIFICATION_EVENT_MAX_AGE_MS) return
  if (event.email.trim().toLowerCase() !== email.value.trim().toLowerCase()) return
  verificationSucceeded.value = true
  verificationError.value = ''
}

function notifyVerificationCompleted(verifiedEmail: string) {
  const event: VerificationEvent = { email: verifiedEmail, completedAt: Date.now() }
  localStorage.setItem(VERIFICATION_EVENT_KEY, JSON.stringify(event))
  verificationChannel?.postMessage(event)
}

function handleStorage(event: StorageEvent) {
  if (event.key === VERIFICATION_EVENT_KEY) {
    applyExternalVerification(parseVerificationEvent(event.newValue))
  }
}

function goToLogin() {
  void router.replace({ path: '/login', query: { verified: '1' } })
}

async function handleVerify() {
  if (!token.value.trim()) return
  submitting.value = true
  verificationError.value = ''
  try {
    const verifiedUser = await auth.verifyEmail(token.value.trim())
    verificationSucceeded.value = true
    notifyVerificationCompleted(verifiedUser.email || email.value)
  } catch {
    verificationError.value = tr('인증 링크가 만료되었거나 유효하지 않습니다. 인증 메일을 다시 받아주세요.', 'The verification link is expired or invalid. Request a new verification email.')
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
    resendMessage.value = tr('인증 메일을 다시 발송했습니다.', 'Verification email sent again.')
  } catch {
    resendError.value = tr('인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해주세요.', 'Could not send the verification email. Please try again later.')
  }
}

onMounted(() => {
  window.addEventListener('storage', handleStorage)
  if (typeof BroadcastChannel !== 'undefined') {
    verificationChannel = new BroadcastChannel('soomgil-auth')
    verificationChannel.onmessage = (message: MessageEvent<VerificationEvent>) => {
      applyExternalVerification(message.data)
    }
  }

  applyExternalVerification(parseVerificationEvent(localStorage.getItem(VERIFICATION_EVENT_KEY)))
  if (token.value) void handleVerify()
})

onUnmounted(() => {
  window.removeEventListener('storage', handleStorage)
  verificationChannel?.close()
})
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="auth-page auth-modern-page">
      <section class="auth-card auth-modern-card" style="grid-template-columns: 1fr;">
        <form class="auth-form auth-modern-form" :aria-label="tr('이메일 인증', 'Email verification')" @submit.prevent="handleVerify">
          <div v-if="verificationSucceeded" class="oauth-callback-state" role="status">
            <span class="material-symbols-rounded verification-success-icon" aria-hidden="true">mark_email_read</span>
            <h2>{{ tr('이메일 인증이 완료됐어요', 'Email verified') }}</h2>
            <p class="small muted">{{ tr('계정이 활성화되었습니다. 이제 가입한 이메일로 로그인할 수 있어요.', 'Your account is active. You can now log in with your email.') }}</p>
            <button data-testid="go-login" class="btn primary auth-main-action" type="button" @click="goToLogin">
              <span class="material-symbols-rounded">login</span>{{ tr('로그인하기', 'Log in') }}
            </button>
          </div>

          <template v-else>
          <div class="auth-form-head">
            <h2>{{ submitting ? tr('이메일 인증 중…', 'Verifying email…') : tr('인증 메일을 확인해주세요', 'Check your verification email') }}</h2>
            <p v-if="token">{{ tr('인증 링크를 확인하고 있습니다. 잠시만 기다려주세요.', 'Checking the verification link. Please wait.') }}</p>
            <p v-else>{{ tr('메일의 인증 버튼을 누르면 이 화면에도 완료 상태가 표시됩니다.', 'After selecting the verification button in the email, this page will show the result.') }}</p>
          </div>

          <p v-if="email" class="small muted" style="margin-bottom: 12px;">
            <span class="material-symbols-rounded" style="font-size: 16px; vertical-align: middle;">mail</span>
            {{ email }}
          </p>

          <details v-if="!submitting" class="verification-token-fallback">
            <summary>{{ tr('인증 링크가 열리지 않나요?', 'Having trouble opening the link?') }}</summary>
            <label>
              <span class="small muted">{{ tr('인증 토큰 직접 입력', 'Enter verification token manually') }}</span>
              <span class="auth-field-wrap">
                <span class="material-symbols-rounded">vpn_key</span>
                <input v-model="token" class="field" type="text" :placeholder="tr('이메일의 인증 토큰', 'Verification token from the email')" :aria-label="tr('인증 토큰', 'Verification token')">
              </span>
            </label>
            <button class="btn primary auth-main-action" type="submit" :disabled="!token.trim()">
              <span class="material-symbols-rounded">verified</span>{{ tr('토큰으로 인증하기', 'Verify with token') }}
            </button>
          </details>

          <p v-if="verificationError" class="auth-submit-error" role="alert">{{ verificationError }}</p>

          <div class="auth-form-options" style="justify-content: space-between;">
            <a href="#" @click.prevent="handleResend">{{ tr('인증 메일 다시 보내기', 'Resend verification email') }}</a>
            <a href="#" @click.prevent="router.push('/login')">{{ tr('로그인으로', 'Go to login') }}</a>
          </div>

          <p v-if="resendMessage" class="small" style="color: var(--blue);">{{ resendMessage }}</p>
          <p v-if="resendError" class="auth-submit-error" role="alert">{{ resendError }}</p>
          </template>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.verification-success-icon {
  font-size: 52px;
  color: #16a34a;
}

.verification-token-fallback {
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 10px;
}

.verification-token-fallback summary {
  cursor: pointer;
  color: var(--violet);
  font-size: 13px;
  font-weight: 800;
}

.verification-token-fallback label {
  margin-top: 14px;
}

.verification-token-fallback .auth-main-action {
  margin-top: 12px;
}
</style>
