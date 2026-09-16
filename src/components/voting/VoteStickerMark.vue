<script setup lang="ts">
import { computed } from 'vue'
import { DEFAULT_VOTE_STICKER, voteStickerSrc, type VoteStickerStyle } from './voteStickerCatalog'

/**
 * 스티커 한 장. 덱의 사진 위 겹침, 보드의 사용/미사용 표시에 같은 컴포넌트를 쓴다.
 * data-testid 등 나머지 속성은 루트 <img>로 내려간다.
 */
const props = withDefaults(
  defineProps<{
    styleName?: VoteStickerStyle
    size?: number
    rotate?: number
    /** 아직 쓰지 않은 스티커 자리. 흐리게 보인다. */
    muted?: boolean
  }>(),
  { styleName: DEFAULT_VOTE_STICKER, size: 32, rotate: 0, muted: false },
)

const src = computed(() => voteStickerSrc(props.styleName))
const inlineStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
  transform: props.rotate ? `rotate(${props.rotate}deg)` : undefined,
}))
</script>

<template>
  <img :src="src" :alt="muted ? '남은 스티커 자리' : '붙인 스티커'" aria-hidden="true" draggable="false"
    class="vote-sticker-mark" :class="{ 'vote-sticker-mark--muted': muted }" :style="inlineStyle" />
</template>

<style scoped>
.vote-sticker-mark {
  display: inline-block;
  filter: drop-shadow(0 3px 5px rgba(0, 0, 0, 0.28));
  flex: 0 0 auto;
  user-select: none;
}

.vote-sticker-mark--muted {
  filter: grayscale(1);
  opacity: 0.28;
}
</style>
