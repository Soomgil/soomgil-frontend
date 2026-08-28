<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useVotingStore } from '@/stores/voting.store'

/**
 * 투표가 끝난 뒤 지도(Route) 화면 위에 결과 요약을 띄우는 오버레이.
 * `?voteCompleted=1` 쿼리로 진입했을 때만 열리고, 닫으면 쿼리를 지워 다시 뜨지 않는다.
 */
const route = useRoute()
const router = useRouter()
const voting = useVotingStore()

const open = ref(false)
const loading = ref(false)

const selectedRows = computed(() => {
  const results = voting.result?.results ?? []
  return results
    .filter((item) => item.selected)
    .sort((a, b) => (a.selectedRank ?? 99) - (b.selectedRank ?? 99))
})

const completionLabel = computed(() =>
  voting.session?.completionReason === 'OWNER_EARLY_CLOSE'
    ? '방장이 투표를 마감했어요'
    : '모두 제출해서 자동으로 마감됐어요',
)

watch(
  () => [route.name, route.query.voteCompleted, route.params.tripId],
  async () => {
    if (route.name !== 'Route' || route.query.voteCompleted !== '1') {
      open.value = false
      return
    }
    const tripId = typeof route.params.tripId === 'string' ? route.params.tripId : null
    if (!tripId || loading.value) return
    loading.value = true
    try {
      if (voting.session?.tripId !== tripId) await voting.load(tripId)
      if (voting.session?.status === 'COMPLETED') {
        if (!voting.result || voting.result.sessionId !== voting.session.id) {
          await voting.loadResult()
        }
        open.value = true
      } else {
        stripQuery()
      }
    } catch {
      stripQuery()
    } finally {
      loading.value = false
    }
  },
  { immediate: true },
)

function stripQuery() {
  const { voteCompleted: _removed, ...rest } = route.query
  void router.replace({ query: rest })
}

function dismiss() {
  open.value = false
  stripQuery()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vote-map-overlay" data-testid="vote-map-overlay">
      <div class="vote-map-overlay__backdrop" @click="dismiss"></div>
      <section class="vote-map-overlay__card" role="dialog" aria-modal="true" aria-label="투표 결과">
        <span class="vote-map-overlay__icon material-symbols-rounded" aria-hidden="true">celebration</span>
        <h2 class="vote-map-overlay__title">투표가 끝났어요!</h2>
        <p class="vote-map-overlay__lead">
          {{ completionLabel }}. 선정된 {{ selectedRows.length }}곳을
          <strong>일차 미정</strong>에 담아뒀어요.
        </p>

        <ol class="vote-map-overlay__list">
          <li
            v-for="row in selectedRows"
            :key="row.candidateId"
            class="vote-map-overlay__item"
            data-testid="overlay-selected"
          >
            <span class="vote-map-overlay__rank">{{ row.selectedRank }}</span>
            <img
              v-if="row.thumbnailUrl"
              :src="row.thumbnailUrl"
              alt=""
              class="vote-map-overlay__thumb"
            />
            <span v-else class="vote-map-overlay__thumb vote-map-overlay__thumb--empty">
              <span class="material-symbols-rounded" aria-hidden="true">landscape</span>
            </span>
            <span class="vote-map-overlay__name">{{ row.name ?? '이름 미상' }}</span>
            <span class="vote-map-overlay__count">
              <span class="material-symbols-rounded" aria-hidden="true">favorite</span>
              {{ row.stickerCount }}
            </span>
          </li>
        </ol>

        <button type="button" class="vote-map-overlay__cta" data-testid="overlay-dismiss" @click="dismiss">
          일정에서 확인할게요
        </button>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.vote-map-overlay {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.vote-map-overlay__backdrop {
  position: absolute;
  inset: 0;
  background: rgba(10, 22, 44, 0.45);
  backdrop-filter: blur(4px);
}

.vote-map-overlay__card {
  position: relative;
  width: min(440px, 100%);
  max-height: min(640px, calc(100vh - 48px));
  overflow-y: auto;
  padding: 30px 26px 24px;
  border-radius: 26px;
  background: var(--surface);
  box-shadow: var(--shadow);
  text-align: center;
  animation: vote-map-overlay-pop 0.24s ease;
}

@keyframes vote-map-overlay-pop {
  from {
    transform: translateY(14px) scale(0.97);
    opacity: 0;
  }
  to {
    transform: none;
    opacity: 1;
  }
}

.vote-map-overlay__icon {
  font-size: 44px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: transparent;
}

.vote-map-overlay__title {
  margin: 8px 0 6px;
  color: var(--ink);
  font-size: 24px;
  font-weight: 900;
}

.vote-map-overlay__lead {
  margin: 0 0 18px;
  color: var(--muted);
  font-size: 14px;
  line-height: 1.7;
}

.vote-map-overlay__lead strong {
  color: var(--violet);
}

.vote-map-overlay__list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 0 0 18px;
  padding: 0;
  list-style: none;
}

.vote-map-overlay__item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 16px;
  text-align: left;
}

.vote-map-overlay__rank {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 13px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}

.vote-map-overlay__thumb {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
}

.vote-map-overlay__thumb--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  color: rgba(0, 102, 255, 0.4);
}

.vote-map-overlay__name {
  flex: 1;
  min-width: 0;
  color: var(--ink);
  font-size: 14px;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.vote-map-overlay__count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--rose, #ff5a8a);
  font-size: 13px;
  font-weight: 800;
}

.vote-map-overlay__count .material-symbols-rounded {
  font-size: 16px;
  font-variation-settings: 'FILL' 1;
}

.vote-map-overlay__cta {
  width: 100%;
  padding: 13px;
  border: none;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--violet), var(--blue));
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  cursor: pointer;
  box-shadow: 0 12px 26px rgba(0, 102, 255, 0.28);
  transition: transform 0.15s ease;
}

.vote-map-overlay__cta:hover {
  transform: translateY(-2px);
}
</style>
