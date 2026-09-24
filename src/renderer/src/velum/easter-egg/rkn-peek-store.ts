import { create } from 'zustand'

// Bridges the title bar (where the click happens) and the sidebar-area scene (rkn-peeker.tsx) -
// they are not in the same subtree. Each peek() bumps `nonce`; the scene replays its whole
// sequence whenever it changes.
interface RknPeekStore {
  nonce: number
  peek: () => void
}

export const useRknPeekStore = create<RknPeekStore>((set) => ({
  nonce: 0,
  peek: (): void => set((s) => ({ nonce: s.nonce + 1 }))
}))
