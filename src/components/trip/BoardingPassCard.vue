<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth.store'
import type { TripSummary } from '@/types/trip'
import logoUrl from '@/assets/images/soomgil_logo_none_text.png'

const props = withDefaults(defineProps<{ trip: TripSummary; position?: number; count?: number }>(), {
  position: 0,
  count: 1,
})

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
const createdLabel = computed(() => {
  const date = new Date(props.trip.createdAt)
  return Number.isNaN(date.getTime()) ? '-' : new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium' }).format(date)
})
</script>

<template>
  <div class="boarding-pass-card boarding-pass-card--placeholder" data-testid="trip-ticket">
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
        <div class="detail-item"><span class="label">CREATED</span><span class="value">{{ createdLabel }}</span></div>
        <div class="detail-item"><span class="label">DESTINATION</span><span class="value">{{ destinationName }}</span></div>
        <div class="detail-item"><span class="label">FLIGHT</span><span class="value">{{ flightNumber }}</span></div>
        <div class="detail-item"><span class="label">SEAT</span><span class="value">{{ seatNumber }}</span></div>
        <div class="detail-item"><span class="label">GATE</span><span class="value">{{ gateNumber }}</span></div>
      </div>
    </div>
    <div class="ticket-divider" aria-hidden="true"><span class="punch-hole top"></span><span class="dashed-line"></span><span class="punch-hole bottom"></span></div>
    <div class="ticket-stub">
      <div class="stub-header">
        <span class="stub-title-label">BOARDING PASS</span><h2 class="stub-title">{{ trip.title }}</h2><p class="stub-date-info">{{ createdLabel }} 생성</p>
        <div class="ticket-members-wrapper" aria-label="여행 권한">
          <span class="label">ROLE</span><div class="next-trip-members"><span class="avatar">{{ roleLabel }}</span></div>
        </div>
      </div>
      <div class="stub-actions">
        <button v-if="trip.myRole === 'OWNER'" class="stub-action-btn" type="button" @click="$emit('access')"><span class="material-symbols-rounded" aria-hidden="true">group</span>멤버 및 초대</button>
        <button v-if="trip.myRole === 'OWNER'" class="stub-action-btn" type="button" @click="$emit('settings')"><span class="material-symbols-rounded" aria-hidden="true">settings</span>설정</button>
      </div>
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

.stub-action-btn .material-symbols-rounded {
  font-size: 15px;
}
</style>
