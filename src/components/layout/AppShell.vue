<script setup lang="ts">
import { useRoute } from 'vue-router'
import AppHeader from './AppHeader.vue'
import BaseToast from '@/components/common/BaseToast.vue'

const route = useRoute()
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <AppHeader v-if="!route.meta.hideLayout" />
    <main class="flex-1" style="min-height:0;overflow:hidden;display:flex;flex-direction:column;">
      <slot />
    </main>
    <BaseToast />
  </div>
</template>
