import { useEffect, useMemo, useState } from 'react'
import { authHeaders, handleUnauthorized } from '../utils/auth'

const DASHBOARD_API = `${import.meta.env.VITE_BACKEND_URL}/api/dashboard`

export default function Dashboard({ environment = 'sandbox' }) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState('')

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async (isManualRefresh = false) => {
    try {
      if (isManualRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setError('')

      console.log('[Dashboard.jsx] Fetching dashboard from:', DASHBOARD_API)

      const res = await fetch(DASHBOARD_API, { headers: authHeaders() })

      console.log('[Dashboard.jsx] Dashboard response status:', res.status)

      if (res.status === 401) return handleUnauthorized()

      const jsonData = await res.json()

      console.log('[Dashboard.jsx] Dashboard response payload:', jsonData)

      if (!res.ok) {
        throw new Error(jsonData?.error || `Error: ${res.status} ${res.statusText}`)
      }

      setData(jsonData)
      setLastFetchedAt(new Date().toLocaleString())
    } catch (err) {
      console.error('[Dashboard.jsx] Error fetching dashboard:', err)
      setError(`Failed to fetch dashboard. ${err.message}`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const filteredActivity = useMemo(() => {
    const rows = Array.isArray(data?.recentActivity) ? data.recentActivity : []
    const q = search.trim().toLowerCase()

    if (!q) return rows

    return rows.filter((row) => {
      const customer = String(row.customer || '').toLowerCase()
      const action = String(row.action || '').toLowerCase()
      const plan = String(row.plan || '').toLowerCase()
      const externalSubscriptionId = String(row.externalSubscriptionId || '').toLowerCase()

      return (
        customer.includes(q) ||
        action.includes(q) ||
        plan.includes(q) ||
        externalSubscriptionId.includes(q)
      )
    })
  }, [data, search])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500 animate-pulse">Loading dashboard…</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-lg">
          {error}
        </div>

        <button
          onClick={() => loadDashboard(true)}
          className="px-4 py-2 rounded-lg bg-gray-800 text-white text-sm hover:bg-gray-900 transition"
        >
          Retry
        </button>
      </div>
    )
  }

  const stats = data?.stats || {}

  return (
    <div className="space-y-8 sm:py-[50px] sm:px-[40px] px-[20px] py-[24px]">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
            {/* <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
              environment === 'live' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}> */}
              {/* {environment === 'live' ? 'Live' : 'Sandbox'} */}
            {/* </span> */}
          </div>
          <p className="text-gray-500 mt-1">
            Overview of subscriptions and recent activity
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Last fetched: {lastFetchedAt || '-'}
          </p>
        </div>

        <button
          onClick={() => loadDashboard(true)}
          disabled={refreshing}
          className={`px-4 py-2 rounded-lg text-sm text-white transition ${
            refreshing
              ? 'bg-gray-400 cursor-not-allowed'
              : 'bg-gray-800 hover:bg-gray-900'
          }`}
        >
          {refreshing ? 'Refreshing...' : 'Refresh Dashboard'}
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-6">
        <StatCard
          label="Total Subscribers"
          value={stats.totalSubscribers ?? 0}
        />
        <StatCard
          label="Active"
          value={stats.activeSubscriptions ?? 0}
        />
        <StatCard
          label="Paused"
          value={stats.pausedSubscriptions ?? 0}
        />
        <StatCard
          label="Cancelled"
          value={stats.cancelledSubscriptions ?? 0}
        />
        <StatCard
          label="Pending"
          value={stats.pendingSubscriptions ?? 0}
        />
      </div>

      <div className="bg-white rounded-xl shadow p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          type="text"
          placeholder="Search by customer, action, plan, or subscription id..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full md:w-1/2 px-4 py-2 rounded-lg border border-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-400"
        />

        <div className="text-sm text-gray-500">
          Showing {filteredActivity.length} of {Array.isArray(data?.recentActivity) ? data.recentActivity.length : 0} records
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <InfoCard
          label="Total Subscription Orders"
          value={data?.totalSubscriptionOrders ?? 0}
        />
        <InfoCard
          label="Recent Activity Count"
          value={Array.isArray(data?.recentActivity) ? data.recentActivity.length : 0}
        />
        <InfoCard
          label="Nomade Horizon"
          value="Subscriptions at convenience"
        />
      </div>

      <div className="bg-white rounded-xl shadow overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-100">
            <tr className="bg-[#1b2432] text-white">
              <TableHead>Customer</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>External ID</TableHead>
              <TableHead>Date</TableHead>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-100">
            {filteredActivity.length > 0 ? (
              filteredActivity.map((row, i) => (
                <tr key={`${row.externalSubscriptionId || 'row'}-${i}`} className="hover:bg-gray-50">
                  <TableCell>{row.customer || '-'}</TableCell>
                  <TableCell>
                    <StatusBadge status={row.action} />
                  </TableCell>
                  <TableCell>{row.plan || '-'}</TableCell>
                  <TableCell>
                    <span className="text-xs text-gray-600 break-all">
                      {row.externalSubscriptionId || '-'}
                    </span>
                  </TableCell>
                  <TableCell>{row.date || '-'}</TableCell>
                </tr>
              ))
            ) : (
              <tr >
                <td
                  colSpan="5"
                  className="text-center py-6 text-gray-500"
                >
                  No matching records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

     
    </div>
  )
}

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <p className="text-gray-500 text-sm">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  )
}

function InfoCard({ label, value }) {
  return (
    <div className="bg-white rounded-xl shadow p-5">
      <p className="text-gray-500 text-sm">{label}</p>
      <p className="text-lg font-semibold text-gray-800 mt-1 break-all">
        {value}
      </p>
    </div>
  )
}

function TableHead({ children }) {
  return (
    <th className="px-6 py-3 text-left text-xs font-semibold text-white uppercase">
      {children}
    </th>
  )
}

function TableCell({ children }) {
  return (
    <td className="px-6 py-4 text-sm text-gray-700 align-top">
      {children}
    </td>
  )
}

function StatusBadge({ status }) {
  const normalized = String(status || '').toLowerCase()

  const styles = {
    active: 'bg-green-100 text-green-800',
    paused: 'bg-yellow-100 text-yellow-800',
    cancelled: 'bg-red-100 text-red-800',
    canceled: 'bg-red-100 text-red-800',
    pending: 'bg-gray-100 text-gray-800',
    pending_payment: 'bg-gray-100 text-gray-800',
  }

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-semibold ${
        styles[normalized] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {status || 'unknown'}
    </span>
  )
}