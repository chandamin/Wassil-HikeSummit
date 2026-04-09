const TOKEN_KEY = 'adminToken';

export const getToken = () => localStorage.getItem(TOKEN_KEY);

export const setToken = (token) => localStorage.setItem(TOKEN_KEY, token);

export const removeToken = () => localStorage.removeItem(TOKEN_KEY);

export const isAuthenticated = () => !!getToken();

/**
 * Returns headers object with Authorization + ngrok bypass.
 * Merge with any additional headers: { ...authHeaders(), 'Content-Type': 'application/json' }
 */
export const authHeaders = () => ({
  Authorization: `Bearer ${getToken()}`,
  'ngrok-skip-browser-warning': 'true',
});

/**
 * Call on 401 responses to clear state and redirect to login.
 */
export const handleUnauthorized = () => {
  removeToken();
  window.location.href = '/login';
};
