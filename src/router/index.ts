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
      name: 'VerifyEmail',
      component: () => import('@/pages/VerifyEmailPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/reset-password',
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
      path: '/my-trips',
      name: 'MyTrips',
      component: () => import('@/pages/MyTripsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/trips/:tripId/swipe',
      name: 'Swipe',
      component: () => import('@/pages/SwipePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/trips/:tripId/route',
      name: 'Route',
      component: () => import('@/pages/RoutePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/community',
      name: 'Community',
      component: () => import('@/pages/CommunityPage.vue'),
    },
    {
      path: '/community/feed',
      name: 'Feed',
      component: () => import('@/pages/FeedPage.vue'),
    },
    {
      path: '/community/stories',
      name: 'Stories',
      component: () => import('@/pages/StoriesPage.vue'),
    },
    {
      path: '/community/story-write',
      name: 'StoryWrite',
      component: () => import('@/pages/StoryWritePage.vue'),
      meta: { requiresAuth: true },
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
      name: 'Settings',
      component: () => import('@/pages/SettingsPage.vue'),
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
