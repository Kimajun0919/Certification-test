/**
 * Centralised API client.
 *
 * All requests go through this module so the base URL and error handling
 * are managed in one place.  The Vite dev-server proxies /api/* to
 * http://localhost:8000 (see vite.config.ts), so we use /api as the
 * base in development and the real URL in production via VITE_API_URL.
 */

import axios, { AxiosError } from 'axios'
import type {
  CheckinResponse,
  GenerateQRResponse,
  PaymentStatus,
  User,
} from '@/types'

// ---------------------------------------------------------------------------
// Axios instance
// ---------------------------------------------------------------------------

const BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const http = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
})

// Intercept responses to normalise error messages
http.interceptors.response.use(
  (res) => res,
  (err: AxiosError<{ detail: string }>) => {
    const message =
      err.response?.data?.detail ??
      err.message ??
      'An unexpected error occurred'
    return Promise.reject(new Error(message))
  },
)

// ---------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------

/** Fetch all participants (admin dashboard). */
export async function getUsers(): Promise<User[]> {
  const { data } = await http.get<User[]>('/users')
  return data
}

/** Fetch a single user by ID. */
export async function getUser(userId: string): Promise<User> {
  const { data } = await http.get<User>(`/users/${userId}`)
  return data
}

/** Register a new participant. */
export async function createUser(name: string, phone: string): Promise<User> {
  const { data } = await http.post<User>('/users', { name, phone })
  return data
}

/** Toggle payment status for a participant. */
export async function updatePayment(
  userId: string,
  payment_status: PaymentStatus,
): Promise<User> {
  const { data } = await http.patch<User>(`/users/${userId}/payment`, {
    payment_status,
  })
  return data
}

/** Cancel attendance for a participant without changing payment or QR. */
export async function cancelCheckin(userId: string): Promise<User> {
  try {
    const { data } = await http.delete<User>(`/users/${userId}/checkin`)
    return data
  } catch (err: unknown) {
    if (err instanceof Error && err.message === 'Not Found') {
      throw new Error(
        'Cancel check-in is not available on the deployed backend yet. Redeploy the backend service.',
      )
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// QR generation
// ---------------------------------------------------------------------------

/** Generate (or retrieve existing) QR token + URL for a paid user. */
export async function generateQR(userId: string): Promise<GenerateQRResponse> {
  const { data } = await http.post<GenerateQRResponse>('/generate-qr', {
    user_id: userId,
  })
  return data
}

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

/** Validate a QR token and record attendance. */
export async function checkin(qr_token: string): Promise<CheckinResponse> {
  const { data } = await http.post<CheckinResponse>('/checkin', { qr_token })
  return data
}

// ---------------------------------------------------------------------------
// QR page (public) — fetch user by token without auth
// ---------------------------------------------------------------------------

export async function getUserByToken(token: string): Promise<User | null> {
  try {
    const { data } = await http.get<User>(`/users/token/${encodeURIComponent(token)}`)
    return data
  } catch (err: unknown) {
    if (err instanceof Error) {
      if (err.message === 'QR code not found or has been revoked.') {
        const users = await getUsers()
        return users.find((u) => u.qr_token === token) ?? null
      }
      if (err.message === 'Not Found') {
        const users = await getUsers()
        return users.find((u) => u.qr_token === token) ?? null
      }
    }
    throw err
  }
}
