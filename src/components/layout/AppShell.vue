<script setup lang="ts">
import BaseToast from '@/components/common/BaseToast.vue'

defineProps<{ immersive?: boolean; paper?: boolean }>()
</script>

<template>
  <div class="min-h-screen flex flex-col" :class="{ 'immersive-shell': immersive, 'paper-shell': paper }">
    <main class="flex-1" style="min-height:0;overflow:hidden;display:flex;flex-direction:column;">
      <slot />
    </main>
    <BaseToast />
  </div>
</template>

<style scoped>
.paper-shell { --ink: #35465A; --muted: #647C92; --bg: #F8FBFF; --line: #EAF4FF; --surface-2: #EAF4FF; background: #F8FBFF; }
</style>
