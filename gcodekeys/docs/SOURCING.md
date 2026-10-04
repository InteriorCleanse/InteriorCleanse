# GCode Keys — sourcing, manufacturing, and automated fulfillment

How to source keys and custom parts, and how to automate order-to-ship so the
business runs print-on-demand. Researched 2026-10-03; verify pricing and API
terms with each vendor before committing.

## The honest shape of "print on demand" for car keys

A working car key is two things: a **shell/blade** (plastic + metal) and the
**electronics** (transponder chip and/or remote PCB). You can manufacture or
print the shell, color, cover and engraving on demand. You **cannot** 3D-print
working electronics — the transponder/remote is an OEM or aftermarket module
that still has to be **coded to the car at the vehicle**. So the automated
model is:

1. **Custom cosmetic layer** (shells, covers, engraving, keychains, Faraday
   pouches): true print-on-demand / 3D-print-on-demand, fully automatable.
2. **Functional keys** (transponder, remote, smart): drop-ship the correct
   blank fob from a wholesale distributor, then code it at the vehicle. The
   "automation" here is catalog + ordering + routing, not printing.

Build the site so each order line routes to the right fulfillment path
automatically.

## 1. Functional keys and fobs — wholesale distributors (USA)

Open trade accounts with two of these for redundancy and price:

| Distributor | What they carry | Notes |
| --- | --- | --- |
| [UHS Hardware](https://www.uhs-hardware.com/) | OEM + aftermarket keys, fobs, Xhorse/Autel/KEYDIY, cutting machines | Florida; free shipping over $99; VIN-based lookup |
| [Key4](https://www.key4.com/) | Keys, remotes, transponder chips/keys, emulators, blades | Strattec, Ilco, JMA, FOBIKO stock |
| [Locksmith Keyless](https://www.locksmithkeyless.com/) | Xhorse, Autel, universal remotes | Wholesale, bulk pricing |
| [Royal Key Supply](https://royalkeysupply.com/collections/universal-smart-keys) | Universal smart keys (Autel/Xhorse/KEYDIY) | Bulk options |
| [KeylessCity](https://keyless-city.com/collections/universal-remotes) | Universal remotes and smart keys | Same-day US shipping |

**Universal/programmable fobs** (one blank covers many models, you set it up
with your programmer): **Xhorse (VVDI)**, **KEYDIY (KD)**, **Autel**. These
cut your SKU count dramatically — a handful of universal fobs cover hundreds
of vehicles. Pair with an Autel IM508S/IM608 or Xhorse Key Tool Plus to code.

Most of these distributors are order-by-web, not real-time API. Automate with:
- A nightly stock/price sync (scrape or their feed where offered).
- Auto-generated purchase orders when a customer order lands, emailed or
  placed through the distributor's account.
- Later, ask each for an EDI/API or dropship program (UHS and Key4 both run
  dealer programs worth asking about).

## 2. Custom shells, covers, engraving — true print-on-demand

The cosmetic, high-margin layer. Two production routes:

- **3D-print-on-demand (custom shells, holders, accessories):**
  [Shapeways](https://www.shapeways.com/) and
  [Gelato](https://www.gelato.com/) both expose **order APIs** and route jobs
  to local production partners automatically. Shapeways handles SLS/engineering
  materials for durable shells; Gelato is the largest production-on-demand
  network with API + Shopify/Woo/custom-store integrations and local printing
  for fast, cheap shipping.
- **Flat/branded accessories (covers, keychains, Faraday pouches, cards):**
  [Printful](https://www.printful.com/print-on-demand),
  [Prodigi](https://www.prodigi.com/), and white-label fulfillers like
  [Fulfill Engine](https://fulfillengine.com/) and
  [White Label MFG](https://whitelabelmfg.com/on-demand) offer API-driven,
  white-label dropship with your packaging.

**Recommended automated stack:** Gelato (or Shapeways) API for custom shells
and 3D parts, Printful/Prodigi API for soft accessories, both triggered by the
same checkout. Each has a REST API: on paid order, POST the line items with
the design file, they print and ship under your label, and send tracking back
by webhook.

## 3. Laser engraving

For engraved heads and metal covers, either:
- Use the POD partner's engraving option where available, or
- Run a desktop fiber/diode laser in-house (xTool, OMTech class) for same-day
  custom engraving and the best margin. Low capex, fully in your control.

## 4. The automation flow to build next (site side)

1. Customer designs a key → line item carries `{ family, color, finish,
   engrave, vehicle, fulfillment }`.
2. On paid, verified order, a server job **splits the order by fulfillment**:
   - `aftermarket` functional key → create a distributor PO + dispatch job.
   - cosmetic shell/cover → POST to Gelato/Printful API with the generated
     design file.
   - `oem` / `dealer-coordinated` → create an operator task to confirm price
     and coordinate the OEM key.
3. Collect tracking by webhook; email the customer; update order status.
4. Programming is always scheduled at the vehicle after verification.

This is the "automated print-on-demand" business: the custom layer prints and
ships itself; the functional layer auto-orders and routes to a verified
at-vehicle coding appointment.

## Legal / IP guardrails

- Sell OEM or aftermarket-compatible parts; **do not reproduce a maker's logo
  or trademark** on custom shells for resale. Offer color/finish/engraving and
  neutral or your-own-brand marks.
- Keep ownership verification on every order (ID + registration + VIN match).
- Never advertise or build remote (not-at-vehicle) programming.
