import { create } from 'zustand';

type AppStore = {
  isInitialized: boolean;
  setInitialized: (value: boolean) => void;
  reset: () => void;
};

const initialState = {
  isInitialized: true,
};

export const useAppStore = create<AppStore>((set) => ({
  ...initialState,
  setInitialized: (value) => set({ isInitialized: value }),
  reset: () => set(initialState),
}));
