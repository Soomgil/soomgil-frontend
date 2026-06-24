<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import QRCode from 'qrcode'
import { toPng } from 'html-to-image'
import type { TripSummary } from '@/types/trip'
import logoUrl from '@/assets/images/soomgil_logo_none_text.png'

const props = defineProps<{ trip: TripSummary }>()

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

defineEmits<{ detail: [] }>()

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
const statusLabel = computed(() => props.trip.status === 'ARCHIVED' ? '보관된 여행' : '여행 준비 중')
const roleLabel = computed(() => props.trip.myRole === 'OWNER' ? '방장' : '멤버')
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
  if (document.fonts) await document.fonts.ready

  try {
    const dataUrl = await toPng(ticketEl.value, {
      backgroundColor: '#f4f9ff',
      cacheBust: true,
      pixelRatio: 2,
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
        <div class="route-path" aria-hidden="true"><span class="line"></span><span class="plane-mark">&#9992;</span><span class="line"></span></div>
        <div class="route-point destination"><span class="airport-code">{{ destinationCode }}</span><span class="city-name">{{ destinationName }}</span></div>
      </div>
      <div class="ticket-reservation">
        <span class="ticket-reservation-label">TRIP RESERVATION</span>
        <h2>{{ trip.title }}</h2>
        <p>서울에서 {{ destinationName }}까지</p>
      </div>
      <div class="ticket-details">
        <div class="detail-item ticket-field">
          <span class="label">STATUS</span>
          <span class="value">{{ statusLabel }}</span>
          <small>여행 상태</small>
        </div>
        <div class="detail-item ticket-field">
          <span class="label">DEPARTURE</span>
          <span class="value">{{ formatTripDate(trip.startDate) }}</span>
          <small>출발일</small>
        </div>
        <div class="detail-item ticket-field">
          <span class="label">RETURN</span>
          <span class="value">{{ formatTripDate(trip.endDate) }}</span>
          <small>귀환일</small>
        </div>
        <div class="detail-item ticket-field">
          <span class="label">DESTINATION</span>
          <span class="value">{{ destinationName }}</span>
          <small>{{ destinationCode }}</small>
        </div>
      </div>
    </div>
    <div class="ticket-divider" aria-hidden="true"><span class="punch-hole top"></span><span class="dashed-line"></span><span class="punch-hole bottom"></span></div>
    <div class="ticket-stub">
      <div class="stub-header">
        <div class="stub-kicker-row">
          <span class="stub-title-label">BOARDING PASS</span>
          <div class="stub-ticket-badges">
            <span class="stub-role-badge">{{ roleLabel }}</span>
            <span class="stub-route-code">{{ destinationCode }}</span>
          </div>
        </div>
        <h2 class="stub-title">{{ trip.title }}</h2>
        <p class="stub-date-info">
          <span class="stub-date-label" aria-hidden="true">DATE</span>
          {{ periodLabel }}
        </p>
      </div>

      <div class="stub-qr-panel">
        <div class="ticket-qr" aria-label="여행 상세 QR 코드">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="여행 상세 페이지 QR 코드" data-testid="trip-qr">
        </div>
        <span class="ticket-qr-label">SCAN TO OPEN</span>
      </div>

      <div class="stub-actions" data-export-controls>
        <button class="stub-export-btn" type="button" :disabled="exporting" data-testid="export-ticket" @click="exportTicket">
          <span class="material-symbols-rounded" aria-hidden="true">download</span>{{ exporting ? '저장 중' : '티켓 이미지 저장' }}
        </button>
      </div>
      <p v-if="exportError" class="ticket-export-error" role="alert">{{ exportError }}</p>
      <button class="stub-detail-btn" type="button" @click="$emit('detail')"><span>여행 계획 열기</span><span class="material-symbols-rounded">arrow_forward</span></button>
    </div>
  </div>
</template>

<style scoped>
.boarding-pass-card--placeholder { background-image: linear-gradient(135deg, rgba(255, 255, 255, 0.96), rgba(244, 249, 255, 0.98)) !important; }

.ticket-main {
  justify-content: flex-start !important;
  padding: 30px 38px 26px !important;
}

.ticket-main .ticket-header {
  margin-bottom: 18px;
}

.ticket-main .ticket-route {
  margin-bottom: 20px;
  padding: 0;
}

.ticket-main .route-point {
  flex-basis: 170px;
  width: 170px;
}

.ticket-main .route-point .airport-code {
  font-size: clamp(48px, 5vw, 64px);
}

.ticket-main .route-point .city-name {
  letter-spacing: 0;
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-logo .logo-text,
.stub-title-label {
  white-space: nowrap;
}

.plane-mark {
  color: var(--violet);
  flex: 0 0 auto;
  font-family: Arial, sans-serif;
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}

.ticket-main .route-path .line,
.ticket-main .route-path .line:last-of-type {
  background: repeating-linear-gradient(90deg, rgba(0, 102, 255, 0.32) 0 4px, transparent 4px 8px);
  height: 1px;
}

.ticket-reservation {
  border-bottom: 1px solid var(--line);
  min-height: 90px;
  padding: 4px 0 18px;
}

.ticket-reservation-label {
  color: var(--violet);
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.12em;
}

.ticket-reservation h2 {
  color: var(--ink);
  font-size: 24px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1.3;
  margin: 6px 0 0;
  overflow-wrap: anywhere;
}

.ticket-reservation p {
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
  margin: 5px 0 0;
}

.ticket-main .ticket-details {
  border-bottom: 0;
  border-top: 0;
  gap: 0;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  margin-top: auto;
  padding: 18px 0 0;
}

.ticket-main .ticket-field {
  gap: 4px;
  padding: 0 16px;
}

.ticket-main .ticket-field:first-child {
  padding-left: 0;
}

.ticket-main .ticket-field + .ticket-field {
  border-left: 1px solid var(--line);
}

.ticket-main .ticket-field .label {
  color: #62708a;
  font-size: 9px;
  font-weight: 850;
  letter-spacing: 0.08em;
}

.ticket-main .ticket-field .value {
  font-size: 14px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-main .ticket-field small {
  color: var(--muted);
  font-size: 9px;
  font-weight: 600;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ticket-stub {
  gap: 14px;
  justify-content: flex-start !important;
  padding: 28px 26px 22px !important;
  background:
    linear-gradient(160deg, rgba(247, 250, 255, 0.98), rgba(237, 245, 255, 0.94)) !important;
}

.stub-header {
  display: block;
  flex: 0 0 auto;
  min-height: 0;
}

.stub-kicker-row {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
}

.stub-route-code {
  border: 1px solid rgba(0, 102, 255, 0.14);
  border-radius: 999px;
  color: var(--violet);
  font-size: 10px;
  font-weight: 900;
  line-height: 22px;
  min-width: 38px;
  padding: 0 8px;
  text-align: center;
}

.stub-ticket-badges {
  align-items: center;
  display: flex;
  gap: 5px;
}

.stub-title {
  -webkit-line-clamp: 2;
  font-size: 18px !important;
  line-height: 1.35 !important;
  min-height: 48px;
}

.stub-date-info {
  align-items: center;
  display: flex;
  gap: 5px;
  margin-top: 7px !important;
}

.stub-date-label {
  border: 1px solid rgba(0, 102, 255, 0.22);
  border-radius: 4px;
  color: var(--violet);
  font-size: 8px;
  font-weight: 900;
  line-height: 16px;
  padding: 0 4px;
}

.stub-qr-panel {
  align-items: center;
  background: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(196, 213, 238, 0.9);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  justify-content: center;
  margin-right: 22px;
  padding: 10px 12px 8px;
  box-shadow: 0 8px 20px rgba(31, 75, 140, 0.06);
}

.ticket-qr {
  background: #fff;
  border-radius: 5px;
  padding: 4px;
}

.ticket-qr img {
  display: block;
  height: 104px;
  image-rendering: pixelated;
  width: 104px;
}

.ticket-qr-label {
  color: #64748b;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0;
  line-height: 1;
}

.stub-role-badge {
  background: rgba(0, 102, 255, 0.09);
  border-radius: 999px;
  color: var(--violet) !important;
  font-size: 9px;
  font-weight: 850;
  line-height: 22px;
  padding: 0 8px;
}

.stub-actions {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 0;
}

.stub-export-btn {
  align-items: center;
  border: 1px solid rgba(196, 213, 238, 0.95);
  border-radius: 7px;
  color: var(--ink);
  cursor: pointer;
  display: inline-flex;
  font-size: 11px;
  font-weight: 800;
  gap: 5px;
  height: 32px;
  justify-content: center;
  padding: 0 9px;
  transition: background 160ms ease, border-color 160ms ease;
}

.stub-export-btn {
  background: #fff;
  color: var(--violet);
  width: 100%;
}

.stub-export-btn:hover {
  background: #fff;
  border-color: var(--violet);
}

.stub-export-btn:disabled {
  cursor: wait;
  opacity: 0.6;
}

.stub-detail-btn {
  background: linear-gradient(135deg, #0868ff, #0d8dff) !important;
  border: 0 !important;
  border-radius: 8px !important;
  box-shadow: 0 8px 18px rgba(0, 102, 255, 0.2);
  color: #fff !important;
  flex: 0 0 38px;
  font-size: 12px !important;
  min-height: 38px;
}

.stub-detail-btn:hover {
  box-shadow: 0 10px 22px rgba(0, 102, 255, 0.28);
  transform: translateY(-1px);
}

.ticket-export-error {
  color: #dc2626;
  font-size: 11px;
  margin: -5px 0 8px;
}

.boarding-pass-card.is-exporting .stub-actions,
.boarding-pass-card.is-exporting .stub-detail-btn,
.boarding-pass-card.is-exporting .ticket-export-error {
  display: none;
}

.boarding-pass-card.is-exporting .stub-qr-panel {
  flex: 1 1 auto;
  margin-bottom: 0;
}

.stub-export-btn .material-symbols-rounded {
  font-size: 15px;
}
</style>
