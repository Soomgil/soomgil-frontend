<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import LoadingState from '@/components/common/LoadingState.vue'
import ErrorState from '@/components/common/ErrorState.vue'
import EmptyState from '@/components/common/EmptyState.vue'
import { useTripStore } from '@/stores/trip.store'
import type { TripInvite, TripSummary } from '@/types/trip'

const props = defineProps<{
  open: boolean
  trip: TripSummary | null
}>()

const emit = defineEmits<{ close: [] }>()
const tripStore = useTripStore()
const actionError = ref('')
const creatingInvite = ref(false)
const copiedInviteId = ref<string | null>(null)

const isOwner = computed(() => props.trip?.myRole === 'OWNER')
const pendingInvites = computed(() => tripStore.invites.filter((invite) => invite.status === 'PENDING'))

watch(
  () => [props.open, props.trip?.id] as const,
  ([open, tripId]) => {
    actionError.value = ''
    copiedInviteId.value = null
    if (open && tripId) {
      tripStore.fetchTripAccess(tripId, isOwner.value).catch(() => undefined)
    }
  },
  { immediate: true },
)

watch(
  () => props.open,
  (open) => {
    document.body.style.overflow = open ? 'hidden' : ''
  },
  { immediate: true },
)

function handleKeydown(event: KeyboardEvent) {
  if (props.open && event.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})

async function createInvite() {
  if (!props.trip) return
  creatingInvite.value = true
  actionError.value = ''
  try {
    await tripStore.createInvite(props.trip.id)
  } catch {
    actionError.value = '초대 코드를 만들지 못했습니다.'
  } finally {
    creatingInvite.value = false
  }
}

async function copyInviteCode(invite: TripInvite) {
  actionError.value = ''
  try {
    const inviteLink = new URL(`/trip-invites/${encodeURIComponent(invite.inviteCode)}`, window.location.origin)
    await navigator.clipboard.writeText(inviteLink.toString())
    copiedInviteId.value = invite.id
  } catch {
    actionError.value = '초대 코드를 복사하지 못했습니다.'
  }
}

async function revokeInvite(inviteId: string) {
  if (!props.trip || !window.confirm('이 초대 코드를 취소할까요?')) return
  actionError.value = ''
  try {
    await tripStore.revokeInvite(props.trip.id, inviteId)
  } catch {
    actionError.value = '초대 코드를 취소하지 못했습니다.'
  }
}

async function removeMember(userId: string) {
  if (!props.trip || !window.confirm('이 멤버를 여행에서 내보낼까요?')) return
  actionError.value = ''
  try {
    await tripStore.removeMember(props.trip.id, userId)
  } catch {
    actionError.value = '멤버를 내보내지 못했습니다.'
  }
}
</script>

