import { computed, ref } from 'vue'
import { itineraryApi } from '@/api/itinerary.api'
import type {
  CreateItineraryDayInput,
  CreateItineraryItemInput,
  ItineraryDay,
  ItineraryItem,
  ItineraryMutationResponse,
  MapDrawing,
  TripRoute,
  UpdateItineraryDayInput,
  UpdateItineraryItemInput,
} from '@/types/itinerary'

export function useItinerary(tripId: string) {
  const itineraryVersion = ref(0)
  const days = ref<ItineraryDay[]>([])
  const routes = ref<TripRoute[]>([])
  const mapDrawings = ref<MapDrawing[]>([])
  const loading = ref(false)
  const mutating = ref(false)
  const error = ref<string | null>(null)

  const allItems = computed(() => days.value.flatMap((day) => day.items))
  const unscheduledDay = computed(() => days.value.find((day) => day.groupType === 'UNSCHEDULED') ?? null)

  function getItemsByDay(dayId: string) {
    return days.value.find((day) => day.id === dayId)?.items ?? []
  }

  function applyMutation(response: ItineraryMutationResponse) {
    itineraryVersion.value = response.itineraryVersion
    if (response.affectedRouteIds.length > 0) {
      const affectedIds = new Set(response.affectedRouteIds)
      routes.value = routes.value.filter((route) => !affectedIds.has(route.id))
    }
  }

  function upsertDay(day: ItineraryDay) {
    const index = days.value.findIndex((current) => current.id === day.id)
    if (index < 0) {
      days.value.push(day)
    } else {
      const existingItems = days.value[index].items
      days.value[index] = { ...day, items: day.items.length > 0 ? day.items : existingItems }
    }
    days.value.sort((left, right) => left.sortOrder - right.sortOrder)
  }

  function upsertItem(item: ItineraryItem) {
    for (const day of days.value) {
      day.items = day.items.filter((current) => current.id !== item.id)
    }
    const targetDay = days.value.find((day) => day.id === item.itineraryDayId)
    if (!targetDay) throw new Error('Itinerary day not found for item.')
    targetDay.items.push(item)
    targetDay.items.sort((left, right) => left.sortOrder - right.sortOrder)
  }

  async function runMutation<T>(operation: () => Promise<T>) {
    mutating.value = true
    error.value = null
    try {
      return await operation()
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '일정을 변경하지 못했습니다.'
      throw cause
    } finally {
      mutating.value = false
    }
  }

  async function fetchItinerary() {
    loading.value = true
    error.value = null
    try {
      const itinerary = await itineraryApi.getItinerary(tripId)
      itineraryVersion.value = itinerary.itineraryVersion
      days.value = itinerary.days
      routes.value = itinerary.routes
      mapDrawings.value = itinerary.mapDrawings
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '일정을 불러오지 못했습니다.'
      throw cause
    } finally {
      loading.value = false
    }
  }

  async function createDay(input: CreateItineraryDayInput) {
    return runMutation(async () => {
      const response = await itineraryApi.createDay(tripId, {
        ...input,
        baseVersion: itineraryVersion.value,
      })
      applyMutation(response)
      if (!response.day) throw new Error('Created itinerary day is missing.')
      upsertDay(response.day)
      return response.day
    })
  }

  async function ensureUnscheduledDay() {
    if (unscheduledDay.value) return unscheduledDay.value
    const nextSortOrder = days.value.reduce((maximum, day) => Math.max(maximum, day.sortOrder), -1) + 1
    return createDay({
      groupType: 'UNSCHEDULED',
      dayNumber: null,
      date: null,
      sortOrder: nextSortOrder,
    })
  }

  async function updateDay(dayId: string, input: UpdateItineraryDayInput) {
    return runMutation(async () => {
      const response = await itineraryApi.updateDay(tripId, dayId, {
        ...input,
        baseVersion: itineraryVersion.value,
      })
      applyMutation(response)
      if (!response.day) throw new Error('Updated itinerary day is missing.')
      upsertDay(response.day)
      return response.day
    })
  }

  async function deleteDay(dayId: string) {
    return runMutation(async () => {
      const response = await itineraryApi.deleteDay(tripId, dayId, itineraryVersion.value)
      applyMutation(response)
      days.value = days.value.filter((day) => day.id !== dayId)
    })
  }

  async function createItem(input: CreateItineraryItemInput) {
    return runMutation(async () => {
      const response = await itineraryApi.createItem(tripId, {
        ...input,
        baseVersion: itineraryVersion.value,
      })
      applyMutation(response)
      if (!response.item) throw new Error('Created itinerary item is missing.')
      upsertItem(response.item)
      return response.item
    })
  }

  async function updateItem(itemId: string, input: UpdateItineraryItemInput) {
    return runMutation(async () => {
      const response = await itineraryApi.updateItem(tripId, itemId, {
        ...input,
        baseVersion: itineraryVersion.value,
      })
      applyMutation(response)
      if (!response.item) throw new Error('Updated itinerary item is missing.')
      upsertItem(response.item)
      return response.item
    })
  }

  async function deleteItem(itemId: string) {
    return runMutation(async () => {
      const response = await itineraryApi.deleteItem(tripId, itemId, itineraryVersion.value)
      applyMutation(response)
      for (const day of days.value) {
        day.items = day.items.filter((item) => item.id !== itemId)
      }
    })
  }

  return {
    itineraryVersion,
    days,
    routes,
    mapDrawings,
    loading,
    mutating,
    error,
    allItems,
    unscheduledDay,
    getItemsByDay,
    fetchItinerary,
    createDay,
    ensureUnscheduledDay,
    updateDay,
    deleteDay,
    createItem,
    updateItem,
    deleteItem,
  }
}
