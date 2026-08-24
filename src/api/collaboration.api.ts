import http from './http'

export interface CollaborationActionRequest {
  baseVersion: number
  commandEventId?: number | null
}

export interface CollaborationActionResponse {
  tripId: string
  itineraryVersion: number
  commandEventId: number | null
  undoAvailable: boolean
  redoAvailable: boolean
}

async function execute(
  tripId: string,
  action: 'undo' | 'redo',
  request: CollaborationActionRequest,
) {
  const response = await http.post<CollaborationActionResponse>(
    `/trips/${tripId}/collaboration/${action}`,
    request,
  )
  return response.data
}

export const collaborationApi = {
  undo: (tripId: string, request: CollaborationActionRequest) => execute(tripId, 'undo', request),
  redo: (tripId: string, request: CollaborationActionRequest) => execute(tripId, 'redo', request),
}
