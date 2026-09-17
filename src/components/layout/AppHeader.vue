<script lang="ts">
// Page shells remount the header; retain only the last menu key between them.
let previousNavKey = ''
</script>
<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { notificationApi } from '@/api/notification.api'
import { tripApi } from '@/api/trip.api'
import { itineraryApi } from '@/api/itinerary.api'
import { useTheme } from '@/composables/useTheme'
import type { PageMeta } from '@/types/api'
import type { Notification } from '@/types/notification'
import logoUrl from '@/assets/images/soomgil_logo_none_text.png'
import { useLocale } from '@/i18n'

const route = useRoute()
defineProps<{ immersive?: boolean; paper?: boolean }>()
const router = useRouter()
const auth = useAuthStore()
const { isDarkMode, toggleTheme } = useTheme()
const { t } = useLocale()

/* ── Nav Items ── */
const landingNavItems = computed(() => [
  { label: t('nav.home'), key: 'home', href: '/#home' },
  { label: t('nav.features'), key: 'features', href: '/#features' },
  { label: t('nav.flow'), key: 'flow', href: '/#flow' },
  { label: t('nav.templates'), key: 'templates', href: '/#templates' },
])

const serviceNavItems = computed(() => [
  { label: t('nav.home'), key: 'home', path: '/home' },
  { label: t('nav.trips'), key: 'my-trips', path: '/my-trips' },
  { label: t('nav.preferences'), key: 'swipe', path: '/swipe' },
  { label: t('nav.community'), key: 'community', path: '/community' },
])

const isLandingPage = computed(() => route.path === '/')
const isRouteWorkspace = computed(() => route.path.startsWith('/trips/') && route.path.endsWith('/route'))
const currentNavItems = computed(() => isLandingPage.value ? landingNavItems.value : serviceNavItems.value)

const activeNavKey = computed(() => {
  if (isLandingPage.value) return ''
  const path = route.path
  for (const item of serviceNavItems.value) {
    if (path.startsWith(item.path)) return item.key
  }
  if (path === '/home') return 'home'
  return ''
})

const navElement = ref<HTMLElement | null>(null)
const indicatorStyle = ref({ width: '0px', height: '0px', transform: 'translate(0px, 0px)', opacity: '0' })
const indicatorReady = ref(false)
let navObserver: ResizeObserver | undefined
let navFrame = 0
function positionIndicator(key = activeNavKey.value) {
  const link = navElement.value?.querySelector<HTMLElement>(`[data-nav-key="${key}"]`)
  if (!link) { indicatorStyle.value.opacity = '0'; return }
  indicatorStyle.value = { width: `${link.offsetWidth}px`, height: `${link.offsetHeight}px`, transform: `translate(${link.offsetLeft}px, ${link.offsetTop}px)`, opacity: '1' }
}
watch(activeNavKey, () => {
  positionIndicator()
}, { flush: 'post' })
watch(() => serviceNavItems.value.map(item => item.label).join(), () => positionIndicator(), { flush: 'post' })

/* ── Dropdowns ── */
const showBriefing = ref(false)
const showNotif = ref(false)
const showProfile = ref(false)
const briefingTripId = ref<string | null>(null)
const notifications = ref<Notification[]>([])
const notificationsLoading = ref(false)
const notificationsError = ref('')
const notificationPage = ref<PageMeta | null>(null)
const unreadCount = ref(0)
const notificationBusy = ref(false)
let sessionVersion = 0
let countRequest = 0
const hasMoreNotifications = computed(() => {
  const page = notificationPage.value
  return page ? page.page + 1 < page.totalPages : false
})

/* ── Briefing ── */
interface BriefingItem {
  id: string
  label: string
  title: string
  address: string | null
  photo: string | null
}
const briefingItems = ref<BriefingItem[]>([])
const briefingLoading = ref(false)
const briefingError = ref('')
const briefingTitle = ref('')
const briefingDate = ref('')
const briefingDay = ref<number | null>(null)
const briefingIsToday = ref(false)
const koreaDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
function dateLabel(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date(`${value}T12:00:00+09:00`))
}
function notificationTime(value: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}
function notificationIcon(type: string) {
  return type === 'VOTE_STARTED' ? 'how_to_vote' : type === 'VOTE_COMPLETED' ? 'where_to_vote' : 'person_add'
}
async function refreshUnreadCount() {
  if (!auth.isAuthenticated || notificationBusy.value) return
  const version = sessionVersion
  const request = ++countRequest
  try {
    const response = await notificationApi.getNotifications({ unreadOnly: true, page: 0, size: 1 })
    if (version === sessionVersion && request === countRequest) unreadCount.value = response.page.totalElements
  } catch { /* 목록 열기에서 오류와 재시도를 제공한다. 마지막으로 확인한 개수는 유지한다. */ }
}


