import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  PageMeta,
  TripCreateRequest,
  TripDetail,
  TripFilter,
  TripListParams,
  TripMember,
  TripSummary,
} from '@/types/trip'
import { tripApi } from '@/api/trip.api'

export const useTripStore = defineStore('trip', () => {
  const currentTrip = ref<TripDetail | null>(null)
  const trips = ref<TripSummary[]>([])
  const page = ref<PageMeta | null>(null)
  const members = ref<TripMember[]>([])
  const loading = ref(false)
  const creating = ref(false)
  const error = ref<string | null>(null)
  const filter = ref<TripFilter>('all')

  async function fetchTrips(params?: TripListParams) {
    loading.value = true
    error.value = null
    try {
      const result = await tripApi.getTrips(params)
      trips.value = result.items
      page.value = result.page
    } catch (cause) {
      error.value = '여행 목록을 불러오지 못했습니다.'
      throw cause
    } finally {
      loading.value = false
    }
  }

  function setCurrentTrip(trip: TripDetail) {
    currentTrip.value = trip
  }

  async function fetchTrip(tripId: string) {
    currentTrip.value = await tripApi.getTrip(tripId)
  }

  async function createTrip(data: TripCreateRequest) {
    creating.value = true
    try {
      const created = await tripApi.createTrip(data)
      trips.value.unshift(created)
      return created
    } finally {
      creating.value = false
    }
  }

  async function fetchMembers(tripId: string) {
    const res = await tripApi.getMembers(tripId)
    members.value = res.data
  }

  return {
    currentTrip,
    trips,
    page,
    members,
    loading,
    creating,
    error,
    filter,
    fetchTrips,
    setCurrentTrip,
    fetchTrip,
    createTrip,
    fetchMembers,
  }
})
