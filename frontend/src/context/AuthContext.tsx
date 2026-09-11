import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { UserResponse } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: UserResponse | null;
  token: string | null;
  login: (token: string, user: UserResponse) => void;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('ignite_shield_token');
  });

  const [user, setUser] = useState<UserResponse | null>(() => {
    const savedUser = localStorage.getItem('ignite_shield_user');
    if (savedUser) {
      try {
        return JSON.parse(savedUser);
      } catch {
        localStorage.removeItem('ignite_shield_token');
        localStorage.removeItem('ignite_shield_user');
      }
    }
    return null;
  });

  const [loading] = useState(false);

  useEffect(() => {
    if (token) {
      authApi.getMe(token).then((u) => {
        setUser(u);
        localStorage.setItem('ignite_shield_user', JSON.stringify(u));
      }).catch(() => {
        // Token expired — keep user logged in locally, backend will reject if needed
      });
    }
  }, [token]);

  const login = (newToken: string, newUser: UserResponse) => {
    setToken(newToken);
    setUser(newUser);
    localStorage.setItem('ignite_shield_token', newToken);
    localStorage.setItem('ignite_shield_user', JSON.stringify(newUser));
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('ignite_shield_token');
    localStorage.removeItem('ignite_shield_user');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        logout,
        isAuthenticated: !!token,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
