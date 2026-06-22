import { describe, expect, it } from 'vitest'
import { getAiRefreshTargets } from './routeBackendSync'

describe('AI tool 결과 화면 동기화', () => {
  it('성공한 일정·메모·체크리스트 도구의 화면만 갱신한다', () => {
    expect(getAiRefreshTargets({
      message: {
        id: 'assistant-1', role: 'ASSISTANT', requester: null, content: '처리했어요.',
        toolCallId: null, createdAt: '2026-06-22T00:00:00Z',
      },
      toolCalls: [
        {
          id: 'tool-1', toolName: 'addPlaceToItinerary', executionPolicy: 'REVERSIBLE_WRITE',
          status: 'SUCCEEDED', versionBefore: 3, versionAfter: 4, undoRedoAvailable: true, errorCode: null,
        },
        {
          id: 'tool-2', toolName: 'upsertNote', executionPolicy: 'REVERSIBLE_WRITE',
          status: 'SUCCEEDED', versionBefore: null, versionAfter: null, undoRedoAvailable: null, errorCode: null,
        },
        {
          id: 'tool-3', toolName: 'addChecklistItem', executionPolicy: 'REVERSIBLE_WRITE',
          status: 'SUCCEEDED', versionBefore: null, versionAfter: null, undoRedoAvailable: null, errorCode: null,
        },
      ],
      itineraryVersion: 4,
      undoAvailable: true,
      redoAvailable: false,
    }, 3)).toEqual({ itinerary: true, note: true, checklist: true })
  })
})
