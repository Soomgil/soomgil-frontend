<script setup lang="ts">
withDefaults(defineProps<{
  modelValue?: string
  label?: string
  icon?: string
  type?: string
  placeholder?: string
  required?: boolean
}>(), {
  type: 'text',
  required: false,
})

defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="flex flex-col gap-1.5">
    <span v-if="label" class="text-xs font-semibold text-muted">{{ label }}</span>
    <span class="flex items-center gap-2 px-4 py-3 rounded-2xl border border-line bg-surface focus-within:border-brand-violet focus-within:ring-2 focus-within:ring-brand-violet/20 transition-all">
      <span v-if="icon" class="material-symbols-rounded text-muted text-[20px]">{{ icon }}</span>
      <input
        :type="type"
        :value="modelValue"
        :placeholder="placeholder"
        :required="required"
        class="flex-1 bg-transparent outline-none text-ink placeholder:text-muted/60"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </span>
  </label>
</template>
