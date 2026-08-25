import { createRouter, createWebHistory } from 'vue-router'
import { applyGuards } from './guards'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'Landing',
      component: () => import('@/pages/LandingPage.vue'),
    },
    {
      path: '/login',
      name: 'Login',
      component: () => import('@/pages/LoginPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'Register',
      component: () => import('@/pages/RegisterPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/verify-email',
      alias: '/auth/verify-email',
      name: 'VerifyEmail',
      component: () => import('@/pages/VerifyEmailPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/reset-password',
      alias: '/auth/reset-password',
      name: 'ResetPassword',
      component: () => import('@/pages/ResetPasswordPage.vue'),
    },
    {
      // Kakao/Google에서 리다이렉트 돌아오는 콜백 경로.
      // requiresAuth 없음 — 이 페이지가 토큰을 세팅한다.
      path: '/auth/oauth/:provider/callback',
      name: 'OAuthCallback',
      component: () => import('@/pages/OAuthCallbackPage.vue'),
    },
    {
      path: '/home',
      name: 'Home',
      component: () => import('@/pages/HomePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/search',
      name: 'Search',
      component: () => import('@/pages/SearchResultsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/my-trips',
      name: 'MyTrips',
      component: () => import('@/pages/MyTripsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/trip-invites/:inviteCode',
      name: 'TripInviteAccept',
      component: () => import('@/pages/TripInviteAcceptPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/swipe',
      name: 'Swipe',
      component: () => import('@/pages/SwipePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/trips/:tripId/swipe',
      redirect: '/swipe',
    },
    {
      path: '/trips/:tripId/route',
      name: 'Route',
      component: () => import('@/pages/RoutePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/trips/:tripId/vote',
      name: 'TripVote',
      component: () => import('@/pages/TripVotePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/community',
      name: 'Community',
      component: () => import('@/pages/CommunityFeedPage.vue'),
    },
    {
      path: '/community/threads/:threadId',
      name: 'CommunityThread',
      component: () => import('@/pages/CommunityThreadDetailPage.vue'),
    },
    {
      path: '/community/feed',
      name: 'Feed',
      redirect: { name: 'Community' },
    },
    // 여행 스냅샷 게시글 UI는 신규 커뮤니티에서 사용하지 않는다.
    // 기존 링크가 깨지지 않도록 새 공개 피드로 보낸다.
    {
      path: '/community/stories',
      name: 'Stories',
      redirect: { name: 'Community' },
    },
    {
      path: '/community/story-write',
      name: 'StoryWrite',
      redirect: { name: 'Community' },
    },
    {
      path: '/record',
      name: 'Record',
      component: () => import('@/pages/RecordPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/mypage',
      name: 'MyPage',
      component: () => import('@/pages/MyPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/mypage/:userId',
      name: 'UserProfile',
      component: () => import('@/pages/UserProfilePage.vue'),
    },
    {
      path: '/settings',
      alias: '/setting',
      name: 'Settings',
      component: () => import('@/pages/SettingsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/admin/moderation',
      name: 'AdminModeration',
      component: () => import('@/pages/AdminModerationPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'NotFound',
      component: () => import('@/pages/NotFoundPage.vue'),
    },
  ],
  scrollBehavior() {
    return { top: 0 }
  },
})

applyGuards(router)

export default router
