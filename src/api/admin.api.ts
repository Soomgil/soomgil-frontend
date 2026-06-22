import http from './http'
import type { PagedItems } from '@/types/api'
import type {
  ContentReport,
  ModerationAction,
  ModerationActionType,
  ReportStatus,
  ResolveReportRequest,
} from '@/types/community'

export const adminApi = {
  async getReports(status?: ReportStatus, page = 0, size = 20): Promise<PagedItems<ContentReport>> {
    const response = await http.get<PagedItems<ContentReport>>('/moderation/reports', {
      params: { status, page, size },
    })
    return response.data
  },

  async resolveReport(reportId: string, request: ResolveReportRequest): Promise<ContentReport> {
    const response = await http.patch<ContentReport>(`/moderation/reports/${reportId}`, request)
    return response.data
  },

  async getActions(page = 0, size = 20): Promise<PagedItems<ModerationAction>> {
    const response = await http.get<PagedItems<ModerationAction>>('/moderation/actions', { params: { page, size } })
    return response.data
  },

  async createAction(request: {
    targetType: 'POST' | 'POST_COMMENT'
    targetId: string
    action: ModerationActionType
    moderationReason?: string | null
  }): Promise<ModerationAction> {
    const response = await http.post<ModerationAction>('/moderation/actions', request)
    return response.data
  },
}
