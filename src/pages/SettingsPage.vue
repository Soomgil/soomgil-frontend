<script setup lang="ts">
import { ref, onMounted } from 'vue'
import AppShell from '@/components/layout/AppShell.vue'
import { useAuth } from '@/composables/useAuth'
import { userApi } from '@/api/user.api'
import type { UpdateMeRequest, UpdateUserSettingsRequest } from '@/types/auth'
import type { SecurityEvent, UserSession } from '@/types/auth'

const { logout, user } = useAuth()

const loading = ref(false)
const saving = ref(false)

const profileForm = ref({
  displayName: '',
  bio: '',
})

const settingsForm = ref({
  displayLanguage: 'ko',
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul',
  marketingEmailOptIn: false,
  tripInviteEmailOptIn: true,
})

const timezones = Intl.supportedValuesOf ? Intl.supportedValuesOf('timeZone') : [Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Seoul']

const message = ref('')
const errorMessage = ref('')
const sessions = ref<UserSession[]>([])
const securityEvents = ref<SecurityEvent[]>([])
const accountLoading = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const [settings, sessionPage, eventPage] = await Promise.all([
      userApi.getSettings(),
      userApi.getSessions(),
      userApi.getSecurityEvents(),
    ])
    sessions.value = sessionPage.items
    securityEvents.value = eventPage.items
    settingsForm.value = {
      displayLanguage: settings.displayLanguage || 'ko',
      timezone: settings.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
      marketingEmailOptIn: settings.marketingEmailOptIn,
      tripInviteEmailOptIn: settings.tripInviteEmailOptIn,
    }
    if (user) {
      profileForm.value.displayName = user.displayName
      profileForm.value.bio = user.bio ?? ''
    }
  } catch {
    errorMessage.value = '계정 설정을 불러오지 못했습니다.'
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

async function revokeSession(sessionId: string) {
  accountLoading.value = true
  errorMessage.value = ''
  try {
    await userApi.revokeSession(sessionId)
    sessions.value = sessions.value.filter((session) => session.id !== sessionId)
    message.value = '선택한 로그인 세션을 해제했습니다.'
  } catch {
    errorMessage.value = '세션을 해제하지 못했습니다.'
  } finally {
    accountLoading.value = false
  }
}

async function logoutAllDevices() {
  if (!window.confirm('모든 기기에서 로그아웃할까요?')) return
  accountLoading.value = true
  try {
    await logout(true)
  } finally {
    accountLoading.value = false
  }
}

async function requestAccountDeletion() {
  if (!window.confirm('계정 삭제를 예약할까요? 활성 여행방의 소유자는 요청이 제한될 수 있습니다.')) return
  accountLoading.value = true
  errorMessage.value = ''
  try {
    await userApi.deleteMe()
    message.value = '계정 삭제가 예약되었습니다. 상태를 다시 확인하려면 재로그인해 주세요.'
  } catch (error: any) {
    errorMessage.value = error?.response?.data?.detail || '계정 삭제를 예약하지 못했습니다.'
  } finally {
    accountLoading.value = false
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
      <p v-if="errorMessage" class="text-sm mb-4" style="color: var(--rose);">{{ errorMessage }}</p>

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

      <section class="p-6 rounded-3xl bg-surface border border-line mb-6">
        <h2 class="font-bold text-ink mb-4">로그인 기기</h2>
        <p v-if="sessions.length === 0" class="text-sm text-muted">활성 로그인 세션이 없습니다.</p>
        <ul v-else class="space-y-3">
          <li v-for="session in sessions" :key="session.id" class="flex items-center justify-between gap-4 p-3 rounded-xl border border-line">
            <div>
              <strong class="text-sm text-ink">{{ session.deviceName || '알 수 없는 기기' }}</strong>
              <p class="text-xs text-muted mt-1">{{ session.deviceOs || '운영체제 정보 없음' }} · 만료 {{ new Date(session.expiresAt).toLocaleString('ko-KR') }}</p>
            </div>
            <button type="button" class="px-3 py-2 rounded-lg border border-line text-xs text-brand-rose" :disabled="accountLoading" @click="revokeSession(session.id)">해제</button>
          </li>
        </ul>
        <button type="button" class="mt-4 px-4 py-2 rounded-xl border border-line text-sm font-semibold" :disabled="accountLoading" @click="logoutAllDevices">모든 기기 로그아웃</button>
      </section>

      <section class="p-6 rounded-3xl bg-surface border border-line mb-6">
        <h2 class="font-bold text-ink mb-4">보안 활동</h2>
        <p v-if="securityEvents.length === 0" class="text-sm text-muted">최근 보안 활동이 없습니다.</p>
        <ul v-else class="space-y-2">
          <li v-for="event in securityEvents" :key="event.id" class="flex justify-between gap-4 text-sm py-2 border-b border-line last:border-0">
            <span><strong>{{ event.eventType }}</strong><small v-if="event.failureReason" class="block text-brand-rose">{{ event.failureReason }}</small></span>
            <time class="text-xs text-muted">{{ new Date(event.createdAt).toLocaleString('ko-KR') }}</time>
          </li>
        </ul>
      </section>

      <section class="p-6 rounded-3xl bg-surface border border-brand-rose/20 mb-6">
        <h2 class="font-bold text-brand-rose mb-2">계정 삭제</h2>
        <p class="text-sm text-muted mb-4">삭제 요청은 서버 정책에 따라 예약 처리됩니다. 활성 여행방을 소유 중이면 요청이 거절될 수 있습니다.</p>
        <button type="button" class="px-4 py-2 rounded-xl border border-brand-rose/30 text-brand-rose text-sm font-semibold" :disabled="accountLoading" @click="requestAccountDeletion">계정 삭제 예약</button>
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
            <select v-model="settingsForm.timezone" class="w-full px-4 py-2 rounded-xl border border-line bg-white">
              <option v-for="tz in timezones" :key="tz" :value="tz">{{ tz }}</option>
            </select>
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
        @click="() => logout()"
      >
        로그아웃
      </button>
    </div>
  </AppShell>
</template>
