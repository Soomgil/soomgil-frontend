import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useSwipeStore } from '@/stores/swipe.store'

export function applyGuards(router: Router) {
  router.beforeEach(async (to, _from, next) => {
    const auth = useAuthStore()

    await auth.initialize()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }

    if (to.meta.guestOnly && auth.isAuthenticated) {
      next({ name: 'Home' })
      return
    }

    if (to.name === 'Swipe' && auth.isAuthenticated) {
      await useSwipeStore().warm()
    }

    next()
  })
}
