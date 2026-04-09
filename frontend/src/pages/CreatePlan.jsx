// import { useState } from 'react';

// const API = `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans`

// export default function CreatePlan() {
//   const [form, setForm] = useState({
//     name: '',
//     description: '',
//     amount: '',
//     interval: 'MONTH',
//     trialDays: 30,
//   });

//   const submit = async (e) => {
//     e.preventDefault();

//     const res = await fetch(`${API}`, {
//       method: 'POST',
//       headers: { 'Content-Type': 'application/json' },
//       body: JSON.stringify({
//         ...form,
//         amount: Number(form.amount),
//       }),
//     });

//     const data = await res.json();
//     if (!res.ok) {
//       alert(data.error);
//       return;
//     }

//     alert('Plan created successfully');
//     setForm({ name: '', description: '', amount: '', interval: 'MONTH', trialDays: 14 });
//   };

//   return (
//     <form onSubmit={submit}>
//       <h2>Create Subscription Plan</h2>

//       <input
//         placeholder="Plan name"
//         value={form.name}
//         onChange={e => setForm({ ...form, name: e.target.value })}
//         required
//       />

//       <input
//         placeholder="Description"
//         value={form.description}
//         onChange={e => setForm({ ...form, description: e.target.value })}
//       />

//       <input
//         type="number"
//         placeholder="Amount (USD)"
//         value={form.amount}
//         onChange={e => setForm({ ...form, amount: e.target.value })}
//         required
//       />

//       <select
//         value={form.interval}
//         onChange={e => setForm({ ...form, interval: e.target.value })}
//       >
//         <option value="MONTH">Monthly</option>
//         <option value="YEAR">Yearly</option>
//       </select>

//       <input
//         type="number"
//         placeholder="Trial days"
//         value={form.trialDays}
//         onChange={e => setForm({ ...form, trialDays: e.target.value })}
//       />

//       <button type="submit">Create Plan</button>
//     </form>
//   );
// }


import { useState } from 'react';

const API = `${import.meta.env.VITE_BACKEND_URL}/api/subscription-plans/plans`;

export default function CreatePlan() {
  const [form, setForm] = useState({
    name: '',
    description: '',
    amount: '',
    interval: 'MONTH',
    trialDays: 30,
  });

  const submit = async (e) => {
    e.preventDefault();

    const res = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        amount: Number(form.amount),
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error);
      return;
    }

    alert('Plan created successfully');
    setForm({ name: '', description: '', amount: '', interval: 'MONTH', trialDays: 14 });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-white via-gray-50 to-gray-100 px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 space-y-5"
      >
        <h2 className="text-2xl font-semibold text-gray-800 text-center">
          Create Subscription Plan
        </h2>

        <input
          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="Plan name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          required
        />

        <input
          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />

        <input
          type="number"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="Amount (USD)"
          value={form.amount}
          onChange={(e) => setForm({ ...form, amount: e.target.value })}
          required
        />

        <select
          className="w-full rounded-lg border border-gray-300 px-4 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-gray-400"
          value={form.interval}
          onChange={(e) => setForm({ ...form, interval: e.target.value })}
        >
          <option value="MONTH">Monthly</option>
          <option value="YEAR">Yearly</option>
        </select>

        <input
          type="number"
          className="w-full rounded-lg border border-gray-300 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-gray-400"
          placeholder="Trial days"
          value={form.trialDays}
          onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
        />

        <button
          type="submit"
          className="w-full rounded-lg bg-gray-900 text-white py-2 font-medium hover:bg-gray-800 transition"
        >
          Create Plan
        </button>
      </form>
    </div>
  );
}
