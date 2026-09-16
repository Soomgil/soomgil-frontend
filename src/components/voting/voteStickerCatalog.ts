/**
 * 투표 스티커 에셋 카탈로그.
 *
 * 파일은 public/vote-stickers/ 에 둔다. src/assets 로 import 하면 Vite가 4KB 미만 SVG를 data: URI로 인라인해
 * <img>/<use> 참조가 환경에 따라 깨질 수 있어, 항상 실제 URL로 서빙되는 public 경로를 쓴다.
 */
export type VoteStickerStyle = 'heart-stamp' | 'star-burst' | 'pin-flag' | 'passport-stamp' | 'smile' | 'wax-seal'

export interface VoteStickerDefinition {
  style: VoteStickerStyle
  label: string
  src: string
}

export const VOTE_STICKERS: readonly VoteStickerDefinition[] = [
  { style: 'heart-stamp', label: '하트 도장', src: '/vote-stickers/heart-stamp.svg' },
  { style: 'star-burst', label: '별 스티커', src: '/vote-stickers/star-burst.svg' },
  { style: 'pin-flag', label: '깃발 핀', src: '/vote-stickers/pin-flag.svg' },
  { style: 'passport-stamp', label: '여권 스탬프', src: '/vote-stickers/passport-stamp.svg' },
  { style: 'smile', label: '스마일', src: '/vote-stickers/smile.svg' },
  { style: 'wax-seal', label: '왁스 실링', src: '/vote-stickers/wax-seal.svg' },
] as const

/** 기본 스티커. 브랜드 로즈 톤에 맞고 "좋아요" 의미가 바로 읽혀 기본값으로 쓴다. */
export const DEFAULT_VOTE_STICKER: VoteStickerStyle = 'heart-stamp'

export function voteStickerSrc(style: VoteStickerStyle = DEFAULT_VOTE_STICKER) {
  return (VOTE_STICKERS.find((item) => item.style === style) ?? VOTE_STICKERS[0]).src
}