function closeAllDropdowns() {
  showBriefing.value = false
  showNotif.value = false
  showProfile.value = false
}

async function toggleBriefing() {
  const next = !showBriefing.value
  closeAllDropdowns()
  showBriefing.value = next
  if (next) await loadBriefing()
}

async function loadBriefing() {
  if (briefingLoading.value) return
  const version = sessionVersion
  briefingLoading.value = true
  briefingError.value = ''
  briefingItems.value = []
  briefingTripId.value = null
  briefingTitle.value = ''
  briefingDate.value = ''
  try {
    const nearest = await tripApi.getNearestTrip()
    if (version !== sessionVersion || !nearest) return
    const itinerary = await itineraryApi.getItinerary(nearest.id)
    if (version !== sessionVersion) return
    const today = koreaDate()
    const day = itinerary.days.filter(item => item.groupType === 'DAY' && item.date && item.date >= today)
      .sort((a, b) => a.date!.localeCompare(b.date!) || a.sortOrder - b.sortOrder)[0]
    if (!day) return
    briefingTripId.value = nearest.id
    briefingTitle.value = nearest.title
    briefingDate.value = day.date!
    briefingDay.value = day.dayNumber
    briefingIsToday.value = day.date === today
    briefingItems.value = [...day.items].sort((a, b) => a.sortOrder - b.sortOrder).map((item, index) => ({
      id: item.id, label: `${index + 1}`, title: item.placeName,
      address: item.address, photo: item.thumbnailUrl,
    }))
  } catch {
    if (version === sessionVersion) briefingError.value = '예정된 일정을 불러오지 못했습니다.'
  } finally {
    if (version === sessionVersion) briefingLoading.value = false
  }
}

async function toggleNotif() {
  const next = !showNotif.value
  closeAllDropdowns()
  showNotif.value = next
  if (next) await Promise.all([loadNotifications(0), refreshUnreadCount()])
}

async function loadNotifications(page = 0) {
  if (notificationsLoading.value || !auth.isAuthenticated) return
  const version = sessionVersion
  notificationsLoading.value = true
  notificationsError.value = ''
  try {
    const response = await notificationApi.getNotifications({ page, size: 20 })
    if (version !== sessionVersion) return
    notificationPage.value = response.page
    notifications.value = page === 0
      ? response.items
      : [...notifications.value, ...response.items.filter((next) => (
          !notifications.value.some((current) => current.id === next.id)
        ))]
  } catch {
    if (version === sessionVersion) notificationsError.value = '알림을 불러오지 못했습니다.'
  } finally {
    if (version === sessionVersion) notificationsLoading.value = false
  }
}

async function openNotification(notification: Notification) {
  if (notificationBusy.value) return
  notificationBusy.value = true
  notificationsError.value = ''
  const version = sessionVersion
  ++countRequest
  try {
    if (!notification.readAt) {
      const updated = await notificationApi.markAsRead(notification.id)
      if (version !== sessionVersion) return
      notifications.value = notifications.value.map(item => item.id === updated.id ? updated : item)
      unreadCount.value = Math.max(0, unreadCount.value - 1)
    }
    const destination = notification.payload?.route
      || (notification.payload?.inviteCode ? `/trip-invites/${encodeURIComponent(notification.payload.inviteCode)}` : null)
      || (notification.tripId ? `/trips/${notification.tripId}/route` : null)
    if (destination && destination.startsWith('/') && !destination.startsWith('//')) {
      closeAllDropdowns()
      await router.push(destination)
    }
  } catch {
    if (version === sessionVersion) notificationsError.value = '알림을 읽음 처리하지 못했습니다.'
  } finally {
    if (version === sessionVersion) notificationBusy.value = false
  }
}

