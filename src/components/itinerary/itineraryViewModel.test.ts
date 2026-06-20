import { describe, expect, it } from 'vitest'
import { dayPlanLabel, toDayPlans } from './itineraryViewModel'
import type { ItineraryDay } from '@/types/itinerary'

describe('itinerary view model', () => {
  it('실제 day와 일차 미정을 화면 순서로 변환한다', () => {
    const days: ItineraryDay[] = [
      {
        id: 'unscheduled', tripId: 'trip-1', groupType: 'UNSCHEDULED', dayNumber: null,
        date: null, title: null, sortOrder: 1, items: [],
      },
      {
        id: 'day-1', tripId: 'trip-1', groupType: 'DAY', dayNumber: 1,
        date: '2026-07-01', title: null, sortOrder: 0,
        items: [
          {
            id: 'item-2', itineraryDayId: 'day-1', sortOrder: 1, itemType: 'PLACE',
            place: { provider: 'KTO', externalPlaceId: 'kto-2' }, placeName: '두 번째 장소',
            address: '부산광역시', lat: 35.1, lng: 129.1, thumbnailUrl: null,
            sourceStatus: 'AVAILABLE',
          },
          {
            id: 'item-1', itineraryDayId: 'day-1', sortOrder: 0, itemType: 'CUSTOM_PLACE',
            place: null, placeName: '첫 번째 일정', address: null, lat: null, lng: null,
            thumbnailUrl: null, sourceStatus: 'AVAILABLE',
          },
        ],
      },
    ]

    const plans = toDayPlans(days)

    expect(plans.map((day) => day.id)).toEqual(['day-1', 'unscheduled'])
    expect(plans[0].items.map((item) => item.id)).toEqual(['item-1', 'item-2'])
    expect(plans[0].items[1].placeExternalId).toBe('kto-2')
    expect(dayPlanLabel(plans[0])).toBe('1일차')
    expect(dayPlanLabel(plans[1])).toBe('일차 미정')
    expect(plans[1].day).toBe(-1)
  })
})
