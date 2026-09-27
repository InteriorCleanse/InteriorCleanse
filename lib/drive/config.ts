/** Names and switches for the Drive section, in one place. */

export const DRIVE_NAME = 'Drive'

export const DRIVE_TAGLINE = 'Book the exact car you want, from a neighbour.'

/**
 * The section runs on a sample fleet, so it stays out of search indexes
 * until a real backend and real listings exist. Flip this when they do.
 */
export const DRIVE_INDEXABLE = false

/** Storage key for everything Drive keeps on the device. Bump to reset. */
export const DRIVE_STORAGE_KEY = 'ic-drive:v1'

export const DEFAULT_PICKUP_TIME = '10:00'
export const DEFAULT_RETURN_TIME = '10:00'

/** Free cancellation up to this many hours before pickup. */
export const FREE_CANCEL_HOURS = 24
