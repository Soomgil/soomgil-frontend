import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useSwipeStore } from '@/stores/swipe.store'
import { useVotingStore } from '@/stores/voting.store'

export function applyGuards(router: Router) {
  router.beforeEach(async (to, _from, next) => {
    const auth = useAuthStore()

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

    // 투표가 열려 있고 아직 제출하지 않은 참여자는 지도보다 투표 화면을 먼저 본다.
    // 반대로 참여할 투표가 없으면 투표 화면에 머무르지 않고 지도로 돌려보낸다.
    // 판정은 서버가 nextScreen으로 내려주고, 조회 실패 시에는 진입을 막지 않고 지도로 통과시킨다.
    if ((to.name === 'Route' || to.name === 'TripVote') && auth.isAuthenticated) {
      const tripId = typeof to.params.tripId === 'string' ? to.params.tripId : null
      if (tripId) {
        const nextScreen = await useVotingStore().ensureGate(tripId)
        if (to.name === 'Route' && (nextScreen === 'VOTE' || nextScreen === 'WAITING')) {
          next({ name: 'TripVote', params: { tripId } })
          return
        }
        if (to.name === 'TripVote' && nextScreen === 'MAP') {
          next({ name: 'Route', params: { tripId } })
          return
        }
      }
    }

    next()
  })
}
