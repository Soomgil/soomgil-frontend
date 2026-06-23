import type { ItineraryDay } from '@/types/itinerary'

export interface RouteStopViewModel {
  id: string
  placeProvider: string
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
  const sorted = [...days]
    .sort((left, right) => {
      if (left.groupType === 'UNSCHEDULED' && right.groupType !== 'UNSCHEDULED') return -1
      if (left.groupType !== 'UNSCHEDULED' && right.groupType === 'UNSCHEDULED') return 1
      return left.sortOrder - right.sortOrder
    })

  let scheduledCount = 0
  return sorted.map((day) => {
    let dayNumber = -1
    if (day.groupType !== 'UNSCHEDULED') {
      scheduledCount++
      dayNumber = scheduledCount
    }
    return {
      id: day.id,
      groupType: day.groupType,
      day: dayNumber,
      date: day.date ?? '',
      items: [...day.items]
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((item) => ({
          id: item.id,
          placeProvider: item.place?.provider ?? '',
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
  if (day.groupType === 'UNSCHEDULED') return '일차 미정'
  const base = `${day.day}일차`
  if (!day.date) return base
  // YYYY-MM-DD → M/D 형태로 짧게 표시
  const parts = day.date.split('-')
  if (parts.length === 3) {
    const month = parseInt(parts[1], 10)
    const d = parseInt(parts[2], 10)
    return `${base} (${month}/${d})`
  }
  return base
}
