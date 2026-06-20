<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppHeader from '@/components/layout/AppHeader.vue'
import LoadingState from '@/components/common/LoadingState.vue'
import { useTripStore } from '@/stores/trip.store'
import type { TripDetail } from '@/types/trip'

type AcceptState = 'loading' | 'success' | 'expired' | 'unavailable' | 'already-member' | 'forbidden' | 'not-found' | 'error'

interface InviteProblem {
  response?: {
    status?: number
    data?: {
      code?: string
      detail?: string
    }
  }
}

const route = useRoute()
const router = useRouter()
const tripStore = useTripStore()
const state = ref<AcceptState>('loading')
const acceptedTrip = ref<TripDetail | null>(null)
let acceptAttempt = 0

const inviteCode = computed(() => {
  const value = route.params.inviteCode
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

const errorContent = computed(() => {
  const content: Record<Exclude<AcceptState, 'loading' | 'success'>, { icon: string; title: string; message: string }> = {
    expired: { icon: 'schedule', title: '초대가 만료되었습니다', message: '방장에게 새로운 초대 링크를 요청해 주세요.' },
    unavailable: { icon: 'link_off', title: '사용할 수 없는 초대입니다', message: '이미 사용되었거나 취소된 초대 링크입니다.' },
    'already-member': { icon: 'group', title: '이미 참여 중인 여행입니다', message: '내 여행 목록에서 해당 여행을 확인할 수 있습니다.' },
    forbidden: { icon: 'lock', title: '다른 사용자에게 발급된 초대입니다', message: '초대를 받은 계정으로 로그인해 주세요.' },
    'not-found': { icon: 'search_off', title: '초대를 찾을 수 없습니다', message: '링크가 정확한지 확인하거나 방장에게 다시 요청해 주세요.' },
    error: { icon: 'error', title: '초대를 처리하지 못했습니다', message: '잠시 후 다시 시도해 주세요.' },
  }
  return state.value === 'loading' || state.value === 'success' ? null : content[state.value]
})

function classifyError(cause: unknown): AcceptState {
  const response = (cause as InviteProblem)?.response
  const detail = response?.data?.detail ?? ''
  if (response?.status === 403) return 'forbidden'
  if (response?.status === 404) return 'not-found'
  if (detail === 'Trip invite has expired.') return 'expired'
  if (detail === 'User is already a trip member.') return 'already-member'
  if (detail.includes('not pending') || detail.includes('no longer pending')) return 'unavailable'
  return 'error'
}

async function acceptInvite() {
  const attempt = ++acceptAttempt
  const code = inviteCode.value

  if (!code) {
    state.value = 'not-found'
    return
  }

  state.value = 'loading'
  try {
    const trip = await tripStore.acceptInvite(code)
    if (attempt !== acceptAttempt) return
    acceptedTrip.value = trip
    state.value = 'success'
  } catch (cause) {
    if (attempt !== acceptAttempt) return
    state.value = classifyError(cause)
  }
}

function goToTrip() {
  if (!acceptedTrip.value) return
  router.push({ name: 'Route', params: { tripId: acceptedTrip.value.id } })
}

watch(inviteCode, () => {
  acceptedTrip.value = null
  void acceptInvite()
}, { immediate: true })
</script>

<template>
  <div class="app-shell">
    <AppHeader />

    <main class="invite-page">
      <section class="invite-status" aria-live="polite">
        <LoadingState v-if="state === 'loading'" />

        <template v-else-if="state === 'success' && acceptedTrip">
          <span class="invite-icon success material-symbols-rounded" aria-hidden="true">check_circle</span>
          <p class="eyebrow">Invitation Accepted</p>
          <h1>초대 수락 완료</h1>
          <p><strong>{{ acceptedTrip.title }}</strong> 여행에 참여했습니다.</p>
          <div class="invite-actions">
            <button class="btn ghost" type="button" @click="router.push({ name: 'MyTrips' })">내 여행</button>
            <button class="btn primary" type="button" data-testid="go-trip" @click="goToTrip">
              여행으로 이동
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </button>
          </div>
        </template>

        <template v-else-if="errorContent">
          <span class="invite-icon material-symbols-rounded" aria-hidden="true">{{ errorContent.icon }}</span>
          <p class="eyebrow">Invitation</p>
          <h1>{{ errorContent.title }}</h1>
          <p>{{ errorContent.message }}</p>
          <div class="invite-actions">
            <button class="btn ghost" type="button" @click="router.push({ name: 'MyTrips' })">내 여행으로 이동</button>
            <button v-if="state === 'error'" class="btn primary" type="button" data-testid="retry-invite" @click="acceptInvite">
              다시 시도
            </button>
          </div>
        </template>
      </section>
    </main>
  </div>
</template>

<style scoped>
.invite-page {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: calc(100vh - 80px);
  padding: 48px 20px;
}

.invite-status {
  max-width: 560px;
  text-align: center;
  width: 100%;
}

.invite-status h1 {
  font-size: 42px;
  letter-spacing: 0;
  margin: 10px 0 12px;
  overflow-wrap: anywhere;
}

.invite-status > p:not(.eyebrow) {
  color: #6b7280;
  line-height: 1.7;
  margin: 0;
}

.invite-icon {
  color: #be123c;
  font-size: 64px;
  margin-bottom: 18px;
}

.invite-icon.success {
  color: #047857;
}

.invite-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  margin-top: 30px;
}

@media (max-width: 480px) {
  .invite-status h1 {
    font-size: 32px;
  }

  .invite-actions {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
