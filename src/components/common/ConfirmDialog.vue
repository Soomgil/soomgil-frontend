<script setup lang="ts">
withDefaults(defineProps<{
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'default' | 'danger'
  busy?: boolean
}>(), {
  confirmLabel: '확인',
  cancelLabel: '취소',
  tone: 'default',
  busy: false,
})

defineEmits<{ cancel: []; confirm: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-message">
      <button class="confirm-dialog__backdrop" type="button" aria-label="취소" :disabled="busy" @click="$emit('cancel')"></button>
      <section class="confirm-dialog__card">
        <span class="confirm-dialog__icon material-symbols-rounded" :class="`is-${tone}`" aria-hidden="true">{{ tone === 'danger' ? 'delete' : 'help' }}</span>
        <div class="confirm-dialog__copy">
          <h2 id="confirm-dialog-title">{{ title }}</h2>
          <p id="confirm-dialog-message">{{ message }}</p>
        </div>
        <div class="confirm-dialog__actions">
          <button type="button" class="confirm-dialog__cancel" :disabled="busy" @click="$emit('cancel')">{{ cancelLabel }}</button>
          <button type="button" class="confirm-dialog__confirm" :class="`is-${tone}`" :disabled="busy" @click="$emit('confirm')">{{ busy ? '처리 중...' : confirmLabel }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.confirm-dialog { position:fixed; inset:0; z-index:1600; display:grid; place-items:center; padding:20px; }
.confirm-dialog__backdrop { position:absolute; inset:0; width:100%; height:100%; padding:0; border:0; background:rgb(28 43 56 / 42%); backdrop-filter:blur(3px); }
.confirm-dialog__card { position:relative; width:min(100%,420px); display:grid; grid-template-columns:44px minmax(0,1fr); gap:16px; padding:24px; border:1px solid #dce7ef; border-radius:20px; background:#fff; color:#35465a; box-shadow:0 24px 70px rgb(31 55 73 / 24%); }
.confirm-dialog__icon { width:44px; height:44px; display:grid; place-items:center; border-radius:14px; background:#edf5fa; color:#427ead; font-size:23px; }
.confirm-dialog__icon.is-danger { background:#fff0f1; color:#c84f5c; }
.confirm-dialog__copy h2 { margin:1px 0 7px; font-family:'Noto Serif KR',Batang,serif; font-size:19px; font-weight:600; line-height:1.45; letter-spacing:-.02em; }
.confirm-dialog__copy p { margin:0; color:#6c8194; font-size:12px; line-height:1.75; word-break:keep-all; }
.confirm-dialog__actions { grid-column:1 / -1; display:flex; justify-content:flex-end; gap:8px; margin-top:4px; }
.confirm-dialog__actions button { min-height:42px; padding:0 17px; border-radius:999px; font-size:12px; font-weight:700; cursor:pointer; }
.confirm-dialog__actions button:disabled { opacity:.6; cursor:not-allowed; }
.confirm-dialog__cancel { border:1px solid #dfeaf2; background:#fff; color:#61778a; }
.confirm-dialog__cancel:hover:not(:disabled) { background:#f4f8fb; }
.confirm-dialog__confirm { border:1px solid #3f78a3; background:#427ead; color:#fff; }
.confirm-dialog__confirm.is-danger { border-color:#c84f5c; background:#c84f5c; box-shadow:0 7px 18px rgb(200 79 92 / 18%); }
.confirm-dialog__confirm.is-danger:hover:not(:disabled) { background:#b6424e; }
@media(max-width:600px) {
  .confirm-dialog { padding:16px; }
  .confirm-dialog__card { grid-template-columns:38px minmax(0,1fr); gap:13px; padding:20px; border-radius:18px; }
  .confirm-dialog__icon { width:38px; height:38px; border-radius:12px; font-size:20px; }
  .confirm-dialog__copy h2 { font-size:17px; }
  .confirm-dialog__actions { display:grid; grid-template-columns:1fr 1fr; }
  .confirm-dialog__actions button { padding-inline:10px; }
}
</style>
