/**
 * The live order state machine. A real order moves through a fixed set of
 * states, and only certain moves are legal; anything else is a bug we want to
 * catch, not a silent corruption of position state. Pure: given an order and an
 * event, it returns the next order or throws on an illegal transition.
 */

export type OrderState = 'new' | 'submitted' | 'open' | 'partially_filled' | 'filled' | 'cancelled' | 'rejected' | 'reconciled'

export type LiveOrder = {
  id: string
  clientOrderId: string
  symbol: string
  side: 'BUY' | 'SELL'
  state: OrderState
  requestedQty: number
  filledQty: number
  avgPrice: number
  events: Array<{ at: number; from: OrderState; to: OrderState; detail: string }>
}

/** Legal transitions. Terminal states (filled/cancelled/rejected/reconciled) go nowhere except reconciled. */
const LEGAL: Record<OrderState, OrderState[]> = {
  new: ['submitted', 'rejected'],
  submitted: ['open', 'partially_filled', 'filled', 'rejected', 'cancelled'],
  open: ['partially_filled', 'filled', 'cancelled', 'rejected'],
  partially_filled: ['partially_filled', 'filled', 'cancelled'],
  filled: ['reconciled'],
  cancelled: ['reconciled'],
  rejected: ['reconciled'],
  reconciled: [],
}

export function canTransition(from: OrderState, to: OrderState): boolean {
  return LEGAL[from]?.includes(to) ?? false
}

export function newOrder(o: { id: string; clientOrderId: string; symbol: string; side: 'BUY' | 'SELL'; requestedQty: number }): LiveOrder {
  return { ...o, state: 'new', filledQty: 0, avgPrice: 0, events: [] }
}

export type FillEvent = { to: OrderState; at: number; fillQty?: number; fillPrice?: number; detail?: string }

/** Apply an event, enforcing the legal transitions. Throws on an illegal move. */
export function applyEvent(order: LiveOrder, ev: FillEvent): LiveOrder {
  if (!canTransition(order.state, ev.to)) {
    throw new Error(`Illegal order transition: ${order.state} → ${ev.to} (order ${order.id})`)
  }
  let filledQty = order.filledQty
  let avgPrice = order.avgPrice
  if (ev.fillQty && ev.fillQty > 0 && ev.fillPrice && ev.fillPrice > 0) {
    const newFilled = filledQty + ev.fillQty
    avgPrice = newFilled > 0 ? (avgPrice * filledQty + ev.fillPrice * ev.fillQty) / newFilled : ev.fillPrice
    filledQty = newFilled
  }
  return {
    ...order, state: ev.to, filledQty, avgPrice,
    events: [...order.events, { at: ev.at, from: order.state, to: ev.to, detail: ev.detail ?? '' }],
  }
}

/**
 * The real exposure an order represents right now. A rejected order carries no
 * exposure — that is the guarantee against a phantom position: a reject leaves
 * zero, never a half-open guess.
 */
export function exposureQty(order: LiveOrder): number {
  if (order.state === 'rejected') return 0
  return order.filledQty
}