async function markAllNotificationsRead() {
  if (notificationBusy.value) return
  notificationBusy.value = true
  notificationsError.value = ''
  const version = sessionVersion
  ++countRequest
  try {
    await notificationApi.markAllAsRead()
    if (version !== sessionVersion) return
    const readAt = new Date().toISOString()
    notifications.value = notifications.value.map(item => ({ ...item, readAt: item.readAt ?? readAt }))
    unreadCount.value = 0
  } catch {
    if (version === sessionVersion) notificationsError.value = '전체 알림을 읽음 처리하지 못했습니다.'
  } finally {
    if (version === sessionVersion) notificationBusy.value = false
  }
}

async function dismissNotification(notificationId: string) {
  if (notificationBusy.value) return
  notificationBusy.value = true
  notificationsError.value = ''
  const version = sessionVersion
  ++countRequest
  try {
    await notificationApi.deleteNotification(notificationId)
    if (version !== sessionVersion) return
    if (notifications.value.some(item => item.id === notificationId && !item.readAt)) unreadCount.value = Math.max(0, unreadCount.value - 1)
    notifications.value = notifications.value.filter(item => item.id !== notificationId)
    await loadNotifications(0)
  } catch {
    if (version === sessionVersion) notificationsError.value = '알림을 삭제하지 못했습니다.'
  } finally {
    if (version === sessionVersion) notificationBusy.value = false
  }
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

let notificationTimer: ReturnType<typeof setInterval> | undefined
function refreshInbox() {
  if (document.visibilityState === 'hidden' || !auth.isAuthenticated || notificationBusy.value) return
  void refreshUnreadCount()
  if (showNotif.value && (!notificationPage.value || notificationPage.value.page === 0)) void loadNotifications(0)
}
function handleEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  const target = showBriefing.value ? 'header-briefing-btn' : showNotif.value ? 'header-notif-btn' : 'header-profile-btn'
  closeAllDropdowns()
  document.getElementById(target)?.focus()
}
watch(() => [auth.isAuthenticated, auth.user?.id], () => {
  sessionVersion++
  countRequest++
  notifications.value = []
  unreadCount.value = 0
  notificationPage.value = null
  notificationBusy.value = false
  notificationsLoading.value = false
  briefingLoading.value = false
  briefingItems.value = []
  closeAllDropdowns()
  if (auth.isAuthenticated) void refreshUnreadCount()
}, { immediate: true })
watch(() => route.fullPath, closeAllDropdowns)
onMounted(() => {
  positionIndicator(previousNavKey || activeNavKey.value)
  previousNavKey = activeNavKey.value
  navFrame = requestAnimationFrame(() => {
    navFrame = requestAnimationFrame(() => {
      indicatorReady.value = true
      positionIndicator()
    })
  })
  if (typeof ResizeObserver !== 'undefined' && navElement.value) {
    navObserver = new ResizeObserver(() => { if (indicatorReady.value) positionIndicator() })
    navObserver.observe(navElement.value)
    navElement.value.querySelectorAll('a').forEach(link => navObserver!.observe(link))
  }
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleEscape)
  document.addEventListener('visibilitychange', refreshInbox)
  window.addEventListener('focus', refreshInbox)
  notificationTimer = setInterval(refreshInbox, 30000)
})
onUnmounted(() => {
  cancelAnimationFrame(navFrame)
  navObserver?.disconnect()
  sessionVersion++
  clearInterval(notificationTimer)
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleEscape)
  document.removeEventListener('visibilitychange', refreshInbox)
  window.removeEventListener('focus', refreshInbox)
})

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
  <header :class="['topbar paper-header', { 'route-workspace-header': isRouteWorkspace }]">
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
    <nav ref="navElement" class="nav" aria-label="Primary">
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
          :data-nav-key="item.key"
          :aria-current="activeNavKey === item.key ? 'page' : undefined"
          @click.prevent="handleNavClick(item)"
        >{{ item.label }}</a>
      </template>
      <div class="nav-indicator" :class="{ 'is-ready': indicatorReady }" :style="indicatorStyle" aria-hidden="true"></div>
    </nav>

    <!-- Right: Actions -->
    <div class="header-actions" style="min-width:220px; display:flex; justify-content:flex-end; align-items:center; gap:8px;">

      <!-- Theme Toggle -->
      <button v-if="isRouteWorkspace" type="button" class="btn ghost icon-btn" style="border-radius:50%; width:40px; height:40px; padding:0; border:none; cursor:pointer;" :title="isDarkMode ? '라이트 모드로 전환' : '다크 모드로 전환'" @click="toggleTheme">
        <span class="material-symbols-rounded">{{ isDarkMode ? 'light_mode' : 'dark_mode' }}</span>
      </button>

      <template v-if="auth.isAuthenticated">

        <!-- 일정과 알림은 같은 여행 수첩 스타일로 표시한다. -->
        <div class="briefing-dropdown">
          <button type="button" id="header-briefing-btn" class="inbox-trigger" aria-label="오늘 일정 브리핑" :aria-expanded="showBriefing" aria-controls="header-briefing-panel" title="오늘 일정 브리핑" @click.stop="toggleBriefing">
            <span class="material-symbols-rounded">event_note</span>
          </button>
          <section v-if="showBriefing" id="header-briefing-panel" class="inbox-panel" aria-label="일정 브리핑" :aria-busy="briefingLoading">
            <div class="inbox-heading"><div><span class="inbox-eyebrow">YOUR NEXT JOURNEY</span><h2>{{ briefingDate && !briefingIsToday ? '다가오는 여행' : '오늘 일정 브리핑' }}</h2></div><button class="inbox-icon" aria-label="브리핑 닫기" @click="closeAllDropdowns"><span class="material-symbols-rounded">close</span></button></div>
            <div v-if="briefingLoading" class="inbox-state" role="status"><span class="material-symbols-rounded">travel_explore</span><strong>여행 일정을 펼치는 중이에요</strong></div>
            <div v-else-if="briefingError" class="inbox-state" role="alert"><strong>{{ briefingError }}</strong><button class="inbox-link" @click="loadBriefing">다시 시도</button></div>
            <template v-else-if="briefingTripId">
              <div class="briefing-summary"><span class="briefing-date">{{ dateLabel(briefingDate) }} <span v-if="briefingDay">· DAY {{ briefingDay }}</span></span><h3>{{ briefingTitle }}</h3><p>{{ briefingItems.length ? `${briefingItems.length}곳을 따라 떠나는 하루` : '아직 방문할 장소를 정하지 않았어요' }}</p></div>
              <ol v-if="briefingItems.length" class="briefing-timeline">
                <li v-for="item in briefingItems" :key="item.id"><span class="briefing-step">{{ item.label }}</span><div><strong>{{ item.title }}</strong><p>{{ item.address || '위치 정보 없음' }}</p></div><img v-if="item.photo" :src="item.photo" alt="" loading="lazy" @error="($event.target as HTMLImageElement).style.display = 'none'" /></li>
              </ol>
              <button class="inbox-primary" @click="closeAllDropdowns(); router.push(`/trips/${briefingTripId}/route`)">여행 지도에서 일정 보기<span class="material-symbols-rounded">arrow_forward</span></button>
            </template>
            <div v-else class="inbox-state"><span class="material-symbols-rounded">calendar_month</span><strong>예정된 여행이 없어요</strong><p>여행 날짜와 방문할 장소를 정해보세요.</p><button class="inbox-primary" @click="closeAllDropdowns(); router.push('/my-trips')">내 여행 둘러보기</button></div>
          </section>
        </div>
        <div class="notifications-dropdown">
          <button type="button" id="header-notif-btn" class="inbox-trigger" :aria-label="`알림, 읽지 않은 알림 ${unreadCount}개`" :aria-expanded="showNotif" aria-controls="header-notif-panel" title="알림" @click.stop="toggleNotif"><span class="material-symbols-rounded">notifications</span><span v-if="unreadCount" class="inbox-badge">{{ unreadCount > 99 ? '99+' : unreadCount }}</span></button>
          <section v-if="showNotif" id="header-notif-panel" class="inbox-panel" aria-label="알림" :aria-busy="notificationsLoading">
            <div class="inbox-heading"><div><span class="inbox-eyebrow">TRAVEL TOGETHER</span><h2>알림 <span v-if="unreadCount" class="inbox-count">{{ unreadCount }}</span></h2></div><button class="inbox-icon" aria-label="알림 닫기" @click="closeAllDropdowns"><span class="material-symbols-rounded">close</span></button></div>
            <div class="inbox-toolbar"><span>함께하는 여행의 새로운 소식</span><button class="inbox-link" :disabled="!unreadCount || notificationBusy || notificationsLoading" @click="markAllNotificationsRead">모두 읽음</button></div>
            <div v-if="notificationsError" class="inbox-error" role="alert">{{ notificationsError }} <button class="inbox-link" :disabled="notificationsLoading" @click="loadNotifications(0); refreshUnreadCount()">다시 불러오기</button></div>
            <div v-if="notificationsLoading && !notifications.length" class="inbox-state" role="status">알림을 불러오는 중…</div>
            <div v-else-if="!notifications.length && !notificationsError" class="inbox-state"><span class="material-symbols-rounded">notifications_none</span><strong>새 알림이 없습니다.</strong><p>여행 초대와 투표 소식을 여기서 알려드려요.</p></div>
            <div v-if="notifications.length" class="notification-list">
              <article v-for="notification in notifications" :key="notification.id" class="notification-item" :class="{ 'is-read': !!notification.readAt }">
                <button class="notification-open" :disabled="notificationBusy || notificationsLoading" @click.stop="openNotification(notification)">
                  <span class="notification-symbol"><img v-if="notification.actor?.profileImageUrl" :src="notification.actor.profileImageUrl" alt="" /><span v-else class="material-symbols-rounded">{{ notificationIcon(notification.type) }}</span></span>
                  <span class="notification-copy"><strong class="notification-title">{{ notification.title }}</strong><span v-if="notification.body" class="notification-body">{{ notification.body }}</span><span v-if="notification.actor" class="notification-actor">{{ notification.actor.displayName }}</span><time :datetime="notification.createdAt">{{ notificationTime(notification.createdAt) }}</time><span v-if="!notification.readAt" class="notification-unread">읽지 않음</span></span>
                </button>
                <button class="notification-dismiss" :disabled="notificationBusy || notificationsLoading" aria-label="알림 삭제" @click.stop="dismissNotification(notification.id)"><span class="material-symbols-rounded">close</span></button>
              </article>
              <button v-if="hasMoreNotifications" class="inbox-more" :disabled="notificationsLoading || notificationBusy" data-testid="load-more-notifications" @click="loadNotifications((notificationPage?.page ?? 0) + 1)">{{ notificationsLoading ? '불러오는 중…' : '이전 알림 더 보기' }}</button>
            </div>
          </section>
        </div>

        <!-- Profile -->
        <div class="profile-dropdown" style="position:relative;">
          <button type="button" id="header-profile-btn" class="btn ghost" style="border-radius:50%; width:40px; height:40px; padding:0; border:none; background:var(--surface-2); display:flex; align-items:center; justify-content:center; overflow:hidden; font-weight:800; color:var(--violet); font-size:14px; cursor:pointer;" title="내 프로필" @click.stop="toggleProfile">
            <img v-if="auth.user?.profileImageUrl" :src="auth.user.profileImageUrl" alt="내 프로필 사진" style="width:100%;height:100%;object-fit:cover;" />
            <template v-else>{{ auth.user?.displayName?.charAt(0) || 'U' }}</template>
          </button>
          <div id="header-profile-panel" class="header-dropdown-panel" :class="{ 'is-open': showProfile }">
            <div style="margin-bottom:12px; padding-bottom:12px; border-bottom:1px solid var(--line);">
              <strong style="font-size:14px; display:block; color:var(--ink);">{{ auth.user?.displayName || '사용자' }}</strong>
              <span style="font-size:12px; color:var(--muted); display:block; word-break:break-all;">{{ auth.user?.email || '이메일 미확인' }}</span>
            </div>
            <div style="display:grid; gap:4px;">
              <a href="#" style="font-size:13px; color:var(--ink); text-decoration:none; padding:8px; border-radius:8px; display:flex; align-items:center; gap:8px;" class="profile-item-link" @click.prevent="closeAllDropdowns(); router.push('/mypage')">
                <span class="material-symbols-rounded" style="font-size:18px; color:var(--muted)">person</span>{{ t('common.myPage') }}
              </a>
              <a href="#" style="font-size:13px; color:var(--ink); text-decoration:none; padding:8px; border-radius:8px; display:flex; align-items:center; gap:8px;" class="profile-item-link" @click.prevent="closeAllDropdowns(); router.push('/settings')">
                <span class="material-symbols-rounded" style="font-size:18px; color:var(--muted)">settings</span>{{ t('common.settings') }}
              </a>
              <a href="#" style="font-size:13px; color:var(--rose); text-decoration:none; padding:8px; border-radius:8px; display:flex; align-items:center; gap:8px;" class="profile-item-link" @click.prevent="handleLogout">
                <span class="material-symbols-rounded" style="font-size:18px; color:var(--rose)">logout</span>{{ t('auth.logout') }}
              </a>
            </div>
          </div>
        </div>
      </template>
      <template v-else-if="isLandingPage">
        <a class="btn ghost" href="#" @click.prevent="router.push('/login')" style="font-size:14px">{{ t('auth.login') }}</a>
        <a class="btn primary" href="#" @click.prevent="router.push('/register')" style="font-size:14px">{{ t('auth.register') }}</a>
      </template>
      <template v-else>
        <a class="btn ghost" href="#" @click.prevent="router.push('/login')" style="font-size:14px">{{ t('auth.login') }}</a>
        <a class="btn primary" href="#" @click.prevent="router.push('/register')" style="font-size:14px">{{ t('auth.register') }}</a>
      </template>
    </div>
  </header>
