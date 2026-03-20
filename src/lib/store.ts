import { create } from "zustand";

interface AppState {
  sidebarOpen: boolean;
  toggleSidebar: () => void;
  setSidebarOpen: (open: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  sidebarOpen: false,
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

type PopupType = "id-inquiry" | "password-reset" | "personal-info" | "two-factor-auth" | "zipcode-search" | "signup-complete" | null;

interface PopupState {
  activePopup: PopupType;
  popupData: Record<string, unknown>;
  openPopup: (type: PopupType, data?: Record<string, unknown>) => void;
  closePopup: () => void;
}

export const usePopupStore = create<PopupState>((set) => ({
  activePopup: null,
  popupData: {},
  openPopup: (type, data = {}) => set({ activePopup: type, popupData: data }),
  closePopup: () => set({ activePopup: null, popupData: {} }),
}));
