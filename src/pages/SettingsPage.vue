<script setup lang="ts">
import AppShell from '@/components/layout/AppShell.vue'
import { useAuth } from '@/composables/useAuth'

const { logout, user } = useAuth()
</script>

<template>
  <AppShell>
    <div class="max-w-2xl mx-auto px-6 py-12">
      <h1 class="text-2xl font-black text-ink mb-8">설정</h1>

      <!-- Profile Section -->
      <section class="p-6 rounded-3xl bg-surface border border-line mb-6">
        <h2 class="font-bold text-ink mb-4">프로필</h2>
        <div class="flex items-center gap-4">
          <div class="w-16 h-16 rounded-full bg-brand-violet flex items-center justify-center text-white text-xl font-bold">
            {{ user?.displayName?.charAt(0) || 'U' }}
          </div>
          <div>
            <p class="font-bold text-ink">{{ user?.displayName || '사용자' }}</p>
            <p class="text-sm text-muted">{{ user?.email || '' }}</p>
          </div>
          <button class="ml-auto px-4 py-2 rounded-xl border border-line text-sm font-semibold text-muted hover:bg-surface-2 transition-colors">
            편집
          </button>
        </div>
      </section>

      <!-- Notifications -->
      <section class="p-6 rounded-3xl bg-surface border border-line mb-6">
        <h2 class="font-bold text-ink mb-4">알림</h2>
        <div class="space-y-4">
          <label v-for="item in ['여행방 초대', '일정 변경', '새 댓글', '커뮤니티 활동']" :key="item" class="flex items-center justify-between">
            <span class="text-sm text-ink">{{ item }}</span>
            <input type="checkbox" checked class="accent-brand-violet" />
          </label>
        </div>
      </section>

      <!-- Account -->
      <section class="p-6 rounded-3xl bg-surface border border-line mb-6">
        <h2 class="font-bold text-ink mb-4">계정</h2>
        <div class="space-y-3">
          <button class="w-full text-left px-4 py-3 rounded-xl hover:bg-surface-2 transition-colors flex items-center justify-between">
            <span class="text-sm text-ink">비밀번호 변경</span>
            <span class="material-symbols-rounded text-muted">chevron_right</span>
          </button>
          <button class="w-full text-left px-4 py-3 rounded-xl hover:bg-surface-2 transition-colors flex items-center justify-between">
            <span class="text-sm text-ink">이메일 설정</span>
            <span class="material-symbols-rounded text-muted">chevron_right</span>
          </button>
        </div>
      </section>

      <!-- Logout -->
      <button
        class="w-full py-4 rounded-2xl border border-brand-rose/30 text-brand-rose font-bold hover:bg-brand-rose/5 transition-colors"
        @click="logout"
      >
        로그아웃
      </button>
    </div>
  </AppShell>
</template>
