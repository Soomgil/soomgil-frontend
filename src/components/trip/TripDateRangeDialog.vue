<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useLocale } from '@/i18n'

const props = defineProps<{ start: string; end: string }>()
const emit = defineEmits<{ apply:[start:string,end:string]; close:[] }>()
const { locale } = useLocale()
const start = ref(props.start)
const end = ref(props.end)
const selecting = ref<'start'|'end'>('start')
const initial = props.start ? new Date(`${props.start}T12:00:00`) : new Date()
const month = ref(new Date(initial.getFullYear(), initial.getMonth(), 1))
const dialog = ref<HTMLElement|null>(null)
let previousFocus: HTMLElement|null = null
const iso = (d:Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const monthLabel = computed(() => month.value.toLocaleDateString(locale.value === 'en' ? 'en-US' : 'ko-KR', {year:'numeric',month:'long'}))
const weekdays = computed(() => locale.value === 'en' ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : ['일','월','화','수','목','금','토'])
const days = computed(() => {
  const m=month.value
  return Array.from({length:42},(_,i)=>{
    const date=new Date(m.getFullYear(),m.getMonth(),1-m.getDay()+i)
    return {value:iso(date),label:date.getDate(),outside:date.getMonth()!==m.getMonth()}
  })
})
function moveMonth(delta:number) { month.value=new Date(month.value.getFullYear(),month.value.getMonth()+delta,1) }
function pick(value:string) {
  if(selecting.value==='start' || !start.value || value<start.value) {
    start.value=value;end.value='';selecting.value='end'
  } else { end.value=value }
}
function keyboard(event:KeyboardEvent) {
  if(event.key==='Escape') {event.stopPropagation();emit('close')}
  if(event.key!=='Tab')return
  const buttons=Array.from(dialog.value?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')??[])
  const first=buttons[0],last=buttons.at(-1)
  if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus()}
  else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus()}
}
onMounted(async()=>{previousFocus=document.activeElement as HTMLElement;await nextTick();dialog.value?.querySelector('button')?.focus()})
onUnmounted(()=>previousFocus?.focus())
</script>

<template>
  <div class="range-overlay" @click.self="emit('close')" @keydown="keyboard">
    <section ref="dialog" class="range-dialog" role="dialog" aria-modal="true" aria-labelledby="range-title">
      <header><h3 id="range-title">여행 기간 선택</h3><button type="button" class="range-close" aria-label="닫기" @click="emit('close')">×</button></header>
      <div class="range-fields">
        <button type="button" :aria-pressed="selecting==='start'" @click="selecting='start'"><small>From</small><strong>{{start || '출발일 선택'}}</strong></button>
        <span aria-hidden="true">→</span>
        <button type="button" :aria-pressed="selecting==='end'" @click="selecting='end'"><small>To</small><strong>{{end || '종료일 선택'}}</strong></button>
      </div>
      <nav class="range-month"><button type="button" aria-label="이전 달" @click="moveMonth(-1)">‹</button><strong aria-live="polite">{{monthLabel}}</strong><button type="button" aria-label="다음 달" @click="moveMonth(1)">›</button></nav>
      <div class="range-grid">
        <span v-for="day in weekdays" :key="day" class="range-weekday">{{day}}</span>
        <button v-for="day in days" :key="day.value" type="button" :data-date="day.value" :aria-label="day.value" :aria-pressed="day.value===start || day.value===end" :class="{outside:day.outside,endpoint:day.value===start||day.value===end,between:start&&end&&day.value>start&&day.value<end}" @click="pick(day.value)">{{day.label}}</button>
      </div>
      <footer><button type="button" class="range-clear" @click="emit('apply','','')">날짜 미정</button><button type="button" class="range-apply" data-testid="range-apply" :disabled="!start || !end" @click="emit('apply',start,end)">기간 적용</button></footer>
    </section>
  </div>
</template>

<style scoped>
.range-overlay{position:fixed;inset:0;z-index:30001;display:grid;place-items:center;padding:16px;background:#1b30474d;}
.range-dialog{width:min(100%,400px);max-height:calc(100svh - 32px);overflow:auto;padding:24px;background:#fff;border:1px solid #dceaf5;border-radius:26px;box-shadow:0 20px 70px #163c6133;color:#24374b;}
header,.range-month,footer{display:flex;align-items:center;justify-content:space-between;gap:12px;}h3{margin:0;font-size:18px;}button{font:inherit;cursor:pointer;border:0;background:#f2f7fb;color:inherit;}button:focus-visible{outline:2px solid #408fca;outline-offset:2px;}
.range-close,.range-month button{width:32px;height:32px;border-radius:50%;font-size:22px;}
.range-fields{display:flex;align-items:center;gap:8px;margin:20px 0;}.range-fields button{flex:1;text-align:left;padding:10px 12px;border-radius:16px;border:1px solid #dfebf4;}.range-fields button[aria-pressed=true]{background:#eaf5ff;border-color:#79b5e0;}.range-fields small,.range-fields strong{display:block;}.range-fields small{font-size:11px;color:#658198;margin-bottom:5px;}.range-fields strong{font-size:13px;}
.range-month{margin-bottom:14px;}.range-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:3px;}.range-weekday{text-align:center;font-size:11px;padding:7px 0;color:#8194a5;}.range-grid button{aspect-ratio:1;background:#fff;border-radius:50%;font-size:13px;}.range-grid button.outside{color:#acb8c2;}.range-grid button.between{background:#edf6ff;border-radius:8px;}.range-grid button.endpoint{background:#4284bd;color:#fff;font-weight:700;}
footer{padding:0;margin-top:20px;min-height:0;background:none;border:0;}.range-clear,.range-apply{padding:10px 18px;border-radius:999px;font-size:13px;}.range-apply{background:#4284bd;color:white;font-weight:700;}.range-apply:disabled{opacity:.4;cursor:default;}
@media(max-width:420px){.range-dialog{padding:20px;}}
</style>
