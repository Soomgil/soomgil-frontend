<script setup lang="ts">
import { onMounted, ref } from 'vue'
import AppShell from '@/components/layout/AppShell.vue'
import { adminApi } from '@/api/admin.api'
import type { ContentReport, ModerationAction, ModerationActionType, ReportStatus } from '@/types/community'

const reports = ref<ContentReport[]>([])
const actions = ref<ModerationAction[]>([])
const status = ref<ReportStatus | ''>('OPEN')
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [reportPage, actionPage] = await Promise.all([
      adminApi.getReports(status.value || undefined),
      adminApi.getActions(),
    ])
    reports.value = reportPage.items
    actions.value = actionPage.items
  } catch (cause: any) {
    error.value = cause?.response?.status === 403
      ? '모더레이터 권한이 필요한 화면입니다.'
      : '모더레이션 데이터를 불러오지 못했습니다.'
  } finally {
    loading.value = false
  }
}

async function resolve(report: ContentReport, result: 'RESOLVED' | 'REJECTED', action?: ModerationActionType) {
  const note = window.prompt('처리 메모를 입력하세요.', '') ?? ''
  loading.value = true
  error.value = ''
  try {
    await adminApi.resolveReport(report.id, {
      status: result,
      resolutionNote: note || null,
      moderationAction: action ? {
        targetType: report.targetType,
        targetId: report.targetId,
        action,
        moderationReason: note || null,
      } : null,
    })
    await load()
  } catch (cause: any) {
    error.value = cause?.response?.data?.detail || '신고를 처리하지 못했습니다.'
    loading.value = false
  }
}

onMounted(load)
</script>

<template>
  <AppShell>
    <main class="max-w-5xl mx-auto px-6 py-12">
      <div class="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div><p class="text-sm text-muted">운영 도구</p><h1 class="text-2xl font-black text-ink">신고 및 모더레이션</h1></div>
        <select v-model="status" class="px-4 py-2 rounded-xl border border-line bg-surface" @change="load">
          <option value="">전체 상태</option><option value="OPEN">대기</option><option value="REVIEWING">검토 중</option><option value="RESOLVED">처리 완료</option><option value="REJECTED">반려</option>
        </select>
      </div>
      <p v-if="error" class="p-4 rounded-xl bg-red-50 text-brand-rose mb-6">{{ error }}</p>
      <p v-if="loading" class="text-muted">불러오는 중…</p>
      <section v-else class="grid gap-4 mb-12">
        <p v-if="reports.length === 0" class="text-muted">조건에 맞는 신고가 없습니다.</p>
        <article v-for="report in reports" :key="report.id" class="p-5 rounded-2xl bg-surface border border-line">
          <div class="flex flex-wrap justify-between gap-3"><strong>{{ report.reasonCode }} · {{ report.targetType }}</strong><span class="text-xs text-muted">{{ report.status }} · {{ new Date(report.createdAt).toLocaleString('ko-KR') }}</span></div>
          <p class="text-sm text-muted my-3">{{ report.detail || '상세 설명 없음' }}</p>
          <p class="text-xs mb-4">대상 ID: {{ report.targetId }} · 신고자: {{ report.reporter?.displayName || '탈퇴 사용자' }}</p>
          <div v-if="report.status === 'OPEN' || report.status === 'REVIEWING'" class="flex flex-wrap gap-2">
            <button class="px-3 py-2 rounded-lg bg-brand-violet text-white text-xs" @click="resolve(report, 'RESOLVED', 'HIDE')">숨김 후 해결</button>
            <button class="px-3 py-2 rounded-lg border border-line text-xs" @click="resolve(report, 'RESOLVED')">조치 없이 해결</button>
            <button class="px-3 py-2 rounded-lg border border-line text-xs" @click="resolve(report, 'REJECTED')">반려</button>
          </div>
        </article>
      </section>
      <section>
        <h2 class="text-xl font-bold mb-4">최근 조치 이력</h2>
        <div class="grid gap-3">
          <article v-for="action in actions" :key="action.id" class="p-4 rounded-xl border border-line bg-surface text-sm">
            <strong>{{ action.action }}</strong> · {{ action.targetType }} {{ action.targetId }}
            <span class="block text-xs text-muted mt-1">{{ action.moderator?.displayName || '관리자' }} · {{ new Date(action.createdAt).toLocaleString('ko-KR') }} · {{ action.moderationReason || '사유 없음' }}</span>
          </article>
        </div>
      </section>
    </main>
  </AppShell>
</template>
