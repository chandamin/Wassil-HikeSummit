import { useEffect, useState } from 'react'
import { authHeaders, handleUnauthorized } from '../utils/auth'

// const API = `${import.meta.env.VITE_BACKEND_URL}/api/selling-plans`
// const API = `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans`




export default function SellingPlans({ environment }) {
  const [plans, setPlans] = useState([])
  const [showForm, setShowForm] = useState(false)
  const [editingPlan, setEditingPlan] = useState(null)
  const [loading, setLoading] = useState(true)

  // Set the API endpoint dynamically based on the environment

  // const API = environment === 'live'
  // ? `${import.meta.env.VITE_BACKEND_URL}/api/selling-plans/plans`
  // : `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans`;

  const API = `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans`;

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    async function loadPlans() {
      try {
        const res = await fetch(API, {
          headers: { ...authHeaders(), Accept: "application/json" },
        });
        console.log("API: ", API);

        if (res.status === 401) { handleUnauthorized(); return; }

        const text = await res.text();
        console.log("RAW RESPONSE:", text);

        if (!res.ok) throw new Error(text);

        const data = JSON.parse(text);
        if (mounted) setPlans(data);
      } catch (err) {
        console.error("Failed to load plans:", err);
        if (mounted) setPlans([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPlans();
    return () => (mounted = false);
  }, [API]);



  return (
    // <div className="space-y-6">
    <div className="min-h-screen bg-gradient-to-br from-white via-gray-50 to-gray-100 sm:py-[50px] sm:px-[40px] px-[20px] py-[24px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Selling Plans</h1>
          <span className={`inline-block mt-1 px-2 py-0.5 rounded text-xs font-semibold ${environment === 'live' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
            }`}>
            {/* {environment === 'live' ? 'Live' : 'Sandbox'} */}
          </span>
        </div>

        <button
          onClick={() => setShowForm(true)}
          className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800"
        >
          + Create Plan
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow overflow-x-auto">
        {loading ? (
          <p className="p-6 text-gray-500">Loading plans…</p>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-100">
              <tr className="bg-[#1b2432] text-white">
                <TableHead>Name</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead>Free Trial</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>BC Product ID</TableHead>
                <TableHead>Actions</TableHead>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {plans.length > 0 ? (
                plans.map(plan => (
                  <tr key={plan._id} className="hover:bg-gray-50">
                    <TableCell>{plan.name}</TableCell>
                    <TableCell>{currencySymbol(plan.currency)}{plan.amount}</TableCell>
                    <TableCell>{plan.currency || 'USD'}</TableCell>
                    <TableCell>{plan.interval}</TableCell>
                    <TableCell>
                      {plan.trialDays > 0
                        ? `${plan.trialDays} days`
                        : 'None'}
                    </TableCell>
                    <TableCell>
                      <button
                        onClick={async () => {
                          const updated = await updatePlan(plan._id, {
                            active: plan.status !== 'enabled',
                          }, environment);

                          setPlans(prev =>
                            prev.map(p =>
                              p._id === updated._id ? updated : p
                            )
                          );
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${plan.status === 'enabled'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-200 text-gray-700'
                          }`}
                      >
                        {plan.status === 'enabled' ? 'Enabled' : 'Disabled'}
                      </button>
                    </TableCell>
                    <TableCell>{plan.bigcommerceProductId}</TableCell>
                    <TableCell>
                      <button
                        onClick={() => setEditingPlan(plan)}
                        className="px-3 py-1 rounded-lg text-xs font-semibold bg-blue-100 text-blue-800 hover:bg-blue-200 transition"
                      >
                        Edit
                      </button>
                    </TableCell>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan="8"
                    className="text-center py-6 text-gray-500"
                  >
                    No selling plans created
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <CreatePlanForm
          onClose={() => setShowForm(false)}
          onCreated={plan =>
            setPlans(prev => [plan, ...prev])
          }
          environment={environment}
        />
      )}

      {editingPlan && (
        <EditPlanModal
          plan={editingPlan}
          onClose={() => setEditingPlan(null)}
          onUpdated={updated => {
            setPlans(prev =>
              prev.map(p => (p._id === updated._id ? updated : p))
            );
            setEditingPlan(null);
          }}
          environment={environment}
        />
      )}
    </div>
  )
}

/* ---------- Currency Helper ---------- */

function currencySymbol(code) {
  switch ((code || '').toUpperCase()) {
    case 'EUR': return '€';
    case 'GBP': return '£';
    case 'USD': return '$';
    default: return '$';
  }
}

/* ---------- Create Plan Form ---------- */


// const APS = `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans`

function CreatePlanForm({ onClose, onCreated, environment }) {

  const API = environment === 'live'
    ? `${import.meta.env.VITE_BACKEND_URL}/api/selling-plans/plans`
    : `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans`;

  // Set the API endpoint dynamically based on the environment

  const [form, setForm] = useState({
    name: '',
    description: '',
    amount: '',
    currency: 'EUR',
    interval: 'MONTH',
    trialDays: 30,
    bigcommerceProductId: '',
  })

  const handleChange = e => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const submit = async e => {
    e.preventDefault()

    const res = await fetch(API, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
        trialDays: Number(form.trialDays),
        bigcommerceProductId: Number(form.bigcommerceProductId),
      }),
    })

    if (res.status === 401) { handleUnauthorized(); return; }

    const created = await res.json()
    if (!res.ok) {
      alert(created.error)
      return
    }

    onCreated?.(created)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-white/80 via-gray-100/80 to-gray-200/80 backdrop-blur px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
          Create Subscription Plan
        </h2>

        <form onSubmit={submit} className="space-y-4">
          <input
            name="name"
            placeholder="Plan name"
            value={form.name}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-gray-400 outline-none"
          />

          <input
            name="description"
            placeholder="Description"
            value={form.description}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-gray-400 outline-none"
          />

          <input
            name="amount"
            type="number"
            placeholder="Amount"
            value={form.amount}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-gray-400 outline-none"
          />

          <select
            name="currency"
            value={form.currency}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 bg-white focus:ring-2 focus:ring-gray-400 outline-none"
          >
            <option value="EUR">EUR (€)</option>
            <option value="USD">USD ($)</option>
            <option value="GBP">GBP (£)</option>
          </select>

          {/* Bigcommerce Product Id */}
          <input
            name="bigcommerceProductId"
            type="number"
            placeholder="BigCommerce Product ID"
            value={form.bigcommerceProductId}
            onChange={handleChange}
            required
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-gray-400 outline-none"
          />

          <select
            name="interval"
            value={form.interval}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 bg-white focus:ring-2 focus:ring-gray-400 outline-none"
          >
            <option value="MONTH">Monthly</option>
            <option value="YEAR">Yearly</option>
          </select>

          <input
            name="trialDays"
            type="number"
            placeholder="Trial days"
            value={form.trialDays}
            onChange={handleChange}
            className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-gray-400 outline-none"
          />

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              className="px-5 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition"
            >
              Create Plan
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


/* ---------- Edit Plan Modal ---------- */

function EditPlanModal({ plan, onClose, onUpdated, environment }) {
  const [form, setForm] = useState({
    name: plan.name || '',
    description: plan.description || '',
    amount: plan.amount || '',
    currency: plan.currency || 'USD',
    interval: plan.interval || 'MONTH',
  })
  const [submitting, setSubmitting] = useState(false)

  const handleChange = e => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
  }

  const submit = async e => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const updated = await updatePlan(plan._id, {
        name: form.name,
        description: form.description,
        amount: Number(form.amount),
        currency: form.currency,
        interval: form.interval,
      }, environment);

      onUpdated?.(updated);
    } catch (err) {
      alert(err.message || 'Failed to update plan');
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-white/80 via-gray-100/80 to-gray-200/80 backdrop-blur px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8">
        <h2 className="text-2xl font-semibold text-gray-800 mb-6 text-center">
          Edit Plan
        </h2>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Name</label>
            <input
              name="name"
              value={form.name}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-gray-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Description</label>
            <input
              name="description"
              value={form.description}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-gray-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Amount</label>
            <input
              name="amount"
              type="number"
              value={form.amount}
              onChange={handleChange}
              required
              className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:ring-2 focus:ring-gray-400 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Currency</label>
            <select
              name="currency"
              value={form.currency}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 bg-white focus:ring-2 focus:ring-gray-400 outline-none"
            >
              <option value="EUR">EUR (€)</option>
              <option value="USD">USD ($)</option>
              <option value="GBP">GBP (£)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Interval</label>
            <select
              name="interval"
              value={form.interval}
              onChange={handleChange}
              className="w-full rounded-lg border border-gray-300 px-4 py-2 bg-white focus:ring-2 focus:ring-gray-400 outline-none"
            >
              <option value="MONTH">Monthly</option>
              <option value="YEAR">Yearly</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-100 transition"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 transition disabled:opacity-50"
            >
              {submitting ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


/* ---------- UI Helpers ---------- */

async function updatePlan(id, payload, environment) {

  const API = environment === 'live'
    ? `${import.meta.env.VITE_BACKEND_URL}/api/selling-plans/plans`
    : `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans`;

  console.log("APILive Or not: ", API);
  const res = await fetch(`${API}/${id}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) { handleUnauthorized(); return; }

  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
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
    <td className="px-6 py-4 text-sm text-gray-700">
      {children}
    </td>
  )
}