<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { notificationApi } from '@/api/notification.api'
import type { Notification } from '@/types/notification'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

const logoUrl = '/images/soomgil_logo_none_text.png'

/* ── Nav Items ── */
const landingNavItems = [
  { label: '홈', key: 'home', href: '/#home' },
  { label: '기능', key: 'features', href: '/#features' },
  { label: '사용 흐름', key: 'flow', href: '/#flow' },
  { label: '템플릿', key: 'templates', href: '/#templates' },
]

const serviceNavItems = [
  { label: '홈', key: 'home', path: '/home' },
  { label: '내 여행', key: 'my-trips', path: '/my-trips' },
  { label: '취향 수집', key: 'swipe', path: '/swipe' },
  { label: '커뮤니티', key: 'community', path: '/community' },
  { label: '기록', key: 'record', path: '/record' },
]

const isLandingPage = computed(() => route.path === '/')
const currentNavItems = computed(() => isLandingPage.value ? landingNavItems : serviceNavItems)

const activeNavKey = computed(() => {
  if (isLandingPage.value) return ''
  const path = route.path
  for (const item of serviceNavItems) {
    if (path.startsWith(item.path)) return item.key
  }
  if (path === '/home') return 'home'
  return ''
})

/* ── Dropdowns ── */
const showBriefing = ref(false)
const showNotif = ref(false)
const showProfile = ref(false)
const notifications = ref<Notification[]>([])
const notificationsLoading = ref(false)
const notificationsError = ref('')
const unreadCount = computed(() => notifications.value.filter((item) => !item.readAt).length)

function closeAllDropdowns() {
  showBriefing.value = false
  showNotif.value = false
  showProfile.value = false
}

function toggleBriefing() {
  const next = !showBriefing.value
  closeAllDropdowns()
  showBriefing.value = next
}

async function toggleNotif() {
  const next = !showNotif.value
  closeAllDropdowns()
  showNotif.value = next
  if (next) await loadNotifications()
}

async function loadNotifications() {
  notificationsLoading.value = true
  notificationsError.value = ''
  try {
    notifications.value = (await notificationApi.getNotifications({ page: 0, size: 20 })).items
  } catch {
    notificationsError.value = '알림을 불러오지 못했습니다.'
  } finally {
    notificationsLoading.value = false
  }
}

async function openNotification(notification: Notification) {
  if (!notification.readAt) {
    const updated = await notificationApi.markAsRead(notification.id)
    notifications.value = notifications.value.map((item) => item.id === updated.id ? updated : item)
  }
  const destination = notification.payload?.route
    || (notification.payload?.inviteCode ? `/trip-invites/${notification.payload.inviteCode}` : null)
    || (notification.tripId ? `/trips/${notification.tripId}/route` : null)
  closeAllDropdowns()
  if (destination) await router.push(destination)
}

async function markAllNotificationsRead() {
  await notificationApi.markAllAsRead()
  const readAt = new Date().toISOString()
  notifications.value = notifications.value.map((item) => ({ ...item, readAt: item.readAt ?? readAt }))
}

async function dismissNotification(notificationId: string) {
  await notificationApi.deleteNotification(notificationId)
  notifications.value = notifications.value.filter((item) => item.id !== notificationId)
}

function toggleProfile() {
  const next = !showProfile.value
  closeAllDropdowns()
  showProfile.value = next
}

/* ── Click outside ── */
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.briefing-dropdown, .notifications-dropdown, .profile-dropdown')) {
    closeAllDropdowns()
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onUnmounted(() => document.removeEventListener('click', handleClickOutside))

function handleNavClick(item: { path?: string; href?: string }) {
  if (item.path) {
    router.push(item.path)
  } else if (item.href) {
    if (item.href.startsWith('/#')) {
      router.push(item.href)
    }
  }
}

async function handleLogout() {
  closeAllDropdowns()
  await auth.logout()
  router.push('/')
}
</script>

