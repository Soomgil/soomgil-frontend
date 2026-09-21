<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/composables/useAuth'
import { authApi } from '@/api/auth.api'
import { useLocale } from '@/i18n'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const { tr } = useLocale()

const email = ref((route.query.email as string) || '')
const token = ref((route.query.token as string) || '')
const submitting = ref(false)
const resending = ref(false)
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
  if (!email.value || resending.value) return
  resending.value = true
  resendError.value = ''
  resendMessage.value = ''
  try {
    await authApi.sendEmailVerification({ email: email.value })
    resendMessage.value = tr('인증 메일을 다시 발송했습니다.', 'Verification email sent again.')
  } catch {
    resendError.value = tr('인증 메일을 발송하지 못했습니다. 잠시 후 다시 시도해주세요.', 'Could not send the verification email. Please try again later.')
  } finally {
    resending.value = false
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
    <main class="auth-page auth-modern-page">
      <section class="auth-card auth-modern-card email-verification-card">
        <aside class="auth-visual-panel email-verification-visual" aria-hidden="true">
          <div class="email-verification-visual__wash"></div>
          <div class="auth-visual-content email-verification-visual__content">
            <p class="eyebrow">WELCOME TO SOOMGIL</p>
            <h1>{{ tr('여행을 시작하기 전,\n마지막 한 걸음', 'One last step\nbefore your journey') }}</h1>
            <p>{{ tr('이메일 인증으로 소중한 여행 기록과 계정을 안전하게 지켜드려요.', 'Email verification helps keep your account and travel memories safe.') }}</p>
          </div>
        </aside>

        <form class="auth-form auth-modern-form email-verification-form" :aria-label="tr('이메일 인증', 'Email verification')" @submit.prevent="handleVerify">
          <div v-if="verificationSucceeded" class="oauth-callback-state" role="status">
            <h2>{{ tr('이메일 인증이 완료됐어요', 'Email verified') }}</h2>
            <p class="email-verification-description">{{ tr('계정이 활성화되었습니다. 이제 가입한 이메일로 로그인하고 첫 여행을 만들어보세요.', 'Your account is active. Log in and start planning your first journey.') }}</p>
            <button data-testid="go-login" class="btn primary auth-main-action" type="button" @click="goToLogin">
              {{ tr('로그인하기', 'Log in') }}
            </button>
          </div>

          <template v-else>
          <div class="auth-form-head">
            <p class="email-verification-kicker">CHECK YOUR INBOX</p>
            <h2>{{ submitting ? tr('이메일 인증 중…', 'Verifying email…') : tr('인증 메일을 확인해주세요', 'Check your verification email') }}</h2>
            <p v-if="token">{{ tr('인증 링크를 확인하고 있습니다. 잠시만 기다려주세요.', 'Checking the verification link. Please wait.') }}</p>
            <p v-else>{{ tr('메일에 있는 인증 버튼을 누르면 가입이 완료됩니다.', 'Select the verification button in the email to finish signing up.') }}</p>
          </div>

          <div v-if="email" class="email-recipient">
            <strong>{{ email }}</strong>
          </div>

          <p v-if="!token" class="verification-note">{{ tr('메일이 보이지 않으면 스팸 메일함을 확인하거나 아래에서 다시 보내주세요.', 'If you do not see it, check your spam folder or resend it below.') }}</p>

          <div v-if="submitting" class="verification-progress" role="status">
            <span>{{ tr('인증 정보를 안전하게 확인하고 있어요.', 'Securely checking your verification details.') }}</span>
          </div>

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

          <div class="email-verification-actions">
            <button class="btn ghost email-resend-button" type="button" :disabled="!email || resending" @click="handleResend">
              {{ resending ? tr('보내는 중…', 'Sending…') : tr('인증 메일 다시 보내기', 'Resend verification email') }}
            </button>
            <button class="email-login-link" type="button" @click="router.push('/login')">
              {{ tr('로그인으로 돌아가기', 'Back to login') }}
            </button>
          </div>

          <p v-if="resendMessage" class="auth-success-message" role="status">{{ resendMessage }}</p>
          <p v-if="resendError" class="auth-submit-error" role="alert">{{ resendError }}</p>
          </template>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.email-verification-card {
  grid-template-columns: minmax(300px, .82fr) minmax(420px, 1.18fr);
  overflow: hidden;
}

.email-verification-visual {
  position: relative;
  overflow: hidden;
  background:
    linear-gradient(180deg, rgb(31 64 91 / 10%), rgb(20 47 70 / 78%)),
    url('/images/랜딩페이지/jeju.png') center / cover;
}

.email-verification-visual__wash {
  position: absolute;
  inset: 0;
  background: linear-gradient(145deg, rgb(83 145 184 / 12%), rgb(10 34 51 / 18%));
}

.email-verification-visual__content {
  position: relative;
  z-index: 1;
  justify-content: flex-end;
}

.email-verification-visual__content h1 {
  white-space: pre-line;
}

.email-verification-form {
  gap: 16px;
}

.email-verification-kicker {
  margin: 0 0 8px !important;
  color: #6f96b2 !important;
  font-size: 10px !important;
  font-weight: 800;
  letter-spacing: .14em;
}

.email-recipient {
  min-width: 0;
  padding: 0 0 14px;
  border-bottom: 1px solid #dce9f2;
  color: #496a82;
}

.email-recipient strong {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
}

.verification-note {
  margin: 0;
  color: #8293a1;
  font-size: 12px;
  line-height: 1.7;
}

.verification-progress {
  display: flex;
  align-items: center;
  padding: 4px 0;
  color: #58758a;
  font-size: 13px;
}

.verification-token-fallback {
  padding: 12px 0 0;
  border: 0;
  border-top: 1px solid #edf2f6;
}

.verification-token-fallback summary {
  cursor: pointer;
  color: #527f9f;
  font-size: 13px;
  font-weight: 750;
}

.verification-token-fallback label {
  margin-top: 14px;
}

.verification-token-fallback .auth-main-action {
  margin-top: 12px;
}

.email-verification-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.email-resend-button {
  min-height: auto;
  padding: 6px 0;
  border: 0 !important;
  border-radius: 0;
  color: #487db5;
  background: transparent !important;
  box-shadow: none !important;
}

.email-login-link {
  padding: 6px 0;
  border: 0;
  color: #718696;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.email-verification-description {
  margin: 0 0 22px;
  color: #718696;
  font-size: 14px;
  line-height: 1.75;
}

.email-verification-form .auth-success-message {
  margin: 0;
  padding: 11px 13px;
  border: 1px solid #cfe5d8;
  border-radius: 12px;
  color: #387459;
  background: #f0f8f3;
  font-size: 12px;
}

.oauth-callback-state {
  text-align: center;
}

.oauth-callback-state h2 {
  margin: 0 0 10px;
  color: #35465a;
  font-family: 'Noto Serif KR', 'Batang', serif;
  font-size: 30px;
}

@media (max-width: 900px) {
  .email-verification-card {
    grid-template-columns: 1fr;
  }

  .email-verification-visual {
    display: none;
  }
}

@media (max-width: 560px) {
  .email-verification-form {
    justify-content: center;
  }

  .email-verification-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
