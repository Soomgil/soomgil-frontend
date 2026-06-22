import http from './http'
import type {
  Checklist,
  Note,
  PlanningMutationResponse,
  PlanningScope,
} from '@/types/planning'

export const planningApi = {
  async getNote(tripId: string, scope: PlanningScope): Promise<Note> {
    const response = await http.get<Note>(`/trips/${tripId}/planning/notes`, { params: scope })
    return response.data
  },

  async saveNote(tripId: string, scope: PlanningScope, content: string): Promise<PlanningMutationResponse> {
    const response = await http.put<PlanningMutationResponse>(`/trips/${tripId}/planning/notes`, {
      ...scope,
      content,
    })
    return response.data
  },

  async deleteNote(tripId: string, noteId: string): Promise<void> {
    await http.delete(`/trips/${tripId}/planning/notes/${noteId}`)
  },

  async getChecklists(tripId: string, scope?: Partial<PlanningScope>): Promise<Checklist[]> {
    const response = await http.get<Checklist[]>(`/trips/${tripId}/planning/checklists`, { params: scope })
    return response.data
  },

  async saveChecklist(tripId: string, scope: PlanningScope, title?: string): Promise<PlanningMutationResponse> {
    const response = await http.put<PlanningMutationResponse>(`/trips/${tripId}/planning/checklists`, {
      ...scope,
      title: title ?? null,
    })
    return response.data
  },

  async deleteChecklist(tripId: string, checklistId: string): Promise<PlanningMutationResponse> {
    const response = await http.delete<PlanningMutationResponse>(`/trips/${tripId}/planning/checklists/${checklistId}`)
    return response.data
  },

  async addChecklistItem(tripId: string, checklistId: string, content: string, sortOrder?: number): Promise<PlanningMutationResponse> {
    const response = await http.post<PlanningMutationResponse>(
      `/trips/${tripId}/planning/checklists/${checklistId}/items`,
      { content, sortOrder },
    )
    return response.data
  },

  async updateChecklistItem(
    tripId: string,
    checklistId: string,
    itemId: string,
    data: { content?: string; sortOrder?: number },
  ): Promise<PlanningMutationResponse> {
    const response = await http.patch<PlanningMutationResponse>(
      `/trips/${tripId}/planning/checklists/${checklistId}/items/${itemId}`,
      data,
    )
    return response.data
  },

  async deleteChecklistItem(tripId: string, checklistId: string, itemId: string): Promise<void> {
    await http.delete(`/trips/${tripId}/planning/checklists/${checklistId}/items/${itemId}`)
  },

  async reorderChecklistItems(
    tripId: string,
    checklistId: string,
    itemOrders: Array<{ itemId: string; sortOrder: number }>,
  ): Promise<PlanningMutationResponse> {
    const response = await http.put<PlanningMutationResponse>(
      `/trips/${tripId}/planning/checklists/${checklistId}/items/order`,
      { itemOrders },
    )
    return response.data
  },

  async updateMyItemStatus(
    tripId: string,
    checklistId: string,
    itemId: string,
    isCompleted: boolean,
  ): Promise<PlanningMutationResponse> {
    const response = await http.patch<PlanningMutationResponse>(
      `/trips/${tripId}/planning/checklists/${checklistId}/items/${itemId}/members/me`,
      { isCompleted },
    )
    return response.data
  },
}
