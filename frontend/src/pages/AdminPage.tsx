/**
 * Admin Page — /admin
 *
 * Full participant table with inline actions:
 *   - Toggle payment status (pending ↔ paid)
 *   - Generate QR (only for paid users)
 *   - Copy QR URL to clipboard
 *   - Refresh list
 *
 * Mirrors the Google Sheets view exactly.
 */

import { useCallback, useEffect, useState } from 'react'
import {
  cancelCheckin,
  createUser,
  generateQR,
  getUsers,
  updatePayment,
} from '@/api/client'
import type { PaymentStatus, User } from '@/types'
import StatusBadge from '@/components/StatusBadge'
import LoadingSpinner from '@/components/LoadingSpinner'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(dt: string | null): string {
  if (!dt) return '—'
  return new Date(dt).toLocaleString()
}

// ---------------------------------------------------------------------------
// Add-user modal
// ---------------------------------------------------------------------------

interface AddUserModalProps {
  onClose: () => void
  onCreated: (user: User) => void
}

function AddUserModal({ onClose, onCreated }: AddUserModalProps) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErr(null)
    try {
      const user = await createUser(name.trim(), phone.trim())
      onCreated(user)
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : 'Failed to create user')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="card w-full max-w-sm">
        <h2 className="text-lg font-bold mb-4">Add Participant</h2>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Full name"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
            <input
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="010-0000-0000"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
          {err && <p className="text-sm text-red-600">{err}</p>}
          <div className="flex gap-3 justify-end">
            <button type="button" onClick={onClose} className="btn-ghost">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : 'Add'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row actions
// ---------------------------------------------------------------------------

interface RowActionsProps {
  user: User
  onUpdated: (user: User) => void
  onError: (message: string | null) => void
}

function RowActions({ user, onUpdated, onError }: RowActionsProps) {
  const [busy, setBusy] = useState(false)
  const [copyLabel, setCopyLabel] = useState('Copy URL')

  const togglePayment = async () => {
    setBusy(true)
    onError(null)
    try {
      const next: PaymentStatus =
        user.payment_status === 'paid' ? 'pending' : 'paid'
      const updated = await updatePayment(user.id, next)
      onUpdated(updated)
    } catch (ex: unknown) {
      onError(ex instanceof Error ? ex.message : 'Failed to update payment status')
    } finally {
      setBusy(false)
    }
  }

  const handleGenerateQR = async () => {
    setBusy(true)
    onError(null)
    try {
      const res = await generateQR(user.id)
      // Optimistically patch the user row with the new QR info
      onUpdated({ ...user, qr_token: res.qr_token, qr_url: res.qr_url })
    } catch (ex: unknown) {
      onError(ex instanceof Error ? ex.message : 'Failed to generate QR code')
    } finally {
      setBusy(false)
    }
  }

  const handleCancelCheckin = async () => {
    setBusy(true)
    onError(null)
    try {
      const updated = await cancelCheckin(user.id)
      onUpdated(updated)
    } catch (ex: unknown) {
      onError(ex instanceof Error ? ex.message : 'Failed to cancel check-in')
    } finally {
      setBusy(false)
    }
  }

  const copyQRUrl = () => {
    if (!user.qr_url) return
    navigator.clipboard.writeText(user.qr_url).then(() => {
      setCopyLabel('Copied!')
      setTimeout(() => setCopyLabel('Copy URL'), 2000)
    })
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Toggle payment */}
      <button
        onClick={togglePayment}
        disabled={busy}
        title={`Mark as ${user.payment_status === 'paid' ? 'pending' : 'paid'}`}
        className={`text-xs px-2 py-1 rounded-md font-medium transition-colors disabled:opacity-50 ${
          user.payment_status === 'paid'
            ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
            : 'bg-green-100 text-green-700 hover:bg-green-200'
        }`}
      >
        {user.payment_status === 'paid' ? '↩ Unpay' : '✓ Mark Paid'}
      </button>

      {/* Generate QR — only available when paid */}
      {user.payment_status === 'paid' && !user.qr_token && (
        <button
          onClick={handleGenerateQR}
          disabled={busy}
          className="text-xs px-2 py-1 rounded-md font-medium bg-blue-100 text-blue-700 hover:bg-blue-200 disabled:opacity-50"
        >
          🔗 Gen QR
        </button>
      )}

      {/* Copy QR URL — only when token exists */}
      {user.checked_in && (
        <button
          onClick={handleCancelCheckin}
          disabled={busy}
          className="text-xs px-2 py-1 rounded-md font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
        >
          Cancel Check-in
        </button>
      )}

      {user.qr_url && (
        <>
          <a
            href={user.qr_url}
            target="_blank"
            rel="noreferrer"
            className="text-xs px-2 py-1 rounded-md font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            🔍 View
          </a>
          <button
            onClick={copyQRUrl}
            className="text-xs px-2 py-1 rounded-md font-medium bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            📋 {copyLabel}
          </button>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function AdminPage() {
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setUsers(await getUsers())
    } catch (ex: unknown) {
      setError(ex instanceof Error ? ex.message : 'Failed to load users')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleUpdated = (updated: User) => {
    setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)))
  }

  const handleCreated = (user: User) => {
    setUsers((prev) => [...prev, user])
    setShowAddModal(false)
  }

  const handleActionError = (message: string | null) => {
    setError(message)
  }

  // Client-side search / filter
  const filtered = users.filter((u) => {
    const q = search.toLowerCase()
    return (
      u.name.toLowerCase().includes(q) ||
      u.phone.includes(q) ||
      u.id.includes(q)
    )
  })

  // Summary counts
  const totalPaid = users.filter((u) => u.payment_status === 'paid').length
  const totalCheckedIn = users.filter((u) => u.checked_in).length

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {users.length} participants · {totalPaid} paid · {totalCheckedIn} checked in
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAddModal(true)} className="btn-primary">
            + Add
          </button>
          <button onClick={load} disabled={loading} className="btn-ghost">
            {loading ? '…' : '↻'} Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or ID…"
          className="w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" label="Loading participants…" />
        </div>
      )}

      {/* Table */}
      {!loading && (
        <div className="overflow-x-auto rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Payment</th>
                <th className="px-4 py-3">Checked In</th>
                <th className="px-4 py-3">Check-in Time</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 bg-white">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-gray-400">
                    No participants found.
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{user.name}</p>
                      <p className="text-xs text-gray-400">{user.id}</p>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{user.phone}</td>
                    <td className="px-4 py-3">
                      {user.payment_status === 'paid' ? (
                        <StatusBadge variant="success" label="Paid" icon="✓" />
                      ) : (
                        <StatusBadge variant="warning" label="Pending" />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {user.checked_in ? (
                        <StatusBadge variant="success" label="Yes" icon="✅" />
                      ) : (
                        <StatusBadge variant="neutral" label="No" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {fmt(user.checked_in_at)}
                    </td>
                    <td className="px-4 py-3">
                      <RowActions
                        user={user}
                        onUpdated={handleUpdated}
                        onError={handleActionError}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add user modal */}
      {showAddModal && (
        <AddUserModal
          onClose={() => setShowAddModal(false)}
          onCreated={handleCreated}
        />
      )}
    </div>
  )
}
