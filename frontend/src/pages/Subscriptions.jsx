import { useEffect, useMemo, useState } from 'react'
import { authHeaders, handleUnauthorized } from '../utils/auth'

const API_BASE = `${import.meta.env.VITE_BACKEND_URL}/api/subscriptions`

export default function Subscriptions({ environment = 'sandbox' }) {
  const [subs, setSubs] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState({})
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [cancelModal, setCancelModal] = useState({
    open: false,
    subscriptionId: null,
    subscription: null,
  })

  const [editModal, setEditModal] = useState({
    open: false,
    subscriptionId: null,
    subscription: null,
  })

  useEffect(() => {
    loadSubscriptions()
  }, [environment])

  const loadSubscriptions = async () => {
    try {
      setLoading(true)
      setError('')

      const res = await fetch(API_BASE, { headers: authHeaders() })

      if (res.status === 401) return handleUnauthorized()

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || 'Failed to fetch subscriptions')
      }

      setSubs(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err.message || 'Failed to load subscriptions')
    } finally {
      setLoading(false)
    }
  }

  const setRowLoading = (id, value) => {
    setActionLoading((prev) => ({ ...prev, [id]: value }))
  }

  const syncSubscription = async (id) => {
    try {
      setRowLoading(id, true)
      setError('')
      setSuccess('')

      const res = await fetch(`${API_BASE}/${id}/sync`, {
        method: 'POST',
        headers: authHeaders(),
      })

      if (res.status === 401) return handleUnauthorized()

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || data?.details || 'Failed to sync subscription')
      }

      if (data?.subscription) {
        setSubs((prev) => prev.map((sub) => (sub._id === id ? data.subscription : sub)))
      }

      setSuccess('Subscription synced successfully')
    } catch (err) {
      setError(err.message || 'Failed to sync subscription')
    } finally {
      setRowLoading(id, false)
    }
  }

  const cancelSubscription = async (id, prorationBehavior = 'PRORATED') => {
    try {
      setRowLoading(id, true)
      setError('')
      setSuccess('')

      const res = await fetch(`${API_BASE}/${id}/cancel`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proration_behavior: prorationBehavior,
        }),
      })

      if (res.status === 401) return handleUnauthorized()

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || data?.details || 'Failed to cancel subscription')
      }

      if (data?.subscription) {
        setSubs((prev) => prev.map((sub) => (sub._id === id ? data.subscription : sub)))
      } else {
        await loadSubscriptions()
      }

      setSuccess('Subscription cancelled successfully')
    } catch (err) {
      setError(err.message || 'Failed to cancel subscription')
    } finally {
      setRowLoading(id, false)
    }
  }

  const updateSubscription = async (id, updatePayload) => {
    try {
      setRowLoading(id, true)
      setError('')
      setSuccess('')

      const res = await fetch(`${API_BASE}/${id}/update`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload),
      })

      if (res.status === 401) return handleUnauthorized()

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data?.error || data?.details || 'Failed to update subscription')
      }

      if (data?.subscription) {
        setSubs((prev) => prev.map((sub) => (sub._id === id ? data.subscription : sub)))
      }

      setSuccess('Subscription updated successfully')
      return true
    } catch (err) {
      setError(err.message || 'Failed to update subscription')
      return false
    } finally {
      setRowLoading(id, false)
    }
  }

  const handleEditSubmit = async (subscriptionId, formData) => {
    const payload = {}

    if (formData.cancel_at_period_end !== undefined) {
      payload.cancel_at_period_end = formData.cancel_at_period_end
    }

    if (formData.collection_method) {
      payload.collection_method = formData.collection_method
    }

    if (formData.payment_source_id) {
      payload.payment_source_id = formData.payment_source_id
    }

    if (formData.trial_ends_at) {
      payload.trial_ends_at =
        formData.trial_ends_at === 'NOW'
          ? new Date().toISOString()
          : new Date(formData.trial_ends_at).toISOString()
    }

    if (formData.days_until_due !== '') {
      payload.days_until_due = Number(formData.days_until_due)
    }

    if (formData.default_tax_percent !== '') {
      payload.default_tax_percent = Number(formData.default_tax_percent)
    }

    const ok = await updateSubscription(subscriptionId, payload)

    if (ok) {
      setEditModal({ open: false, subscriptionId: null, subscription: null })
    }
  }

  const filteredSubs = useMemo(() => {
    return subs.filter((sub) => {
      const email = sub.customerEmail || ''
      const plan = sub.planName || ''
      const externalId = sub.externalSubscriptionId || ''
      const q = search.toLowerCase()

      return (
        email.toLowerCase().includes(q) ||
        plan.toLowerCase().includes(q) ||
        externalId.toLowerCase().includes(q)
      )
    })
  }, [subs, search])

  const stats = useMemo(() => ({
    total: subs.length,
    active: subs.filter((s) => s.status === 'active').length,
    trialing: subs.filter((s) => s.status === 'trialing').length,
    cancelled: subs.filter((s) => s.status === 'cancelled').length,
    paused: subs.filter((s) => s.status === 'paused').length,
  }), [subs])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-gray-700" />
        <p className="text-sm text-gray-500 animate-pulse">Loading subscriptions…</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 sm:py-[50px] sm:px-[40px] px-[20px] py-[24px]">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Subscriptions</h1>
            {/* <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              environment === 'live' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}> */}
              {/* {environment === 'live' ? 'Live' : 'Sandbox'} */}
            {/* </span> */}
          </div>
          <p className="mt-1 text-sm text-gray-500">Manage customer subscriptions and sync with Airwallex</p>
        </div>

        <button
          onClick={loadSubscriptions}
          className="self-start sm:self-auto rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white transition hover:bg-gray-900 active:scale-95"
        >
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Total" value={stats.total} color="gray" />
        <StatCard label="Active" value={stats.active} color="green" />
        <StatCard label="Trialing" value={stats.trialing} color="blue" />
        <StatCard label="Paused" value={stats.paused} color="yellow" />
        <StatCard label="Cancelled" value={stats.cancelled} color="red" />
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span className="mt-0.5 shrink-0 text-base leading-none">&#9888;</span>
          <span>{error}</span>
        </div>
      )}

      {success && (
        <div className="flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <span className="mt-0.5 shrink-0 text-base leading-none">&#10003;</span>
          <span>{success}</span>
        </div>
      )}

      {/* Search bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
            &#128269;
          </span>
          <input
            type="text"
            placeholder="Search by email, plan, or Airwallex ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-4 text-sm focus:border-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-300"
          />
        </div>
        <p className="shrink-0 text-sm text-gray-500">
          {filteredSubs.length} of {subs.length} records
        </p>
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="bg-[#1b2432] text-white">
                <TableHead>Customer</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Airwallex ID</TableHead>
                <TableHead>Next Billing</TableHead>
                <TableHead>Actions</TableHead>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 bg-white">
              {filteredSubs.length > 0 ? (
                filteredSubs.map((sub) => {
                  const busy = !!actionLoading[sub._id]

                  return (
                    <tr key={sub._id} className="group transition hover:bg-gray-50">
                      <TableCell>
                        <span className="font-medium text-gray-900">{sub.customerEmail || '-'}</span>
                      </TableCell>
                      <TableCell>{sub.planName || '-'}</TableCell>
                      <TableCell>
                        <StatusBadge status={sub.status} />
                      </TableCell>
                      <TableCell>
                        <span className="max-w-[180px] break-all text-xs text-gray-500 font-mono">
                          {sub.externalSubscriptionId || '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-gray-700">
                          {sub?.metadata?.nextBillingAt
                            ? new Date(sub.metadata.nextBillingAt).toLocaleDateString()
                            : sub?.nextBillingAt
                              ? new Date(sub.nextBillingAt).toLocaleDateString()
                              : '-'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1.5">
                          {/* <ActionBtn color="blue" disabled={busy} onClick={() => syncSubscription(sub._id)}>
                            {busy ? '…' : 'Sync'}
                          </ActionBtn> */}

                          {sub.status !== 'cancelled' && (
                            <ActionBtn
                              color="indigo"
                              disabled={busy}
                              onClick={() =>
                                setEditModal({ open: true, subscriptionId: sub._id, subscription: sub })
                              }
                            >
                              Edit
                            </ActionBtn>
                          )}

                          {sub.status !== 'cancelled' && (
                            <ActionBtn
                              color="red"
                              disabled={busy}
                              onClick={() =>
                                setCancelModal({ open: true, subscriptionId: sub._id, subscription: sub })
                              }
                            >
                              Cancel
                            </ActionBtn>
                          )}
                        </div>
                      </TableCell>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan="6">
                    <EmptyState search={search} />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 md:hidden">
        {filteredSubs.length > 0 ? (
          filteredSubs.map((sub) => {
            const busy = !!actionLoading[sub._id]
            const nextBilling = sub?.metadata?.nextBillingAt || sub?.nextBillingAt

            return (
              <div
                key={sub._id}
                className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md"
              >
                {/* Card header */}
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-gray-900 text-sm">
                      {sub.customerEmail || 'Unknown customer'}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-500">{sub.planName || 'No plan'}</p>
                  </div>
                  <StatusBadge status={sub.status} />
                </div>

                {/* Card details */}
                <div className="mb-4 space-y-2 rounded-lg bg-gray-50 px-3 py-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-500 font-medium">Airwallex ID</span>
                    <span className="font-mono text-gray-700 break-all text-right max-w-[60%]">
                      {sub.externalSubscriptionId || '-'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-500 font-medium">Next Billing</span>
                    <span className="text-gray-700">
                      {nextBilling ? new Date(nextBilling).toLocaleDateString() : '-'}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {/* <ActionBtn color="blue" disabled={busy} onClick={() => syncSubscription(sub._id)}>
                    {busy ? 'Working…' : 'Sync'}
                  </ActionBtn> */}

                  {sub.status !== 'cancelled' && (
                    <ActionBtn
                      color="indigo"
                      disabled={busy}
                      onClick={() =>
                        setEditModal({ open: true, subscriptionId: sub._id, subscription: sub })
                      }
                    >
                      Edit
                    </ActionBtn>
                  )}

                  {sub.status !== 'cancelled' && (
                    <ActionBtn
                      color="red"
                      disabled={busy}
                      onClick={() =>
                        setCancelModal({ open: true, subscriptionId: sub._id, subscription: sub })
                      }
                    >
                      Cancel
                    </ActionBtn>
                  )}
                </div>
              </div>
            )
          })
        ) : (
          <EmptyState search={search} />
        )}
      </div>

      {cancelModal.open && (
        <CancelModal
          subscription={cancelModal.subscription}
          onClose={() => setCancelModal({ open: false, subscriptionId: null, subscription: null })}
          onConfirm={async (proration) => {
            await cancelSubscription(cancelModal.subscriptionId, proration)
            setCancelModal({ open: false, subscriptionId: null, subscription: null })
          }}
        />
      )}

      {editModal.open && (
        <EditSubscriptionModal
          subscription={editModal.subscription}
          onClose={() => setEditModal({ open: false, subscriptionId: null, subscription: null })}
          onSubmit={handleEditSubmit}
        />
      )}
    </div>
  )
}

