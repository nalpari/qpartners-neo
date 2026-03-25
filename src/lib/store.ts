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

type PopupType = "id-inquiry" | "password-reset" | "personal-info" | "two-factor-auth" | "zipcode-search" | "signup-complete" | "password-change" | "withdraw" | "member-detail" | "notice-form" | "permission-menu" | null;

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

interface AlertOptions {
  type: "alert" | "confirm";
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface AlertState {
  isOpen: boolean;
  options: AlertOptions | null;
  openAlert: (options: AlertOptions) => void;
  closeAlert: () => void;
}

export const useAlertStore = create<AlertState>((set) => ({
  isOpen: false,
  options: null,
  openAlert: (options) => set({ isOpen: true, options }),
  closeAlert: () => set({ isOpen: false, options: null }),
}));
