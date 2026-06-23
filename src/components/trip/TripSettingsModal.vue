<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue'
import LegalRegionCombobox from '@/components/trip/LegalRegionCombobox.vue'
import { useTripStore } from '@/stores/trip.store'
import type { LegalRegion } from '@/types/geo'
import type { TripStatus, TripSummary } from '@/types/trip'

const props = defineProps<{
  open: boolean
  trip: TripSummary | null
}>()

const emit = defineEmits<{
  close: []
  deleted: [tripId: string]
}>()

const tripStore = useTripStore()
const title = ref('')
const displayDestination = ref('')
const initialDisplayDestination = ref('')
const selectedRegion = ref<LegalRegion | null>(null)
const regionSelectionChanged = ref(false)
const status = ref<Exclude<TripStatus, 'DELETED'>>('ACTIVE')
const error = ref('')
const confirmingDelete = ref(false)

watch(
  () => [props.open, props.trip] as const,
  ([open, trip]) => {
    if (!open || !trip) return
    title.value = trip.title
    displayDestination.value = trip.displayDestination ?? ''
    initialDisplayDestination.value = displayDestination.value
    selectedRegion.value = null
    regionSelectionChanged.value = false
    status.value = trip.status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE'
    error.value = ''
    confirmingDelete.value = false
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
      status: status.value,
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
  } catch {
    error.value = '여행을 삭제하지 못했습니다.'
  }
}

onMounted(() => document.addEventListener('keydown', handleKeydown))
onUnmounted(() => {
  document.removeEventListener('keydown', handleKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div v-if="open" class="settings-overlay" @click.self="close">
    <section class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="trip-settings-title">
      <header class="settings-header">
        <div>
          <p class="eyebrow">Trip Settings</p>
          <h2 id="trip-settings-title">여행 설정</h2>
        </div>
        <button class="icon-btn" type="button" aria-label="닫기" :disabled="tripStore.mutating" @click="close">
          <span class="material-symbols-rounded" aria-hidden="true">close</span>
        </button>
      </header>

      <form class="settings-form" @submit.prevent="save">
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

        <fieldset class="status-fieldset">
          <legend>여행 상태</legend>
          <div class="status-segments">
            <button type="button" data-status="ACTIVE" :class="{ active: status === 'ACTIVE' }" @click="status = 'ACTIVE'">
              진행 중
            </button>
            <button type="button" data-status="ARCHIVED" :class="{ active: status === 'ARCHIVED' }" @click="status = 'ARCHIVED'">
              보관됨
            </button>
          </div>
          <small class="status-help">여행이 끝났다면 직접 ‘보관됨’으로 바꿀 수 있습니다. 언제든 다시 진행 중으로 되돌릴 수 있어요.</small>
        </fieldset>

        <p v-if="error" class="settings-error" aria-live="polite">{{ error }}</p>

        <div class="settings-actions">
          <button class="btn ghost" type="button" :disabled="tripStore.mutating" @click="close">취소</button>
          <button class="btn primary" type="submit" data-testid="settings-save" :disabled="tripStore.mutating">
            {{ tripStore.mutating ? '저장 중...' : '저장' }}
          </button>
        </div>
      </form>

      <section class="danger-zone" aria-labelledby="delete-trip-title">
        <div>
          <h3 id="delete-trip-title">여행 삭제</h3>
          <p>여행의 일정과 협업 데이터에 더 이상 접근할 수 없습니다.</p>
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
    </section>
  </div>
</template>

<style scoped>
.settings-overlay {
  align-items: center;
  background: rgb(17 24 39 / 48%);
  display: flex;
  inset: 0;
  justify-content: center;
  padding: 20px;
  position: fixed;
  z-index: 2000;
}

.settings-modal {
  background: #fff;
  border: 1px solid rgba(227, 234, 244, .9);
  border-radius: 24px;
  box-shadow: 0 24px 64px rgb(0 0 0 / 18%);
  max-height: min(760px, calc(100vh - 40px));
  overflow: auto;
  width: min(560px, 100%);
}

.settings-header {
  align-items: center;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  justify-content: space-between;
  padding: 24px;
}

.settings-header h2,
.settings-header p,
.danger-zone h3,
.danger-zone p {
  letter-spacing: 0;
  margin: 0;
}

.settings-form {
  display: grid;
  gap: 20px;
  padding: 24px;
}

.status-fieldset {
  border: 0;
  margin: 0;
  padding: 0;
}

.status-fieldset legend {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 8px;
}

.status-segments {
  background: #f3f4f6;
  border-radius: 8px;
  display: grid;
  gap: 4px;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
}

.status-segments button {
  background: transparent;
  border: 0;
  border-radius: 6px;
  color: #6b7280;
  cursor: pointer;
  font-weight: 700;
  padding: 10px;
}

.status-segments button.active {
  background: #fff;
  box-shadow: 0 1px 3px rgb(0 0 0 / 10%);
  color: #111827;
}

.status-hint {
  color: #6b7280;
  font-size: 12px;
  line-height: 1.5;
  margin: 8px 0 0;
}

.settings-actions,
.delete-confirmation {
  align-items: center;
  display: flex;
  gap: 8px;
}

.settings-actions {
  justify-content: flex-end;
}

.settings-error {
  color: #be123c;
  font-size: 14px;
  margin: 0;
}
.status-help { display: block; margin-top: 8px; color: var(--muted); font-size: 11px; line-height: 1.5; }

.danger-zone {
  align-items: center;
  background: #fff1f2;
  border-top: 1px solid #fecdd3;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 20px 24px;
}

.danger-zone h3 {
  color: #9f1239;
  font-size: 15px;
}

.danger-zone p {
  color: #881337;
  font-size: 13px;
  margin-top: 4px;
}

.danger-button {
  background: #be123c;
  border: 0;
  border-radius: 6px;
  color: #fff;
  cursor: pointer;
  font-weight: 700;
  padding: 9px 12px;
}

.delete-confirmation {
  flex-wrap: wrap;
  justify-content: flex-end;
}

.delete-confirmation > button:not(.danger-button) {
  background: transparent;
  border: 0;
  cursor: pointer;
  font-weight: 700;
}

@media (max-width: 640px) {
  .settings-overlay {
    align-items: flex-end;
    padding: 0;
  }

  .settings-modal {
    border-radius: 24px 24px 0 0;
    max-height: 92vh;
  }

  .settings-header,
  .settings-form,
  .danger-zone {
    padding: 20px;
  }

  .danger-zone {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
