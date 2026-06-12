import { ref, computed } from 'vue'
import type { ItineraryDay, ItineraryItem, TripRoute, ItineraryPutRequest } from '@/types/itinerary'
import { itineraryApi } from '@/api/itinerary.api'

export function useItinerary(tripId: string) {
  const days = ref<ItineraryDay[]>([])
  const routes = ref<TripRoute[]>([])
  const loading = ref(false)

  /** 모든 아이템 flat list */
  const allItems = computed(() =>
    days.value.flatMap((d) => d.items ?? []),
  )

  /** 특정 일차의 아이템 */
  function getItemsByDay(dayId: string): ItineraryItem[] {
    return days.value.find((d) => d.id === dayId)?.items ?? []
  }

  /** 두 아이템 사이에 루트가 있는지 */
  function getRouteBetween(originItemId: string, destinationItemId: string): TripRoute | undefined {
    return routes.value.find(
      (r) => r.originItineraryItemId === originItemId && r.destinationItineraryItemId === destinationItemId,
    )
  }

  async function fetchItinerary() {
    loading.value = true
    try {
      const res = await itineraryApi.getItinerary(tripId)
      days.value = res.data.days
      routes.value = res.data.routes
    } finally {
      loading.value = false
    }
  }

  async function putItinerary(data: ItineraryPutRequest) {
    const res = await itineraryApi.putItinerary(tripId, data)
    days.value = res.data.days
    routes.value = res.data.routes
  }

  async function addItem(dayId: string, item: Partial<ItineraryItem>) {
    const res = await itineraryApi.addItem(tripId, { ...item, itineraryDayId: dayId })
    const day = days.value.find((d) => d.id === dayId)
    if (day) {
      if (!day.items) day.items = []
      day.items.push(res.data)
    }
  }

  async function updateItem(itemId: string, item: Partial<ItineraryItem>) {
    await itineraryApi.updateItem(tripId, itemId, item)
    for (const day of days.value) {
      const idx = day.items?.findIndex((i) => i.id === itemId) ?? -1
      if (idx !== -1 && day.items) {
        day.items[idx] = { ...day.items[idx], ...item }
        break
      }
    }
  }

  async function deleteItem(itemId: string) {
    await itineraryApi.deleteItem(tripId, itemId)
    for (const day of days.value) {
      if (day.items) {
        day.items = day.items.filter((i) => i.id !== itemId)
      }
    }
    // 관련 루트도 제거
    routes.value = routes.value.filter(
      (r) => r.originItineraryItemId !== itemId && r.destinationItineraryItemId !== itemId,
    )
  }

  async function createRoute(originItemId: string, destinationItemId: string, mode: string) {
    const res = await itineraryApi.createRoute(tripId, originItemId, destinationItemId, mode)
    routes.value.push(res.data)
  }

  async function deleteRoute(routeId: string) {
    await itineraryApi.deleteRoute(tripId, routeId)
    routes.value = routes.value.filter((r) => r.id !== routeId)
  }

  return {
    days, routes, loading, allItems,
    getItemsByDay, getRouteBetween,
    fetchItinerary, putItinerary,
    addItem, updateItem, deleteItem,
    createRoute, deleteRoute,
  }
}
