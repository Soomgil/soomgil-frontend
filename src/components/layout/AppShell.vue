<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppHeader from './AppHeader.vue'
import BaseToast from '@/components/common/BaseToast.vue'

const route = useRoute()
defineProps<{ immersive?: boolean; paper?: boolean }>()
</script>

<template>
  <div class="min-h-screen flex flex-col" :class="{ 'immersive-shell': immersive, 'paper-shell': paper }">
    <AppHeader v-if="!route.meta.hideLayout" :immersive="immersive" :paper="paper" />
    <main class="flex-1" style="min-height:0;overflow:hidden;display:flex;flex-direction:column;">
      <slot />
    </main>
    <BaseToast />
  </div>
</template>

<style scoped>
/* 기존 body의 헤더 여백을 홈에서만 상쇄해 사진이 화면 위까지 이어지게 한다. */
.immersive-shell { margin-top: -72px; }
.paper-shell { --ink: #35465A; --muted: #647C92; --bg: #F8FBFF; --line: #EAF4FF; --surface-2: #EAF4FF; background: #F8FBFF; }
@media (max-width: 480px) {
  .immersive-shell { margin-top: -132px; }
}
</style>
