/**
 * Oturum durumu — token localStorage'da, kullanıcı bilgisi bellekte.
 * Uygulama açılışında token varsa /auth/me ile doğrulanır (401 ise temizlenir).
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { User } from '../types';
import {
  authApi,
  clearToken,
  getToken,
  setToken,
} from '../services/api';

interface AuthContextValue {
  user: User | null;
  /** İlk yüklemede token doğrulanıyor mu? */
  loading: boolean;
  /** Tek giriş: admin/öğretmen e-posta, veli/öğrenci username. */
  login: (identifier: string, password: string) => Promise<void>;
  /** Kendi şifresini değiştir; dönen yeni token + user uygulanır. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  // Token yoksa doğrulama gerekmez — ilk render'da hazırız.
  const [loading, setLoading] = useState(() => getToken() !== null);

  useEffect(() => {
    if (!getToken()) {
      return;
    }
    let cancelled = false;
    authApi
      .me()
      .then(({ user: me }) => {
        if (!cancelled) setUser(me);
      })
      .catch(() => {
        if (!cancelled) {
          clearToken();
          setUser(null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const applyAuth = useCallback((token: string, user: User) => {
    setToken(token);
    setUser(user);
  }, []);

  const login = useCallback(
    async (identifier: string, password: string) => {
      const res = await authApi.login({ identifier, password });
      applyAuth(res.token, res.user);
    },
    [applyAuth],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const res = await authApi.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      applyAuth(res.token, res.user);
    },
    [applyAuth],
  );

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, changePassword, logout }),
    [user, loading, login, changePassword, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// Context + hook aynı dosyada — fast-refresh kuralı yalnızca component
// export'u bekler; bu yaygın context desenidir.
// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth, AuthProvider içinde kullanılmalı');
  }
  return ctx;
}
