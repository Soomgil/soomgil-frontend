import type { Ref } from 'vue'
import { mediaApi } from '@/api/media.api'
import type { TripRecordPhoto, TripRecordPhotoReadUrl } from '@/types/media'

export function useRecordPhotoUrlRefresh(
  photos: Ref<TripRecordPhoto[]>,
  onRefreshed?: (result: TripRecordPhotoReadUrl) => void,
) {
  const failedUrlByMediaId = new Map<string, string>()
  const refreshingMediaIds = new Set<string>()

  async function refreshPhotoUrlById(mediaFileId: string, failedUrl: string) {
    if (!failedUrl || failedUrlByMediaId.get(mediaFileId) === failedUrl || refreshingMediaIds.has(mediaFileId)) return
    refreshingMediaIds.add(mediaFileId)
    try {
      let refreshed: TripRecordPhotoReadUrl
      try {
        refreshed = await mediaApi.refreshRecordPhotoReadUrl(mediaFileId)
      } catch (cause) {
        const status = typeof cause === 'object' && cause !== null && 'response' in cause
          ? (cause as { response?: { status?: number } }).response?.status
          : undefined
        if (status != null && status < 500) throw cause
        await new Promise((resolve) => setTimeout(resolve, 300))
        refreshed = await mediaApi.refreshRecordPhotoReadUrl(mediaFileId)
      }
      failedUrlByMediaId.set(mediaFileId, failedUrl)
      photos.value = photos.value.map((item) => item.media.id === mediaFileId
        ? {
            ...item,
            media: {
              ...item.media,
              servingUrl: refreshed.url,
              servingUrlExpiresAt: refreshed.expiresAt,
            },
          }
        : item)
      onRefreshed?.(refreshed)
    } catch {
      // 최종 실패는 기록하지 않아 이후 image error에서 다시 복구할 수 있게 한다.
    } finally {
      refreshingMediaIds.delete(mediaFileId)
    }
  }

  function refreshPhotoUrl(photo: TripRecordPhoto) {
    return refreshPhotoUrlById(
      photo.media.id,
      photo.media.servingUrl ?? photo.media.publicUrl ?? '',
    )
  }

  return { refreshPhotoUrl, refreshPhotoUrlById }
}
