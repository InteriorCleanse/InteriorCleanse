import { NextResponse } from 'next/server'
import { newRef, saveOrder, type Order } from '@/lib/orders'
import { OPERATOR_EMAIL, sendEmail, shell } from '@/lib/email'

export const runtime = 'nodejs'

// Order request intake. No charge here — GCode charges on approval. This
// persists the request, emails the customer a confirmation and dispatch an
// alert, and returns a reference. The operator then verifies ownership,
// confirms the flat price, and mints a payment link from /operator.
export async function POST(req: Request) {
  let body: {
    items?: Array<{ name: string; qty: number; price: number; meta?: string }>
    contact?: { name?: string; email?: string; phone?: string; city?: string }
    service?: 'come' | 'mail'
    vehicle?: string
    docs?: { id?: boolean; registration?: boolean }
    ownershipConfirmed?: boolean
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  if (!body.items?.length) return NextResponse.json({ error: 'Your bag is empty.' }, { status: 400 })
  if (!body.contact?.name || !body.contact?.email) return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
  if (!body.vehicle) return NextResponse.json({ error: 'Tell us the vehicle.' }, { status: 400 })
  if (!body.ownershipConfirmed) return NextResponse.json({ error: 'Ownership must be confirmed.' }, { status: 400 })

  const ref = newRef()
  const order: Order = {
    ref,
    status: 'requested',
    createdAt: new Date().toISOString(),
    items: body.items.map((i) => ({ name: i.name, qty: i.qty, price: i.price, meta: i.meta })),
    contact: {
      name: body.contact.name,
      email: body.contact.email,
      phone: body.contact.phone,
      city: body.contact.city,
    },
    service: body.service === 'mail' ? 'mail' : 'come',
    vehicle: body.vehicle,
    docs: { id: !!body.docs?.id, registration: !!body.docs?.registration },
    ownershipConfirmed: true,
    quotedAmount: null,
    paidAt: null,
  }

  try {
    await saveOrder(order)
  } catch (err) {
    console.error('[order] save failed', err)
    // Don't lose the customer: still return a ref and alert the operator below.
  }

  // Fire-and-forget notifications; failures never block the response.
  const itemLines = order.items.map((i) => `${i.name} × ${i.qty}${i.meta ? ` (${i.meta})` : ''}`).join('<br>')
  void sendEmail({
    to: order.contact.email,
    subject: `We got your request · ${ref}`,
    html: shell(
      'Request received',
      `<p>Thanks, ${order.contact.name.split(' ')[0] || 'there'} — your request is in.</p>
       <p><b>Reference:</b> ${ref}<br><b>Vehicle:</b> ${order.vehicle}</p>
       <p>${itemLines}</p>
       <p>We'll verify your vehicle and documents, confirm your flat price in writing, and send a secure payment link. <b>No charge until you approve the price.</b> Programming happens at the vehicle.</p>`,
    ),
  })
  if (OPERATOR_EMAIL) {
    void sendEmail({
      to: OPERATOR_EMAIL,
      replyTo: order.contact.email,
      subject: `New order ${ref} · ${order.vehicle}`,
      html: shell(
        'New order to verify',
        `<p><b>${ref}</b> · ${order.service === 'mail' ? 'Mail-in' : 'Come-to-me'}</p>
         <p><b>${order.contact.name}</b> · ${order.contact.email}${order.contact.phone ? ` · ${order.contact.phone}` : ''}${order.contact.city ? ` · ${order.contact.city}` : ''}</p>
         <p><b>Vehicle:</b> ${order.vehicle}<br><b>ID:</b> ${order.docs.id ? 'attached' : '—'} · <b>Registration:</b> ${order.docs.registration ? 'attached' : '—'}</p>
         <p>${itemLines}</p>
         <p>Verify ownership, confirm the flat price, then create the payment link in the operator console.</p>`,
      ),
    })
  }

  return NextResponse.json({ ok: true, ref })
}
