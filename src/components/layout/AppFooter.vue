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
  padding: 0 max(32px, calc((100% - 1240px) / 2));
  color: #7b8e9d;
  background: rgb(248 251 255 / 92%);
}

.app-footer-inner {
  min-height: 112px;
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 28px;
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
  margin: 0;
  font-size: 11px;
}

.app-footer p {
  text-align: center;
}

@media (max-width: 760px) {
  .app-footer {
    padding: 0 20px;
  }

  .app-footer-inner {
    min-height: 0;
    grid-template-columns: 1fr;
    justify-items: center;
    gap: 10px;
    padding: 28px 0 max(34px, env(safe-area-inset-bottom));
    text-align: center;
  }

  .app-footer-brand img {
    width: 64px;
  }
}
</style>
