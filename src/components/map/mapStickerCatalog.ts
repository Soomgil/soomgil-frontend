import stickerSpriteUrl from '@/assets/stickers/map-stickers.svg?url'
import type { MapStickerCode } from '@/types/itinerary'

export interface MapStickerDefinition {
  code: MapStickerCode
  label: string
  symbolId: string
}

export const MAP_STICKERS: readonly MapStickerDefinition[] = [
  { code: 'HEART', label: '좋아요', symbolId: 'heart' },
  { code: 'STAR', label: '별', symbolId: 'star' },
  { code: 'CHECK', label: '체크', symbolId: 'check' },
  { code: 'CAMERA', label: '사진', symbolId: 'camera' },
  { code: 'FOOD', label: '맛집', symbolId: 'food' },
  { code: 'CAFE', label: '카페', symbolId: 'cafe' },
  { code: 'SHOPPING', label: '쇼핑', symbolId: 'shopping' },
  { code: 'HOTEL', label: '숙소', symbolId: 'hotel' },
  { code: 'NATURE', label: '자연', symbolId: 'nature' },
  { code: 'BEACH', label: '바다', symbolId: 'beach' },
  { code: 'MUSEUM', label: '문화', symbolId: 'museum' },
  { code: 'TRANSPORT', label: '이동', symbolId: 'transport' },
] as const

export function stickerHref(code: MapStickerCode) {
  const sticker = MAP_STICKERS.find((candidate) => candidate.code === code)
  return sticker ? `${stickerSpriteUrl}#${sticker.symbolId}` : null
}
