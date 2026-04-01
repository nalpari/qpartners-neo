import { create } from "zustand";

import type { LoginUser } from "@/lib/schemas/auth";

interface AuthState {
  user: LoginUser | null;
  isAuthenticated: boolean;
  setUser: (user: LoginUser | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  setUser: (user) => set({ user, isAuthenticated: user !== null }),
  logout: () => set({ user: null, isAuthenticated: false }),
}));
