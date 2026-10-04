# AVANT on the App Store

The iOS app is a native Capacitor shell (`ios/`, `capacitor.config.ts`)
around the live service. Cars, prices, trips and messages are
server-rendered and change by the minute, so the app loads the production
site and adds what only the phone can do:

| Native | Where |
| --- | --- |
| Push notifications for requests, confirmations, messages and reminders (APNs, token-based) | `lib/server/push.ts`, `lib/native.ts`, Profile → Notifications |
| The iOS share sheet for invite links and the data export | `lib/native.ts`, Circle, Profile |
| Haptics when a car is saved or a trip is booked | `lib/native.ts` |
| Camera and photo library for listing and check-in photos | file inputs; `Info.plist` usage strings |
| Location for "cars near you", on the device only | `Info.plist` usage string |
| A branded launch screen and an offline screen | `native/brand/`, `native/offline.template.html` |
| No website footer or desktop shortcuts inside the app; the status bar and safe areas respected | `app/layout.tsx`, `app/globals.css` |

## What you need

- A Mac with Xcode 26 or later. Nothing else can build or upload an iOS app.
- An Apple Developer Program membership (organisation account, so the seller
  name is the company, not a person). Enrol with the company's D-U-N-S number.
- The production site live on its own domain, with `NEXT_PUBLIC_SITE_URL` set.

## One-time setup

1. **Bundle id.** developer.apple.com → Identifiers → add an App ID, for
   example `com.yourcompany.avant`, with the **Push Notifications** capability.
