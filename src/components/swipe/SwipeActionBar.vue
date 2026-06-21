<script setup lang="ts">
defineProps<{ disabled?: boolean }>()
defineEmits<{
  nope: []
  like: []
  superLike: []
}>()
</script>

<template>
  <div class="flex items-center justify-center gap-5">
    <button
      type="button"
      :disabled="disabled"
      class="w-14 h-14 rounded-full bg-white border-2 border-brand-rose/30 flex items-center justify-center shadow-lg hover:border-brand-rose hover:scale-110 transition-all"
      aria-label="NOPE"
      @click="$emit('nope')"
    >
      <span class="material-symbols-rounded text-brand-rose text-2xl">close</span>
    </button>
    <button
      type="button"
      :disabled="disabled"
      class="w-16 h-16 rounded-full bg-white border-2 border-brand-violet/30 flex items-center justify-center shadow-lg hover:border-brand-violet hover:scale-110 transition-all"
      aria-label="LIKE"
      @click="$emit('like')"
    >
      <span class="material-symbols-rounded text-brand-violet text-3xl">favorite</span>
    </button>
    <button
      type="button"
      :disabled="disabled"
      class="w-14 h-14 rounded-full bg-white border-2 border-brand-yellow/30 flex items-center justify-center shadow-lg hover:border-brand-yellow hover:scale-110 transition-all"
      aria-label="SUPER LIKE"
      @click="$emit('superLike')"
    >
      <span class="material-symbols-rounded text-brand-yellow text-2xl">star</span>
    </button>
  </div>
</template>

<style scoped>
button:disabled {
  cursor: wait;
  opacity: 0.5;
  transform: none;
}
</style>