<template>
  <header class="topbar">
    <!-- Left: Brand -->
    <div style="min-width:220px">
      <a
        class="brand"
        :href="auth.isAuthenticated ? '/home' : '/'"
        style="display:flex; align-items:center; gap:8px; text-decoration:none;"
        @click.prevent="router.push(auth.isAuthenticated ? '/home' : '/')"
      >
        <img :src="logoUrl" alt="Soomgil Logo" style="width:52px; height:52px;">
        <span style="font-size:22px; font-weight:800; color:var(--ink);">Soomgil</span>
      </a>
    </div>

    <!-- Center: Nav -->
    <nav class="nav" aria-label="Primary">
      <template v-if="isLandingPage">
        <a
          v-for="item in landingNavItems"
          :key="item.key"
          :href="item.href"
          @click.prevent="handleNavClick(item)"
        >{{ item.label }}</a>
      </template>
      <template v-else>
        <a
          v-for="item in currentNavItems"
          :key="item.key"
          href="#"
          :class="{ active: activeNavKey === item.key }"
          :aria-current="activeNavKey === item.key ? 'page' : undefined"
          @click.prevent="handleNavClick(item)"
        >{{ item.label }}</a>
      </template>
      <div class="nav-indicator"></div>
    </nav>

    <!-- Right: Actions -->
    <div class="header-actions" style="min-width:220px; display:flex; justify-content:flex-end; align-items:center; gap:8px;">
      <template v-if="auth.isAuthenticated">

        <!-- Briefing -->
        <div class="briefing-dropdown" style="position:relative;">
          <button type="button" id="header-briefing-btn" class="btn ghost icon-btn" style="border-radius:50%; width:40px; height:40px; padding:0; border:none; cursor:pointer;" title="오늘 일정 브리핑" @click.stop="toggleBriefing">
            <span class="material-symbols-rounded">event_note</span>
          </button>
          <div id="header-briefing-panel" class="header-dropdown-panel" :class="{ 'is-open': showBriefing }">
            <h4 style="margin:0 0 16px 0; font-size:15px; font-weight:700; display:flex; align-items:center; gap:6px;">
              <span class="material-symbols-rounded" style="font-size:18px; color:var(--violet)">event_note</span>
              오늘 일정 브리핑
            </h4>
            <div class="compact-timeline" style="margin-bottom:20px;">
              <div>
                <time>10:00</time>
                <span></span>
                <p><strong>부산역 도착</strong>KTX 123열차, 수화물 보관</p>
              </div>
              <div>
                <time>12:30</time>
                <span></span>
                <p><strong>이재모 피자 본점</strong>치즈크러스트 피자 대기</p>
              </div>
              <div>
                <time>15:00</time>
                <span></span>
                <p><strong>흰여울문화마을</strong>해안 터널 및 오션뷰 카페</p>
              </div>
            </div>
            <a href="#" class="btn ghost" style="display:flex; align-items:center; justify-content:center; width:100%; padding:8px 0; font-size:13px; min-height:0; height:auto; border-color:var(--line); border-radius:999px; text-decoration:none; color:var(--violet); font-weight:700;" @click.prevent="closeAllDropdowns(); router.push('/my-trips')">전체보기</a>
          </div>
        </div>

        <!-- Notifications -->
        <div class="notifications-dropdown" style="position:relative;">
          <button type="button" id="header-notif-btn" class="btn ghost icon-btn" style="border-radius:50%; width:40px; height:40px; padding:0; position:relative; border:none; cursor:pointer;" @click.stop="toggleNotif">
            <span class="material-symbols-rounded">notifications</span>
            <span v-if="unreadCount" style="position:absolute; top:4px; right:4px; min-width:16px; height:16px; padding:0 4px; background:var(--rose); color:#fff; border-radius:999px; font-size:10px; line-height:16px;">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
          </button>
          <div id="header-notif-panel" class="header-dropdown-panel" :class="{ 'is-open': showNotif }">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
              <h4 style="margin:0;font-size:15px;font-weight:700;">알림</h4>
              <button v-if="unreadCount" type="button" class="btn ghost" style="font-size:11px;padding:4px 8px;min-height:0;height:auto" @click="markAllNotificationsRead">모두 읽음</button>
            </div>
            <p v-if="notificationsLoading" style="font-size:13px;color:var(--muted)">불러오는 중…</p>
            <p v-else-if="notificationsError" style="font-size:13px;color:var(--rose)">{{ notificationsError }}</p>
            <p v-else-if="notifications.length === 0" style="font-size:13px;color:var(--muted)">새 알림이 없습니다.</p>
            <div v-else style="display:grid;gap:8px;max-height:360px;overflow:auto;">
              <article v-for="notification in notifications" :key="notification.id" :style="{background: notification.readAt ? '#fff' : 'var(--bg)', padding:'10px', borderRadius:'12px', border:'1px solid var(--line)'}">
                <button type="button" style="display:block;width:100%;text-align:left;border:0;background:transparent;cursor:pointer;padding:0" @click="openNotification(notification)">
                  <strong style="font-size:13px;display:block;color:var(--ink)">{{ notification.title }}</strong>
                  <span v-if="notification.actor" style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--violet)">
                    <img v-if="notification.actor.profileImageUrl" :src="notification.actor.profileImageUrl" alt="" style="width:18px;height:18px;border-radius:50%;object-fit:cover;" />
                    {{ notification.actor.displayName }}
                  </span>
                  <p v-if="notification.body" style="font-size:12px;color:var(--muted);margin:3px 0 0">{{ notification.body }}</p>
                </button>
                <button type="button" aria-label="알림 삭제" style="margin-top:6px;border:0;background:transparent;color:var(--muted);font-size:11px;cursor:pointer" @click="dismissNotification(notification.id)">삭제</button>
              </article>
            </div>
          </div>
        </div>

        <!-- Profile -->
        <div class="profile-dropdown" style="position:relative;">
          <button type="button" id="header-profile-btn" class="btn ghost" style="border-radius:50%; width:40px; height:40px; padding:0; border:none; background:var(--surface-2); display:flex; align-items:center; justify-content:center; overflow:hidden; font-weight:800; color:var(--violet); font-size:14px; cursor:pointer;" title="내 프로필" @click.stop="toggleProfile">
            <img v-if="auth.user?.profileImageUrl" :src="auth.user.profileImageUrl" alt="내 프로필 사진" style="width:100%;height:100%;object-fit:cover;" />
            <template v-else>{{ auth.user?.displayName?.charAt(0) || 'U' }}</template>
          </button>
          <div id="header-profile-panel" class="header-dropdown-panel" :class="{ 'is-open': showProfile }">
            <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--line);">
              <strong style="font-size:14px; display:block; color:var(--ink);">{{ auth.user?.displayName || '김지훈' }}</strong>
              <span style="font-size:12px; color:var(--muted); display:block; word-break:break-all;">{{ auth.user?.email || 'traveler@tripmates.kr' }}</span>
            </div>
            <div style="display:grid; gap:4px;">
              <a href="#" style="font-size:13px; color:var(--ink); text-decoration:none; padding:8px; border-radius:8px; display:flex; align-items:center; gap:8px;" class="profile-item-link" @click.prevent="closeAllDropdowns(); router.push('/mypage')">
                <span class="material-symbols-rounded" style="font-size:18px; color:var(--muted)">person</span>마이페이지
              </a>
              <a href="#" style="font-size:13px; color:var(--ink); text-decoration:none; padding:8px; border-radius:8px; display:flex; align-items:center; gap:8px;" class="profile-item-link" @click.prevent="closeAllDropdowns(); router.push('/settings')">
                <span class="material-symbols-rounded" style="font-size:18px; color:var(--muted)">settings</span>설정
              </a>
              <a href="#" style="font-size:13px; color:var(--rose); text-decoration:none; padding:8px; border-radius:8px; display:flex; align-items:center; gap:8px;" class="profile-item-link" @click.prevent="handleLogout">
                <span class="material-symbols-rounded" style="font-size:18px; color:var(--rose)">logout</span>로그아웃
              </a>
            </div>
          </div>
        </div>
      </template>
      <template v-else-if="isLandingPage">
        <a class="btn ghost" href="#" @click.prevent="router.push('/login')" style="font-size:14px">로그인</a>
        <a class="btn primary" href="#" @click.prevent="router.push('/register')" style="font-size:14px">회원가입</a>
      </template>
      <template v-else>
        <a class="btn ghost" href="#" @click.prevent="router.push('/login')" style="font-size:14px">로그인</a>
        <a class="btn primary" href="#" @click.prevent="router.push('/register')" style="font-size:14px">회원가입</a>
      </template>
    </div>
  </header>
</template>

<style scoped>
.profile-item-link:hover {
  background: var(--bg);
}

@media (max-width: 480px) {
  .header-actions {
    width: auto !important;
    min-width: 0 !important;
  }

  .header-actions .btn {
    flex: 0 0 auto;
  }
}
</style>
