/* ── Success Response ── */
export interface ApiResponse<T> {
  status: number
  message: string
  data: T
}

/* ── Paginated Response ── */
export interface PaginatedResponse<T> {
  content: T[]
  totalPages: number
  totalElements: number
  page: number
  size: number
}

/* ── RFC 7807 Problem Detail ── */
export interface ProblemDetail {
  type: string
  title: string
  status: number
  detail: string | null
  instance: string | null
  properties?: Record<string, unknown>
}

/* ── Pagination Params ── */
export interface PaginationParams {
  page?: number
  size?: number
  sort?: string
}
