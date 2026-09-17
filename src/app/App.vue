<script setup lang="ts">
import { watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import VoteResultMapOverlay from '@/components/voting/VoteResultMapOverlay.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useSwipeStore } from '@/stores/swipe.store'
import { useUiLocalizer } from '@/i18n/ui-localizer'

const route = useRoute()
const auth = useAuthStore()
const swipe = useSwipeStore()
useUiLocalizer()

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
  <AppHeader v-show="!route.meta.hideLayout && route.path !== '/'" />
  <RouterView />
  <VoteResultMapOverlay />
</template>
