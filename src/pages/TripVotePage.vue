<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import AppShell from '@/components/layout/AppShell.vue'
import TripVoteFlow from '@/components/voting/TripVoteFlow.vue'
import { buildVoteArrangePrompt } from '@/components/voting/voteArrangePrompt'

/**
 * /trips/:tripId/vote 딥링크용 페이지. 실제 흐름은 TripVoteFlow가 그리고, 여기서는 이동만 처리한다.
 * 지도에서는 같은 흐름이 모달로 열린다.
 */
const route = useRoute()
const router = useRouter()
const tripId = computed(() => String(route.params.tripId ?? ''))

/** showResult가 true면 지도 위에 결과 오버레이(투표가 끝났어요)를 띄운다. */
function goToMap(showResult = false) {
  router.push({
    name: 'Route',
    params: { tripId: tripId.value },
    ...(showResult ? { query: { voteCompleted: '1' } } : {}),
  })
}

/** 지도로 이동하면서 AI 패널을 열고 배치 프롬프트를 채워 둔다. */
function arrangeWithAi(names: string[]) {
  router.push({
    name: 'Route',
    params: { tripId: tripId.value },
    query: { panel: 'ai', aiPrompt: buildVoteArrangePrompt(names) },
  })
}
</script>

<template>
  <AppShell>
    <TripVoteFlow :trip-id="tripId" @close="goToMap" @ai-arrange="arrangeWithAi" />
  </AppShell>
</template>
