<script setup lang="ts">
import { formatUiText } from '@/i18n/ui-localizer'
import { onMounted, onUnmounted, ref, watch, computed } from 'vue'
import LegalRegionCombobox from '@/components/trip/LegalRegionCombobox.vue'
import TripDateRangeDialog from './TripDateRangeDialog.vue'
import { useTripStore } from '@/stores/trip.store'
import { tripApi } from '@/api/trip.api'
import type { LegalRegion } from '@/types/geo'
import type { TripStatus, TripSummary, TripDetail, TripDetailMember, TripMember } from '@/types/trip'

const props = defineProps<{
  open: boolean
  trip: TripSummary | TripDetail | null
  defaultTab?: 'tab-settings' | 'tab-members'
}>()

const emit = defineEmits<{
  close: []
  deleted: [tripId: string]
  saved: [tripId: string, settings: { startDate: string | null; endDate: string | null }]
}>()

const tripStore = useTripStore()
const activeTab = ref<'tab-settings' | 'tab-members'>('tab-settings')

// Settings Tab State
const title = ref('')
const displayDestination = ref('')
const initialDisplayDestination = ref('')
const selectedRegion = ref<LegalRegion | null>(null)
const regionSelectionChanged = ref(false)
const status = ref<Exclude<TripStatus, 'DELETED'>>('ACTIVE')
const editStartDate = ref('')
const editEndDate = ref('')
const dateDialogOpen = ref(false)
function applyDateRange(start:string,end:string) { editStartDate.value=start;editEndDate.value=end;dateDialogOpen.value=false }
const error = ref('')
const confirmingDelete = ref(false)

// Invite Tab State
const inviteLink = ref('')
const inviteLoading = ref(false)
const inviteError = ref('')
const inviteCopied = ref(false)
let inviteCopiedTimer: number | null = null
let inviteTripId: string | null = null
let inviteRequest = 0

