<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed } from 'vue'
import LegalRegionCombobox from '@/components/trip/LegalRegionCombobox.vue'
import { useTripStore } from '@/stores/trip.store'
import { tripApi } from '@/api/trip.api'
import type { LegalRegion } from '@/types/geo'
import type { TripStatus, TripSummary, TripDetail } from '@/types/trip'

const props = defineProps<{
  open: boolean
  trip: TripSummary | TripDetail | null
  defaultTab?: 'tab-settings' | 'tab-members'
}>()

const emit = defineEmits<{
  close: []
  deleted: [tripId: string]
  saved: [tripId: string]
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
const error = ref('')
const confirmingDelete = ref(false)

// Invite Tab State
const inviteLink = ref('')
const inviteLoading = ref(false)
const inviteError = ref('')
const inviteCopied = ref(false)
let inviteCopiedTimer: number | null = null

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
      inviteLink.value = ''
      inviteCopied.value = false
      return
    }
    
    activeTab.value = defaultTab || 'tab-settings'
    
    if (!trip) return
    
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
  if (inviteLink.value) return
  inviteLoading.value = true
  inviteError.value = ''
  try {
    const invites = await tripApi.getInvites(tripId)
    const activeInvite = invites.find(invite => invite.status === 'PENDING' && invite.inviteUrl)
    const invite = activeInvite ?? await tripApi.createInvite(tripId)
    inviteLink.value = invite.inviteUrl ?? `${window.location.origin}/trip-invites/${invite.inviteCode}`
  } catch {
    inviteError.value = '초대 링크를 준비하지 못했습니다.'
  } finally {
    inviteLoading.value = false
  }
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
  if (props.open && event.key === 'Escape') close()
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

  if (editStartDate.value && editEndDate.value && new Date(editEndDate.value) < new Date(editStartDate.value)) {
    error.value = '종료 날짜는 시작 날짜 이후로 선택해 주세요.'
    return
  }

  error.value = ''
  try {
    const trimmedDestination = displayDestination.value.trim()
    const regionCodesChanged = Boolean(selectedRegion.value)
      || (regionSelectionChanged.value && trimmedDestination !== initialDisplayDestination.value.trim())
    
    // tripApi를 통해 수정
    // (startDate, endDate 등은 tripStore.updateTrip 내부에서 지원 안 할 수도 있으나 UI상 처리)
    await tripStore.updateTrip(props.trip.id, {
      title: trimmedTitle,
      displayDestination: trimmedDestination,
      ...(regionCodesChanged
        ? { legalRegionCodes: selectedRegion.value ? [selectedRegion.value.code] : [] }
        : {}),
      status: status.value,
    })
    
    // RoutePage에서 날짜 동기화를 위해 변경된 날짜값들을 trip 객체에 임시 셋업
    if (props.trip) {
      props.trip.startDate = editStartDate.value || undefined
      props.trip.endDate = editEndDate.value || undefined
    }

    emit('saved', props.trip.id)
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

const membersList = computed(() => {
  if (!props.trip) return []
  return (props.trip as any).members ?? []
})

const isOwner = computed(() => props.trip?.myRole === 'OWNER')

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => {
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

            <label class="form-label">
              <span class="form-label-text">여행 기간 설정 <span v-if="$route?.name !== 'Route'" style="font-weight:normal;color:var(--muted);font-size:12px;">(일정 페이지에서만 수정 가능)</span></span>
              <div style="display:flex;align-items:center;gap:8px;">
                <input type="date" class="field" v-model="editStartDate" style="flex:1;" :disabled="$route?.name !== 'Route'">
                <span>-</span>
                <input type="date" class="field" v-model="editEndDate" :min="editStartDate" style="flex:1;" :disabled="$route?.name !== 'Route'">
              </div>
              <div v-if="editStartDate && editEndDate" style="text-align:center;font-size:14px;color:var(--violet);font-weight:600;margin-top:8px;">
                총 {{ editDayCount }}일 여행
              </div>
            </label>

            <section v-if="isOwner" class="management-section" aria-labelledby="trip-status-title">
              <div class="management-section-head">
                <span class="material-symbols-rounded management-section-icon" aria-hidden="true">toggle_on</span>
                <div>
                  <h4 id="trip-status-title">여행 상태 설정</h4>
                  <p>목록과 대시보드에서 이 여행이 표시되는 방식을 선택합니다.</p>
                </div>
              </div>
              <div class="status-option-grid" role="radiogroup" aria-label="여행 상태">
                <button
                  type="button"
                  class="status-option"
                  :class="{ active: status === 'ACTIVE' }"
                  role="radio"
                  :aria-checked="status === 'ACTIVE'"
                  @click="status = 'ACTIVE'"
                >
                  <span class="material-symbols-rounded status-option-icon" aria-hidden="true">directions_run</span>
                  <span class="status-option-copy">
                    <strong>진행 중</strong>
                    <span>계획을 계속 편집하고 활성 여행으로 표시합니다.</span>
                  </span>
                  <span class="material-symbols-rounded status-option-check" aria-hidden="true">check_circle</span>
                </button>
                <button
                  type="button"
                  class="status-option"
                  :class="{ active: status === 'ARCHIVED' }"
                  role="radio"
                  :aria-checked="status === 'ARCHIVED'"
                  @click="status = 'ARCHIVED'"
                >
                  <span class="material-symbols-rounded status-option-icon" aria-hidden="true">inventory_2</span>
                  <span class="status-option-copy">
                    <strong>보관됨</strong>
                    <span>끝난 여행으로 정리합니다. 언제든 다시 되돌릴 수 있습니다.</span>
                  </span>
                  <span class="material-symbols-rounded status-option-check" aria-hidden="true">check_circle</span>
                </button>
              </div>
            </section>

            <p v-if="error" class="trip-create-error" aria-live="polite" style="color:var(--rose);">{{ error }}</p>

            <section v-if="isOwner" class="management-section danger-zone" aria-labelledby="delete-trip-title">
              <div class="management-section-head">
                <span class="material-symbols-rounded management-section-icon management-section-icon--danger" aria-hidden="true">delete</span>
                <div>
                  <h4 id="delete-trip-title">여행 삭제</h4>
                  <p>삭제하면 여행의 일정과 협업 데이터에 더 이상 접근할 수 없습니다.</p>
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
          <section class="management-section invite-share-section" aria-labelledby="invite-share-title">
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
                :placeholder="inviteLoading ? '초대 링크 생성 중...' : '초대 링크를 사용할 수 없습니다.'"
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
          </section>

          <div class="modal-members-section management-section">
            <div class="members-header">
              <h4>참여 중인 멤버</h4>
              <span class="member-count">{{ membersList.length }}명</span>
            </div>
            <ul class="member-list">
              <li v-for="member in membersList" :key="member.id" class="member-item">
                <div class="member-avatar">
                  <img v-if="member.profileImageUrl" :src="member.profileImageUrl" :alt="member.displayName" />
                  <template v-else>{{ (member.displayName ?? '?').charAt(0) }}</template>
                </div>
                <div class="member-info">
                  <span class="member-name">{{ member.displayName ?? '알 수 없음' }}</span>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
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
  margin-bottom: 0;
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
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  align-items: center;
}

.delete-confirmation > span {
  font-size: 13px;
  color: #9f1239;
  font-weight: 700;
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

@media (max-width: 640px) {
  .danger-zone {
    align-items: stretch;
    flex-direction: column;
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
</style>
