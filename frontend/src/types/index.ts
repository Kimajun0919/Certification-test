/**
 * Shared TypeScript types — mirrors the backend Pydantic models exactly.
 * Keep in sync with backend/models.py.
 */

export type PaymentStatus = 'pending' | 'paid'

export interface User {
  id: string
  name: string
  phone: string
  payment_status: PaymentStatus
  qr_token: string | null
  checked_in: boolean
  checked_in_at: string | null  // ISO-8601 datetime or null
  qr_url: string | null         // populated by the backend router
}

export interface GenerateQRResponse {
  user_id: string
  qr_token: string
  qr_url: string
}

export type CheckinStatus = 'success' | 'already_checked' | 'invalid'

export interface CheckinResponse {
  status: CheckinStatus
  message: string
  user: User | null
}

export interface ApiError {
  detail: string
}
