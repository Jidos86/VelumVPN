// Dev aid: set this to an object and the manual "Check for updates" on Home will report that version
// as available (bright update tile, updater dialog) without going over the network. Use a version that
// does not exist so pressing "install" can never fetch a real build. Leave it `undefined` in commits.
export const SIMULATED_UPDATE: { version: string; changelog: string } | undefined = undefined
