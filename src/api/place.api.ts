import http from './http'
import type { PagedItems, PageMeta } from '@/types/api'
import type { Place, PlaceProvider, PlaceSourceStatus } from '@/types/place'

interface PlaceSummaryDto {
  provider: PlaceProvider
  externalPlaceId: string
  name: string
  address: string | null
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
  category: string | null
  sourceStatus: PlaceSourceStatus
}

interface PlaceDetailDto extends PlaceSummaryDto {
  description: string | null
  phone: string | null
  sourceUpdatedAt: string | null
  enriched: boolean | null
}

interface PagedPlaceDto {
  items: PlaceSummaryDto[]
  page: PageMeta
}

export interface PlaceSearchParams {
  q?: string
  bbox?: string
  legalRegionCode?: string
  category?: string
  page?: number
  size?: number
}

export function mapPlace(dto: PlaceSummaryDto | PlaceDetailDto): Place {
  const detail = 'description' in dto ? dto : null
  return {
    provider: dto.provider,
    externalPlaceId: dto.externalPlaceId,
    placeName: dto.name,
    address: dto.address,
    lat: dto.lat,
    lng: dto.lng,
    thumbnailUrl: dto.thumbnailUrl,
    category: dto.category,
    sourceStatus: dto.sourceStatus,
    summary: detail?.description ?? undefined,
    description: detail?.description ?? undefined,
    contact: detail?.phone ?? undefined,
  }
}

export const placeApi = {
  async search(params: PlaceSearchParams = {}): Promise<PagedItems<Place>> {
    const response = await http.get<PagedPlaceDto>('/places/search', { params })
    return { items: response.data.items.map(mapPlace), page: response.data.page }
  },

  async getPlace(provider: PlaceProvider, externalPlaceId: string): Promise<Place> {
    const response = await http.get<PlaceDetailDto>(`/places/${provider}/${externalPlaceId}`)
    return mapPlace(response.data)
  },
}
