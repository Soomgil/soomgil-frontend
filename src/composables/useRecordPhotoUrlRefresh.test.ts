import { ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TripRecordPhoto } from '@/types/media'

const mediaApi = vi.hoisted(() => ({ refreshRecordPhotoReadUrl: vi.fn() }))
vi.mock('@/api/media.api', () => ({ mediaApi }))

import { useRecordPhotoUrlRefresh } from './useRecordPhotoUrlRefresh'

const photo = (): TripRecordPhoto => ({
  tripId: 'trip-1', tripTitle: '부산', recordId: 'record-1', itineraryDayId: null, dayNumber: null, itineraryItemId: null,
  media: {
    id: 'media-1', publicUrl: null, servingUrl: 'https://storage.example.com/expired',
    servingUrlExpiresAt: '2026-06-22T00:00:00Z', mimeType: 'image/jpeg', byteSize: 10,
    width: 10, height: 10, status: 'ACTIVE', createdAt: '2026-06-22T00:00:00Z',
  },
  uploadedBy: null, takenAt: null, createdAt: '2026-06-22T00:00:00Z',
})

describe('useRecordPhotoUrlRefresh', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('retries one transient failure and applies the refreshed URL', async () => {
    vi.useFakeTimers()
    mediaApi.refreshRecordPhotoReadUrl
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ mediaFileId: 'media-1', url: 'https://storage.example.com/fresh', expiresAt: null })
    const photos = ref([photo()])
    const { refreshPhotoUrl } = useRecordPhotoUrlRefresh(photos)

    const refresh = refreshPhotoUrl(photos.value[0])
    await vi.advanceTimersByTimeAsync(300)
    await refresh

    expect(mediaApi.refreshRecordPhotoReadUrl).toHaveBeenCalledTimes(2)
    expect(photos.value[0].media.servingUrl).toBe('https://storage.example.com/fresh')
  })

  it('does not retry a permission or not-found response', async () => {
    mediaApi.refreshRecordPhotoReadUrl.mockRejectedValue({ response: { status: 404 } })
    const photos = ref([photo()])
    const { refreshPhotoUrl } = useRecordPhotoUrlRefresh(photos)

    await refreshPhotoUrl(photos.value[0])

    expect(mediaApi.refreshRecordPhotoReadUrl).toHaveBeenCalledTimes(1)
  })
})
