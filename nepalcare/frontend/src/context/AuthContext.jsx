import { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!localStorage.getItem('nepalcare_token')) { setLoading(false); return; }
    api.get('/auth/me').then(({ data }) => setUser(data.data.user)).catch(() => localStorage.removeItem('nepalcare_token')).finally(() => setLoading(false));
  }, []);
  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('nepalcare_token', data.data.token); setUser(data.data.user); return data.data.user;
  }
  async function register(payload) {
    const { data } = await api.post('/auth/register', payload);
    localStorage.setItem('nepalcare_token', data.data.token); setUser(data.data.user); return data.data.user;
  }
  function logout() { localStorage.removeItem('nepalcare_token'); setUser(null); }
  return <AuthContext.Provider value={{ user, loading, login, register, logout }}>{children}</AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
