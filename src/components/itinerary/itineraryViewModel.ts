import type { ItineraryDay } from '@/types/itinerary'

export interface RouteStopViewModel {
  id: string
  placeExternalId: string
  title: string
  time: string
  order: number
  day: number
  memo: string
  lat: number | null
  lng: number | null
  thumbnailUrl: string | null
}

export interface DayPlanViewModel {
  id: string
  groupType: ItineraryDay['groupType']
  day: number
  date: string
  items: RouteStopViewModel[]
}

export function toDayPlans(days: ItineraryDay[]): DayPlanViewModel[] {
  return [...days]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .map((day) => {
      const dayNumber = day.groupType === 'UNSCHEDULED' ? -1 : (day.dayNumber ?? day.sortOrder + 1)
      return {
        id: day.id,
        groupType: day.groupType,
        day: dayNumber,
        date: day.date ?? '',
        items: [...day.items]
          .sort((left, right) => left.sortOrder - right.sortOrder)
          .map((item) => ({
            id: item.id,
            placeExternalId: item.place?.externalPlaceId ?? '',
            title: item.placeName,
            time: item.address ?? '시간 미정',
            order: item.sortOrder + 1,
            day: dayNumber,
            memo: '',
            lat: item.lat,
            lng: item.lng,
            thumbnailUrl: item.thumbnailUrl,
          })),
      }
    })
}

export function dayPlanLabel(day: DayPlanViewModel) {
  return day.groupType === 'UNSCHEDULED' ? '일차 미정' : `${day.day}일차`
}
