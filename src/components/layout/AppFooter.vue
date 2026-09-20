<script setup lang="ts">
import { useRouter } from 'vue-router'
import logoUrl from '@/assets/images/soomgil_logo_extract.png'

const router = useRouter()
</script>

<template>
  <footer class="app-footer">
    <div class="app-footer-inner">
      <a class="app-footer-brand" href="/home" aria-label="숨길 홈으로" @click.prevent="router.push('/home')">
        <img :src="logoUrl" alt="Soomgil">
      </a>
      <p>함께 고르고, 함께 계획하고, 함께 떠나는 여행 협업 서비스</p>
      <small>© 2026 Soomgil. All rights reserved.</small>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  position: relative;
  z-index: 1;
  width: 100%;
  max-width: 100vw;
  padding: 0 clamp(16px, 4vw, 32px);
  overflow: hidden;
  color: #7b8e9d;
  background: #fff;
}

.app-footer-inner {
  width: 100%;
  max-width: 1240px;
  min-width: 0;
  margin: 0 auto;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 28px;
  padding: 34px 0 48px;
  border-top: 1px solid #dfe8ef;
}

.app-footer-brand {
  display: inline-flex;
  align-items: center;
  text-decoration: none;
}

.app-footer-brand img {
  display: block;
  width: 72px;
  height: auto;
}

.app-footer p,
.app-footer small {
  min-width: 0;
  margin: 0;
  font-size: 11px;
  overflow-wrap: anywhere;
}

.app-footer p {
  text-align: center;
}

@media (max-width: 900px) {
  .app-footer {
    padding: 0 24px;
  }

  .app-footer-inner {
    min-height: 0;
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 10px;
    padding: 30px 0 max(44px, env(safe-area-inset-bottom));
    text-align: center;
  }

  .app-footer-brand img {
    width: 64px;
  }
}

@media (max-width: 560px) {
  .app-footer { padding-inline: 16px; }
}
</style>
