<script setup lang="ts">
import { watch } from 'vue'
import { RouterView } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useSwipeStore } from '@/stores/swipe.store'

const auth = useAuthStore()
const swipe = useSwipeStore()

watch(
  () => auth.token,
  (token, previousToken) => {
    if (token !== previousToken) swipe.reset()
    if (token) void swipe.warm()
  },
  { immediate: true },
)
</script>

<template>
  <RouterView />
</template>
