import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Trip, TripMember, TripFilter } from '@/types/trip'
import { tripApi } from '@/api/trip.api'

export const useTripStore = defineStore('trip', () => {
  const currentTrip = ref<Trip | null>(null)
  const trips = ref<Trip[]>([])
  const members = ref<TripMember[]>([])
  const loading = ref(false)
  const filter = ref<TripFilter>('all')

  async function fetchTrips() {
    loading.value = true
    try {
      const res = await tripApi.getTrips()
      trips.value = res.data.content
    } finally {
      loading.value = false
    }
  }

  function setCurrentTrip(trip: Trip) {
    currentTrip.value = trip
  }

  async function fetchTrip(tripId: string) {
    const res = await tripApi.getTrip(tripId)
    currentTrip.value = res.data
  }

  async function createTrip(title: string, displayDestination?: string) {
    const res = await tripApi.createTrip({ title, displayDestination })
    trips.value.unshift(res.data)
    return res.data
  }

  async function fetchMembers(tripId: string) {
    const res = await tripApi.getMembers(tripId)
    members.value = res.data
  }

  return { currentTrip, trips, members, loading, filter, fetchTrips, setCurrentTrip, fetchTrip, createTrip, fetchMembers }
})
