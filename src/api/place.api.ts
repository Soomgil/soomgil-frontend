import http from './http'
import type { PagedItems, PageMeta } from '@/types/api'
import type {
  AccessibilityFlag,
  ParkingType,
  Place,
  PlaceAccessibility,
  PlaceProvider,
  PlaceSourceStatus,
  TagPreparationStatus,
} from '@/types/place'

export interface PlaceAccessibilityDto {
  openingHours?: string | null
  closedDays?: string | null
  parkingType?: ParkingType | null
  flags?: AccessibilityFlag[] | null
  unavailableFlags?: AccessibilityFlag[] | null
}

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
  description?: string | null
  photos?: string[] | null
  tags?: string[] | null
  tagStatus?: TagPreparationStatus | null
  accessibility?: PlaceAccessibilityDto | null
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

export interface PlaceAccessibilityBatchItem {
  provider: PlaceProvider
  externalPlaceId: string
  contentTypeId?: string
}

export function mapAccessibility(dto?: PlaceAccessibilityDto | null): PlaceAccessibility | undefined {
  if (!dto) return undefined
  return {
    openingHours: dto.openingHours ?? null,
    closedDays: dto.closedDays ?? null,
    parkingType: dto.parkingType ?? 'UNKNOWN',
    flags: dto.flags ?? [],
    unavailableFlags: dto.unavailableFlags ?? [],
  }
}

export function mapPlace(dto: PlaceSummaryDto | PlaceDetailDto): Place {
  const detail = 'phone' in dto ? dto : null
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
    summary: dto.description ?? detail?.description ?? undefined,
    description: dto.description ?? detail?.description ?? undefined,
    photos: dto.photos ?? undefined,
    tags: dto.tags ?? undefined,
    tagStatus: dto.tagStatus ?? undefined,
    contact: detail?.phone ?? undefined,
    accessibility: mapAccessibility(dto.accessibility),
  }
}

export interface RegionViewport {
  centerLat: number
  centerLng: number
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
  placeCount: number
}

export const placeApi = {
  async search(params: PlaceSearchParams = {}): Promise<PagedItems<Place>> {
    const response = await http.get<PagedPlaceDto>('/places/search', { params })
    return { items: response.data.items.map(mapPlace), page: response.data.page }
  },

  // 여행지역의 지도 뷰포트. 좌표가 있는 관광 원천 장소가 없으면 204 → null.
  async getRegionViewport(legalRegionCode: string): Promise<RegionViewport | null> {
    const response = await http.get<RegionViewport | ''>('/places/region-viewport', { params: { legalRegionCode } })
    return response.status === 204 || !response.data ? null : response.data
  },

  async getPlace(provider: PlaceProvider, externalPlaceId: string, includeInfo = true): Promise<Place> {
    const response = await http.get<PlaceDetailDto>(`/places/${provider}/${externalPlaceId}`, { params: { includeInfo } })
    return mapPlace(response.data)
  },

  async getPopularPlaces(limit = 3): Promise<Place[]> {
    const response = await http.get<PlaceSummaryDto[] | PagedPlaceDto>('/places/popular', { params: { limit } })
    const data = Array.isArray(response.data) ? response.data : response.data.items
    return data.map(mapPlace)
  },

  async getAccessibilityBatch(
    items: PlaceAccessibilityBatchItem[],
  ): Promise<Record<string, PlaceAccessibility>> {
    if (items.length === 0) return {}
    const response = await http.post<{ map: Record<string, PlaceAccessibilityDto> }>(
      '/places/accessibility/batch',
      { items },
    )
    return Object.fromEntries(
      Object.entries(response.data.map).flatMap(([key, value]) => {
        const accessibility = mapAccessibility(value)
        return accessibility ? [[key, accessibility]] : []
      }),
    )
  },
}