/* ---------- Stat Card ---------- */

function StatCard({ label, value, color }) {
  const colors = {
    gray: 'text-gray-800',
    green: 'text-green-700',
    blue: 'text-blue-700',
    yellow: 'text-yellow-700',
    red: 'text-red-700',
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${colors[color] || 'text-gray-800'}`}>{value}</p>
    </div>
  )
}

/* ---------- Empty State ---------- */

function EmptyState({ search }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-300 bg-white py-12 text-center">
      <div className="mb-3 text-4xl text-gray-300">&#128462;</div>
      <p className="text-sm font-medium text-gray-600">
        {search ? 'No matching subscriptions' : 'No subscriptions yet'}
      </p>
      {search && (
        <p className="mt-1 text-xs text-gray-400">Try a different search term</p>
      )}
    </div>
  )
}

/* ---------- Table helpers ---------- */

function TableHead({ children }) {
  return (
    <th
      scope="col"
      className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-white"
    >
      {children}
    </th>
  )
}

function TableCell({ children }) {
  return <td className="px-5 py-3.5 text-sm text-gray-700 align-top">{children}</td>
}

/* ---------- Status Badge ---------- */

function StatusBadge({ status }) {
  const statusConfig = {
    pending: { label: 'Pending', className: 'bg-gray-100 text-gray-700 ring-gray-200' },
    pending_payment: { label: 'Pending', className: 'bg-gray-100 text-gray-700 ring-gray-200' },
    trialing: { label: 'In Trial', className: 'bg-blue-100 text-blue-700 ring-blue-200' },
    active: { label: 'Active', className: 'bg-green-100 text-green-700 ring-green-200' },
    past_due: { label: 'Past Due', className: 'bg-orange-100 text-orange-700 ring-orange-200' },
    cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700 ring-red-200' },
    paused: { label: 'Paused', className: 'bg-yellow-100 text-yellow-700 ring-yellow-200' },
    expired: { label: 'Expired', className: 'bg-gray-200 text-gray-600 ring-gray-300' },
  }

  const config = statusConfig[status] || statusConfig.pending

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${config.className}`}
    >
      {config.label}
    </span>
  )
}

