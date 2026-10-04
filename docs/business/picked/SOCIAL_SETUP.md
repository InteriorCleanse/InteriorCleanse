# Social accounts: set them all up in one sitting

About 90 minutes. Do it the same day you register the domain, so nobody
takes the handles in between. Everything you need to paste or upload is on
this page or in `brand/`.

## Before you start

1. **A business email for every account:** `social@pickedprotein.com` (or a
   free Google Workspace alias). Not your personal email, so the accounts
   belong to the business and can be handed to a hire later.
2. **A password manager** (1Password, Bitwarden, or Apple Passwords). A
   different long password for each account.
3. **An authenticator app** for two-factor sign-in (Google Authenticator,
   Authy, or the password manager's own). Don't use text messages for
   two-factor; a stolen phone number takes every account with it.
4. **Save every recovery code** in the password manager the moment a
   platform shows it.

## The handle

**First choice: @pickedprotein** everywhere. Fallbacks in this order:
@drinkpicked, @picked.protein, @getpicked. Use the **same handle on every
platform**, even if that means the second choice everywhere. Check all of
them first, then claim.

Availability couldn't be checked from the research environment. Check each
platform's sign-up page yourself.

## The accounts

| Platform | Account type | Why | Priority |
| --- | --- | --- | --- |
| TikTok | **Business account** | Main growth channel; analytics; later TikTok Shop and Spark Ads | Now |
| Instagram | **Professional, Business** | Reels, proof, community; links to Facebook for ads | Now |
| Facebook Page | Page, created in Meta Business Suite | Required for Instagram ads and Meta's business tools | Now |
| YouTube | Channel on a **Brand Account** under the business Google account | Shorts reach; long-form later | Now |
| Pinterest | Business account | Recipe and fruit pins bring slow, steady search traffic | Claim now, post at launch |
| LinkedIn | Company Page | Store buyers, distributors, manufacturers look you up here | Now (5 minutes) |
| X | Standard account | Hold the handle; no posting plan | Claim only |
| Threads | Comes with Instagram | Hold the handle | Claim only |

**Business accounts on TikTok and Instagram** mean you may use only
commercially licensed music (TikTok's Commercial Music Library, Instagram's
library where marked). That's the right trade: a brand using a trending song
without a license can get a takedown.

## What to paste

### Names

| Platform | Display name |
| --- | --- |
| Instagram name field (searchable) | Picked · Real Fruit Protein |
| TikTok | Picked |
| YouTube | Picked |
| Facebook Page | Picked |
| LinkedIn | Picked |
| X | Picked |
| Pinterest | Picked · Real Fruit Protein |

### Bios (character counts checked)

**Instagram** (134 of 150)

```
Real fruit. Real protein.
Whey isolate drink mix, flavored with freeze-dried fruit.
Strawberry first. Waitlist: 20% off + free shaker.
```

**TikTok** (75 of 80)

```
Protein that tastes like real fruit. Building it in public. Waitlist below.
```

**X** (135 of 160)

```
Real fruit protein. We print the grams of fruit on the front and post every lot's lab results. Building it in public. Strawberry first.
```

**Facebook Page intro** (88 of 101)

```
Real fruit protein drink mix. The fruit grams are on the front, and every lot is tested.
```

**LinkedIn tagline** (89 of 120)

```
Real fruit protein drink mix. Fruit grams on the front, every lot tested, results public.
```

**LinkedIn About and YouTube description**

```
Picked is a whey protein drink mix flavored mainly by real freeze-dried
fruit. We print the grams of real fruit per serving on the front of every
pack, use no sucralose, acesulfame K, or artificial colors, and post every
lot's independent lab results in the Lot Book at pickedprotein.com/lots.

Strawberry comes first. The next flavor is chosen by the people on our
waitlist.

Stores, gyms, and cafés: hello@pickedprotein.com
```

**Pinterest** (127 of 500)

```
Real fruit protein. Recipes, fruit, and label reading from Picked, the whey protein drink mix flavored with freeze-dried fruit.
```

**Before the formula is final**, none of these say "20g protein". That
number goes in once it's on the final Supplement Facts.

### Link

Every platform links to **pickedprotein.com/links/**, the link page in
`site/links/`. It has four buttons (waitlist, Real Fruit Test, flavor vote,
Lot Book), each tagged so you can see which platform sent each signup. It
replaces Linktree at no cost. Change the buttons in one file and every
profile updates.

### Images

| Use | File | Size |
| --- | --- | --- |
| Profile picture, every platform | `brand/png/picked-mark-1024.png` (the leaf in a strawberry circle) | 1024 × 1024 |
| YouTube banner | `brand/social/profile/youtube-banner-2560x1440.png` | 2560 × 1440; the text sits inside YouTube's 1546 × 423 safe area |
| X header | `brand/social/profile/x-header-1500x500.png` | 1500 × 500 |
| Facebook cover | `brand/social/profile/facebook-cover-1640x624.png` | 1640 × 624 |
| LinkedIn banner | `brand/social/profile/linkedin-banner-1584x396.png` | 1584 × 396 |
| Instagram story highlight covers | Make in Canva from `marketing/INSTAGRAM.md`, "Story highlights" | 1080 × 1920 |

All banners come from one template, `brand/social/profile/banner.html`.
Change the line there and re-export if the tagline ever changes.

## Settings to turn on

**Every platform**

- Two-factor sign-in with the authenticator app. Recovery codes saved.
- Business email as the login; your phone as a backup only where required.
- Category: a food and beverage category wherever the platform offers one.
  Picked sells taste and fruit, not health, so avoid health categories.
- Contact button: email `hello@pickedprotein.com`. No phone number.

**Instagram**

- Link to the Facebook Page in Meta Business Suite (Settings, Accounts).
- Comment filter on, with these hidden words: detox, cleanse, skinny,
  ozempic, weight loss, fat burner. They catch claims in comments you'd
  otherwise have to reply to.
- Branded content tools on, so creators can tag paid partnerships.

**TikTok**

- Business account; category Food & Beverage.
- Comment filter on with the same words.
- Turn on "Content disclosure" for any post that promotes the brand once
  products exist (TikTok requires it for branded content).
- Don't apply for TikTok Shop yet: supplements need an invite and recent lab
  reports (`LAUNCH_GUIDE.md`).

**YouTube**

- Create the channel from a **Brand Account** so more people can manage it
  later without sharing a password.
- Set the handle and the channel description above. Shorts need no other
  setup.

**Facebook / Meta Business Suite**

- Create a Business Portfolio named Picked. Add the Page and Instagram.
- Add a payment method only when you start ads, and set a spending limit.

## Who else gets access, later

Never share passwords. When you hire help or a creator manager:

- **Meta:** add them in Business Suite with a role (Content or Messages),
  not admin.
- **TikTok:** TikTok Business Center lets you add members with roles.
- **YouTube:** add them to the Brand Account as Manager.
- **The AI team never logs in** to any platform. It drafts; you post
  (`ai-team/README.md`).

## Done when

- [ ] Same handle claimed on TikTok, Instagram, YouTube, Facebook, LinkedIn,
      Pinterest, X, and Threads
- [ ] Two-factor on everywhere, recovery codes saved
- [ ] Bios, names, and the links page in place
- [ ] Profile picture and banners uploaded
- [ ] Comment filters on for TikTok and Instagram
- [ ] Instagram linked to the Facebook Page
- [ ] First TikTok posted (`marketing/TIKTOK.md`, day 1)
