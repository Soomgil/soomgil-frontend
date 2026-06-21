<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppShell from '@/components/layout/AppShell.vue'
import { useAuth } from '@/composables/useAuth'
import { userApi } from '@/api/user.api'
import type { UpdateMeRequest, UpdateUserSettingsRequest } from '@/types/auth'

const { logout, user } = useAuth()

const loading = ref(false)
const saving = ref(false)

const profileForm = ref({
  displayName: '',
  bio: '',
})

const settingsForm = ref({
  displayLanguage: 'ko',
  timezone: 'Asia/Seoul',
  marketingEmailOptIn: false,
  tripInviteEmailOptIn: true,
})

const message = ref('')

onMounted(async () => {
  loading.value = true
  try {
    const settings = await userApi.getSettings()
    settingsForm.value = {
      displayLanguage: settings.displayLanguage,
      timezone: settings.timezone,
      marketingEmailOptIn: settings.marketingEmailOptIn,
      tripInviteEmailOptIn: settings.tripInviteEmailOptIn,
    }
    if (user) {
      profileForm.value.displayName = user.displayName
      profileForm.value.bio = user.bio ?? ''
    }
  } catch {
    // 에러는 인터셉터에서 처리
  } finally {
    loading.value = false
  }
})

async function saveProfile() {
  saving.value = true
  try {
    const payload: UpdateMeRequest = {
      displayName: profileForm.value.displayName,
      bio: profileForm.value.bio || undefined,
    }
    await userApi.updateMe(payload)
    message.value = '프로필을 저장했습니다.'
  } catch {
    // 에러는 인터셉터에서 처리
  } finally {
    saving.value = false
  }
}

async function saveSettings() {
  saving.value = true
  try {
    const payload: UpdateUserSettingsRequest = {
      displayLanguage: settingsForm.value.displayLanguage,
      timezone: settingsForm.value.timezone,
      marketingEmailOptIn: settingsForm.value.marketingEmailOptIn,
      tripInviteEmailOptIn: settingsForm.value.tripInviteEmailOptIn,
    }
    await userApi.updateSettings(payload)
    message.value = '설정을 저장했습니다.'
  } catch {
    // 에러는 인터셉터에서 처리
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <AppShell>
    <div class="max-w-2xl mx-auto px-6 py-12">
      <h1 class="text-2xl font-black text-ink mb-8">설정</h1>

      <p v-if="loading" class="text-muted">불러오는 중…</p>
      <p v-if="message" class="text-sm mb-4" style="color: var(--blue);">{{ message }}</p>

      <!-- Profile Section -->
      <section class="p-6 rounded-3xl bg-surface border border-line mb-6">
        <h2 class="font-bold text-ink mb-4">프로필</h2>
        <div class="flex items-center gap-4 mb-4">
          <div class="w-16 h-16 rounded-full bg-brand-violet flex items-center justify-center text-white text-xl font-bold">
            {{ profileForm.displayName?.charAt(0) || 'U' }}
          </div>
          <div>
            <p class="font-bold text-ink">{{ user?.displayName || '사용자' }}</p>
            <p class="text-sm text-muted">{{ user?.email || '' }}</p>
          </div>
        </div>
        <label class="block mb-3">
          <span class="text-sm text-ink font-semibold block mb-1">이름</span>
          <input v-model="profileForm.displayName" type="text" class="w-full px-4 py-2 rounded-xl border border-line" />
        </label>
        <label class="block mb-4">
          <span class="text-sm text-ink font-semibold block mb-1">소개</span>
          <textarea v-model="profileForm.bio" rows="3" class="w-full px-4 py-2 rounded-xl border border-line"></textarea>
        </label>
        <button
          class="px-4 py-2 rounded-xl bg-brand-violet text-white font-semibold text-sm disabled:opacity-50"
          :disabled="saving"
          @click="saveProfile"
        >
          프로필 저장
        </button>
      </section>

      <!-- Settings Section -->
      <section class="p-6 rounded-3xl bg-surface border border-line mb-6">
        <h2 class="font-bold text-ink mb-4">환경 설정</h2>
        <div class="space-y-4">
          <label class="block">
            <span class="text-sm text-ink font-semibold block mb-1">표시 언어</span>
            <input v-model="settingsForm.displayLanguage" type="text" class="w-full px-4 py-2 rounded-xl border border-line" />
          </label>
          <label class="block">
            <span class="text-sm text-ink font-semibold block mb-1">타임존</span>
            <input v-model="settingsForm.timezone" type="text" class="w-full px-4 py-2 rounded-xl border border-line" />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-ink">마케팅 이메일 수신</span>
            <input type="checkbox" v-model="settingsForm.marketingEmailOptIn" class="accent-brand-violet" />
          </label>
          <label class="flex items-center justify-between">
            <span class="text-sm text-ink">여행 초대 이메일 수신</span>
            <input type="checkbox" v-model="settingsForm.tripInviteEmailOptIn" class="accent-brand-violet" />
          </label>
        </div>
        <button
          class="mt-4 px-4 py-2 rounded-xl bg-brand-violet text-white font-semibold text-sm disabled:opacity-50"
          :disabled="saving"
          @click="saveSettings"
        >
          설정 저장
        </button>
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
