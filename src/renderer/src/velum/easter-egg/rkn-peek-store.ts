import { create } from 'zustand'

// Bridges the three places involved in the "shoot at RKN" easter egg, which are not in the same
// subtree: the title bar (where the click happens), the power button on Home (which flashes red
// and is the laser's origin - but only exists while Home is mounted), and the effects overlay
// (rkn-peeker.tsx, mounted globally) that draws RKN itself and the laser.
//
// Shared timing so the power button's own flash and the overlay's laser/knockback stay in sync.
export const RKN_PEEK_MS = 700
export const RKN_HOLD_MS = 150 // beat between RKN peeking in and getting shot
export const RKN_FIRE_MS = 250
export const RKN_HIT_MS = 450
// When the shot fires, relative to the trigger.
export const RKN_FIRE_DELAY_MS = RKN_PEEK_MS + RKN_HOLD_MS

interface RknPeekStore {
  nonce: number
  peek: () => void
  // Center of the power button at the moment it last fired, in screen coordinates - the laser's
  // origin. Null when Home (and so the real button) is not mounted; the RKN part of the scene
  // still plays without a visible beam in that case.
  powerButtonOrigin: { x: number; y: number } | null
  setPowerButtonOrigin: (origin: { x: number; y: number } | null) => void
}

export const useRknPeekStore = create<RknPeekStore>((set) => ({
  nonce: 0,
  peek: (): void => set((s) => ({ nonce: s.nonce + 1 })),
  powerButtonOrigin: null,
  setPowerButtonOrigin: (powerButtonOrigin): void => set({ powerButtonOrigin })
}))
