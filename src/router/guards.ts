import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useSwipeStore } from '@/stores/swipe.store'
import { useVotingStore } from '@/stores/voting.store'

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

    // 투표 상태는 지도 진입 전에 미리 읽어 두기만 한다. 투표는 지도 위 모달로 열리므로
    // 어디서 들어오든 강제로 이동시키지 않는다. 조회 실패 시에도 진입을 막지 않는다.
    if (to.name === 'Route' && auth.isAuthenticated) {
      const tripId = typeof to.params.tripId === 'string' ? to.params.tripId : null
      if (tripId) await useVotingStore().ensureGate(tripId)
    }

    next()
  })
}