</template>

<style scoped>
/* 모든 서비스 탭은 동일한 헤더 색상과 간격을 공유한다. */
.topbar.paper-header { --ink: #35465A; --muted: #647C92; --bg: #F8FBFF; --line: #EAF4FF; --surface-2: #EAF4FF; background: rgb(248 251 255 / 94%); border-bottom: 0; backdrop-filter: none; padding-inline: 40px; }
.paper-header .brand > span { color: #35465A !important; }
.paper-header .nav a { color: #647C92; text-shadow: none; }
.paper-header .nav a.active { color: #427EAD; background: #EAF4FF; border-color: #DFEAF5; }
.paper-header .nav-indicator { display: none; }
.paper-header .header-actions > .btn.ghost,
.paper-header .header-actions .icon-btn { color: #427EAD; background: #EAF4FF; }
@media (max-width: 480px) {
  .topbar.paper-header { height: auto; min-height: 72px; padding: 12px 20px; gap: 10px; flex-wrap: wrap; }
  .paper-header .brand img { width: 38px !important; height: 38px !important; }
  .paper-header .brand > span { font-size: 19px !important; }
  .paper-header .nav { order: 3; flex-basis: 100%; width: 100%; justify-content: flex-start; overflow-x: auto; }
  .paper-header .nav a { font-size: 13px; padding: 8px 12px; }
  .paper-header .header-actions { width: auto; }
}
.profile-item-link:hover {
  background: var(--bg);
}
@media (max-width: 1023px) {
  .topbar.route-workspace-header {
    gap: 12px;
    padding: 0 16px;
  }

  .route-workspace-header .nav {
    display: none;
  }

  .route-workspace-header > div:first-child,
  .route-workspace-header .header-actions {
    min-width: 0 !important;
  }
}

@media (max-width: 767px) {
  .topbar.route-workspace-header {
    height: 64px;
    min-height: 64px;
    flex-wrap: nowrap;
    padding: 0 12px;
  }

  .route-workspace-header .brand img {
    width: 40px !important;
    height: 40px !important;
  }

  .route-workspace-header .brand > span {
    display: none;
  }
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

.header-actions .material-symbols-rounded {
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.12));
}

@media (max-width: 1024px) {
  /* 481~1024px 구간: original.css는 .nav에 overflow-x: auto만 주고 줄바꿈은 480px 이하에서만
     한다. 인라인 min-width 220px가 내비 폭을 빼앗아 메뉴가 잘리고 가로 스크롤바가 드러난다.
     액션 영역의 최소 폭을 풀고, 내비는 스크롤바 없이 넘치도록 한다. */
  .header-actions,
  .topbar > div:first-child {
    min-width: 0 !important;
  }

  .nav {
    scrollbar-width: none;
  }

  .nav::-webkit-scrollbar {
    display: none;
  }

  .nav a {
    padding: 10px 14px;
    white-space: nowrap;
  }
}

@media (max-width: 768px) {
  .nav a {
    padding: 10px 10px;
  }
}

.briefing-dropdown,.notifications-dropdown { position:relative; }
.inbox-trigger { position:relative; display:grid; place-items:center; width:40px; height:40px; padding:0; border:1px solid transparent; border-radius:50%; color:#427ead; background:#eaf4ff; cursor:pointer; transition:background .2s; }
.inbox-trigger:hover,.inbox-trigger[aria-expanded=true] { background:#dceeff; border-color:#bdd8ed; }
.inbox-badge { position:absolute; top:-3px; right:-5px; min-width:18px; height:18px; padding:0 4px; border:2px solid #f8fbff; border-radius:20px; background:#427ead; color:white; font-size:10px; font-weight:800; line-height:14px; }
#header-briefing-panel.inbox-panel,#header-notif-panel.inbox-panel { position:absolute; top:52px; right:0; width:380px !important; padding:0 !important; max-height:min(680px,calc(100dvh - 110px)); overflow:auto; scrollbar-width:thin; z-index:110; background:white; border:1px solid #dfeaf5; border-radius:22px; box-shadow:0 20px 70px #35465a24; color:#35465a; text-align:left; animation:inbox-in .18s ease-out; }
.inbox-heading { display:flex; align-items:center; justify-content:space-between; padding:22px 22px 16px; background:linear-gradient(140deg,#f0f8ff,#fff); border-bottom:1px solid #eaf0f6; }
.inbox-eyebrow { font-size:9px; letter-spacing:.17em; color:#718fa7; font-weight:700; }
.inbox-heading h2 { margin:6px 0 0; font-size:20px; letter-spacing:-.6px; font-weight:800; }
.inbox-icon,.notification-dismiss { display:grid; place-items:center; flex-shrink:0; width:30px; height:30px; border:0; border-radius:50%; background:transparent; color:#71869a; cursor:pointer; }
.inbox-icon:hover,.notification-dismiss:hover { background:#eaf4ff; color:#427ead; }
.inbox-icon span,.notification-dismiss span { font-size:18px; }
.inbox-count { color:#427ead; font-size:14px; margin-left:4px; }
.inbox-toolbar { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:12px 20px; color:#71869a; font-size:11px; }
.inbox-link { background:none; border:0; padding:6px 0; color:#427ead; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap; }
.inbox-panel button:disabled { opacity:.45; cursor:default; }
.inbox-panel button:focus-visible,.inbox-trigger:focus-visible { outline:2px solid #427ead; outline-offset:3px; }
.inbox-state { display:flex; flex-direction:column; align-items:center; padding:32px 22px; gap:12px; text-align:center; color:#71869a; font-size:13px; }
.inbox-state > .material-symbols-rounded { font-size:34px; padding:16px; border-radius:24px; background:#f0f7fe; color:#79a2c1; }
.inbox-state strong { color:#35465a; font-size:14px; }
.inbox-state p { margin:0; line-height:1.7; font-size:12px; }
.inbox-primary { display:flex; align-items:center; justify-content:center; gap:10px; width:calc(100% - 40px); min-height:44px; margin:10px 20px 20px; border:0; border-radius:12px; background:#427ead; color:white; font-size:13px; font-weight:700; cursor:pointer; }
.inbox-primary:hover { background:#356c97; }
.inbox-primary span { font-size:18px; }
.inbox-state .inbox-primary { width:100%; margin:8px 0 0; }
.briefing-summary { margin:18px 20px 6px; padding:16px; background:#f5f9fd; border:1px solid #e6eff7; border-radius:16px; }
.briefing-date { color:#427ead; font-size:11px; font-weight:700; }
.briefing-summary h3 { margin:8px 0; font-size:17px; font-weight:750; }
.briefing-summary p { margin:0; color:#71869a; font-size:12px; }
.briefing-timeline { list-style:none; margin:0; padding:8px 20px; }
.briefing-timeline li { display:flex; align-items:center; gap:12px; position:relative; padding:12px 0; }
.briefing-timeline li:not(:last-child)::after { content:''; position:absolute; left:13px; top:43px; bottom:-11px; width:1px; background:#dfeaf5; }
.briefing-step { flex-shrink:0; display:grid; place-items:center; width:27px; height:27px; border-radius:50%; color:#427ead; background:#eaf4ff; font-size:11px; font-weight:800; }
.briefing-timeline li > div { flex:1; min-width:0; }
.briefing-timeline strong { font-size:13px; }
.briefing-timeline p { font-size:11px; color:#71869a; margin:5px 0 0; line-height:1.5; }
.briefing-timeline img { width:48px; height:48px; object-fit:cover; border-radius:10px; }
.notification-list { display:grid; gap:8px; padding:0 12px 14px; }
.notification-item { position:relative; border:1px solid #e3edf6; border-radius:14px; background:#f2f8fe; }
.notification-item.is-read { background:#fff; border-color:#edf1f5; }
.notification-open { display:flex; align-items:flex-start; gap:10px; width:100%; padding:14px 34px 14px 12px; border:0; background:none; color:inherit; text-align:left; cursor:pointer; }
.notification-open:hover { background:#eaf4ff66; border-radius:14px; }
.notification-symbol { width:34px; height:34px; flex-shrink:0; display:grid; place-items:center; background:white; border-radius:12px; color:#588eb7; }
.notification-symbol img { width:34px; height:34px; object-fit:cover; border-radius:12px; }
.notification-symbol > span { font-size:20px; }
.notification-copy { display:flex; flex-direction:column; gap:5px; min-width:0; }
.notification-title { font-size:13px; line-height:1.5; }
.notification-body { font-size:12px; color:#647c92; line-height:1.6; overflow-wrap:anywhere; }
.notification-actor,.notification-copy time { font-size:10px; color:#8496a6; }
.notification-unread { font-size:10px; color:#427ead; font-weight:700; }
.notification-dismiss { position:absolute; top:8px; right:5px; }
.inbox-more { border:1px solid #dfeaf5; background:white; padding:11px; border-radius:12px; color:#427ead; font-size:12px; cursor:pointer; }
.inbox-error { padding:10px 20px; background:#fff5f3; color:#aa5348; font-size:12px; line-height:1.6; }
@keyframes inbox-in { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:translateY(0); } }
@media (max-width:600px) { #header-briefing-panel.inbox-panel,#header-notif-panel.inbox-panel { position:fixed; top:126px; left:12px; right:12px; width:auto !important; max-height:calc(100dvh - 145px); } }
@media (prefers-reduced-motion:reduce) { .inbox-panel { animation:none !important; } }
</style>
<style scoped>
.topbar.paper-header { --ink:#344e65; --muted:#6b879d; --surface-2:#edf7fd; --violet:#487db5; --blue:#63b2df; background:linear-gradient(110deg,rgb(255 255 255 / 97%),rgb(241 249 255 / 94%),rgb(255 255 255 / 97%)); border-bottom:1px solid rgb(198 222 240 / 45%); box-shadow:0 3px 18px rgb(91 152 192 / 3%); }
.paper-header .nav { isolation:isolate; position:relative; }
.paper-header .nav a { color:#68849a; background:transparent; transition:color .2s; }
.paper-header .nav a:hover { color:#307eb3; background:rgb(227 244 255 / 38%); }
.paper-header .nav a.active { color:#2c729f; background:transparent; border-color:transparent; }
.paper-header .nav .nav-indicator { display:block; position:absolute; top:0; left:0; z-index:0; box-sizing:border-box; border-radius:999px; border:1px solid #bcdcf1; background:#deeffb; box-shadow:none; pointer-events:none; transition:none; }
.paper-header .nav .nav-indicator.is-ready { transition:transform .42s cubic-bezier(.22,1,.36,1),width .42s cubic-bezier(.22,1,.36,1),height .2s,opacity .15s; }
.paper-header .nav-indicator::after { display:none; }
.paper-header .nav a:focus-visible { outline:2px solid #487db5; outline-offset:-3px; }
.paper-header .inbox-trigger { color:#428cb9; background:transparent; }
.paper-header .inbox-trigger:hover,.paper-header .inbox-trigger[aria-expanded=true] { background:#e8f5fe; border-color:#cee6f5; }
.paper-header .header-actions .material-symbols-rounded { filter:none; }
.paper-header .header-actions > .btn { border-radius:999px; box-shadow:none; }
.paper-header .header-actions > .btn.primary { background:#487db5; color:white; }
.paper-header .header-actions > .btn.primary:hover { background:#396a9e; }
.paper-header .header-actions > .btn.ghost { background:transparent; color:#428cb9; }
@media(max-width:480px) { .paper-header .nav { justify-content:space-between; gap:2px; } .paper-header .nav a { text-align:center; flex:1; padding-inline:8px; } }
@media(prefers-reduced-motion:reduce) { .paper-header .nav .nav-indicator.is-ready,.paper-header .nav a { transition:none; } }
</style>
