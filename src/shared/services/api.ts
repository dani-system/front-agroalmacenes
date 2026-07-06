import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

console.info('[agro-debug] API_URL', API_URL);

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  console.info('[agro-debug] api request', {
    method: config.method,
    url: config.url,
    baseURL: config.baseURL,
    hasToken: Boolean(token),
  });
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl = error.config?.url || '';
    console.error('[agro-debug] api error', {
      status: error.response?.status,
      url: requestUrl,
      baseURL: error.config?.baseURL,
      message: error.response?.data?.message || error.message,
      pathname: window.location.pathname,
    });
    if (error.response?.status === 401 && requestUrl.includes('/auth/me')) {
      console.warn('[agro-debug] redirecting to login because session check failed', {
        url: requestUrl,
        pathname: window.location.pathname,
      });
      localStorage.removeItem('token');
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