<template>
  <div v-if="open" class="access-overlay" @click.self="$emit('close')">
    <section class="access-modal" role="dialog" aria-modal="true" aria-labelledby="trip-access-title">
      <header class="access-header">
        <div>
          <p class="eyebrow">Trip Access</p>
          <h2 id="trip-access-title">{{ isOwner ? '멤버 및 초대 관리' : '여행 멤버' }}</h2>
          <p>{{ trip?.title }}</p>
        </div>
        <button class="icon-btn" type="button" aria-label="닫기" @click="$emit('close')">
          <span class="material-symbols-rounded" aria-hidden="true">close</span>
        </button>
      </header>

      <LoadingState v-if="tripStore.accessLoading" />
      <ErrorState
        v-else-if="tripStore.accessError"
        :message="tripStore.accessError"
        @retry="trip && tripStore.fetchTripAccess(trip.id, isOwner)"
      />
      <div v-else class="access-content">
        <p v-if="actionError" class="access-error" aria-live="polite">{{ actionError }}</p>

        <section class="access-section" aria-labelledby="member-list-title">
          <div class="access-section__head">
            <h3 id="member-list-title">멤버</h3>
            <span>{{ tripStore.members.length }}명</span>
          </div>
          <EmptyState v-if="tripStore.members.length === 0" icon="group" message="표시할 멤버가 없습니다." />
          <ul v-else class="access-list">
            <li v-for="member in tripStore.members" :key="member.id">
              <span class="member-avatar" aria-hidden="true">
                <img v-if="member.user.profileImageUrl" :src="member.user.profileImageUrl" :alt="`${member.user.displayName} 프로필 사진`" />
                <template v-else>{{ member.user.displayName.charAt(0) }}</template>
              </span>
              <div class="access-list__body">
                <strong>{{ member.user.displayName }}</strong>
                <span>{{ member.accessRole === 'OWNER' ? '방장' : '멤버' }}</span>
              </div>
              <button
                v-if="isOwner && member.accessRole !== 'OWNER'"
                class="text-action danger"
                type="button"
                @click="removeMember(member.user.id)"
              >
                내보내기
              </button>
            </li>
          </ul>
        </section>

        <section v-if="isOwner" class="access-section" aria-labelledby="invite-list-title">
          <div class="access-section__head">
            <div>
              <h3 id="invite-list-title">초대 코드</h3>
              <span>코드를 전달해 여행에 초대하세요.</span>
            </div>
            <button class="btn primary compact" type="button" :disabled="creatingInvite" @click="createInvite">
              <span class="material-symbols-rounded" aria-hidden="true">add_link</span>
              {{ creatingInvite ? '생성 중' : '코드 만들기' }}
            </button>
          </div>
          <EmptyState v-if="pendingInvites.length === 0" icon="link" message="사용 가능한 초대 코드가 없습니다." />
          <ul v-else class="access-list invite-list">
            <li v-for="invite in pendingInvites" :key="invite.id">
              <div class="access-list__body">
                <code>{{ invite.inviteCode }}</code>
                <span>{{ invite.expiresAt ? `${new Date(invite.expiresAt).toLocaleString('ko-KR')} 만료` : '만료 없음' }}</span>
              </div>
              <div class="invite-actions">
                <button class="icon-btn" type="button" :aria-label="`${invite.inviteCode} 복사`" @click="copyInviteCode(invite)">
                  <span class="material-symbols-rounded" aria-hidden="true">{{ copiedInviteId === invite.id ? 'check' : 'content_copy' }}</span>
                </button>
                <button class="icon-btn danger" type="button" :aria-label="`${invite.inviteCode} 취소`" @click="revokeInvite(invite.id)">
                  <span class="material-symbols-rounded" aria-hidden="true">link_off</span>
                </button>
              </div>
            </li>
          </ul>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.access-overlay {
  align-items: center;
  background: rgb(17 24 39 / 48%);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 2000;
}

.access-modal {
  background: #fff;
  border: 1px solid rgba(227, 234, 244, .9);
  border-radius: 24px;
  box-shadow: 0 24px 64px rgb(0 0 0 / 18%);
  max-height: min(760px, calc(100vh - 40px));
  overflow: auto;
  width: min(620px, 100%);
}

.access-header,
.access-section__head,
.access-list li,
.invite-actions {
  align-items: center;
  display: flex;
}

.access-header {
  border-bottom: 1px solid #e5e7eb;
  justify-content: space-between;
  padding: 24px;
}

.access-header h2,
.access-header p,
.access-section h3 {
  letter-spacing: 0;
  margin: 0;
}

.access-header > div > p:last-child,
.access-section__head span,
.access-list__body span {
  color: #6b7280;
  font-size: 13px;
}

.access-content {
  padding: 24px;
}

.access-section + .access-section {
  border-top: 1px solid #e5e7eb;
  margin-top: 28px;
  padding-top: 28px;
}

.access-section__head {
  justify-content: space-between;
  margin-bottom: 12px;
}

.access-list {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}

.access-list li {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  gap: 12px;
  min-height: 68px;
  padding: 12px 14px;
}

.member-avatar {
  align-items: center;
  background: #ede9fe;
  border-radius: 50%;
  color: #6d28d9;
  display: inline-flex;
  flex: 0 0 40px;
  font-weight: 700;
  height: 40px;
  justify-content: center;
}
.member-avatar img { width:100%; height:100%; object-fit:cover; }

.access-list__body {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.access-list code {
  overflow-wrap: anywhere;
}

.text-action {
  background: none;
  border: 0;
  cursor: pointer;
  font-weight: 700;
}

.danger {
  color: #be123c;
}

.compact {
  padding: 8px 12px;
}

.invite-actions {
  gap: 4px;
}

.access-error {
  color: #be123c;
  font-size: 14px;
  margin: 0 0 16px;
}

@media (max-width: 640px) {
  .access-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .access-modal {
    border-radius: 8px 8px 0 0;
    max-height: 90vh;
  }

  .access-header,
  .access-content {
    padding: 20px;
  }

  .access-section__head {
    align-items: flex-start;
    gap: 12px;
  }
}
</style>
