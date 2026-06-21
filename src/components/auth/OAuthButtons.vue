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
      <img class="google-provider-icon" src="/images/oauth/google-g-logo.png" alt="">
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
      <span class="kakao-provider-label">카카오 로그인</span>
    </button>
  </div>
</template>

<style scoped>
.oauth-provider-stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 98px;
}

.oauth-provider-button {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 48px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 8px;
  cursor: pointer;
}

.oauth-provider-button.google {
  position: relative;
  border: 1px solid #747775;
  background: #fff;
  color: #1f1f1f;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
  font-size: 14px;
  font-weight: 500;
}

.oauth-provider-button.google img {
  position: absolute;
  left: 16%;
  width: 20px;
  height: 20px;
  transform: translateX(-50%);
}

.google-provider-label {
  position: absolute;
  left: 50%;
  white-space: nowrap;
  transform: translateX(-50%);
}

.oauth-provider-button.kakao {
  position: relative;
  border: 0;
  background: #fee500;
  color: rgba(0, 0, 0, 0.85);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans KR", sans-serif;
  font-size: 14px;
  font-weight: 500;
}

.kakao-provider-icon {
  position: absolute;
  left: 16%;
  width: 24px;
  height: 24px;
  background-image: url('/images/oauth/kakao-login.png');
  background-repeat: no-repeat;
  background-position: -14px -12px;
  background-size: 320px 48px;
  transform: translateX(-50%);
}

.kakao-provider-label {
  position: absolute;
  left: 50%;
  white-space: nowrap;
  transform: translateX(-50%);
}

.oauth-provider-button:hover:not(:disabled) {
  filter: brightness(0.97);
}

.oauth-provider-button:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.32);
  outline-offset: 2px;
  border-radius: 12px;
}

.oauth-provider-button:disabled {
  opacity: 0.55;
  cursor: wait;
}
</style>
