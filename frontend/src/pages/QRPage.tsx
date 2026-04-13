/**
 * QR Page — /qr/:token
 *
 * Shown to the attendee.  Displays their QR code and current check-in status.
 * The QR image encodes the full URL of THIS page so staff can scan it with
 * any standard QR reader; the scanner page calls /checkin directly.
 */

import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { getUserByToken } from '@/api/client'
import type { User } from '@/types'
import LoadingSpinner from '@/components/LoadingSpinner'
import StatusBadge from '@/components/StatusBadge'

export default function QRPage() {
  const { token } = useParams<{ token: string }>()
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // The QR code encodes this exact page URL
  const qrValue = window.location.href

  useEffect(() => {
    if (!token) return
    getUserByToken(token)
      .then((u) => {
        setUser(u)
        if (!u) setError('QR code not found or has been revoked.')
      })
      .catch(() => setError('Unable to load your ticket. Please try again.'))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <LoadingSpinner size="lg" label="Loading your ticket…" />
      </div>
    )
  }

  if (error || !user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] px-4 text-center">
        <div className="text-5xl mb-4" aria-hidden="true">❌</div>
        <h2 className="text-xl font-semibold text-red-700 mb-2">Invalid QR Code</h2>
        <p className="text-gray-500">{error ?? 'This QR code is not valid.'}</p>
      </div>
    )
  }

  const alreadyCheckedIn = user.checked_in

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] px-4 py-10">
      <div className="card w-full max-w-sm text-center flex flex-col items-center gap-5">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{user.name}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{user.phone}</p>
        </div>

        {/* Status badge */}
        {alreadyCheckedIn ? (
          <StatusBadge variant="success" label="Checked In" icon="✅" />
        ) : (
          <StatusBadge variant="warning" label="Not Yet Checked In" icon="⏳" />
        )}

        {/* QR code */}
        {!alreadyCheckedIn ? (
          <div className="p-4 bg-white rounded-xl border-2 border-gray-100 shadow-inner">
            <QRCodeSVG
              value={qrValue}
              size={220}
              level="H"
              includeMargin
              bgColor="#ffffff"
              fgColor="#111827"
            />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-6">
            <span className="text-6xl" aria-hidden="true">✅</span>
            <p className="text-green-700 font-medium">You're all checked in!</p>
            {user.checked_in_at && (
              <p className="text-sm text-gray-400">
                {new Date(user.checked_in_at).toLocaleString()}
              </p>
            )}
          </div>
        )}

        {/* Instruction */}
        {!alreadyCheckedIn && (
          <p className="text-sm text-gray-400">
            Show this QR code to staff at the entrance.
          </p>
        )}
      </div>
    </div>
  )
}
