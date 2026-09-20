<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import LoadingState from '@/components/common/LoadingState.vue'
import { useTripStore } from '@/stores/trip.store'
import { useAuth } from '@/composables/useAuth'
import type { TripDetail } from '@/types/trip'
import { useLocale } from '@/i18n'

type AcceptState = 'loading' | 'success' | 'expired' | 'unavailable' | 'already-member' | 'forbidden' | 'not-found' | 'error' | 'unauthorized'

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
const auth = useAuth()
const { tr } = useLocale()
const state = ref<AcceptState>('loading')
const acceptedTrip = ref<TripDetail | null>(null)
let acceptAttempt = 0

const inviteCode = computed(() => {
  const value = route.params.inviteCode
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
})

const errorContent = computed(() => {
  const content: Record<Exclude<AcceptState, 'loading' | 'success'>, { icon: string; title: string; message: string }> = {
    expired: { icon: 'schedule', title: tr('초대가 만료되었습니다', 'Invitation expired'), message: tr('방장에게 새로운 초대 링크를 요청해 주세요.', 'Ask the trip owner for a new invitation link.') },
    unavailable: { icon: 'link_off', title: tr('사용할 수 없는 초대입니다', 'Invitation unavailable'), message: tr('이미 사용되었거나 취소된 초대 링크입니다.', 'This invitation link was already used or canceled.') },
    'already-member': { icon: 'group', title: tr('이미 참여 중인 여행입니다', 'You already joined this trip'), message: tr('내 여행 목록에서 해당 여행을 확인할 수 있습니다.', 'You can find it in My trips.') },
    forbidden: { icon: 'lock', title: tr('다른 사용자에게 발급된 초대입니다', 'Invitation issued to another user'), message: tr('초대를 받은 계정으로 로그인해 주세요.', 'Log in with the account that received the invitation.') },
    'not-found': { icon: 'search_off', title: tr('초대를 찾을 수 없습니다', 'Invitation not found'), message: tr('링크가 정확한지 확인하거나 방장에게 다시 요청해 주세요.', 'Check the link or ask the trip owner to send it again.') },
    error: { icon: 'error', title: tr('초대를 처리하지 못했습니다', 'Could not process the invitation'), message: tr('잠시 후 다시 시도해 주세요.', 'Please try again later.') },
    unauthorized: { icon: 'login', title: tr('로그인이 필요합니다', 'Login required'), message: tr('초대받은 여행에 참여하려면 먼저 로그인해 주세요.', 'Log in before joining the invited trip.') },
  }
  return state.value === 'loading' || state.value === 'success' ? null : content[state.value]
})

