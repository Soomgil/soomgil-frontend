import { describe, expect, it } from 'vitest'
import { MAP_STICKERS, stickerHref } from './mapStickerCatalog'

describe('mapStickerCatalog', () => {
  it('provides the fixed 12-code original SVG catalog', () => {
    expect(MAP_STICKERS).toHaveLength(12)
    expect(new Set(MAP_STICKERS.map((sticker) => sticker.code)).size).toBe(12)
    expect(MAP_STICKERS.every((sticker) => stickerHref(sticker.code)?.includes(`#${sticker.symbolId}`))).toBe(true)
  })
})
