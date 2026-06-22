import type { AiMessageResponse } from '@/types/ai'

export interface AiRefreshTargets {
  itinerary: boolean
  note: boolean
  checklist: boolean
}

export function getAiRefreshTargets(
  response: AiMessageResponse,
  currentItineraryVersion: number | null,
): AiRefreshTargets {
  const successfulTools = response.toolCalls
    .filter((call) => call.status === 'SUCCEEDED')
    .map((call) => call.toolName)

  return {
    itinerary: successfulTools.some((name) => (
      name === 'addPlaceToItinerary' || name === 'moveItineraryItem'
    )) || (
      response.itineraryVersion != null
      && response.itineraryVersion !== currentItineraryVersion
    ),
    note: successfulTools.includes('upsertNote'),
    checklist: successfulTools.some((name) => (
      name === 'upsertChecklist' || name === 'addChecklistItem'
    )),
  }
}
