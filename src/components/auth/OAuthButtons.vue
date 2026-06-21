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
  <div class="oauth-official-row" :aria-label="mode === 'signup' ? '간편 가입' : '간편 로그인'">
    <button
      class="oauth-official-button"
      type="button"
      :aria-label="mode === 'signup' ? 'Google 계정으로 가입' : 'Google 계정으로 로그인'"
      :disabled="disabled"
      @click="emit('select', 'google')"
    >
      <img
        :src="mode === 'signup' ? '/images/oauth/google-signup.svg' : '/images/oauth/google-signin.svg'"
        alt=""
      >
    </button>
    <button
      class="oauth-official-button"
      type="button"
      :aria-label="mode === 'signup' ? '카카오 계정으로 가입' : '카카오 계정으로 로그인'"
      :disabled="disabled"
      @click="emit('select', 'kakao')"
    >
      <img src="/images/oauth/kakao-login.png" alt="">
    </button>
  </div>
</template>

<style scoped>
.oauth-official-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 98px;
}

.oauth-official-button {
  display: flex;
  width: 100%;
  min-width: 0;
  height: 45px;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.oauth-official-button img {
  display: block;
  width: auto;
  max-width: 100%;
  height: 45px;
  object-fit: contain;
}

.oauth-official-button:hover:not(:disabled) {
  filter: brightness(0.97);
}

.oauth-official-button:focus-visible {
  outline: 3px solid rgba(37, 99, 235, 0.32);
  outline-offset: 2px;
  border-radius: 12px;
}

.oauth-official-button:disabled {
  opacity: 0.55;
  cursor: wait;
}
</style>