const acceptedTripDate = computed(() => {
  if (!acceptedTrip.value?.startDate) return null
  const formatter = new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric' })
  const start = formatter.format(new Date(`${acceptedTrip.value.startDate}T00:00:00`))
  if (!acceptedTrip.value.endDate || acceptedTrip.value.endDate === acceptedTrip.value.startDate) return start
  return `${start} – ${formatter.format(new Date(`${acceptedTrip.value.endDate}T00:00:00`))}`
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

function goToLogin() {
  router.push({ name: 'Login', query: { returnTo: route.fullPath } })
}

watch(inviteCode, () => {
  acceptedTrip.value = null
  if (!auth.isAuthenticated) {
    state.value = 'unauthorized'
    return
  }
  void acceptInvite()
}, { immediate: true })
</script>

<template>
  <div class="app-shell invite-shell">
    <main class="invite-page">
      <section class="invite-status" :class="`is-${state}`" aria-live="polite">
        <div v-if="state === 'loading'" class="invite-loading">
          <LoadingState />
          <p>{{ tr('여행 초대를 확인하고 있어요', 'Checking your invitation') }}</p>
        </div>

        <template v-else-if="state === 'success' && acceptedTrip">
          <h1>{{ tr('함께 떠날 준비가 됐어요', 'Ready to travel together') }}</h1>
          <p class="invite-lead">{{ tr('초대 수락 완료! 이제 여행 메이트들과 일정을 만들어 보세요.', 'Invitation accepted. Start planning with your travel mates.') }}</p>
          <article class="invite-trip-card">
            <span class="invite-trip-card__pin material-symbols-rounded" aria-hidden="true">location_on</span>
            <div>
              <small>{{ tr('참여한 여행', 'Your new trip') }}</small>
              <strong>{{ acceptedTrip.title }}</strong>
              <p v-if="acceptedTrip.displayDestination || acceptedTripDate">
                <span v-if="acceptedTrip.displayDestination">{{ acceptedTrip.displayDestination }}</span>
                <span v-if="acceptedTripDate">{{ acceptedTripDate }}</span>
              </p>
            </div>
            <span class="invite-trip-card__check material-symbols-rounded" aria-hidden="true">verified</span>
          </article>
          <div class="invite-actions">
            <button class="invite-button secondary" type="button" @click="router.push({ name: 'MyTrips' })">{{ tr('내 여행 목록', 'My trips') }}</button>
            <button class="invite-button primary" type="button" data-testid="go-trip" @click="goToTrip">
              {{ tr('여행으로 이동', 'Open trip') }}
              <span class="material-symbols-rounded" aria-hidden="true">arrow_forward</span>
            </button>
          </div>
        </template>

        <template v-else-if="errorContent">
          <h1>{{ errorContent.title }}</h1>
          <p class="invite-lead">{{ errorContent.message }}</p>
          <div class="invite-actions">
            <button v-if="state !== 'unauthorized'" class="invite-button secondary" type="button" @click="router.push({ name: 'MyTrips' })">{{ tr('내 여행으로 이동', 'Go to My trips') }}</button>
            <button v-if="state === 'unauthorized'" class="invite-button primary" type="button" @click="goToLogin">
              {{ tr('로그인하고 참여하기', 'Log in and join') }}
            </button>
            <button v-if="state === 'error'" class="invite-button primary" type="button" data-testid="retry-invite" @click="acceptInvite">
              {{ tr('다시 시도', 'Try again') }}
            </button>
          </div>
        </template>
        <footer class="invite-footer"><span class="material-symbols-rounded" aria-hidden="true">lock</span>{{ tr('초대 링크는 안전하게 처리됩니다.', 'Your invitation link is handled securely.') }}</footer>
      </section>
    </main>
  </div>
</template>

<style scoped>
.invite-shell {
  background: transparent;
  min-height: 100vh;
  overflow: hidden;
}

.invite-page {
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 100vh;
  padding: 48px 20px;
  position: relative;
}

.invite-status {
  background: rgb(255 255 255 / 92%);
  border: 1px solid rgb(211 228 239 / 90%);
  border-radius: 32px;
  box-shadow: 0 30px 90px rgb(58 91 119 / 16%);
  max-width: 610px;
  overflow: hidden;
  padding: 26px 46px 24px;
  position: relative;
  text-align: center;
  width: 100%;
  z-index: 1;
}

.invite-loading { color: #6d8497; padding: 42px 0 64px; }
.invite-loading p { font-size: 14px; margin: 20px 0 0; }
.invite-status h1 { color: #30465a; font-size: clamp(30px, 5vw, 42px); letter-spacing: -.05em; line-height: 1.18; margin: 8px 0 12px; overflow-wrap: anywhere; }
.invite-lead { color: #6e8295; font-size: 14px; line-height: 1.7; margin: 0 auto; max-width: 440px; }
.invite-trip-card { align-items: center; background: linear-gradient(135deg, #f2f8fd, #f7fbf8); border: 1px solid #dae8f2; border-radius: 20px; display: grid; gap: 14px; grid-template-columns: auto 1fr auto; margin: 26px 0 0; padding: 17px 18px; text-align: left; }
.invite-trip-card__pin { align-items: center; background: #fff; border-radius: 14px; box-shadow: 0 6px 16px rgb(61 110 147 / 10%); color: #4e91c5; display: flex; height: 46px; justify-content: center; width: 46px; }
.invite-trip-card div { display: grid; gap: 3px; min-width: 0; }
.invite-trip-card small { color: #8497a8; font-size: 10px; font-weight: 800; }
.invite-trip-card strong { color: #354d62; font-size: 17px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.invite-trip-card p { color: #75899a; display: flex; flex-wrap: wrap; font-size: 11px; gap: 12px; margin: 0; }
.invite-trip-card__check { color: #56a276; font-size: 23px; }

.invite-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
  margin-top: 24px;
}

.invite-button { align-items: center; border: 0; border-radius: 14px; cursor: pointer; display: inline-flex; font-size: 14px; font-weight: 800; gap: 7px; justify-content: center; min-height: 48px; padding: 0 21px; transition: box-shadow .18s ease, transform .18s ease; }
.invite-button:hover { transform: translateY(-2px); }
.invite-button.primary { background: #3f8dc8; box-shadow: 0 10px 24px rgb(63 141 200 / 24%); color: #fff; }
.invite-button.secondary { background: #eef5fa; color: #5e778d; }
.invite-button .material-symbols-rounded { font-size: 18px; }
.invite-footer { align-items: center; border-top: 1px solid #e7eef3; color: #98a6b2; display: flex; font-size: 10px; gap: 5px; justify-content: center; margin-top: 26px; padding-top: 17px; }
.invite-footer .material-symbols-rounded { font-size: 13px; }

@media (max-width: 480px) {
  .invite-page { align-items: stretch; padding: 18px 12px; }
  .invite-status { border-radius: 24px; display: flex; flex-direction: column; justify-content: center; padding: 24px 20px 20px; }
  .invite-trip-card { grid-template-columns: auto 1fr; }
  .invite-trip-card__check { display: none; }
  .invite-actions { align-items: stretch; flex-direction: column; }
  .invite-button { width: 100%; }
}
</style>