/* ---------- Action Button ---------- */

function ActionBtn({ color, children, disabled, ...props }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 ring-blue-200 hover:bg-blue-100',
    red: 'bg-red-50 text-red-700 ring-red-200 hover:bg-red-100',
    indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200 hover:bg-indigo-100',
  }

  return (
    <button
      {...props}
      disabled={disabled}
      className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium ring-1 ring-inset transition active:scale-95
        ${colors[color]} ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
    >
      {children}
    </button>
  )
}

/* ---------- Cancel Modal ---------- */

function CancelModal({ subscription, onClose, onConfirm }) {
  const [proration, setProration] = useState('PRORATED')

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Modal header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Cancel Subscription</h3>
        </div>

        <div className="px-6 py-5">
          {subscription && (
            <div className="mb-5 rounded-lg bg-gray-50 p-3 text-sm space-y-1.5">
              <p className="text-gray-600">
                <span className="font-medium text-gray-800">Customer: </span>
                {subscription.customerEmail || 'N/A'}
              </p>
              <p className="text-gray-600">
                <span className="font-medium text-gray-800">Plan: </span>
                {subscription.planName || 'N/A'}
              </p>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 text-sm">Status: </span>
                <StatusBadge status={subscription.status} />
              </div>
            </div>
          )}

          <p className="mb-4 text-sm text-gray-600">Choose how to handle refunds for the current billing period:</p>

          <div className="space-y-2.5">
            {[
              {
                value: 'ALL',
                label: 'Full refund',
                desc: 'Refund the entire current period charge',
                accent: 'border-green-400 bg-green-50',
                dot: 'bg-green-500',
              },
              {
                value: 'PRORATED',
                label: 'Prorated refund',
                desc: 'Refund unused portion only (recommended)',
                accent: 'border-blue-400 bg-blue-50',
                dot: 'bg-blue-500',
              },
              {
                value: 'NONE',
                label: 'No refund',
                desc: 'Keep the current period charge',
                accent: 'border-red-400 bg-red-50',
                dot: 'bg-red-500',
              },
            ].map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition ${
                  proration === option.value ? option.accent : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="proration"
                  value={option.value}
                  checked={proration === option.value}
                  onChange={(e) => setProration(e.target.value)}
                  className="sr-only"
                />
                <span
                  className={`mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-white ring-2 ${
                    proration === option.value ? option.dot + ' ring-current' : 'bg-gray-200 ring-gray-300'
                  }`}
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">{option.label}</p>
                  <p className="text-xs text-gray-500">{option.desc}</p>
                </div>
              </label>
            ))}
          </div>
        </div>

        <div className="border-t border-gray-100 flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 sm:w-auto"
          >
            Keep Subscription
          </button>
          <button
            onClick={() => onConfirm(proration)}
            className="w-full rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-600 active:scale-95 sm:w-auto"
          >
            Cancel Subscription
          </button>
        </div>
      </div>
    </div>
  )
}

