<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { geoApi } from '@/api/geo.api'
import type { LegalRegion } from '@/types/geo'

const props = withDefaults(defineProps<{
  id: string
  modelValue: string
  name?: string
  placeholder?: string
}>(), {
  name: undefined,
  placeholder: '지역 검색',
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  select: [region: LegalRegion | null]
}>()

const SEARCH_DEBOUNCE_MS = 300
const inputValue = ref(props.modelValue)
const options = ref<LegalRegion[]>([])
const loading = ref(false)
const error = ref(false)
const open = ref(false)
const hasSearched = ref(false)
const activeIndex = ref(-1)
let searchSequence = 0
let searchTimer: ReturnType<typeof setTimeout> | null = null
let abortController: AbortController | null = null
let closeTimer: ReturnType<typeof setTimeout> | null = null

const listboxId = computed(() => `${props.id}-options`)
const activeOptionId = computed(() => open.value && activeIndex.value >= 0
  ? `${props.id}-option-${activeIndex.value}`
  : undefined)

watch(() => props.modelValue, (value) => {
  if (inputValue.value === value) return
  inputValue.value = value
  clearSearchTimer()
  cancelRequest()
  resetResults()
})

function clearSearchTimer() {
  if (searchTimer === null) return
  clearTimeout(searchTimer)
  searchTimer = null
}

function cancelRequest() {
  searchSequence += 1
  abortController?.abort()
  abortController = null
}

function resetResults() {
  options.value = []
  activeIndex.value = -1
  hasSearched.value = false
  error.value = false
  loading.value = false
  open.value = false
}

async function search(query: string) {
  const requestId = ++searchSequence
  abortController?.abort()
  const controller = new AbortController()
  abortController = controller
  loading.value = true
  error.value = false
  open.value = true

  try {
    const result = await geoApi.searchLegalRegions({
      q: query,
      isActive: true,
      page: 0,
      size: 10,
    }, controller.signal)
    if (requestId !== searchSequence || controller.signal.aborted) return
    options.value = result.items
    activeIndex.value = result.items.length > 0 ? 0 : -1
    hasSearched.value = true
  } catch {
    if (requestId !== searchSequence || controller.signal.aborted) return
    options.value = []
    activeIndex.value = -1
    hasSearched.value = true
    error.value = true
  } finally {
    if (abortController === controller) abortController = null
    if (requestId === searchSequence) loading.value = false
  }
}

function scheduleSearch() {
  clearSearchTimer()
  cancelRequest()
  const query = inputValue.value.trim()
  if (query.length < 2) {
    resetResults()
    return
  }
  loading.value = true
  error.value = false
  open.value = true
  searchTimer = setTimeout(() => {
    searchTimer = null
    void search(query)
  }, SEARCH_DEBOUNCE_MS)
}

function handleInput(event: Event) {
  inputValue.value = (event.target as HTMLInputElement).value
  emit('update:modelValue', inputValue.value)
  emit('select', null)
  scheduleSearch()
}

function selectRegion(region: LegalRegion) {
  clearSearchTimer()
  cancelRequest()
  inputValue.value = region.fullName
  emit('update:modelValue', region.fullName)
  emit('select', region)
  resetResults()
}

function retry() {
  const query = inputValue.value.trim()
  if (query.length >= 2) void search(query)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false
    return
  }
  if (options.value.length === 0) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    open.value = true
    activeIndex.value = (activeIndex.value + 1) % options.value.length
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    open.value = true
    activeIndex.value = (activeIndex.value - 1 + options.value.length) % options.value.length
  } else if (event.key === 'Enter' && open.value && activeIndex.value >= 0) {
    event.preventDefault()
    selectRegion(options.value[activeIndex.value])
  }
}

function handleFocus() {
  if (closeTimer !== null) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
  if (options.value.length > 0 || loading.value || error.value) open.value = true
}

function handleBlur() {
  if (closeTimer !== null) clearTimeout(closeTimer)
  closeTimer = setTimeout(() => {
    open.value = false
    closeTimer = null
  }, 100)
}

onBeforeUnmount(() => {
  clearSearchTimer()
  cancelRequest()
  if (closeTimer !== null) clearTimeout(closeTimer)
})
</script>

