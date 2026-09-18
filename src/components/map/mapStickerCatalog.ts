import starUrl from '@/assets/stickers/sketch/star.png?url'
import flagUrl from '@/assets/stickers/sketch/flag.png?url'
import circleUrl from '@/assets/stickers/sketch/circle.png?url'
import heartUrl from '@/assets/stickers/sketch/heart.png?url'
import checkUrl from '@/assets/stickers/sketch/check.png?url'
import xMarkUrl from '@/assets/stickers/sketch/x-mark.png?url'
import curvedArrowUrl from '@/assets/stickers/sketch/curved-arrow.png?url'
import upArrowUrl from '@/assets/stickers/sketch/up-arrow.png?url'
import locationPinUrl from '@/assets/stickers/sketch/location-pin.png?url'
import sparkleUrl from '@/assets/stickers/sketch/sparkle.png?url'
import exclamationUrl from '@/assets/stickers/sketch/exclamation.png?url'
import speechBubbleUrl from '@/assets/stickers/sketch/speech-bubble.png?url'
import type { MapStickerCode } from '@/types/itinerary'

export interface MapStickerDefinition {
  code: MapStickerCode
  label: string
  imageUrl: string
}

export const MAP_STICKERS: readonly MapStickerDefinition[] = [
  { code: 'STAR', label: '별', imageUrl: starUrl },
  { code: 'FOOD', label: '깃발', imageUrl: flagUrl },
  { code: 'CAMERA', label: '동그라미', imageUrl: circleUrl },
  { code: 'HEART', label: '하트', imageUrl: heartUrl },
  { code: 'CHECK', label: '체크', imageUrl: checkUrl },
  { code: 'CAFE', label: 'X 표시', imageUrl: xMarkUrl },
  { code: 'SHOPPING', label: '곡선 화살표', imageUrl: curvedArrowUrl },
  { code: 'HOTEL', label: '위쪽 화살표', imageUrl: upArrowUrl },
  { code: 'NATURE', label: '위치 핀', imageUrl: locationPinUrl },
  { code: 'BEACH', label: '반짝이', imageUrl: sparkleUrl },
  { code: 'MUSEUM', label: '느낌표', imageUrl: exclamationUrl },
  { code: 'TRANSPORT', label: '말풍선', imageUrl: speechBubbleUrl },
] as const

export function stickerHref(code: MapStickerCode) {
  return MAP_STICKERS.find((candidate) => candidate.code === code)?.imageUrl ?? null
}
