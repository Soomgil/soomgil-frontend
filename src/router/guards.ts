import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'

export function applyGuards(router: Router) {
  router.beforeEach((to, _from, next) => {
    const auth = useAuthStore()

    if (to.meta.requiresAuth && !auth.isAuthenticated) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }

    if (to.meta.guestOnly && auth.isAuthenticated) {
      next({ name: 'Home' })
      return
    }

    next()
  })
}
