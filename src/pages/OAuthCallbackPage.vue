<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import type { OAuthProvider } from '@/types/auth'
import AppHeader from '@/components/layout/AppHeader.vue'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const status = ref<'processing' | 'error'>('processing')
const errorMessage = ref('')

const VALID_PROVIDERS: OAuthProvider[] = ['kakao', 'google']

onMounted(async () => {
  const providerRaw = String(route.params.provider || '').toLowerCase()
  const code = route.query.code as string | undefined
  const state = route.query.state as string | undefined

  // 1. provider 검증
  if (!VALID_PROVIDERS.includes(providerRaw as OAuthProvider)) {
    status.value = 'error'
    errorMessage.value = `지원하지 않는 OAuth 제공자입니다: ${providerRaw}`
    return
  }

  // 2. code/state 존재 확인 (Kakao/Google이 error=access_denied 등으로 돌려줄 수도)
  const errorParam = route.query.error as string | undefined
  if (errorParam) {
    status.value = 'error'
    errorMessage.value = `제공자에서 로그인이 거부되었습니다: ${errorParam}`
    return
  }
  if (!code || !state) {
    status.value = 'error'
    errorMessage.value = 'authorization code 또는 state가 없습니다.'
    return
  }

  // 3. 백엔드 콜백 처리 (store에서 state CSRF 검증까지 수행)
  try {
    const next = await auth.completeOAuthLogin(providerRaw as OAuthProvider, code, state)
    await router.replace(next || '/home')
  } catch (e: unknown) {
    status.value = 'error'
    errorMessage.value =
      e instanceof Error ? e.message : 'OAuth 로그인 중 오류가 발생했습니다.'
    console.error('[OAuthCallback] failed:', e)
  }
})
</script>

<template>
  <div class="app-shell">
    <AppHeader />
    <main class="auth-page auth-modern-page">
      <section class="auth-card auth-modern-card" style="grid-template-columns: 1fr;">
        <div class="auth-form auth-modern-form">
          <!-- 처리 중 -->
          <div v-if="status === 'processing'" class="oauth-callback-state">
            <div class="oauth-spinner" aria-label="로그인 처리 중"></div>
            <h2>로그인 처리 중...</h2>
            <p class="small muted">잠시만 기다려주세요.</p>
          </div>

          <!-- 실패 -->
          <div v-else class="oauth-callback-state">
            <span class="material-symbols-rounded oauth-error-icon" aria-hidden="true">error</span>
            <h2>로그인 실패</h2>
            <p class="small" style="color: var(--rose); margin-bottom: 16px;">{{ errorMessage }}</p>
            <button class="btn primary auth-main-action" type="button" @click="router.push('/login')">
              <span class="material-symbols-rounded">login</span>로그인 페이지로
            </button>
          </div>
        </div>
      </section>
    </main>
  </div>
</template>

<style scoped>
.oauth-callback-state {
  text-align: center;
  padding: 24px 0;
}
.oauth-callback-state h2 {
  font-size: 20px;
  font-weight: 800;
  color: var(--ink);
  margin: 16px 0 8px;
}
.oauth-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--line);
  border-top-color: var(--violet);
  border-radius: 50%;
  margin: 0 auto;
  animation: oauth-spin 0.8s linear infinite;
}
@keyframes oauth-spin {
  to { transform: rotate(360deg); }
}
.oauth-error-icon {
  font-size: 48px;
  color: var(--rose);
}
</style>
