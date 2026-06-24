<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { toPng } from 'html-to-image'
import { useAuthStore } from '@/stores/auth.store'
import TripSettingsButton from '@/components/trip/TripSettingsButton.vue'
import type { TripSummary } from '@/types/trip'
import logoUrl from '@/assets/images/soomgil_logo_none_text.png'

const props = withDefaults(defineProps<{ trip: TripSummary; position?: number; count?: number }>(), {
  position: 0,
  count: 1,
})

const ticketEl = ref<HTMLElement | null>(null)
const qrDataUrl = ref('')
const exporting = ref(false)
const exportError = ref('')

const tripUrl = computed(() => new URL(
  `/trips/${encodeURIComponent(props.trip.id)}/route`,
  window.location.origin,
).href)

watch(tripUrl, async (url) => {
  qrDataUrl.value = await QRCode.toDataURL(url, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 160,
    color: { dark: '#111827', light: '#ffffff' },
  })
}, { immediate: true })

defineEmits<{ detail: []; access: []; settings: [] }>()

const destinationName = computed(() => props.trip.displayDestination?.trim() || '여행지 미정')
const destinationCode = computed(() => {
  const name = props.trip.displayDestination ?? props.trip.title
  if (!name) return 'TBD'
  if (name.includes('부산')) return 'PUS'
  if (name.includes('제주')) return 'CJU'
  if (name.includes('강릉')) return 'KAG'
  if (name.includes('경주')) return 'KYJ'
  if (name.includes('여수')) return 'YSU'
  if (name.includes('대전')) return 'DJN'
  if (name.includes('전주')) return 'JNJ'

  const normalized = destinationName.value.replace(/[^A-Za-z가-힣]/g, '')
  if (!normalized || normalized === '여행지미정') return 'TBD'
  const latin = normalized.replace(/[^A-Za-z]/g, '').toUpperCase()
  return latin ? latin.slice(0, 3) : 'SMG'
})
const authStore = useAuthStore()
const statusLabel = computed(() => props.trip.status === 'ARCHIVED' ? '보관된 여행' : '여행 준비 중')
const roleLabel = computed(() => props.trip.myRole === 'OWNER' ? '방장' : '멤버')
const passengerName = computed(() => authStore.user?.displayName || '사용자')
const flightNumber = computed(() => props.trip.id.substring(0, 5).toUpperCase())
const seatNumber = computed(() => props.trip.id.substring(5, 8).toUpperCase())
const gateNumber = computed(() => props.trip.id.substring(8, 11).toUpperCase())
const formatTripDate = (value: string | null | undefined) => value ? value.replace(/-/g, '.') : '미정'
const periodLabel = computed(() => {
  if (!props.trip.startDate && !props.trip.endDate) return '여행 기간 미정'
  if (props.trip.startDate && props.trip.endDate) {
    return `${formatTripDate(props.trip.startDate)} - ${formatTripDate(props.trip.endDate)}`
  }
  return formatTripDate(props.trip.startDate ?? props.trip.endDate)
})

