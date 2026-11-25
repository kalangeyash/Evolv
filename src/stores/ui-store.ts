"use client";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { todayISO } from "@/lib/utils/dates";
import type { ISODate } from "@/lib/db/types";

/**
 * UI-only state. Health records never live here — they are in IndexedDB.
 * Only the sidebar preference is persisted (localStorage), because losing
 * it costs nothing.
 */
interface UIState {
  selectedDate: ISODate;
  setSelectedDate: (d: ISODate) => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
}

export const useUI = create<UIState>()(
  persist(
    (set) => ({
      selectedDate: todayISO(),
      setSelectedDate: (d) => set({ selectedDate: d }),
      sidebarCollapsed: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "evolv-ui",
      partialize: (s) => ({ sidebarCollapsed: s.sidebarCollapsed }),
    },
  ),
);