<template>
  <div class="legal-region-combobox">
    <div class="legal-region-input-wrap">
      <input
        :id="id"
        :value="inputValue"
        class="field"
        type="text"
        :name="name"
        maxlength="160"
        autocomplete="off"
        :placeholder="placeholder"
        role="combobox"
        aria-autocomplete="list"
        :aria-controls="listboxId"
        :aria-expanded="open"
        :aria-activedescendant="activeOptionId"
        @input="handleInput"
        @focus="handleFocus"
        @blur="handleBlur"
        @keydown="handleKeydown"
      >
      <span v-if="loading" class="legal-region-spinner" aria-hidden="true"></span>
      <span v-else class="material-symbols-rounded legal-region-search-icon" aria-hidden="true">search</span>
    </div>

    <div v-if="open" :id="listboxId" class="legal-region-options" role="listbox">
      <p v-if="loading" class="legal-region-state" role="status">지역을 검색하는 중</p>
      <div v-else-if="error" class="legal-region-state is-error" role="alert">
        <span>지역을 불러오지 못했습니다.</span>
        <button type="button" aria-label="지역 검색 다시 시도" title="다시 시도" @mousedown.prevent @click="retry">
          <span class="material-symbols-rounded" aria-hidden="true">refresh</span>
        </button>
      </div>
      <p v-else-if="hasSearched && options.length === 0" class="legal-region-state">검색 결과가 없습니다.</p>
      <template v-else>
        <button
          v-for="(region, index) in options"
          :id="`${id}-option-${index}`"
          :key="region.code"
          type="button"
          class="legal-region-option"
          :class="{ active: activeIndex === index }"
          role="option"
          :aria-selected="activeIndex === index"
          @mouseenter="activeIndex = index"
          @mousedown.prevent
          @click="selectRegion(region)"
        >
          <span>{{ region.fullName }}</span>
          <small>{{ region.code }}</small>
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.legal-region-combobox {
  position: relative;
}

.legal-region-input-wrap {
  position: relative;
}

.legal-region-input-wrap .field {
  padding-right: 40px;
  width: 100%;
}

.legal-region-search-icon,
.legal-region-spinner {
  pointer-events: none;
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
}

.legal-region-search-icon {
  color: #9ca3af;
  font-size: 20px;
}

.legal-region-spinner {
  animation: legal-region-spin 700ms linear infinite;
  border: 2px solid #ddd6fe;
  border-radius: 50%;
  border-top-color: #7c3aed;
  height: 16px;
  width: 16px;
}

.legal-region-options {
  background: #fff;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  box-shadow: 0 10px 24px rgb(15 23 42 / 14%);
  left: 0;
  max-height: 240px;
  overflow-y: auto;
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 20;
}

.legal-region-option {
  align-items: center;
  background: #fff;
  border: 0;
  color: #111827;
  cursor: pointer;
  display: flex;
  gap: 12px;
  justify-content: space-between;
  padding: 10px 12px;
  text-align: left;
  width: 100%;
}

.legal-region-option + .legal-region-option {
  border-top: 1px solid #f3f4f6;
}

.legal-region-option:hover,
.legal-region-option.active {
  background: #f5f3ff;
}

.legal-region-option span {
  font-size: 14px;
  min-width: 0;
}

.legal-region-option small {
  color: #9ca3af;
  flex: 0 0 auto;
  font-size: 11px;
}

.legal-region-state {
  color: #6b7280;
  font-size: 13px;
  margin: 0;
  padding: 12px;
}

.legal-region-state.is-error {
  align-items: center;
  color: #be123c;
  display: flex;
  justify-content: space-between;
}

.legal-region-state button {
  align-items: center;
  background: transparent;
  border: 0;
  color: inherit;
  cursor: pointer;
  display: inline-flex;
  height: 24px;
  justify-content: center;
  padding: 0;
  width: 24px;
}

.legal-region-state .material-symbols-rounded {
  font-size: 18px;
}

@keyframes legal-region-spin {
  to { transform: translateY(-50%) rotate(360deg); }
}
</style>