/* ---------- Edit Subscription Modal ---------- */

function EditSubscriptionModal({ subscription, onClose, onSubmit }) {
  const [formData, setFormData] = useState({
    cancel_at_period_end: subscription?.cancelAtPeriodEnd || false,
    collection_method: subscription?.collectionMethod || '',
    payment_source_id: '',
    trial_ends_at: '',
    days_until_due: '',
    default_tax_percent: '',
  })
  const [submitting, setSubmitting] = useState(false)
  const [paymentSources, setPaymentSources] = useState([])
  const [sourcesLoading, setSourcesLoading] = useState(false)
  const [sourcesError, setSourcesError] = useState('')

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }))
    if (field === 'collection_method' && value === 'AUTO_CHARGE') {
      fetchPaymentSources()
    }
  }

  const fetchPaymentSources = async () => {
    setSourcesLoading(true)
    setSourcesError('')
    try {
      const res = await fetch(`${API_BASE}/${subscription._id}/payment-sources`, {
        headers: authHeaders(),
      })
      if (res.status === 401) return handleUnauthorized()
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch payment sources')
      setPaymentSources(data.payment_sources || [])
      if (data.payment_sources?.length === 1) {
        setFormData((prev) => ({ ...prev, payment_source_id: data.payment_sources[0].id }))
      }
    } catch (err) {
      setSourcesError(err.message)
    } finally {
      setSourcesLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      await onSubmit(subscription._id, formData)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Modal header */}
        <div className="border-b border-gray-100 px-6 py-4">
          <h3 className="text-lg font-semibold text-gray-900">Edit Subscription</h3>
        </div>

        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {subscription && (
            <div className="mb-5 rounded-lg bg-gray-50 p-3 text-sm space-y-1.5">
              <p className="text-gray-600">
                <span className="font-medium text-gray-800">Customer: </span>
                {subscription.customerEmail || 'N/A'}
              </p>
              <p className="text-gray-600">
                <span className="font-medium text-gray-800">Plan: </span>
                {subscription.planName || 'N/A'}
              </p>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800 text-sm">Status: </span>
                <StatusBadge status={subscription.status} />
              </div>
              <p className="break-all text-gray-500 text-xs font-mono">
                {subscription.externalSubscriptionId}
              </p>
            </div>
          )}

          <form id="edit-sub-form" onSubmit={handleSubmit} className="space-y-5">
            {/* Cancel at period end */}
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 transition hover:bg-gray-50">
              <input
                type="checkbox"
                checked={formData.cancel_at_period_end}
                onChange={(e) => handleChange('cancel_at_period_end', e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded accent-indigo-600"
              />
              <div>
                <span className="text-sm font-medium text-gray-900">Cancel at period end</span>
                <p className="text-xs text-gray-500">Schedule cancellation after current billing cycle</p>
              </div>
            </label>

            {/* Collection Method */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Collection Method</label>
              <select
                value={formData.collection_method}
                onChange={(e) => handleChange('collection_method', e.target.value)}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              >
                <option value="">— Keep current —</option>
                <option value="AUTO_CHARGE">Auto Charge</option>
                <option value="CHARGE_ON_CHECKOUT">Charge on Checkout</option>
                <option value="OUT_OF_BAND">Out of Band</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">How payment is collected for this subscription</p>
            </div>

            {/* Payment source (only for AUTO_CHARGE) */}
            {formData.collection_method === 'AUTO_CHARGE' && (
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">
                  Payment Source <span className="text-red-500">*</span>
                </label>
                {sourcesLoading ? (
                  <div className="flex items-center gap-2 py-2 text-sm text-gray-500">
                    <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-indigo-500" />
                    Loading saved payment methods…
                  </div>
                ) : sourcesError ? (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">
                    {sourcesError}
                  </div>
                ) : paymentSources.length === 0 ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                    No saved payment sources found for this customer.
                  </div>
                ) : (
                  <select
                    value={formData.payment_source_id}
                    onChange={(e) => handleChange('payment_source_id', e.target.value)}
                    required
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  >
                    <option value="">— Select a payment source —</option>
                    {paymentSources.map((src) => (
                      <option key={src.id} value={src.id}>
                        {src.id}
                        {src.external_id ? ` · ${src.external_id}` : ''}
                        {src.created_at ? ` · Added ${new Date(src.created_at).toLocaleDateString()}` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Trial end date */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Trial End Date</label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="datetime-local"
                  value={formData.trial_ends_at}
                  onChange={(e) => handleChange('trial_ends_at', e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                  type="button"
                  onClick={() => handleChange('trial_ends_at', 'NOW')}
                  className="rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 sm:w-auto"
                >
                  End Now
                </button>
              </div>
              <p className="mt-1 text-xs text-gray-400">Click &quot;End Now&quot; to terminate trial immediately</p>
            </div>

            {/* Days until due */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Days Until Due</label>
              <input
                type="number"
                min="0"
                value={formData.days_until_due}
                onChange={(e) => handleChange('days_until_due', e.target.value)}
                placeholder="e.g., 7"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <p className="mt-1 text-xs text-gray-400">Days from invoice finalization until payment is due</p>
            </div>

            {/* Tax percent */}
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Default Tax Percent</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.default_tax_percent}
                onChange={(e) => handleChange('default_tax_percent', e.target.value)}
                placeholder="e.g., 20.00"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
              />
              <p className="mt-1 text-xs text-gray-400">Tax percentage (0–100) applied to invoices (exclusive)</p>
            </div>
          </form>
        </div>

        {/* Modal footer */}
        <div className="border-t border-gray-100 flex flex-col-reverse gap-2 px-6 py-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition hover:bg-gray-50 disabled:opacity-50 sm:w-auto"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="edit-sub-form"
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {submitting ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Saving…
              </>
            ) : (
              'Save Changes'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
