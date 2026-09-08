<script setup lang="ts">
import { useRouter } from 'vue-router'
import { useLocale } from '@/i18n'

const router = useRouter()
const { tr } = useLocale()
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-6">
    <div class="text-center">
      <span class="text-8xl font-black bg-gradient-to-br from-brand-violet to-brand-blue bg-clip-text text-transparent">404</span>
      <h1 class="text-2xl font-black text-ink mt-4">{{ tr('페이지를 찾을 수 없습니다', 'Page not found') }}</h1>
      <p class="text-muted mt-2 mb-8">{{ tr('요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.', 'The page may not exist or may have moved.') }}</p>
      <button
        class="px-8 py-3 rounded-full bg-brand-violet text-white font-bold hover:bg-brand-violet/90 transition-colors"
        @click="router.push('/home')"
      >
        {{ tr('홈으로 돌아가기', 'Back to home') }}
      </button>
    </div>
  </div>
</template>