async function exportTicket() {
  if (!ticketEl.value || exporting.value) return
  exporting.value = true
  exportError.value = ''
  await nextTick()

  try {
    const dataUrl = await toPng(ticketEl.value, {
      backgroundColor: '#f4f9ff',
      cacheBust: true,
      pixelRatio: 2,
      skipFonts: true,
    })
    const link = document.createElement('a')
    const safeTitle = props.trip.title.replace(/[\\/:*?"<>|]/g, '-').trim() || 'soomgil-trip'
    link.download = `${safeTitle}-ticket.png`
    link.href = dataUrl
    link.click()
  } catch {
    exportError.value = '티켓 이미지를 저장하지 못했습니다. 다시 시도해 주세요.'
  } finally {
    exporting.value = false
  }
}
</script>

<template>
  <div ref="ticketEl" class="boarding-pass-card boarding-pass-card--placeholder" :class="{ 'is-exporting': exporting }" data-testid="trip-ticket">
    <div class="ticket-main">
      <div class="ticket-header">
        <div class="ticket-logo">
          <img :src="logoUrl" alt="숨길 로고" class="logo-image">
          <span class="logo-text">SOOMGIL AIR</span>
        </div>
        <span class="ticket-badge d-day-badge">{{ statusLabel }}</span>
      </div>
      <div class="ticket-route">
        <div class="route-point departure"><span class="airport-code">SEL</span><span class="city-name">서울 (SEOUL)</span></div>
        <div class="route-path" aria-hidden="true"><span class="line"></span><span class="material-symbols-rounded plane-icon">flight</span><span class="line"></span></div>
        <div class="route-point destination"><span class="airport-code">{{ destinationCode }}</span><span class="city-name">{{ destinationName }}</span></div>
      </div>
      <div class="ticket-details">
        <div class="detail-item"><span class="label">PASSENGER</span><span class="value">{{ passengerName }}</span></div>
        <div class="detail-item"><span class="label">PERIOD</span><span class="value">{{ periodLabel }}</span></div>
        <div class="detail-item"><span class="label">DESTINATION</span><span class="value">{{ destinationName }}</span></div>
        <div class="detail-item"><span class="label">FLIGHT</span><span class="value">{{ flightNumber }}</span></div>
        <div class="detail-item"><span class="label">SEAT</span><span class="value">{{ seatNumber }}</span></div>
        <div class="detail-item"><span class="label">GATE</span><span class="value">{{ gateNumber }}</span></div>
      </div>
    </div>
    <div class="ticket-divider" aria-hidden="true"><span class="punch-hole top"></span><span class="dashed-line"></span><span class="punch-hole bottom"></span></div>
    <div class="ticket-stub">
      <div class="stub-header">
        <span class="stub-title-label">BOARDING PASS</span><h2 class="stub-title">{{ trip.title }}</h2><p class="stub-date-info">{{ periodLabel }}</p>
        <div class="ticket-qr" aria-label="여행 상세 QR 코드">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="여행 상세 페이지 QR 코드" data-testid="trip-qr">
          <span class="ticket-qr__label">SCAN TRIP</span>
        </div>
        <div class="ticket-members-wrapper" aria-label="여행 권한">
          <span class="label">ROLE</span><div class="next-trip-members"><span class="avatar">{{ roleLabel }}</span></div>
        </div>
      </div>
      <div class="stub-actions">
        <button v-if="trip.myRole === 'OWNER'" class="stub-action-btn" type="button" @click="$emit('access')"><span class="material-symbols-rounded" aria-hidden="true">group</span>멤버 및 초대</button>
        <TripSettingsButton v-if="trip.myRole === 'OWNER'" variant="chip" @click="$emit('settings')" />
        <button class="stub-action-btn" type="button" :disabled="exporting" data-testid="export-ticket" @click="exportTicket">
          <span class="material-symbols-rounded" aria-hidden="true">download</span>{{ exporting ? '저장 중' : '티켓 내보내기' }}
        </button>
      </div>
      <p v-if="exportError" class="ticket-export-error" role="alert">{{ exportError }}</p>
      <button class="stub-detail-btn" type="button" @click="$emit('detail')"><span>자세히 보기</span><span class="material-symbols-rounded">arrow_forward</span></button>
      <div class="stub-controls">
        <div class="next-trip-dots carousel-dots-container" :aria-label="`${count}개 여행 중 ${position + 1}번째`">
          <span v-for="index in count" :key="index" class="carousel-dot" :class="{ active: index - 1 === position }"></span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.boarding-pass-card--placeholder { background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(244, 249, 255, 0.98)) !important; }

.stub-header {
  min-height: 112px;
  padding-right: 78px;
  position: relative;
}

.ticket-qr {
  align-items: center;
  display: flex;
  flex-direction: column;
  position: absolute;
  right: 0;
  top: 0;
}

.ticket-qr img {
  background: #fff;
  border: 1px solid #dbe3ef;
  border-radius: 4px;
  height: 68px;
  image-rendering: pixelated;
  padding: 3px;
  width: 68px;
}

.ticket-qr__label {
  color: #64748b;
  font-size: 8px;
  font-weight: 800;
  letter-spacing: 0;
  margin-top: 3px;
}

/* stub 내 액션 버튼 영역 */
.stub-actions {
  display: flex;
  gap: 6px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}

.stub-action-btn {
  align-items: center;
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 800;
  gap: 4px;
  padding: 6px 10px;
  transition: background 160ms ease, border-color 160ms ease;
}

.stub-action-btn:hover {
  background: #fff;
  border-color: var(--violet);
}

.stub-action-btn:disabled {
  cursor: wait;
  opacity: 0.6;
}

.ticket-export-error {
  color: #dc2626;
  font-size: 11px;
  margin: -5px 0 8px;
}

.boarding-pass-card.is-exporting .stub-actions,
.boarding-pass-card.is-exporting .stub-detail-btn,
.boarding-pass-card.is-exporting .stub-controls,
.boarding-pass-card.is-exporting .ticket-export-error {
  display: none;
}

.stub-action-btn .material-symbols-rounded {
  font-size: 15px;
}
</style>
