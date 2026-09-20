<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { authApi } from '@/api/auth.api'
import { useLocale } from '@/i18n'

const router = useRouter()
const route = useRoute()
const { tr } = useLocale()

const initialToken = (route.query.token as string) || ''
const step = ref<'request' | 'confirm'>(initialToken ? 'confirm' : 'request')
const email = ref((route.query.email as string) || '')
const token = ref(initialToken)
const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const submitting = ref(false)
const requestMessage = ref('')
const submitError = ref('')
const heroImg = '/images/랜딩페이지/korea_hero.png'

const passwordError = computed(() => {
  if (!newPassword.value && !confirmPassword.value) return ''
  if (newPassword.value.length < 8) return tr('비밀번호는 8자 이상 입력해주세요.', 'Password must be at least 8 characters.')
  if (newPassword.value !== confirmPassword.value) return tr('새 비밀번호가 서로 일치하지 않습니다.', 'The new passwords do not match.')
  return ''
})

async function handleRequest() {
  if (!email.value.trim() || submitting.value) return
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
  if (!token.value.trim() || !newPassword.value || passwordError.value || submitting.value) return
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
    <main class="auth-page auth-modern-page">
      <section class="auth-card auth-modern-card auth-modern-card--split reset-password-card">
        <div class="auth-visual-panel">
          <div
            class="auth-visual-image"
            :style="{ backgroundImage: `linear-gradient(180deg, rgba(9, 18, 34, 0.08), rgba(9, 18, 34, 0.74)), url(${heroImg})` }"
          ></div>
          <div class="auth-visual-content reset-password-visual-copy">
            <p class="eyebrow">WELCOME BACK</p>
            <h1>{{ tr('다시 여행을 이어가세요', 'Continue your journey') }}</h1>
            <p>{{ tr('가입한 이메일로 본인 확인을 마치면 새 비밀번호를 설정할 수 있어요.', 'Verify your email to set a new password.') }}</p>
          </div>
        </div>

        <form class="auth-form auth-modern-form reset-password-form" aria-label="비밀번호 재설정" @submit.prevent="step === 'request' ? handleRequest() : handleReset()">
          <button class="auth-back-to-login" type="button" @click="router.push('/login')">
            <span class="material-symbols-rounded" aria-hidden="true">arrow_back</span>
            {{ tr('로그인으로 돌아가기', 'Back to login') }}
          </button>

          <div class="reset-step-indicator" aria-label="비밀번호 재설정 진행 단계">
            <span :class="{ active: step === 'request' }">1</span>
            <i aria-hidden="true"></i>
            <span :class="{ active: step === 'confirm' }">2</span>
          </div>

          <div class="auth-form-head">
            <h2>{{ tr('비밀번호 재설정', 'Reset password') }}</h2>
            <p v-if="step === 'request'">{{ tr('가입한 이메일로 비밀번호 변경 링크를 보내드릴게요.', 'We will send a password reset link to your account email.') }}</p>
            <p v-else>{{ tr('새 비밀번호를 입력하면 바로 변경됩니다.', 'Enter a new password to complete the reset.') }}</p>
          </div>

          <template v-if="step === 'request'">
            <label>
              <span class="small muted">{{ tr('이메일', 'Email') }}</span>
              <span class="auth-field-wrap">
                <span class="material-symbols-rounded">mail</span>
                <input v-model="email" class="field" type="email" autocomplete="email" required :placeholder="tr('example@email.com', 'example@email.com')" :aria-label="tr('이메일', 'Email')">
              </span>
            </label>
            <button class="btn primary auth-main-action" type="submit" :disabled="submitting">
              <span class="material-symbols-rounded">send</span>{{ submitting ? tr('메일을 보내는 중...', 'Sending...') : tr('재설정 링크 받기', 'Send reset link') }}
            </button>
          </template>

          <template v-else>
            <p v-if="requestMessage" class="reset-request-message" role="status"><span class="material-symbols-rounded" aria-hidden="true">mark_email_read</span>{{ requestMessage }}</p>
            <label>
              <span class="small muted">{{ tr('재설정 토큰', 'Reset token') }}</span>
              <span class="auth-field-wrap">
                <span class="material-symbols-rounded">vpn_key</span>
                <input v-model="token" class="field" type="text" autocomplete="one-time-code" required :aria-label="tr('재설정 토큰', 'Reset token')">
              </span>
            </label>
            <label>
              <span class="small muted">{{ tr('새 비밀번호', 'New password') }}</span>
              <span class="auth-field-wrap reset-password-field reset-password-field--action">
                <span class="material-symbols-rounded">lock</span>
                <input v-model="newPassword" class="field" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="128" required :aria-label="tr('새 비밀번호', 'New password')">
                <button class="reset-password-visibility" type="button" :aria-label="showPassword ? tr('비밀번호 숨기기', 'Hide password') : tr('비밀번호 보기', 'Show password')" @click="showPassword = !showPassword">
                  <span class="material-symbols-rounded" aria-hidden="true">{{ showPassword ? 'visibility_off' : 'visibility' }}</span>
                </button>
              </span>
            </label>
            <label>
              <span class="small muted">{{ tr('새 비밀번호 확인', 'Confirm new password') }}</span>
              <span class="auth-field-wrap reset-password-field">
                <span class="material-symbols-rounded">lock</span>
                <input v-model="confirmPassword" class="field" :type="showPassword ? 'text' : 'password'" autocomplete="new-password" minlength="8" maxlength="128" required :aria-label="tr('새 비밀번호 확인', 'Confirm new password')">
              </span>
            </label>
            <p class="reset-password-hint" :class="{ invalid: passwordError }">{{ passwordError || tr('8자 이상의 새 비밀번호를 입력해주세요.', 'Use at least 8 characters.') }}</p>
            <button class="btn primary auth-main-action" type="submit" :disabled="submitting || !!passwordError || !newPassword || !confirmPassword">
              <span class="material-symbols-rounded">lock_reset</span>{{ submitting ? tr('변경하는 중...', 'Updating...') : tr('새 비밀번호로 변경', 'Update password') }}
            </button>
            <button v-if="!initialToken" class="reset-request-again" type="button" @click="step = 'request'; submitError = ''; requestMessage = ''">
              {{ tr('메일을 받지 못했나요? 다시 보내기', 'Did not receive the email? Send again') }}
            </button>
          </template>

          <div class="auth-feedback-slot reset-feedback" aria-live="polite">
            <p v-if="submitError" class="auth-submit-error" role="alert">{{ submitError }}</p>
          </div>
        </form>
      </section>
    </main>
  </div>
</template>

<style scoped>
.reset-password-card { grid-template-columns:minmax(430px, .94fr) minmax(480px, 1.06fr); }
.reset-password-form { position:relative; }
.reset-password-visual-copy h1 { max-width:380px; }
.reset-password-visual-copy > p:last-child { max-width:390px; font-size:14px; word-break:keep-all; }
.reset-password-form .auth-field-wrap { position:relative; display:flex; min-height:50px; align-items:center; }
.reset-password-form .auth-field-wrap > .material-symbols-rounded { position:absolute; top:50%; left:15px; z-index:1; margin:0; transform:translateY(-50%); color:#5d7890; font-size:20px; pointer-events:none; }
.reset-password-form .auth-field-wrap .field { display:block; width:100%; min-height:50px; box-sizing:border-box; padding-right:16px; padding-left:46px; }
.reset-password-form .reset-password-field--action .field { padding-right:54px; }
.reset-step-indicator { display:flex; align-items:center; width:92px; gap:8px; }
.reset-step-indicator span { display:grid; width:24px; height:24px; place-items:center; border:1px solid #d4e1ea; border-radius:50%; color:#8296a6; background:#f5f9fc; font-size:11px; font-weight:800; }
.reset-step-indicator span.active { border-color:#75a4c5; color:#fff; background:#487db5; }
.reset-step-indicator i { flex:1; height:1px; background:#dbe6ed; }
.reset-request-message { display:flex; align-items:flex-start; gap:8px; margin:0; padding:11px 13px; border:1px solid #cfe2ef; border-radius:12px; color:#416b88; background:#f1f8fc; font-size:12px; line-height:1.55; }
.reset-request-message .material-symbols-rounded { flex:0 0 auto; font-size:18px; }
.reset-password-visibility { position:absolute; top:50%; right:7px; z-index:2; display:grid; width:36px; height:36px; place-items:center; margin:0; border:0; border-radius:50%; color:#718596; background:transparent; transform:translateY(-50%); cursor:pointer; }
.reset-password-visibility:hover { color:#487db5; background:#edf5fa; }
.reset-password-visibility .material-symbols-rounded { font-size:19px; }
.reset-password-hint { min-height:18px; margin:-2px 0 0; color:#718596; font-size:11px; }
.reset-password-hint.invalid { color:#c44f5c; }
.reset-request-again { width:fit-content; margin:0 auto; padding:5px 8px; border:0; color:#647c92; background:transparent; font:inherit; font-size:11px; font-weight:700; cursor:pointer; }
.reset-request-again:hover { color:#487db5; }
.reset-feedback { min-height:0; }
@media (max-width:900px) {
  .reset-password-card { grid-template-columns:1fr; }
  .reset-password-visual-copy { display:none; }
}
</style>
