/**
 * Scanner Page — /scanner
 *
 * Staff-facing page.  Uses the device camera to scan QR codes and calls
 * POST /checkin.  Optimised for mobile use.
 *
 * Library: html5-qrcode (wraps ZXing under the hood).
 * The scanner is started lazily and cleaned up on unmount.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Html5Qrcode, Html5QrcodeScannerState } from 'html5-qrcode'
import { checkin } from '@/api/client'
import type { CheckinResponse, CheckinStatus } from '@/types'

// Unique element ID required by html5-qrcode
const SCANNER_ELEMENT_ID = 'qr-scanner-viewport'

interface ScanResult {
  status: CheckinStatus
  message: string
  name?: string
}

const resultStyles: Record<CheckinStatus, string> = {
  success:        'bg-green-50 border-green-200 text-green-800',
  already_checked: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  invalid:        'bg-red-50 border-red-200 text-red-800',
}
const resultIcons: Record<CheckinStatus, string> = {
  success:        '✅',
  already_checked: '⚠️',
  invalid:        '❌',
}

export default function ScannerPage() {
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [processingToken, setProcessingToken] = useState<string | null>(null)
  const [cameraError, setCameraError] = useState<string | null>(null)

  // ------------------------------------------------------------------
  // Extract token from a QR value.
  // The QR encodes the full page URL: http://host/qr/<token>
  // Fall back to using the raw value as token.
  // ------------------------------------------------------------------
  const extractToken = (raw: string): string => {
    try {
      const url = new URL(raw)
      const parts = url.pathname.split('/')
      const idx = parts.indexOf('qr')
      if (idx !== -1 && parts[idx + 1]) return parts[idx + 1]
    } catch {
      // raw value is not a URL — treat as plain token
    }
    return raw.trim()
  }

  // ------------------------------------------------------------------
  // Handle a scanned QR value — called by html5-qrcode on decode
  // ------------------------------------------------------------------
  const handleScan = useCallback(async (decodedText: string) => {
    const token = extractToken(decodedText)

    // Debounce: ignore repeats of the same token while a request is in flight
    if (processingToken === token) return
    setProcessingToken(token)

    try {
      const res: CheckinResponse = await checkin(token)
      setResult({
        status: res.status,
        message: res.message,
        name: res.user?.name,
      })
    } catch (err: unknown) {
      setResult({
        status: 'invalid',
        message: err instanceof Error ? err.message : 'Network error',
      })
    } finally {
      // Allow re-scan of the same token after 3 s
      setTimeout(() => setProcessingToken(null), 3000)
    }
  }, [processingToken])

  // ------------------------------------------------------------------
  // Start / stop camera
  // ------------------------------------------------------------------
  const startScanner = useCallback(async () => {
    setCameraError(null)
    setResult(null)

    if (!scannerRef.current) {
      scannerRef.current = new Html5Qrcode(SCANNER_ELEMENT_ID)
    }

    try {
      await scannerRef.current.start(
        { facingMode: 'environment' },   // rear camera on mobile
        { fps: 10, qrbox: { width: 250, height: 250 } },
        handleScan,
        () => { /* ignore non-QR frames */ },
      )
      setScanning(true)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setCameraError(`Camera error: ${msg}`)
    }
  }, [handleScan])

  const stopScanner = useCallback(async () => {
    if (
      scannerRef.current &&
      scannerRef.current.getState() === Html5QrcodeScannerState.SCANNING
    ) {
      await scannerRef.current.stop()
    }
    setScanning(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopScanner()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resetResult = () => {
    setResult(null)
    setProcessingToken(null)
  }

  return (
    <div className="flex flex-col items-center px-4 py-8 max-w-md mx-auto gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-gray-900">QR Scanner</h1>
        <p className="text-sm text-gray-500 mt-1">Point camera at attendee's QR code</p>
      </div>

      {/* Camera viewport — html5-qrcode renders into this div */}
      <div className="w-full rounded-2xl overflow-hidden border-2 border-gray-200 bg-black min-h-[300px] flex items-center justify-center">
        <div id={SCANNER_ELEMENT_ID} className="w-full" />
        {!scanning && !cameraError && (
          <p className="text-gray-400 text-sm absolute">Camera off</p>
        )}
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="w-full rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {cameraError}
        </div>
      )}

      {/* Start / Stop button */}
      <div className="flex gap-3 w-full">
        {!scanning ? (
          <button onClick={startScanner} className="btn-primary flex-1 py-3 text-base">
            📷 Start Camera
          </button>
        ) : (
          <button onClick={stopScanner} className="btn-ghost flex-1 py-3 text-base">
            ⏹ Stop Camera
          </button>
        )}
      </div>

      {/* Check-in result */}
      {result && (
        <div
          className={`w-full rounded-xl border p-5 flex flex-col gap-2 ${resultStyles[result.status]}`}
          role="alert"
        >
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden="true">{resultIcons[result.status]}</span>
            <div>
              {result.name && (
                <p className="font-bold text-lg leading-tight">{result.name}</p>
              )}
              <p className="text-sm leading-snug">{result.message}</p>
            </div>
          </div>
          <button
            onClick={resetResult}
            className="mt-1 self-end text-xs underline opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Processing indicator */}
      {processingToken && !result && (
        <p className="text-sm text-blue-600 animate-pulse">Validating ticket…</p>
      )}
    </div>
  )
}
