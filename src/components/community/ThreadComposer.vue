<script setup lang="ts">
import { computed, ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  submitting?: boolean
  initialContent?: string
  submitLabel?: string
  placeholder?: string
  maxLength?: number
}>(), {
  submitting: false,
  initialContent: '',
  submitLabel: '게시',
  placeholder: '무슨 여행 이야기를 나눠볼까요?',
  maxLength: 500,
})

const emit = defineEmits<{
  submit: [content: string]
  cancel: []
}>()

const content = ref(props.initialContent)

watch(
  () => props.initialContent,
  (next) => {
    content.value = next
  },
)

const trimmed = computed(() => content.value.trim())
const canSubmit = computed(
  () => trimmed.value.length >= 1 && trimmed.value.length <= props.maxLength && !props.submitting,
)

function submit() {
  if (!canSubmit.value) return
  emit('submit', trimmed.value)
  content.value = ''
}
</script>

<template>
  <form class="thread-composer" data-testid="thread-composer" @submit.prevent="submit">
    <textarea
      v-model="content"
      class="thread-composer-input"
      data-testid="thread-composer-input"
      :placeholder="placeholder"
      :maxlength="maxLength"
      rows="3"
    />
    <div class="thread-composer-footer">
      <span
        class="thread-composer-counter"
        :class="{ over: trimmed.length > maxLength }"
        data-testid="thread-composer-counter"
      >
        {{ trimmed.length }} / {{ maxLength }}
      </span>
      <div class="thread-composer-buttons">
        <button
          v-if="$attrs.onCancel !== undefined"
          type="button"
          class="thread-composer-cancel"
          @click="emit('cancel')"
        >
          취소
        </button>
        <button
          type="submit"
          class="thread-composer-submit"
          data-testid="thread-composer-submit"
          :disabled="!canSubmit"
        >
          {{ submitLabel }}
        </button>
      </div>
    </div>
  </form>
</template>

<style scoped>
.thread-composer {
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
}

.thread-composer-input {
  background: var(--surface-2, transparent);
  border: 1px solid var(--line);
  border-radius: 12px;
  color: var(--ink);
  font-size: 15px;
  line-height: 1.6;
  padding: 12px;
  resize: vertical;
  width: 100%;
}

.thread-composer-footer {
  align-items: center;
  display: flex;
  justify-content: space-between;
}

.thread-composer-counter {
  color: var(--muted);
  font-size: 12px;
}

.thread-composer-counter.over {
  color: var(--brand-rose, #e0567a);
}

.thread-composer-buttons {
  display: flex;
  gap: 8px;
}

.thread-composer-cancel {
  background: none;
  border: none;
  color: var(--muted);
  cursor: pointer;
  font-size: 13px;
}

.thread-composer-submit {
  background: var(--brand-violet, #6b5bff);
  border: none;
  border-radius: 999px;
  color: #fff;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 18px;
}

.thread-composer-submit:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
</style>
