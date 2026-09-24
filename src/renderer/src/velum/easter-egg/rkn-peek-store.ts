import { create } from 'zustand'

// Bridges the title bar (where the click happens) and the sidebar-area peeker (where the RKN logo
// actually lives) - they are not in the same subtree. Each peek() bumps `nonce`; the peeker replays
// its one-shot animation whenever it changes.
interface RknPeekStore {
  nonce: number
  peek: () => void
}

export const useRknPeekStore = create<RknPeekStore>((set) => ({
  nonce: 0,
  peek: (): void => set((s) => ({ nonce: s.nonce + 1 }))
}))
