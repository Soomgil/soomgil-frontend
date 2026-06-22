import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type {
  PageMeta,
  TripCreateRequest,
  TripDetail,
  TripDetailMember,
  TripFilter,
  TripInvite,
  TripListParams,
  TripSummary,
  TripUpdateRequest,
} from '@/types/trip'
import { tripApi } from '@/api/trip.api'

export const useTripStore = defineStore('trip', () => {
  let listRequestSequence = 0
  let loadMoreRequestSequence = 0
  const currentTrip = ref<TripDetail | null>(null)
  const trips = ref<TripSummary[]>([])
  const page = ref<PageMeta | null>(null)
  const listParams = ref<TripListParams>({})
  const members = ref<TripDetailMember[]>([])
  const invites = ref<TripInvite[]>([])
  const loading = ref(false)
  const loadingMore = ref(false)
  const creating = ref(false)
  const mutating = ref(false)
  const acceptingInvite = ref(false)
  const accessLoading = ref(false)
  const error = ref<string | null>(null)
  const loadMoreError = ref<string | null>(null)
  const accessError = ref<string | null>(null)
  const filter = ref<TripFilter>('all')
  const hasMoreTrips = computed(() => Boolean(page.value && page.value.page + 1 < page.value.totalPages))

  async function fetchTrips(params?: TripListParams) {
    const requestId = ++listRequestSequence
    loadMoreRequestSequence += 1
    const requestParams = { ...params, page: params?.page ?? 0 }
    loading.value = true
    loadingMore.value = false
    error.value = null
    loadMoreError.value = null
    listParams.value = requestParams
    try {
      const result = await tripApi.getTrips(requestParams)
      if (requestId !== listRequestSequence) return
      trips.value = result.items
      page.value = result.page
    } catch (cause) {
      if (requestId !== listRequestSequence) return
      error.value = '여행 목록을 불러오지 못했습니다.'
      throw cause
    } finally {
      if (requestId === listRequestSequence) loading.value = false
    }
  }

  async function fetchNextPage() {
    if (!hasMoreTrips.value || loadingMore.value || !page.value) return

    const requestId = listRequestSequence
    const loadMoreRequestId = ++loadMoreRequestSequence
    loadingMore.value = true
    loadMoreError.value = null
    try {
      const nextParams = { ...listParams.value, page: page.value.page + 1 }
      const result = await tripApi.getTrips(nextParams)
      if (requestId !== listRequestSequence || loadMoreRequestId !== loadMoreRequestSequence) return
      const knownIds = new Set(trips.value.map((trip) => trip.id))
      trips.value.push(...result.items.filter((trip) => !knownIds.has(trip.id)))
      page.value = result.page
      listParams.value = nextParams
    } catch {
      if (requestId === listRequestSequence && loadMoreRequestId === loadMoreRequestSequence) {
        loadMoreError.value = '다음 여행을 불러오지 못했습니다.'
      }
    } finally {
      if (requestId === listRequestSequence && loadMoreRequestId === loadMoreRequestSequence) {
        loadingMore.value = false
      }
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
      const matchesCurrentStatus = !listParams.value.status || listParams.value.status === created.status
      if (matchesCurrentStatus) trips.value.unshift(created)
      await syncFirstPageAfterMutation()
      return created
    } finally {
      creating.value = false
    }
  }

  async function fetchTripAccess(tripId: string, canManageInvites: boolean) {
    accessLoading.value = true
    accessError.value = null
    try {
      const [memberResult, inviteResult] = await Promise.all([
        tripApi.getMembers(tripId),
        canManageInvites ? tripApi.getInvites(tripId) : Promise.resolve([]),
      ])
      members.value = memberResult
      invites.value = inviteResult
    } catch (cause) {
      accessError.value = '멤버와 초대 정보를 불러오지 못했습니다.'
      throw cause
    } finally {
      accessLoading.value = false
    }
  }

  async function updateTrip(tripId: string, data: TripUpdateRequest) {
    mutating.value = true
    try {
      const updated = await tripApi.updateTrip(tripId, data)
      const index = trips.value.findIndex((trip) => trip.id === tripId)
      const matchesCurrentStatus = !listParams.value.status || listParams.value.status === updated.status
      if (index >= 0 && matchesCurrentStatus) {
        trips.value[index] = updated
      } else if (index >= 0) {
        trips.value.splice(index, 1)
        await syncFirstPageAfterMutation()
      }
      if (currentTrip.value?.id === tripId) currentTrip.value = updated
      return updated
    } finally {
      mutating.value = false
    }
  }

  async function deleteTrip(tripId: string) {
    mutating.value = true
    try {
      await tripApi.deleteTrip(tripId)
      trips.value = trips.value.filter((trip) => trip.id !== tripId)
      if (currentTrip.value?.id === tripId) currentTrip.value = null
      await syncFirstPageAfterMutation()
    } finally {
      mutating.value = false
    }
  }

  async function syncFirstPageAfterMutation() {
    const requestId = ++listRequestSequence
    loadMoreRequestSequence += 1
    const requestParams = { ...listParams.value, page: 0 }
    loadingMore.value = false
    loadMoreError.value = null
    listParams.value = requestParams
    try {
      const result = await tripApi.getTrips(requestParams)
      if (requestId !== listRequestSequence) return
      trips.value = result.items
      page.value = result.page
      error.value = null
    } catch {
      if (requestId === listRequestSequence) {
        error.value = '변경된 여행 목록을 다시 불러오지 못했습니다.'
      }
    }
  }

  async function createInvite(tripId: string) {
    const invite = await tripApi.createInvite(tripId)
    invites.value.unshift(invite)
    return invite
  }

  async function revokeInvite(tripId: string, inviteId: string) {
    await tripApi.revokeInvite(tripId, inviteId)
    invites.value = invites.value.filter((invite) => invite.id !== inviteId)
  }

  async function removeMember(tripId: string, userId: string) {
    await tripApi.removeMember(tripId, userId)
    members.value = members.value.filter((member) => member.user.id !== userId)
  }

  async function acceptInvite(inviteCode: string) {
    acceptingInvite.value = true
    try {
      const acceptedTrip = await tripApi.acceptInvite(inviteCode)
      currentTrip.value = acceptedTrip
      const index = trips.value.findIndex((trip) => trip.id === acceptedTrip.id)
      if (index >= 0) trips.value[index] = acceptedTrip
      else trips.value.unshift(acceptedTrip)
      return acceptedTrip
    } finally {
      acceptingInvite.value = false
    }
  }

  return {
    currentTrip,
    trips,
    page,
    members,
    invites,
    loading,
    loadingMore,
    creating,
    mutating,
    acceptingInvite,
    accessLoading,
    error,
    loadMoreError,
    accessError,
    filter,
    hasMoreTrips,
    fetchTrips,
    fetchNextPage,
    setCurrentTrip,
    fetchTrip,
    createTrip,
    updateTrip,
    deleteTrip,
    fetchTripAccess,
    createInvite,
    revokeInvite,
    removeMember,
    acceptInvite,
  }
})
