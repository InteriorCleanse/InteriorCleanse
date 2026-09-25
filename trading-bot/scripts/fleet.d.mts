/** Types for the fleet's testable helpers (scripts/fleet.mjs). */
export declare const DEFAULT_SYMBOLS: string
export declare const STABLE_MS: number
export declare function laneEnv(base: Record<string, string | undefined>, lane: { symbol: string; index: number; port: number; dir: string }): Record<string, string | undefined>
export declare function restartDelay(crashes: number): number
