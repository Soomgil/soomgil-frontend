import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareImageUpload } from './imageUpload'

const convertHeic = vi.hoisted(() => vi.fn())
vi.mock('heic2any', () => ({ default: convertHeic }))

describe('image upload preparation', () => {
  beforeEach(() => {
    convertHeic.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('converts HEIC and HEIF to a JPEG that the media API can register', async () => {
    convertHeic.mockResolvedValue(new Blob(['jpeg-bytes'], { type: 'image/jpeg' }))

    for (const extension of ['heic', 'heif']) {
      const original = new File(['heif-bytes'], `photo.${extension}`, { type: '' })
      const prepared = await prepareImageUpload(original, 'PROFILE_IMAGE')

      expect(prepared.name).toBe('photo.jpg')
      expect(prepared.type).toBe('image/jpeg')
      expect(prepared.size).toBe(10)
    }
    expect(convertHeic).toHaveBeenCalledTimes(2)
  })

  it('flattens GIF to PNG for map attachment and WebP to PNG for profile images', async () => {
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:image')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    class LoadedImage {
      naturalWidth = 4000
      naturalHeight = 2000
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      set src(_value: string) { queueMicrotask(() => this.onload?.()) }
    }
    vi.stubGlobal('Image', LoadedImage)
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D)
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((callback) => {
      callback(new Blob(['png-bytes'], { type: 'image/png' }))
    })

    const gif = await prepareImageUpload(new File(['gif'], 'map.gif', { type: 'image/gif' }), 'MAP_OVERLAY')
    const webp = await prepareImageUpload(new File(['webp'], 'avatar.webp', { type: 'image/webp' }), 'PROFILE_IMAGE')

    expect(gif.name).toBe('map.png')
    expect(webp.name).toBe('avatar.png')
    expect(gif.type).toBe('image/png')
    expect(webp.type).toBe('image/png')
    expect(drawImage).toHaveBeenCalledWith(expect.any(LoadedImage), 0, 0, 2048, 1024)
    expect(createObjectURL).toHaveBeenCalledTimes(2)
    expect(revokeObjectURL).toHaveBeenCalledTimes(2)
  })

  it('keeps map WebP intact and rejects unsupported or oversized images', async () => {
    const webp = new File(['webp'], 'map.webp', { type: 'image/webp' })
    await expect(prepareImageUpload(webp, 'MAP_OVERLAY')).resolves.toBe(webp)
    await expect(prepareImageUpload(new File(['svg'], 'icon.svg', { type: 'image/svg+xml' }), 'PROFILE_IMAGE'))
      .rejects.toThrow('JPG, PNG, WebP, GIF, HEIC 또는 HEIF')
    await expect(prepareImageUpload(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.jpg', { type: 'image/jpeg' }), 'PROFILE_IMAGE'))
      .rejects.toThrow('5MB 이하')
  })
})
