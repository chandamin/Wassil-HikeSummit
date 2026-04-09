import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authHeaders } from '../utils/auth'; // Uses your exact auth.js export

const API_URL = `${import.meta.env.VITE_BACKEND_URL}/api/admin-auth/update-credentials`;

export default function AdminSettings() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    username: '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [message, setMessage] = useState({ type: '', text: '' });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage({ type: '', text: '' });

    if (!form.currentPassword) {
      return setMessage({ type: 'error', text: 'Current password is required' });
    }
    if (form.newPassword && form.newPassword !== form.confirmPassword) {
      return setMessage({ type: 'error', text: 'New passwords do not match' });
    }
    if (!form.username && !form.newPassword) {
      return setMessage({ type: 'error', text: 'Please enter a new username or password' });
    }

    setLoading(true);
    try {
      const res = await fetch(API_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders() //  Injects Bearer token + ngrok bypass
        },
        body: JSON.stringify({
          username: form.username || undefined,
          currentPassword: form.currentPassword,
          newPassword: form.newPassword || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');

      setMessage({ type: 'success', text: ' Credentials updated successfully!' });
      setForm({ username: '', currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
      // Optional: auto-logout on 401/403
      if (res?.status === 401) {
        import('../utils/auth').then(m => m.removeToken());
        navigate('/login', { replace: true });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 w-full max-w-md">
        <h2 className="text-white text-xl font-semibold mb-6">Update Admin Credentials</h2>
        
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* <div>
            <label className="block text-gray-400 text-sm mb-1">New Username (optional)</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => handleChange('username', e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-600 focus:outline-none focus:border-indigo-500 placeholder-gray-500"
              placeholder="Leave blank to keep current"
            />
          </div> */}

          <div>
            <label className="block text-gray-400 text-sm mb-1">Current Password *</label>
            <input
              type="password"
              required
              value={form.currentPassword}
              onChange={(e) => handleChange('currentPassword', e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-600 focus:outline-none focus:border-indigo-500 placeholder-gray-500"
              placeholder="Required to confirm changes"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">New Password (optional)</label>
            <input
              type="password"
              value={form.newPassword}
              onChange={(e) => handleChange('newPassword', e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-600 focus:outline-none focus:border-indigo-500 placeholder-gray-500"
              placeholder="Min 8 characters"
            />
          </div>

          <div>
            <label className="block text-gray-400 text-sm mb-1">Confirm New Password</label>
            <input
              type="password"
              value={form.confirmPassword}
              onChange={(e) => handleChange('confirmPassword', e.target.value)}
              className="w-full bg-gray-700 text-white rounded-lg px-4 py-2.5 text-sm border border-gray-600 focus:outline-none focus:border-indigo-500 placeholder-gray-500"
              placeholder="Re-enter new password"
            />
          </div>

          {message.text && (
            <p className={`text-sm rounded-lg px-3 py-2 ${
              message.type === 'error' 
                ? 'text-red-400 bg-red-900/30 border border-red-800' 
                : 'text-green-400 bg-green-900/30 border border-green-800'
            }`}>
              {message.text}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-medium rounded-lg px-4 py-2.5 text-sm transition"
          >
            {loading ? 'Updating...' : 'Update Credentials'}
          </button>
        </form>

        <button 
          onClick={() => navigate('/dashboard')} 
          className="mt-4 text-gray-400 hover:text-white text-sm w-full text-center"
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
}