const editDayCount = computed(() => {
  if (editStartDate.value && editEndDate.value) {
    const s = new Date(editStartDate.value)
    const e = new Date(editEndDate.value)
    const diff = Math.ceil((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1
    return diff > 0 ? diff : 1
  }
  return 1
})

watch(
  () => [props.open, props.trip, props.defaultTab] as const,
  ([open, trip, defaultTab]) => {
    if (!open) {
      dateDialogOpen.value = false
      inviteRequest++
      inviteLoading.value = false
      inviteLink.value = ''
      inviteCopied.value = false
      inviteTripId = null
      return
    }
    
    activeTab.value = defaultTab || 'tab-settings'
    
    if (!trip) return

    if (inviteTripId !== trip.id) {
      dateDialogOpen.value = false
      inviteRequest++
      inviteLoading.value = false
      inviteTripId = trip.id
      inviteLink.value = ''
      inviteCopied.value = false
      inviteError.value = ''
    }
    
    title.value = trip.title
    displayDestination.value = trip.displayDestination ?? ''
    initialDisplayDestination.value = displayDestination.value
    selectedRegion.value = null
    regionSelectionChanged.value = false
    status.value = trip.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'
    
    if (trip.startDate) {
      editStartDate.value = trip.startDate.slice(0, 10)
    } else {
      editStartDate.value = ''
    }
    if (trip.endDate) {
      editEndDate.value = trip.endDate.slice(0, 10)
    } else {
      editEndDate.value = ''
    }
    
    error.value = ''
    confirmingDelete.value = false

    // Fetch invite link if owner
    if (trip.myRole === 'OWNER') {
      fetchInviteLink(trip.id)
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

async function fetchInviteLink(tripId: string) {
  if (inviteLink.value || inviteLoading.value) return
  const request = ++inviteRequest
  inviteLoading.value = true
  inviteError.value = ''
  try {
    const invites = await tripApi.getInvites(tripId)
    if (request !== inviteRequest) return
    const activeInvite = invites.find(invite => invite.status === 'PENDING' && !invite.inviteeUserId
      && !!invite.inviteCode?.trim() && (!invite.expiresAt || Date.parse(invite.expiresAt) > Date.now()))
    const invite = activeInvite ?? await tripApi.createInvite(tripId)
    if (request === inviteRequest) inviteLink.value = resolveInviteUrl(invite)
  } catch {
    if (request === inviteRequest) inviteError.value = '초대 링크를 준비하지 못했습니다.'
  } finally {
    if (request === inviteRequest) inviteLoading.value = false
  }
}

function resolveInviteUrl(invite: { inviteUrl: string | null; inviteCode: string }) {
  if (!invite.inviteCode?.trim()) throw new Error('Missing invite code')
  if (invite.inviteUrl) return invite.inviteUrl
  const code = encodeURIComponent(invite.inviteCode)
  return new URL(`/trip-invites/${code}`, window.location.origin).toString()
}

async function copyInviteLink() {
  if (!inviteLink.value) return
  try {
    await navigator.clipboard.writeText(inviteLink.value)
    inviteError.value = ''
    inviteCopied.value = true
    if (inviteCopiedTimer) window.clearTimeout(inviteCopiedTimer)
    inviteCopiedTimer = window.setTimeout(() => {
      inviteCopied.value = false
      inviteCopiedTimer = null
    }, 2000)
  } catch {
    inviteError.value = '초대 링크를 복사하지 못했습니다.'
  }
}

async function shareInviteLink() {
  if (!inviteLink.value) return
  if (navigator.share) {
    try {
      await navigator.share({
        title: props.trip ? `${props.trip.title} 초대` : '여행 초대',
        text: '숨길 여행에 함께 참여해 주세요.',
        url: inviteLink.value,
      })
      inviteError.value = ''
      return
    } catch (error) {
      if ((error as DOMException)?.name === 'AbortError') return
    }
  }
  await copyInviteLink()
}

function close() {
  if (!tripStore.mutating) emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  if (props.open && event.key === 'Escape') {
    if (dateDialogOpen.value) dateDialogOpen.value = false
    else close()
  }
}

function handleRegionSelect(region: LegalRegion | null) {
  selectedRegion.value = region
  regionSelectionChanged.value = true
}

async function save() {
  if (!props.trip) return
  const trimmedTitle = title.value.trim()
  if (!trimmedTitle) {
    error.value = '여행 이름을 입력해 주세요.'
    return
  }

  if (editEndDate.value && !editStartDate.value) {
    error.value = '시작 날짜를 먼저 선택해 주세요.'
    return
  }

  const effectiveStartDate = editStartDate.value || null
  const effectiveEndDate = editStartDate.value ? (editEndDate.value || editStartDate.value) : null

  if (effectiveStartDate && effectiveEndDate && new Date(effectiveEndDate) < new Date(effectiveStartDate)) {
    error.value = '종료 날짜는 시작 날짜 이후로 선택해 주세요.'
    return
  }

  error.value = ''
  try {
    const trimmedDestination = displayDestination.value.trim()
    const regionCodesChanged = Boolean(selectedRegion.value)
      || (regionSelectionChanged.value && trimmedDestination !== initialDisplayDestination.value.trim())
    
    await tripStore.updateTrip(props.trip.id, {
      title: trimmedTitle,
      displayDestination: trimmedDestination,
      ...(regionCodesChanged
        ? { legalRegionCodes: selectedRegion.value ? [selectedRegion.value.code] : [] }
        : {}),
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
      ...(isOwner.value ? { status: status.value } : {}),
    })

    emit('saved', props.trip.id, {
      startDate: effectiveStartDate,
      endDate: effectiveEndDate,
    })
    emit('close')
  } catch {
    error.value = '여행 설정을 저장하지 못했습니다.'
  }
}

async function deleteTrip() {
  if (!props.trip) return
  error.value = ''
  try {
    await tripStore.deleteTrip(props.trip.id)
    emit('deleted', props.trip.id)
    emit('close')
  } catch {
    error.value = '여행을 삭제하지 못했습니다.'
  }
}

interface DisplayMember {
  id: string
  userId: string
  displayName: string
  profileImageUrl: string | null
  role: 'OWNER' | 'MEMBER'
}

function toDisplayMember(member: TripDetailMember | TripMember): DisplayMember | null {
  if ('user' in member) {
    if (!member.user?.id) return null
    return {
      id: member.id,
      userId: member.user.id,
      displayName: member.user.displayName || '알 수 없음',
      profileImageUrl: member.user.profileImageUrl ?? null,
      role: member.role,
    }
  }

  if (!member.userId) return null
  return {
    id: member.id,
    userId: member.userId,
    displayName: member.displayName || '알 수 없음',
    profileImageUrl: member.profileImageUrl ?? null,
    role: member.role,
  }
}

const fetchedMembers = ref<TripDetailMember[] | null>(null)
const membersLoading = ref(false)
const membersError = ref('')
const failedProfileImages = ref(new Set<string>())
let membersRequest = 0
async function loadMembers() {
  const id = props.trip?.id
  if (!id) return
  const request = ++membersRequest
  membersLoading.value = true
  membersError.value = ''
  try {
    const members = await tripApi.getMembers(id)
    if (request === membersRequest) fetchedMembers.value = members
  } catch {
    if (request === membersRequest) membersError.value = '참여 중인 멤버를 불러오지 못했습니다.'
  } finally {
    if (request === membersRequest) membersLoading.value = false
  }
}
watch(() => [props.open, props.trip?.id, activeTab.value] as const, ([open, , tab]) => {
  membersRequest++
  fetchedMembers.value = null
  membersLoading.value = false
  membersError.value = ''
  failedProfileImages.value.clear()
  if (open && tab === 'tab-members' && !(props.trip && 'members' in props.trip)) void loadMembers()
}, { immediate: true })

const membersList = computed<DisplayMember[]>(() => {
  if (!props.trip) return []
  return ((fetchedMembers.value ?? (props.trip as TripDetail | (TripSummary & { members?: TripMember[] })).members ?? []) as Array<TripDetailMember | TripMember>)
    .filter((member) => member.status === 'ACTIVE')
    .map(toDisplayMember)
    .filter((member): member is DisplayMember => Boolean(member))
})

const isOwner = computed(() => props.trip?.myRole === 'OWNER')

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => {
  inviteRequest++
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
  if (inviteCopiedTimer) window.clearTimeout(inviteCopiedTimer)
})
</script>

<template>
  <div
    class="modal-overlay advanced-overlay trip-settings-overlay"
    :class="{ show: open, 'is-open': open }"
    :aria-hidden="!open"
    :inert="dateDialogOpen"
    @click.self="close"
  >
    <div class="modal-card advanced-modal trip-settings-card" role="dialog" aria-modal="true" aria-labelledby="trip-settings-title">
      <div class="modal-header">
        <div>
          <p class="eyebrow">Trip Management</p>
          <h3 id="trip-settings-title">여행 관리</h3>
        </div>
        <button class="icon-btn" type="button" aria-label="닫기" :disabled="tripStore.mutating" @click="close">
          <span class="material-symbols-rounded" aria-hidden="true">close</span>
        </button>
      </div>

      <div class="modal-tabs">
        <button :class="['modal-tab-btn', { active: activeTab === 'tab-settings' }]" data-tab="tab-settings" type="button" @click="activeTab = 'tab-settings'">
          <span class="material-symbols-rounded">settings</span> 여행 정보 설정
        </button>
        <button :class="['modal-tab-btn', { active: activeTab === 'tab-members' }]" data-tab="tab-members" type="button" @click="activeTab = 'tab-members'">
          <span class="material-symbols-rounded">group</span> 멤버 관리
        </button>
      </div>

      <div class="modal-body">
        <!-- Settings Tab -->
        <div v-show="activeTab === 'tab-settings'" class="trip-settings-tab-content">
          <form class="trip-create-form" @submit.prevent="save">
            <label class="form-label">
              <span class="form-label-text">여행 이름</span>
              <input v-model="title" class="field" type="text" name="title" maxlength="160" required>
            </label>
            <div class="form-label">
              <label class="form-label-text" for="trip-settings-destination">표시 목적지</label>
              <LegalRegionCombobox
                id="trip-settings-destination"
                v-model="displayDestination"
                name="displayDestination"
                @select="handleRegionSelect"
              />
            </div>

            <div class="form-label">
              <span class="form-label-text">여행 기간 설정</span>
              <button type="button" class="trip-period-card" data-testid="trip-period-card" @click="dateDialogOpen = true">
                <span class="material-symbols-rounded" aria-hidden="true">calendar_month</span>
                <span class="period-card-copy"><strong>{{ editStartDate ? `${editStartDate} → ${editEndDate || editStartDate}` : '여행 날짜를 선택해 주세요.' }}</strong><small>{{ editStartDate ? formatUiText('총 {0}일 여행', '{0}-day trip', [editDayCount]) : '날짜 미정' }}</small></span>
                <span class="material-symbols-rounded" aria-hidden="true">chevron_right</span>
              </button>
            </div>



            <p v-if="error" class="trip-create-error" aria-live="polite" style="color:var(--rose);">{{ error }}</p>

            <section
              v-if="isOwner"
              class="management-section danger-zone"
              :class="{ 'is-confirming-delete': confirmingDelete }"
              aria-labelledby="delete-trip-title"
            >
              <div class="management-section-head">
                <span class="material-symbols-rounded management-section-icon management-section-icon--danger" aria-hidden="true">delete</span>
                <div>
                  <h4 id="delete-trip-title">여행 삭제</h4>
                  <p>영구적으로 여행 데이터를 삭제합니다.</p>
                </div>
              </div>
              <button
                v-if="!confirmingDelete"
                class="danger-button"
                type="button"
                data-testid="delete-open"
                @click="confirmingDelete = true"
              >
                삭제
              </button>
              <div v-else class="delete-confirmation">
                <span>정말 삭제할까요?</span>
                <button type="button" :disabled="tripStore.mutating" @click="confirmingDelete = false">취소</button>
                <button class="danger-button" type="button" data-testid="delete-confirm" :disabled="tripStore.mutating" @click="deleteTrip">
                  {{ tripStore.mutating ? '삭제 중...' : '삭제 확인' }}
                </button>
              </div>
            </section>

            <div class="trip-create-actions" style="margin-top: 16px;">
              <button class="btn ghost" type="button" :disabled="tripStore.mutating" @click="close">취소</button>
              <button class="btn primary" type="submit" data-testid="settings-save" :disabled="tripStore.mutating">
                {{ tripStore.mutating ? '저장 중...' : '저장' }}
              </button>
            </div>
          </form>
        </div>

        <!-- Members Tab -->
        <div v-show="activeTab === 'tab-members'" class="trip-settings-tab-content members-tab-content">
          <section v-if="isOwner" class="management-section invite-share-section" aria-labelledby="invite-share-title">
            <div class="management-section-head">
              <span class="material-symbols-rounded management-section-icon" aria-hidden="true">link</span>
              <div>
                <h4 id="invite-share-title">초대 링크 공유</h4>
                <p>링크를 받은 사용자는 이 여행에 참여 요청을 보낼 수 있습니다.</p>
              </div>
            </div>
            <div class="invite-link-box">
              <span class="material-symbols-rounded invite-link-icon" aria-hidden="true">link</span>
              <input
                type="text"
                readonly
                :value="inviteLink"
                :placeholder="inviteLoading ? '초대 링크 생성 중...' : '초대 링크 준비 중'"
                aria-label="초대 링크"
              >
            </div>
            <div class="invite-actions">
              <button class="invite-action-btn invite-action-btn--ghost" type="button" :disabled="inviteLoading || !inviteLink" @click="shareInviteLink">
                <span class="material-symbols-rounded" aria-hidden="true">ios_share</span>
                공유
              </button>
              <button class="invite-action-btn invite-action-btn--primary" type="button" :disabled="inviteLoading || !inviteLink" @click="copyInviteLink">
                <span class="material-symbols-rounded" aria-hidden="true">{{ inviteCopied ? 'check' : 'content_copy' }}</span>
                {{ inviteCopied ? '복사됨' : '링크 복사' }}
              </button>
            </div>
            <p v-if="inviteError" class="invite-error" role="alert">{{ inviteError }}</p>
            <button v-if="inviteError && trip" type="button" class="invite-action-btn invite-action-btn--ghost" :disabled="inviteLoading" @click="inviteLink ? copyInviteLink() : fetchInviteLink(trip.id)">다시 시도</button>
          </section>
          <p v-else class="member-invite-note">초대 링크는 방장이 공유할 수 있어요.</p>

          <div class="modal-members-section management-section">
            <div class="members-header">
              <h4>참여 중인 멤버</h4>
              <span v-if="!membersLoading && !membersError" class="member-count">{{ formatUiText("{0}명", "{0} people", [membersList.length]) }}</span>
            </div>
            <p v-if="membersLoading" role="status">멤버를 불러오는 중…</p>
            <p v-else-if="membersError" role="alert">{{ membersError }} <button type="button" @click="loadMembers">다시 시도</button></p>
            <p v-else-if="!membersList.length">참여 중인 멤버가 없습니다.</p>
            <ul v-else class="member-list">
              <li v-for="member in membersList" :key="member.id" class="member-item">
                <div class="member-avatar">
                  <img v-if="member.profileImageUrl && !failedProfileImages.has(member.id)" @error="failedProfileImages.add(member.id)" :src="member.profileImageUrl" :alt="`${member.displayName} 프로필 사진`" />
                  <span v-else class="material-symbols-rounded" aria-hidden="true">person</span>
                </div>
                <div class="member-info">
                  <span data-no-translate class="member-name">{{ member.displayName }}</span>
                  <span class="member-role">{{ member.role === 'OWNER' ? '방장' : '멤버' }}</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
  <TripDateRangeDialog v-if="open && dateDialogOpen" :start="editStartDate" :end="editEndDate" @apply="applyDateRange" @close="dateDialogOpen = false" />
</template>

<style scoped>
.modal-tabs {
  display: flex;
  gap: 8px;
  padding: 0 32px 16px;
  border-bottom: 1px solid var(--line);
  margin-bottom: 24px;
}

.modal-tab-btn {
  background: transparent;
  border: none;
  font-size: 15px;
  font-weight: 700;
  color: var(--muted);
  cursor: pointer;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 6px;
  border-radius: 8px;
  transition: all 0.2s ease;
}

.modal-tab-btn:hover {
  background: rgba(124, 58, 237, 0.04);
}

.modal-tab-btn.active {
  color: var(--violet);
  background: rgba(124, 58, 237, 0.08);
}

.modal-tab-btn .material-symbols-rounded {
  font-size: 20px;
}

.management-section {
  border: 1px solid rgba(227, 234, 244, 0.95);
  border-radius: 18px;
  background: #fff;
  padding: 18px;
  box-shadow: 0 10px 28px rgba(15, 23, 42, 0.04);
}

.management-section-head {
  align-items: flex-start;
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
}

.management-section-icon {
  display: grid;
  flex: 0 0 auto;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 12px;
  background: rgba(0, 102, 255, 0.08);
  color: var(--violet);
  font-size: 20px;
}

.management-section-icon--danger {
  background: rgba(225, 29, 72, 0.08);
  color: #e11d48;
}

.management-section h4 {
  margin: 0 0 4px;
  color: #111827;
  font-size: 15px;
  font-weight: 850;
}

.management-section p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.5;
}

.status-option-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
}

.status-option {
  align-items: center;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  width: 100%;
  min-height: 72px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: #fbfdff;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
}

.status-option:hover {
  border-color: rgba(0, 102, 255, 0.28);
  background: #fff;
}

.status-option.active {
  border-color: rgba(0, 102, 255, 0.42);
  background: rgba(0, 102, 255, 0.04);
  box-shadow: 0 8px 22px rgba(0, 102, 255, 0.08);
}

.status-option-icon {
  color: var(--violet);
  font-size: 22px;
}

.status-option-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.status-option-copy strong {
  color: var(--ink);
  font-size: 13px;
  font-weight: 850;
}

.status-option-copy span {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
}

.status-option-check {
  color: var(--violet);
  font-size: 19px;
  opacity: 0;
}

.status-option.active .status-option-check {
  opacity: 1;
}

.danger-zone {
  align-items: flex-start;
  background: linear-gradient(135deg, #fffafa, #fff);
  border: 1px solid #ffe4e6;
  display: flex;
  gap: 16px;
  justify-content: space-between;
}

.danger-zone .management-section-head {
  flex: 1 1 auto;
  min-width: 0;
  margin-bottom: 0;
}

.danger-zone.is-confirming-delete {
  flex-wrap: wrap;
}

.danger-button {
  background: #e11d48;
  border: 0;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 16px;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(225, 29, 72, 0.2);
  transition: all 0.2s;
}

.danger-button:hover {
  background: #be123c;
  box-shadow: 0 6px 16px rgba(225, 29, 72, 0.3);
}

.delete-confirmation {
  align-items: center;
  border-top: 1px solid #f3d9de;
  display: grid;
  flex: 1 0 100%;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 8px;
  min-width: 0;
  padding-top: 14px;
  width: 100%;
}

.delete-confirmation > span {
  min-width: 0;
  font-size: 13px;
  color: #9f1239;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.delete-confirmation > button {
  height: 40px;
  min-width: 72px;
}

.delete-confirmation > button:not(.danger-button) {
  background: transparent;
  border: 0;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 700;
  color: #881337;
  min-height: 36px;
  padding: 0 10px;
}

.delete-confirmation > button:not(.danger-button):hover {
  background: rgba(225, 29, 72, 0.08);
}

.members-tab-content {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 0 32px 32px;
}

.invite-share-section {
  background:
    linear-gradient(135deg, rgba(0, 102, 255, 0.04), rgba(0, 209, 255, 0.03)),
    #fff;
}

.invite-link-box {
  align-items: center;
  display: flex;
  gap: 10px;
  min-height: 46px;
  padding: 0 14px;
  border: 1px solid rgba(0, 102, 255, 0.14);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.88);
}

.invite-link-icon {
  color: var(--violet);
  flex: 0 0 auto;
  font-size: 18px;
}

.invite-link-box input {
  min-width: 0;
  flex: 1;
  border: 0;
  background: transparent;
  color: var(--ink);
  font-size: 12px;
  font-weight: 750;
  outline: none;
}

.invite-link-box input::placeholder {
  color: var(--muted);
  font-weight: 650;
}

.invite-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

.invite-action-btn {
  align-items: center;
  display: inline-flex;
  justify-content: center;
  gap: 6px;
  min-height: 38px;
  padding: 0 13px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 850;
  transition: transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease;
}

.invite-action-btn:disabled {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

.invite-action-btn:not(:disabled):hover {
  transform: translateY(-1px);
}

.invite-action-btn .material-symbols-rounded {
  font-size: 17px;
}

.invite-action-btn--ghost {
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
}

.invite-action-btn--ghost:not(:disabled):hover {
  border-color: rgba(0, 102, 255, 0.28);
  color: var(--violet);
}

.invite-action-btn--primary {
  border: 0;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  box-shadow: 0 8px 18px rgba(0, 102, 255, 0.18);
}

.invite-error {
  margin: 10px 0 0;
  color: var(--rose);
  font-size: 12px;
  font-weight: 750;
}

.modal-members-section {
  box-shadow: none;
}

.members-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.members-header h4 {
  margin: 0;
  color: #111827;
  font-size: 15px;
  font-weight: 850;
}

.member-count {
  color: var(--violet);
  font-size: 12px;
  font-weight: 850;
}

.member-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.member-item {
  align-items: center;
  display: flex;
  gap: 12px;
  padding: 12px;
  border: 1px solid rgba(227, 234, 244, 0.8);
  border-radius: 14px;
  background: #fbfdff;
}

.member-avatar {
  display: grid;
  width: 40px;
  height: 40px;
  place-items: center;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-weight: 850;
}

.member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.member-name {
  color: #1f2937;
  font-size: 13px;
  font-weight: 800;
}

.member-info {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.member-role {
  color: var(--muted);
  font-size: 11px;
  font-weight: 750;
}

@media (max-width: 640px) {
  .danger-zone {
    align-items: stretch;
    flex-direction: column;
  }

  .delete-confirmation {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .delete-confirmation > span {
    grid-column: 1 / -1;
  }

  .delete-confirmation > button {
    width: 100%;
  }

  .members-tab-content {
    padding: 0 20px 24px;
  }

  .invite-actions {
    flex-direction: column;
  }

  .invite-action-btn {
    width: 100%;
  }
}

/* Premium Advanced Modal Styles */
.trip-settings-overlay {
  position: fixed !important;
  inset: 0 !important;
  z-index: 30000 !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  padding: 24px !important;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.trip-settings-overlay.is-open {
  opacity: 1;
  pointer-events: auto;
}

.advanced-overlay {
  background: rgba(10, 10, 15, 0.4);
  backdrop-filter: blur(8px);
}

.advanced-modal.trip-settings-card {
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.12), 0 4px 16px rgba(0, 0, 0, 0.04);
  background: linear-gradient(180deg, #ffffff 0%, #fcfcfd 100%);
  width: min(var(--settings-modal-width, 580px), calc(100vw - 32px)) !important;
  max-width: var(--settings-modal-width, 580px) !important;
  padding: 0 !important;
  overflow: hidden;
  transform: translateY(20px);
  transition: transform 0.3s ease;
}

.trip-settings-overlay.is-open .trip-settings-card {
  transform: translateY(0);
}

.trip-settings-tab-content {
  min-width: 0;
}

.advanced-modal .modal-header {
  border-bottom: none;
  padding: 32px 32px 16px;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.advanced-modal .modal-header h3 {
  font-size: 24px;
  font-weight: 800;
  color: #111827;
  letter-spacing: -0.02em;
  margin: 0;
}

.advanced-modal .eyebrow {
  color: var(--violet);
  font-weight: 800;
  margin-bottom: 6px;
}

.advanced-modal .trip-create-form {
  padding: 0 32px 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.trip-settings-overlay { --ink: #35465A; --muted: #647C92; --line: #EAF4FF; --violet: #427EAD; --surface-2: #EAF4FF; background: rgb(35 53 75 / 35%); backdrop-filter: blur(5px); padding: 24px; }
.trip-settings-overlay .trip-settings-card { width: min(100%, 680px); max-width: 680px; max-height: calc(100dvh - 48px); display: flex; flex-direction: column; overflow: hidden; background: #F8FBFF; border: 1px solid #EAF4FF; border-radius: 24px; box-shadow: 0 24px 80px rgb(35 67 98 / 16%); }
.trip-settings-card .modal-header { padding: 28px 30px 20px; border: 0; background: transparent; flex-shrink: 0; }
.trip-settings-card .eyebrow { color: #647C92; letter-spacing: .12em; font-size: 10px; }
.trip-settings-card h3 { font-family: 'Noto Serif KR', Batang, serif; font-size: 28px; font-weight: 500; color: #35465A; margin: 6px 0; }
.trip-settings-card .icon-btn { border: 1px solid #DFEAF5; background: #EAF4FF; color: #427EAD; border-radius: 50%; width: 40px; height: 40px; }
.trip-settings-card .modal-tabs { margin: 0; padding: 0 30px; gap: 24px; flex-shrink: 0; }
.trip-settings-card .modal-tab-btn { border-radius: 0; padding: 14px 0; border-bottom: 2px solid transparent; font-size: 14px; font-weight: 500; }
.trip-settings-card .modal-tab-btn.active { background: transparent; color: #427EAD; border-bottom-color: #427EAD; }
.trip-settings-card .modal-body { padding: 24px 30px; overflow-y: auto; min-height: 0; }
.trip-settings-card .trip-create-form { display: grid; gap: 20px; }
.trip-settings-card .field { background: #fff; border: 1px solid #DFEAF5; border-radius: 10px; box-shadow: none; color: #35465A; min-width: 0; }
.settings-dates { display: flex; align-items: center; gap: 8px; }
.trip-settings-card .management-section { background: #fff; border-color: #EAF4FF; border-radius: 14px; box-shadow: none; padding: 16px; }
.trip-settings-card .management-section h4 { color: #35465A; font-weight: 600; }
.trip-settings-card .management-section-icon { background: #EAF4FF; color: #647C92; }
.trip-settings-card .status-option-grid { grid-template-columns: repeat(2,minmax(0,1fr)); }
.trip-settings-card .status-option { background: #F8FBFF; padding: 12px; gap: 8px; }
.trip-settings-card .status-option.active { background: #EAF4FF; border-color: #8A9DAF; box-shadow: none; }
.trip-settings-card .danger-zone { background: #fffafa; border-color: #efdddd; }
.trip-settings-card .management-section-icon--danger { color: #a45252; background: #f9eaea; }
.trip-settings-card .trip-create-actions { position: sticky; bottom: -24px; padding: 16px 0 4px; background: #F8FBFF; border-top: 1px solid #EAF4FF; z-index: 3; }
.trip-settings-card .btn.primary, .trip-settings-card .invite-action-btn--primary { background: #427EAD; color: white; border-color: #427EAD; box-shadow: none; }
.trip-settings-card .invite-link-box { background: #EAF4FF; border-color: #DFEAF5; }
.trip-settings-card .member-item { background: #fff; border-color: #EAF4FF; }
.trip-settings-card .member-avatar { background: #EAF4FF; color: #427EAD; }
@media(max-width:600px) {
 .trip-settings-overlay { padding: 12px; }
 .trip-settings-overlay .trip-settings-card { max-height: calc(100dvh - 24px); border-radius: 18px; }
 .trip-settings-card .modal-header { padding: 20px 18px 16px; }
 .trip-settings-card .modal-tabs { padding: 0 18px; gap: 20px; }
 .trip-settings-card .modal-body { padding: 20px 18px; }
 .trip-settings-card .status-option-grid { grid-template-columns: 1fr; }
 .settings-dates { flex-wrap: wrap; }
 .settings-dates .field { width: 100%; flex-basis: 100% !important; }
 .settings-dates > span { display: none; }
}

/* 헤더와 탭을 하나의 옅은 회녹색 영역으로 묶는다. */
.trip-settings-card .modal-header { background: #EAF4FF; padding-bottom: 18px; margin-bottom: 0; }
.trip-settings-card .modal-tabs { background: #EAF4FF; border-bottom: 1px solid #DFEAF5; }
.trip-settings-card .modal-body { background: #fff; padding-top: 24px; }
.trip-settings-card .trip-create-actions { background: #fff; }
.trip-settings-card .modal-header .icon-btn { background: transparent; border-color: transparent; }
.trip-period-card { display:flex; align-items:center; gap:12px; width:100%; border:1px solid #dce9f3; border-radius:18px; background:#f8fbff; color:#304b63; padding:16px; text-align:left; cursor:pointer; font:inherit; }
.trip-period-card:hover { border-color:#86b9df; background:#f0f7ff; }
.period-card-copy { flex:1; min-width:0; }.period-card-copy strong,.period-card-copy small { display:block; }.period-card-copy strong { font-size:14px; }.period-card-copy small { font-size:12px; color:#728ca1; margin-top:5px; }
.trip-settings-card .member-list { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:8px; max-height:280px; overflow:auto; padding:2px; }
.trip-settings-card .member-item { flex-direction:column; gap:6px; padding:12px 6px; text-align:center; min-width:0; }
.trip-settings-card .member-info { width:100%; }.trip-settings-card .member-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
.member-invite-note { font-size:13px; color:#71889d; padding:12px; background:#f2f8fd; border-radius:14px; }
@media(max-width:480px){.trip-settings-card .member-list { grid-template-columns:repeat(3,minmax(0,1fr)); }.period-card-copy strong { font-size:12px; }.trip-period-card { padding:12px; gap:8px; }}
</style>
