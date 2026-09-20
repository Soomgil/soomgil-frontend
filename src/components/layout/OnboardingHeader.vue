<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useOnboardingStore } from '@/stores/onboarding.store'
import logoUrl from '@/assets/images/soomgil_logo_none_text.png'

const router = useRouter()
const auth = useAuthStore()
const onboarding = useOnboardingStore()
const loggingOut = ref(false)

const requiredPlaceCount = computed(() => onboarding.survey?.requiredPlaceCount ?? 10)

async function logout() {
  if (loggingOut.value) return
  loggingOut.value = true
  try {
    await auth.logout()
    await router.replace('/login')
  } finally {
    loggingOut.value = false
  }
}
</script>

<template>
  <header class="onboarding-header">
    <div class="onboarding-header__inner">
      <div class="onboarding-header__brand" aria-label="숨길">
        <img :src="logoUrl" alt="숨길">
      </div>

      <div class="onboarding-header__message">
        <strong>취향 수집을 통해 가입을 완료하세요!</strong>
        <span>약 1분이면 나에게 맞는 여행 추천이 준비돼요.</span>
      </div>

      <div class="onboarding-header__actions">
        <span class="onboarding-header__progress" role="status" aria-live="polite">
          <strong>{{ onboarding.answeredPlaceCount }}</strong>
          <span>/ {{ requiredPlaceCount }}</span>
        </span>
        <button type="button" :disabled="loggingOut" @click="logout">
          <span class="material-symbols-rounded" aria-hidden="true">logout</span>
          로그아웃
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.onboarding-header {
  position: sticky;
  top: 0;
  z-index: 80;
  border-bottom: 1px solid rgba(124, 58, 237, 0.12);
  background: rgba(248, 251, 255, 0.9);
  box-shadow: 0 10px 30px rgba(64, 48, 120, 0.06);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.onboarding-header__inner {
  width: min(1180px, calc(100% - 32px));
  min-height: 76px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: minmax(120px, 1fr) auto minmax(180px, 1fr);
  align-items: center;
  gap: 24px;
}

.onboarding-header__brand {
  display: flex;
  align-items: center;
}

.onboarding-header__brand img {
  width: 48px;
  height: 48px;
  object-fit: contain;
}

.onboarding-header__message {
  display: grid;
  justify-items: center;
  gap: 3px;
  text-align: center;
}

.onboarding-header__message strong {
  color: var(--ink);
  font-size: 16px;
  font-weight: 850;
  letter-spacing: -0.02em;
}

.onboarding-header__message span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 650;
}

.onboarding-header__actions {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 10px;
}

.onboarding-header__progress {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  min-width: 68px;
  justify-content: center;
  padding: 8px 12px;
  border: 1px solid rgba(124, 58, 237, 0.14);
  border-radius: 999px;
  background: rgba(124, 58, 237, 0.07);
  color: var(--muted);
  font-size: 13px;
  font-weight: 750;
}

.onboarding-header__progress strong {
  color: var(--violet);
  font-size: 17px;
}

.onboarding-header__actions button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 12px;
  border: 0;
  border-radius: 12px;
  background: transparent;
  color: #6b7280;
  font: inherit;
  font-size: 13px;
  font-weight: 750;
  cursor: pointer;
}

.onboarding-header__actions button:hover {
  background: rgba(100, 116, 139, 0.08);
  color: var(--ink);
}

.onboarding-header__actions button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.onboarding-header__actions .material-symbols-rounded {
  font-size: 18px;
}

@media (max-width: 760px) {
  .onboarding-header__inner {
    width: min(100% - 20px, 680px);
    min-height: 68px;
    grid-template-columns: auto 1fr auto;
    gap: 10px;
  }

  .onboarding-header__brand img {
    width: 40px;
    height: 40px;
  }

  .onboarding-header__message {
    justify-items: start;
    text-align: left;
  }

  .onboarding-header__message strong {
    font-size: 13px;
  }

  .onboarding-header__message span,
  .onboarding-header__actions button span,
  .onboarding-header__actions button {
    font-size: 0;
  }

  .onboarding-header__actions button {
    padding: 9px;
  }

  .onboarding-header__actions .material-symbols-rounded {
    font-size: 20px;
  }

  .onboarding-header__progress {
    min-width: 58px;
    padding: 7px 9px;
  }
}
</style>
