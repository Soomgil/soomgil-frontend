<script setup lang="ts">
import { computed, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import OnboardingHeader from '@/components/layout/OnboardingHeader.vue'
import ServiceBackdrop from '@/components/layout/ServiceBackdrop.vue'
import VoteResultMapOverlay from '@/components/voting/VoteResultMapOverlay.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useSwipeStore } from '@/stores/swipe.store'
import { useUiLocalizer } from '@/i18n/ui-localizer'

const route = useRoute()
const isPreferenceOnboarding = computed(() => route.name === 'OnboardingPreferences')
const hasServiceBackground = computed(() => !route.meta.hideLayout &&
  /^\/(home|my-trips|swipe|community|search|mypage|settings)(\/|$)/.test(route.path))
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
 <div class="app-layout" :class="{ 'has-service-background': hasServiceBackground }">
  <ServiceBackdrop v-if="hasServiceBackground" />
  <AppHeader v-show="!route.meta.hideLayout && route.path !== '/' && !isPreferenceOnboarding" />
  <OnboardingHeader v-if="isPreferenceOnboarding" />
  <RouterView />
  <VoteResultMapOverlay />
 </div>
</template>

<style>
/* Header stays in normal flow so wrapped navigation reserves its real height. */
body:has(> #app) { padding-top:0; }
.app-layout > .topbar { position:sticky; top:0; background:#f8fbff; }
.app-layout { position: relative; isolation: isolate; display: flow-root; }
.app-layout.has-service-background .paper-shell,
.app-layout.has-service-background .travel-paper,
.app-layout.has-service-background .swipe-discovery,
.app-layout.has-service-background .community-paper,
.app-layout.has-service-background .home-canvas,
.app-layout.has-service-background .search-page { background: transparent; }
</style>
