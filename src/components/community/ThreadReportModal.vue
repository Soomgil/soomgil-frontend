<script setup lang="ts">
import { ref, watch } from 'vue'
import BaseModal from '@/components/common/BaseModal.vue'
import { communityApi } from '@/api/community.api'
import type { ReportReason, ReportReasonCode } from '@/types/community'

const props = defineProps<{
  open: boolean
  /** 신고 대상 설명. 예: "쓰레드", "답글" */
  targetLabel: string
  submitting?: boolean
}>()

const emit = defineEmits<{
  close: []
  submit: [reasonCode: ReportReasonCode, detail: string | undefined]
}>()

const reasons = ref<ReportReason[]>([])
const loadingReasons = ref(false)
const selected = ref<ReportReasonCode | ''>('')
const detail = ref('')

// 서버 사유 목록을 못 받아도 신고 자체는 가능하도록 기본 사유를 둔다.
const FALLBACK_REASONS: ReportReason[] = [
  { code: 'SPAM', displayName: '스팸 · 광고', isActive: true },
  { code: 'INAPPROPRIATE', displayName: '부적절한 내용', isActive: true },
  { code: 'HARASSMENT_OR_HATE', displayName: '괴롭힘 · 혐오 표현', isActive: true },
  { code: 'RIGHTS_VIOLATION', displayName: '저작권 · 초상권 침해', isActive: true },
  { code: 'OTHER', displayName: '기타', isActive: true },
]

async function loadReasons() {
  if (reasons.value.length) return
  loadingReasons.value = true
  try {
    reasons.value = await communityApi.getReportReasons()
  } catch {
    reasons.value = FALLBACK_REASONS
  } finally {
    loadingReasons.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      selected.value = ''
      detail.value = ''
      void loadReasons()
    }
  },
)

function submit() {
  if (!selected.value) return
  emit('submit', selected.value, detail.value.trim() || undefined)
}
</script>

<template>
  <BaseModal :open="open" @close="emit('close')">
    <div class="p-6 sm:p-7" data-testid="report-modal">
      <div class="flex items-center gap-2 mb-1">
        <span class="material-symbols-rounded text-brand-rose text-[22px]">flag</span>
        <h2 class="text-lg font-extrabold text-ink">{{ targetLabel }} 신고</h2>
      </div>
      <p class="text-sm text-muted mb-5">신고 사유를 선택해주세요. 운영팀이 확인 후 처리합니다.</p>

      <div v-if="loadingReasons" class="py-6 text-center text-sm text-muted">사유를 불러오는 중…</div>
      <div v-else class="flex flex-col gap-2 mb-4" role="radiogroup" aria-label="신고 사유">
        <label
          v-for="reason in reasons"
          :key="reason.code"
          class="flex items-center gap-3 px-4 py-3 rounded-2xl border cursor-pointer transition-colors"
          :class="selected === reason.code
            ? 'border-brand-violet bg-surface-2 text-ink'
            : 'border-line text-ink hover:bg-surface-2/60'"
        >
          <input
            v-model="selected"
            type="radio"
            :value="reason.code"
            class="accent-brand-violet"
            data-testid="report-reason"
          />
          <span class="text-sm font-semibold">{{ reason.displayName }}</span>
        </label>
      </div>

      <textarea
        v-model="detail"
        rows="3"
        maxlength="500"
        placeholder="자세한 내용이 있다면 알려주세요 (선택)"
        class="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-violet/30 resize-none"
        data-testid="report-detail"
      />

      <div class="flex justify-end gap-2 mt-5">
        <button
          type="button"
          class="px-5 py-2.5 rounded-full text-sm font-bold text-muted hover:bg-surface-2 transition-colors"
          data-testid="report-cancel"
          @click="emit('close')"
        >
          취소
        </button>
        <button
          type="button"
          class="px-6 py-2.5 rounded-full text-sm font-bold text-white bg-brand-rose shadow-[0_10px_26px_rgba(255,92,141,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:pointer-events-none"
          :disabled="!selected || submitting"
          data-testid="report-submit"
          @click="submit"
        >
          신고하기
        </button>
      </div>
    </div>
  </BaseModal>
</template>
