<script setup lang="ts">
import type { OAuthProvider } from '@/types/auth'

const props = defineProps<{
  mode: 'signin' | 'signup'
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [provider: OAuthProvider]
}>()
</script>

<template>
  <div class="oauth-provider-stack" :aria-label="mode === 'signup' ? '간편 가입' : '간편 로그인'">
    <button
      class="oauth-provider-button google"
      type="button"
      :aria-label="mode === 'signup' ? 'Google 계정으로 가입' : 'Google 계정으로 로그인'"
      :disabled="disabled"
      @click="emit('select', 'google')"
    >
      <svg class="google-provider-icon" viewBox="0 0 24 24" aria-hidden="true">
        <path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.4a4.6 4.6 0 0 1-2 3v2.6h3.3c1.9-1.8 2.9-4.4 2.9-7.5Z" />
        <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.7-2.3l-3.3-2.6c-.9.6-2.1 1-3.4 1a5.9 5.9 0 0 1-5.5-4.1H3.1v2.7A10.1 10.1 0 0 0 12 22Z" />
        <path fill="#FBBC05" d="M6.5 14a6 6 0 0 1 0-3.9V7.3H3.1a10.1 10.1 0 0 0 0 9.4L6.5 14Z" />
        <path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.9 1.5l2.9-2.9A9.8 9.8 0 0 0 12 2a10.1 10.1 0 0 0-8.9 5.3l3.4 2.8A5.9 5.9 0 0 1 12 6Z" />
      </svg>
      <span class="google-provider-label">{{ mode === 'signup' ? 'Google 계정으로 가입' : 'Google 계정으로 로그인' }}</span>
    </button>
    <button
      class="oauth-provider-button kakao"
      type="button"
      :aria-label="mode === 'signup' ? '카카오 계정으로 가입' : '카카오 계정으로 로그인'"
      :disabled="disabled"
      @click="emit('select', 'kakao')"
    >
      <span class="kakao-provider-icon" aria-hidden="true"></span>
      <span class="kakao-provider-label">{{ mode === 'signup' ? '카카오 계정으로 가입' : '카카오 계정으로 로그인' }}</span>
    </button>
  </div>
</template>

<style scoped>
.oauth-provider-stack {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 7px;
  min-height: 91px;
}

.oauth-provider-button {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 42px;
  align-items: center;
  justify-content: center;
  padding: 0 18px;
  border-radius: 999px;
  cursor: pointer;
  transition: border-color .2s ease, background .2s ease, box-shadow .2s ease, transform .2s ease;
}

.oauth-provider-button.google {
  position: relative;
  border: 1px solid #d7e2e9;
  background: #fff;
  color: #425b6e;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
  font-size: 14px;
  font-weight: 700;
}

.google-provider-icon {
  position: absolute;
  left: 20px;
  width: 18px;
  height: 18px;
}

.google-provider-label {
  position: absolute;
  left: 50%;
  white-space: nowrap;
  transform: translateX(-50%);
}

.oauth-provider-button.kakao {
  position: relative;
  border: 1px solid #fee500;
  background: #fee500;
  color: rgba(0, 0, 0, 0.85);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
  font-size: 14px;
  font-weight: 700;
}

.kakao-provider-icon {
  position: absolute;
  left: 18px;
  width: 22px;
  height: 22px;
  background-image: url('/images/oauth/kakao-login.png');
  background-repeat: no-repeat;
  background-position: -14px -12px;
  background-size: 320px 48px;
}

.kakao-provider-label {
  position: absolute;
  left: 50%;
  white-space: nowrap;
  transform: translateX(-50%);
}

.oauth-provider-button:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(66, 91, 110, 0.1);
}

.oauth-provider-button.google:hover:not(:disabled) {
  border-color: #b9cbd7;
  background: #fafdff;
}

.oauth-provider-button.kakao:hover:not(:disabled) {
  border-color: #ead300;
  background: #f4dc00;
}

.oauth-provider-button:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.32);
  outline-offset: 2px;
  border-radius: 999px;
}

.oauth-provider-button:disabled {
  opacity: 0.55;
  cursor: wait;
}
</style>
