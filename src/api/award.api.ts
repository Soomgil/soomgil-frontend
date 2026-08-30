import http from './http'
import type { AwardPhoto } from '@/types/award'

export interface AwardPhotoParams {
  /** 최대 반환 개수. 기본 10 */
  limit?: number
  /** 시도 코드 필터 */
  regionCode?: string
}

export const awardApi = {
  /** 관광사진 공모전 수상작 조회 (GET /award-photos) — 인증 불필요 */
  async getAwardPhotos(params: AwardPhotoParams = {}): Promise<AwardPhoto[]> {
    const response = await http.get<AwardPhoto[]>('/award-photos', { params })
    return response.data
  },
}
