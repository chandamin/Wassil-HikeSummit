import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { setToken } from '../utils/auth';

const LOGIN_URL = `${import.meta.env.VITE_BACKEND_URL}/api/admin-auth/login`;

export default function Login() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(LOGIN_URL, {
        method: 'POST',
        headers: {
              'Content-Type': 'application/json',
              Accept: "application/json",
              "ngrok-skip-browser-warning": "true",
            },
        body: JSON.stringify(form),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error || 'Login failed');
        return;
      }

      setToken(data.token);
      navigate('/dashboard', { replace: true });
    } catch {
      setError('Unable to reach server. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex justify-center py-[10px]">
        <img
          src="../images/hike-summit.webp"
          alt="Store logo"
          className="h-14 w-auto object-contain"
        />
    </div>
   <div className="h-[calc(100%-76px)] bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <h1 className="text-white text-3xl font-bold">Nomade Horizon</h1>
          <p className="text-gray-400 text-sm mt-1">Subscriptions At Convenience</p>
        </div>

        {/* Card */}
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8">
          <h2 className="text-white text-xl font-semibold mb-6">Admin Login</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-gray-400 text-sm mb-1">Username</label>
              <input
                type="text"
                autoComplete="username"
                required
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 text-sm
                  border border-gray-600 focus:outline-none focus:border-indigo-500
                  placeholder-gray-500"
                placeholder="Enter username"
              />
            </div>

            <div>
              <label className="block text-gray-400 text-sm mb-1">Password</label>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 text-sm
                  border border-gray-600 focus:outline-none focus:border-indigo-500
                  placeholder-gray-500"
                placeholder="Enter password"
              />
            </div>

            {error && (
              <p className="text-red-400 text-sm bg-red-900/30 border border-red-800 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60
                text-white font-medium rounded-lg px-4 py-2.5 text-sm transition"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
    </>
  );
}