2. **Push key.** Keys → add a key with Apple Push Notifications service.
   Download the `.p8` once. In Vercel set `APNS_KEY_P8` (the file's text),
   `APNS_KEY_ID`, `APNS_TEAM_ID` and `APNS_TOPIC` (the bundle id). Leave
   `APNS_SANDBOX` unset in production.
3. **App Store Connect.** My Apps → New App: platform iOS, name **AVANT**
   (or a variant if taken), primary language English (U.S.), the bundle id
   above, SKU `avant-ios`.

## Build and upload

```bash
cd avant
npm ci
AVANT_APP_URL=https://your.domain AVANT_IOS_BUNDLE_ID=com.yourcompany.avant npm run ios:sync
npm run ios:open
```

In Xcode: select the **App** target → Signing & Capabilities → your team;
confirm the bundle id; check **Push Notifications** is listed (it comes from
`App.entitlements`). Set the version (1.0) and build (1). Then Product →
Archive → Distribute App → App Store Connect → Upload. Test it through
TestFlight on a real iPhone before submitting: sign up, verify the email,
book, message, turn notifications on and receive one, share an invite, go
offline and back.

## Listing text

**Name:** AVANT
**Subtitle (30):** Cars worth remembering
**Category:** Travel (secondary: Lifestyle)
**Age rating:** answer the questionnaire honestly: no objectionable
content, and no unrestricted web access (links to other sites leave the app
for Safari). Being 18 or older to use AVANT is enforced at sign-up and in the
terms, not by the rating.

**Promotional text (170):**
The whole price up front. Coverage in one number. Lower fees the more you
drive, and if a host ever cancels on you, we make it right.

**Description:**

> Book the exact car you want from a neighbour who cares for it.
>
> THE WHOLE PRICE, UP FRONT
> Every fee is in the price you see while you search. Taxes are their own
> line. The total at checkout is what you pay.
>
> COVERAGE IN ONE NUMBER
> Choose a protection plan by the most you could ever owe, not a page of
> clauses.
>
> AVANT CIRCLE
> Your trip fee falls as you drive with us: Silver after 3 trips, Gold after
> 10, with longer free cancellation.
>
> THE AVANT PROMISE
> If a host cancels a confirmed trip, you're refunded in full and we add
> credit for the trouble.
>
> FOR HOSTS
> List your car in minutes with your own photos, set your price and rules,
> and get paid through Stripe after every trip.
>
> PRIVATE BY DESIGN
> Your licence is checked once and never stored. Messages, addresses and
> pickup notes are encrypted. Download or delete your data any time.

**Keywords (100):**
`car sharing,rent a car,car rental,peer to peer,borrow car,road trip,luxury car,EV rental,host,weekend`

**Support URL:** `https://your.domain/more` (or a dedicated support page)
**Marketing URL:** `https://your.domain/why`
**Privacy Policy URL:** `https://your.domain/legal/privacy`

## App Privacy (the "nutrition label")

Matches `ios/App/App/PrivacyInfo.xcprivacy`. Tracking: **No**. Every item
below is **linked to the user** and used for **App Functionality** only.

| Data type | Collected | Notes |
| --- | --- | --- |
| Contact Info → Name, Email Address | Yes | Account |
| Contact Info → Physical Address | Yes | Only a delivery address the guest types; removed 30 days after the trip |
| Financial Info → Payment Info | Yes | Collected by Stripe; AVANT never sees card numbers |
| User Content → Photos | Yes | Listing and check-in photos, metadata removed |
| User Content → Emails or Text Messages | Yes | Messages between guest and host |
| User Content → Customer Support, Other User Content | Yes | Concierge questions, reviews |
| Identifiers → User ID | Yes | Account id |
| Purchases → Purchase History | Yes | Trips |
| Other Data | Yes | Driver eligibility facts: age in years, licence validity, clean record |
| Location | **No** | Used on the device to pick the nearest city; never sent |
| Usage Data, Diagnostics, Browsing History | **No** | No analytics or crash SDKs |

## App Review notes

Paste into App Review Information → Notes, and create the demo account in
production first (verified email, a completed trip, a message thread):

> AVANT is a peer-to-peer car sharing marketplace (like a rental counter
> where the cars belong to private owners). Guests pay hosts for the use
> of a physical car, a service consumed outside the app, so payments go
> through Stripe under guideline 3.1.5(a); nothing digital is sold.
> AVANT credit can't be bought; it is a refund or loyalty reward only.
>
> Demo account: reviewer@your.domain / [password]. It has a past trip,
> a conversation with a host, and Circle credit.
>
> Native features: push notifications (Profile → Notifications), the iOS
> share sheet (Circle → Share invite), haptics, camera for listing photos
> (Host → List your car), an offline screen.
>
> Account deletion: Profile → Close account. Data export: Profile →
> Download all my data.
>
> Licence verification uses Stripe Identity and is skipped for the demo
> account.

Sign in with Apple is not required: AVANT offers only its own email
sign-in, no third-party or social login (guideline 4.8).

## Screenshots

Required: iPhone 6.9" (1320 × 2868). Apple scales them down for smaller
iPhones. The app is iPhone-only (`TARGETED_DEVICE_FAMILY = 1`), so no iPad
screenshots are needed. A first set, taken from the app shell at 1320 × 2868,
is in `native/screenshots/`, in upload order:

| File | Caption |
| --- | --- |
| `1-home.png` | Cars worth remembering. From people who care for them. |
| `2-search.png` | The whole price, up front. Every fee is in the price you compare. |
| `3-car.png` | Know the car before you go. The host's own photos, rules and record. |
| `4-checkout.png` | Coverage in one number. Choose the most you could ever owe. |
| `5-circle.png` | Drive more, pay less. Your trip fee falls with every trip. |
| `6-messages.png` | Talk to your host, privately. Messages are encrypted and stay on AVANT. |

The app icon (1024 × 1024, no transparency) and launch screen are drawn
from the crest in `native/brand/` (`app-icon.svg`, `splash.svg`). They show sample listings, which are labelled
"Sample" and have no photos. **Retake them once real hosts have listed
real cars**: a listing with the host's own photos sells the app far better,
and App Review expects screenshots to show the app as customers will see
it.

## Before you press Submit

- [ ] Production has `NEXT_PUBLIC_AVANT_SAMPLE_FLEET=0` and real listings,
      or reviewers will see sample cars and may reject the app as incomplete.
- [ ] Email is configured (verification and reset links work from the app).
- [ ] APNs keys set; a TestFlight build received a notification.
- [ ] The privacy policy and terms are final (no "Draft" notice): App
      Review checks the privacy policy link.
- [ ] Demo account works and is in the review notes.
- [ ] Insurance and state requirements in `LEGAL_BRIEF.md` are done for the
      launch state; App Review can ask for proof that you may operate.
