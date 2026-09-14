<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'

const router = useRouter()
const homeSearchQuery = ref('')

function submitSearch() {
  const q = homeSearchQuery.value.trim()
  if (!q) return
  void router.push({ path: '/search', query: { q, tab: '전체' } })
}
</script>

<template>
  <AppShell>
    <main class="home-page">
      <section class="home-search-hero">
        <div class="home-search-hero-inner">
          <h1 class="home-search-hero-title">어떤 여행을 찾고 계신가요?</h1>

          <form class="home-search-capsule" role="search" @submit.prevent="submitSearch">
            <span class="material-symbols-rounded home-search-capsule-icon" aria-hidden="true">search</span>
            <input
              v-model="homeSearchQuery"
              type="search"
              class="home-search-capsule-input"
              placeholder="여행지, 계획, 커뮤니티 글을 검색해보세요"
              aria-label="여행 검색"
            />
            <button type="submit" class="home-search-capsule-btn">
              <span class="material-symbols-rounded" aria-hidden="true">search</span>
              <span class="home-search-capsule-btn-label">검색</span>
            </button>
          </form>
        </div>
      </section>
    </main>
  </AppShell>
</template>

<style scoped>
.home-page {
  min-height: calc(100vh - 72px);
}

.home-search-hero {
  display: grid;
  min-height: min(560px, calc(100vh - 72px));
  place-items: center;
  padding: 64px 24px 120px;
  background:
    radial-gradient(circle at 50% 12%, rgba(0, 102, 255, 0.1), transparent 34%),
    linear-gradient(180deg, #f7fbff 0%, #ffffff 74%);
}

.home-search-hero-inner {
  width: min(760px, 100%);
  text-align: center;
}

.home-search-hero-title {
  margin: 0 0 28px;
  color: var(--ink);
  font-size: clamp(30px, 4vw, 46px);
  font-weight: 900;
  letter-spacing: -0.04em;
  line-height: 1.2;
}

.home-search-capsule {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 68px;
  padding: 8px 8px 8px 22px;
  border: 1px solid rgba(214, 224, 241, 0.95);
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 18px 48px rgba(31, 68, 122, 0.13);
}

.home-search-capsule:focus-within {
  border-color: rgba(0, 102, 255, 0.45);
  box-shadow: 0 20px 52px rgba(0, 102, 255, 0.16);
}

.home-search-capsule-icon {
  flex: 0 0 auto;
  color: #64748b;
  font-size: 26px;
}

.home-search-capsule-input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--ink);
  font: inherit;
  font-size: 16px;
}

.home-search-capsule-input::placeholder {
  color: #94a3b8;
}

.home-search-capsule-input::-webkit-search-cancel-button {
  cursor: pointer;
}

.home-search-capsule-btn {
  display: inline-flex;
  min-height: 52px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0 24px;
  border: 0;
  border-radius: 999px;
  background: linear-gradient(135deg, #2563eb, #00a6ff);
  box-shadow: 0 12px 24px rgba(0, 102, 255, 0.22);
  color: #fff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 800;
}

.home-search-capsule-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(0, 102, 255, 0.28);
}

.home-search-capsule-btn .material-symbols-rounded {
  font-size: 20px;
}

@media (max-width: 600px) {
  .home-search-hero {
    min-height: calc(100vh - 64px);
    padding: 48px 16px 96px;
  }

  .home-search-hero-title {
    margin-bottom: 22px;
  }

  .home-search-capsule {
    min-height: 60px;
    padding-left: 18px;
  }

  .home-search-capsule-btn {
    width: 48px;
    min-height: 48px;
    padding: 0;
  }

  .home-search-capsule-btn-label {
    display: none;
  }
}
</style>
