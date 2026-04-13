/**
 * Scanner Page - /scanner
 *
 * Staff-facing page. The camera detects a QR token, pauses the live feed,
 * shows participant details in an overlay, and waits for explicit staff
 * confirmation before completing check-in.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import { checkin, getUserByToken } from '@/api/client'
import StatusBadge from '@/components/StatusBadge'
import type { CheckinStatus, User } from '@/types'

const SCANNER_ELEMENT_ID = 'qr-scanner-viewport'

interface PreviewState {
  token: string
  user: User | null
  error: string | null
}

interface ScanResult {
  status: CheckinStatus
  message: string
  user: User | null
}

const resultStyles: Record<CheckinStatus, string> = {
  success: 'border-green-200 bg-green-50 text-green-800',
  already_checked: 'border-yellow-200 bg-yellow-50 text-yellow-800',
  invalid: 'border-red-200 bg-red-50 text-red-800',
}

const resultTitles: Record<CheckinStatus, string> = {
  success: 'Check-in Complete',
  already_checked: 'Already Checked In',
  invalid: 'Invalid QR',
}

function extractToken(raw: string): string {
  try {
    const url = new URL(raw)
    const parts = url.pathname.split('/')
    const idx = parts.indexOf('qr')
    if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
  } catch {
    // Raw value is not a URL, so treat it as the token itself.
  }

  return raw.trim()
}

export default function ScannerPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scanLockedRef = useRef(false)

  const [scanning, setScanning] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)

  const pauseScanner = useCallback(() => {
    const scanner = scannerRef.current
    if (!scanner) return

    if (scanner.getState() === Html5QrcodeScannerState.SCANNING) {
      scanner.pause(true)
    }
  }, [])

  const resumeScanner = useCallback(() => {
    const scanner = scannerRef.current
    if (!scanner) return

    if (scanner.getState() === Html5QrcodeScannerState.PAUSED) {
      scanner.resume()
    }
  }, [])

  const clearOverlay = useCallback(() => {
    setPreview(null)
    setPreviewLoading(false)
    setConfirming(false)
    setResult(null)
    scanLockedRef.current = false
    resumeScanner()
  }, [resumeScanner])

  const handleScan = useCallback(async (decodedText: string) => {
    const token = extractToken(decodedText)
    if (!token || scanLockedRef.current) return

    scanLockedRef.current = true
    setResult(null)
    setPreview({ token, user: null, error: null })
    setPreviewLoading(true)
    pauseScanner()

    try {
      const user = await getUserByToken(token)
      if (!user) {
        setPreview({
          token,
          user: null,
          error: 'This QR code is invalid or has been revoked.',
        })
        return
      }

      setPreview({
        token,
        user,
        error: null,
      })
    } catch (err: unknown) {
      setPreview({
        token,
        user: null,
        error: err instanceof Error ? err.message : 'Unable to read ticket details.',
      })
    } finally {
      setPreviewLoading(false)
    }
  }, [pauseScanner])

  const startScanner = useCallback(async () => {
    setCameraError(null)
    setPreview(null)
    setPreviewLoading(false)
    setConfirming(false)
    setResult(null)
    scanLockedRef.current = false

    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(SCANNER_ELEMENT_ID)
    }

    try {
      await scannerRef.current.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScan,
        () => { /* Ignore non-QR frames. */ },
      )
      setScanning(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setCameraError(`Camera error: ${msg}`)
    }
  }, [handleScan])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    if (!scanner) {
      setScanning(false)
      return
    }

    const state = scanner.getState()
    if (
      state === Html5QrcodeScannerState.SCANNING ||
      state === Html5QrcodeScannerState.PAUSED
    ) {
      await scanner.stop()
    }

    scanLockedRef.current = false
    setPreview(null)
    setPreviewLoading(false)
    setConfirming(false)
    setResult(null)
    setScanning(false)
  }, [])

  useEffect(() => {
    return () => {
      void stopScanner()
    }
  }, [stopScanner])

  const confirmCheckin = useCallback(async () => {
    if (!preview?.token) return

    setConfirming(true)
    try {
      const res = await checkin(preview.token)
      setResult({
        status: res.status,
        message: res.message,
        user: res.user,
      })
      setPreview(null)
    } catch (err: unknown) {
      setResult({
        status: 'invalid',
        message: err instanceof Error ? err.message : 'Network error',
        user: preview.user,
      })
      setPreview(null)
    } finally {
      setConfirming(false)
    }
  }, [preview])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">QR Scanner</h1>
        <p className="mt-1 text-sm text-gray-500">
          Point the camera at a QR code, review the attendee, then confirm.
        </p>
      </div>

      <div className="relative w-full overflow-hidden rounded-[28px] border border-slate-200 bg-slate-950 shadow-sm">
        <div className="aspect-[3/4] min-h-[360px] w-full">
          <div id={SCANNER_ELEMENT_ID} className="h-full w-full" />
        </div>

        {!scanning && !cameraError && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80">
            <div className="text-center text-slate-300">
              <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-400">
                Scanner Idle
              </p>
              <p className="mt-3 text-sm text-slate-300/80">
                Start the camera to begin scanning tickets.
              </p>
            </div>
          </div>
        )}

        {scanning && !preview && !previewLoading && !result && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="relative h-64 w-64 rounded-[2rem] border-2 border-white/90 shadow-[0_0_0_9999px_rgba(2,6,23,0.45)]">
              <div className="absolute inset-x-6 top-0 h-px bg-cyan-300/80" />
              <div className="absolute inset-x-6 bottom-0 h-px bg-cyan-300/80" />
            </div>
          </div>
        )}

        {(previewLoading || preview || result) && (
          <div className="absolute inset-0 z-10 flex items-end bg-slate-950/62 p-4">
            <div className="w-full rounded-3xl border border-white/20 bg-white/96 p-5 shadow-2xl backdrop-blur">
              {previewLoading && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                    Ticket Detected
                  </p>
                  <h2 className="text-xl font-bold text-slate-900">Loading attendee details</h2>
                  <p className="text-sm text-slate-600">
                    Hold steady while we verify the QR token.
                  </p>
                </div>
              )}

              {!previewLoading && preview && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                      Attendee Preview
                    </p>
                    {preview.error ? (
                      <>
                        <h2 className="text-xl font-bold text-slate-900">Ticket not recognized</h2>
                        <p className="text-sm text-slate-600">{preview.error}</p>
                      </>
                    ) : (
                      <>
                        <h2 className="text-2xl font-bold text-slate-900">
                          {preview.user?.name}
                        </h2>
                        <p className="text-sm text-slate-500">{preview.user?.phone}</p>
                      </>
                    )}
                  </div>

                  {preview.user && (
                    <div className="flex flex-wrap gap-2">
                      <StatusBadge
                        variant={preview.user.payment_status === 'paid' ? 'success' : 'warning'}
                        label={preview.user.payment_status === 'paid' ? 'Paid' : 'Pending'}
                      />
                      <StatusBadge
                        variant={preview.user.checked_in ? 'warning' : 'neutral'}
                        label={preview.user.checked_in ? 'Already checked in' : 'Not checked in'}
                      />
                    </div>
                  )}

                  <div className="flex gap-3">
                    {preview.user && (
                      <button
                        onClick={confirmCheckin}
                        disabled={confirming}
                        className="btn-primary flex-1 py-3 text-base"
                      >
                        {confirming ? 'Confirming...' : 'Confirm Check-in'}
                      </button>
                    )}
                    <button
                      onClick={clearOverlay}
                      disabled={confirming}
                      className="btn-ghost flex-1 py-3 text-base"
                    >
                      Scan Next
                    </button>
                  </div>
                </div>
              )}

              {!previewLoading && result && (
                <div className={`space-y-4 rounded-2xl border p-4 ${resultStyles[result.status]}`}>
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-70">
                      Scan Result
                    </p>
                    <h2 className="text-xl font-bold">{resultTitles[result.status]}</h2>
                    {result.user?.name && (
                      <p className="text-base font-semibold">{result.user.name}</p>
                    )}
                    {result.user?.phone && (
                      <p className="text-sm opacity-80">{result.user.phone}</p>
                    )}
                    <p className="text-sm leading-relaxed">{result.message}</p>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={clearOverlay} className="btn-ghost">
                      Continue Scanning
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {cameraError && (
        <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {cameraError}
        </div>
      )}

      <div className="flex w-full gap-3">
        {!scanning ? (
          <button onClick={startScanner} className="btn-primary flex-1 py-3 text-base">
            Start Camera
          </button>
        ) : (
          <button onClick={stopScanner} className="btn-ghost flex-1 py-3 text-base">
            Stop Camera
          </button>
        )}
      </div>
    </div>
  )
}
