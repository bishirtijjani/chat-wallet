# Chat & Wallet — Project Bible

> Working title. A social savings platform for Nigeria: a custom chat app, a
> ROSCA (adashe / esusu / ajo) engine, and an in-app wallet — all in one product.

**Status:** Draft v0.1 · **Owner:** @bishirtijjani · **Last updated:** 2026-07-15

This is the single source of truth for _what we're building and why_. Code
decisions should trace back to something in here. It is a living document —
when reality disagrees with the bible, we update the bible.

---

## 1. Vision

Nigerians already save together. **Adashe** (Hausa), **esusu / isusu**
(Yoruba/Igbo), and **ajo** (Yoruba) are rotating savings groups that have run on
trust and pen-and-paper for generations. People also pool money constantly for
life events — weddings, naming ceremonies, funerals, `aso ebi`.

The problem is never the _willingness_ to save together. It's the friction and
the trust risk:

- The coordinator (`alajo`) holds cash — theft, loss, and "the money finished" happen.
- Someone collects their payout and then stops contributing.
- No records. Disputes over who paid, who's next, how much is left.
- It's all offline — no reminders, no receipts, no history.

**Our bet:** put the group, the conversation, and the money in one app. The
chat is where the group lives; the ROSCA engine enforces the rules; the wallet
holds the money in a ledger nobody can fudge.

### What we are building

1. **Chat** — a custom real-time messaging app (1:1 and groups). Not WhatsApp
   integration — our own.
2. **ROSCA engine** — create a savings circle, set contribution amount +
   frequency, invite members, run rotating payouts, handle contributions and
   defaults.
3. **Wallet** — every user has an in-app wallet backed by a double-entry ledger.
   Fund it, contribute from it, receive payouts into it, cash out.

Each ROSCA circle _is_ a chat group. Money events post into the chat as system
messages ("Amina contributed ₦5,000", "Payout of ₦50,000 sent to Bello").

### Non-goals (for now)

- Not a general-purpose bank. No lending, no cards (initially).
- Not a WhatsApp bot / integration.
- Not crypto.
- Not multi-country at launch — Nigeria first, NGN only.

---

## 2. Users & core scenarios

**Primary personas**

- **Coordinator / admin** — starts a circle, sets the rules, invites people,
  chases late payers. Today this is the `alajo`.
- **Member** — joins a circle, contributes each round, receives a payout on
  their turn.

**Core user stories (v1)**

- As a coordinator, I can create a savings circle with an amount, a frequency,
  and a payout order.
- As a member, I can join a circle via an invite and see my position in the
  rotation.
- As a member, I can fund my wallet and have my contribution auto-collected each
  round.
- As a member, I receive my payout into my wallet when it's my turn.
- As a group, we can chat and see every money event as it happens.
- As a coordinator, I can see who has paid, who is late, and what the pot is.

---

## 3. Domain model

Three bounded contexts: **Identity**, **Money (wallet/ledger)**, **Savings
(ROSCA)**, plus **Chat**. They share the `user` but are otherwise decoupled and
talk through events.

### 3.1 Core entities (first pass)

```
User ──────────< Membership >────────── Circle
 │                                         │
 │                                         ├─ Round (one per rotation period)
 Wallet (1:1 with User)                    │    └─ Contribution (member → round)
 │                                         └─ Payout (to the round's recipient)
 └─ ledger accounts

Conversation ──< Message
 (a Circle has one group Conversation)
```

### 3.2 Savings (ROSCA) domain — the heart of the product

**Circle** — a savings group. The adashe/esusu unit.

| Field | Notes |
|---|---|
| `id` | |
| `name` | "Kano Traders Adashe" |
| `contribution_amount` | fixed amount each member pays per round, in kobo |
| `frequency` | `daily` \| `weekly` \| `monthly` |
| `payout_order_method` | `fixed` \| `lottery` \| `auction` \| `needs_based` |
| `member_cap` | number of slots = number of rounds in one full cycle |
| `status` | `forming` \| `active` \| `completed` \| `cancelled` |
| `start_date` | when round 1 begins |
| `coordinator_id` | the admin |
| `escrow_account_id` | the ledger account that holds this circle's money |

**Membership** — a user's slot in a circle.

- `position` — where they fall in the rotation (their payout turn).
- `status` — `invited` \| `active` \| `defaulted` \| `left`.
- `joined_at`.

**Round** — one rotation period. If a circle has 10 members, a full cycle is 10
rounds. Each round:

- collects `contribution_amount` from **every active member**,
- pays the whole pot to **one** member (the one whose `position` matches this
  round),
- has a `status`: `pending` → `collecting` → `paid` → `closed`.

**Contribution** — one member's payment into one round. `status`: `due` →
`paid` \| `missed`. This is the row we reconcile against the ledger.

**Payout** — the disbursement of a round's pot to its recipient.

#### How a cycle runs (the algorithm)

```
Circle of N members, contribution C per round.
Full cycle = N rounds. Pot each round = N × C.

For round r = 1..N:
  1. Determine recipient (by payout_order_method).
  2. Collect C from each active member's wallet → circle escrow.
  3. When all collected, pay pot (N × C) from escrow → recipient's wallet.
  4. Everyone pays in N times total and receives once. Net zero, minus fees.
```

The value isn't interest — it's the **forced lump sum**. You pay ₦5k × 10 weeks
and once during those 10 weeks you walk away with ₦50k you couldn't have saved
alone.

#### Payout order methods (design decision — see Open Questions)

- ✅ **Fixed, set by the admin via a draggable list (DECIDED for v1)** — the
  admin arranges the payout order by dragging members into position in the app.
  The order is locked when the cycle starts. Simple, familiar, and mirrors how
  the `alajo` decides turns today.
- **Lottery** — random draw each round. Fairer, needs a verifiable RNG. Later.
- **Auction** — members bid (discount) to receive early; the discount is shared
  with the rest. Powerful but complex. Later.
- **Needs-based** — coordinator assigns by need. Flexible but trust-heavy. Later.

The draggable order just sets each membership's `position`; the round algorithm
is unchanged. Lottery/auction later plug into the same `position` interface.

#### Default after payout — our stance (DECIDED)

The structural risk in every ROSCA: a member takes their payout in round 3 and
stops contributing for rounds 4–10 (received N×C, paid only 3×C).

✅ **We are digitizing an existing offline system, not underwriting it.** Just
like the local adashe, a member can refuse to pay — and just like the `alajo`,
the **circle admin adds the members and is responsible for chasing payment.**
The platform is not liable for a default and does not guarantee funds.

What that means for the build:

- **Admin-controlled membership** — the admin invites/adds people they trust.
  There is no open "anyone can join" flow. The admin owns the roster.
- **The app's job is transparency, not enforcement** — accurate records of who
  paid / who's late, reminders, and a clear paper trail for the admin to act on.
- **No guarantee fund, no platform liability** in v1. We surface the truth; the
  admin and the group handle consequences the way they always have.

Optional, later (not v1): reputation/completion history and auto-debit from a
funded wallet to make paying the path of least resistance — but these are
convenience, not a promise by us to cover losses.

### 3.3 Money domain — wallet & ledger

**Principle: double-entry, append-only ledger.** Money is never a mutable
`balance` column you increment. Every movement is a transaction with entries
that sum to zero. Balance is derived. This is non-negotiable for a money product.

```
Transaction (atomic, balanced)
  └─< Entry (account_id, direction debit/credit, amount)   -- entries sum to 0

Account types:
  - user_wallet     (one per user)
  - circle_escrow   (one per circle — holds the pot mid-round)
  - fees_revenue    (system — our cut, if any)
  - float / settlement (system — bridges to the real bank/PSP)
  - suspense        (system — unreconciled funds)
```

Example — a member contributes ₦5,000:

```
Transaction: "contribution, round 3, circle X, member Y"
  Debit  user_wallet(Y)     ₦5,000
  Credit circle_escrow(X)   ₦5,000
```

Payout of the ₦50,000 pot:

```
Transaction: "payout, round 3, circle X → member Z"
  Debit  circle_escrow(X)   ₦50,000
  Credit user_wallet(Z)     ₦50,000
```

Every entry must:

- reference a transaction that balances to zero,
- be **idempotent** (a dedupe key so a retried request can't double-charge),
- be immutable once written (corrections are new reversing transactions, never edits).

**Funding & cash-out (the boundary to the real world)**

In-app balances are just ledger numbers. Real money enters and leaves through a
**PSP** (payment service provider):

- **Fund wallet:** bank transfer / card / USSD via Paystack or Flutterwave →
  webhook confirms → we credit `user_wallet`, debit `float`.
- **Cash out:** user requests payout to bank → we debit `user_wallet`, credit
  `float` → PSP transfer API sends the money.

> ✅ **DECIDED — we are not the money implementors.** All funds move and are
> held through a licensed PSP: **Paystack or Monnify**. They are the
> deposit-taker / settlement layer of record; we integrate with their
> APIs (virtual accounts, transfers, webhooks) and keep only a mirror ledger for
> in-app accounting. **We do not hold customer funds ourselves and do not design
> as if we're the bank.** Monnify is strong for dedicated virtual accounts;
> Paystack for cards/transfers — we may use one or both.

### 3.4 Chat domain

- **Conversation** — `direct` (1:1) or `group`. A Circle owns one `group`
  conversation created when the circle forms.
- **Message** — `sender_id`, `conversation_id`, `body`, `type`
  (`text` | `system` | `image` | ...), `created_at`, delivery/read state.
- **System messages** — emitted by the ROSCA/wallet domains into the circle's
  conversation: contributions, payouts, joins, missed payments, round opening/closing.
- **Real-time** — WebSocket (Socket.IO) for live delivery; REST for history and
  send. Presence and read receipts later.

---

## 4. Architecture

### 4.1 High level

```
┌─────────────────────────────────────────────────────────────┐
│  ONE Expo codebase (React Native + React Native Web)          │
│  iOS   ·   Android   ·   web (browser)                        │
└───────────────────────────────┬─────────────────────────────┘
                                 │  REST (HTTPS) + WebSocket
                                 │
                        ┌──────────▼──────────┐
                        │  Express API (TS)   │
                        │  REST + Socket.IO   │
                        └──────────┬──────────┘
             ┌─────────────────────┼─────────────────────┐
             │                     │                     │
      ┌──────▼──────┐      ┌───────▼───────┐      ┌──────▼──────┐
      │ PostgreSQL  │      │     Redis     │      │  PSP        │
      │ source of   │      │ pub/sub,      │      │ Paystack /  │
      │ truth+ledger│      │ queues, cache │      │ Flutterwave │
      └─────────────┘      └───────────────┘      └─────────────┘
                                   │
                          ┌────────▼────────┐
                          │ Worker (BullMQ) │
                          │ round scheduler,│
                          │ collection,     │
                          │ payouts, reminders
                          └─────────────────┘
```

### 4.2 Stack (decided)

| Layer | Choice |
|---|---|
| Backend | **Node.js + TypeScript + Express** |
| Database | **PostgreSQL** (source of truth, ledger, everything) |
| Cache / queue / pub-sub | **Redis** (+ BullMQ for jobs) |
| Real-time | **Socket.IO** |
| Clients | **One Expo codebase** (React Native + React Native Web) → iOS, Android, **and** web |
| Payments | **PSP** — Paystack and/or Flutterwave (Nigeria) |
| Auth | Phone-number + OTP (SMS); JWT sessions |

**Why TypeScript everywhere:** one language across API, mobile, and web; share
domain types and validation (e.g. a `zod` schema for a contribution) between
client and server.

### 4.3 Repository shape (proposed monorepo)

```
chat-and-wallet/
├─ docs/                 ← this bible + ADRs + schema docs
├─ apps/
│  ├─ api/               ← Express + Socket.IO server
│  ├─ worker/            ← BullMQ jobs (scheduler, collection, payouts)
│  └─ app/               ← ONE Expo app → iOS, Android, and web (RN Web)
├─ packages/
│  ├─ shared/            ← domain types, zod schemas, constants (money in kobo)
│  └─ sdk/               ← typed API client used by the app on every platform
└─ package.json          ← workspaces (npm / pnpm)
```

We can start with just `apps/api` and grow into the monorepo.

### 4.4 Cross-cutting rules

- **Money is stored in the smallest unit — kobo (integer).** Never floats for money.
- **Every write that moves money goes through the ledger service.** No feature
  touches balances directly.
- **Idempotency keys** on all money-moving endpoints and on PSP webhooks.
- **The scheduler is the clock.** Rounds open/close and contributions get
  collected by the worker on a schedule, not by a user pressing a button.
- **Events between contexts.** ROSCA emits `ContributionCollected`,
  `PayoutSent`; Chat listens and posts system messages; the two don't call each
  other directly.

---

## 5. Security, trust & compliance

Money + chat = high stakes. Baseline requirements:

- **KYC tiers** — tiered onboarding matching CBN's 3-tier KYC (Tier 1: phone/BVN
  light limits; higher tiers need BVN/NIN + ID for higher limits). Required
  before real cash-out.
- **BVN/NIN verification** — via the PSP or an identity provider.
- **AML** — transaction monitoring, limits, flagging.
- **Auth** — phone + OTP, JWT with refresh, device binding, PIN/biometric for
  money actions.
- **Data protection** — **NDPR** (Nigeria Data Protection Regulation) compliance:
  consent, data minimization, the right to deletion.
- **Chat safety** — abuse/spam reporting, block, coordinator controls.
- **Ledger integrity** — append-only, periodic reconciliation of ledger vs. PSP
  balance, alerts on drift.

---

## 6. Revenue model

Margins are thin at launch — PSP fees eat into every transaction and users are
price-sensitive — so **v1 is about trust and growth, not profit.** We keep money
_inside_ the app free-flowing and only charge at the edges, in ways that feel
native to how adashe already works.

### v1 — DECIDED

1. ✅ **Cycle fee (coordinator fee).** The `alajo` already earns a cut in real
   life, so a fee here feels native, not like a tax. Charge a small fee per
   circle **cycle** — a flat naira amount or ~1–2% of a single round's pot — paid
   by the group. **We never touch members' contributions mid-circle.**
2. ✅ **Cash-out fee.** A small fee (flat ₦, or a %) when money leaves a wallet to
   a bank account. Users tolerate this because banks and PSPs already charge it.
   Contributions and payouts _within_ the app stay free, so money keeps
   circulating instead of leaving.

Accounting-wise this activates the `fees_revenue` ledger account: every fee is a
normal balanced transaction crediting `fees_revenue`.

### Later (not v1)

- **Float income** — interest on idle wallet/escrow balances. Only works if our
  licensed PSP partner (Paystack/Monnify) shares float revenue, since **they**
  hold the funds, not us. A negotiation, not a launch lever.
- **Premium / subscription** — free for small circles; paid tier for larger
  groups, more concurrent circles, analytics, verified-admin badge, priority
  support.
- **Value-added services** — airtime/bill payments, then the real prize: use each
  member's in-app savings/repayment history as a credit signal for lending /
  BNPL and insurance. This is where Nigerian fintechs typically become
  profitable.

> Guiding rule: charge for **moving money out** and for **running a circle** —
> never for saving. Saving must feel free.

---

## 7. Roadmap (build in slices)

Each milestone is shippable and testable on its own.

**M0 — Foundation**
Repo scaffold, PostgreSQL + migrations, auth (phone + OTP), health check, CI.
_Outcome: a running skeleton with users who can log in._

**M1 — Wallet & ledger core** ⭐ recommended first real slice
Double-entry ledger, user wallets, fund (PSP sandbox), transfer, cash-out,
balance/history. _Outcome: money can move correctly and provably._

**M2 — Chat core**
1:1 + group conversations, real-time messaging, history, system-message support.
_Outcome: people can talk; groups exist for circles to attach to._

**M3 — ROSCA engine**
Create circle, invite/join, fixed payout order, the round scheduler, auto
collection from wallet, payout to wallet, contribution tracking. Money events
post into the circle chat. _Outcome: a full adashe cycle runs end to end._

**M4 — Trust & robustness**
Reputation, late/missed handling, reminders, coordinator dashboard, dispute log.

**M5 — Client & polish**
One Expo app shipping to iOS, Android, and web; notifications, KYC flows, hardening.

> **Dependency order that matters:** Wallet (M1) underpins ROSCA (M3). Chat (M2)
> is where ROSCA surfaces to users. So M1 → M2 → M3 is the natural spine.

---

## 8. Open questions & decisions to make

These need answers (some are yours, some are legal/business, some we defer):

1. ✅ **Licensing / money layer — DECIDED.** Ride on a licensed PSP (Paystack or
   Monnify). We are not the fund holders/implementors.
2. ✅ **Payout order — DECIDED.** Admin-set `fixed` order via a draggable list in
   v1.
3. ✅ **Default policy — DECIDED.** Admin-controlled membership; admin is
   responsible for collection; platform is not liable and offers no guarantee
   fund. We digitize, we don't underwrite.
4. ✅ **Revenue model — DECIDED.** v1 = cycle fee + cash-out fee (see §6). We do
   need the `fees_revenue` ledger account from the start.
5. **Product name** — "Chat & Wallet" is a placeholder.
6. **Circle size / amount limits** — min/max members, min/max contribution
   (ties to KYC tiers).

✅ **Web scope — DECIDED.** No separate web app. One Expo codebase (React Native
Web) serves iOS, Android, and web from the same source.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| **Adashe** | Hausa term for a rotating savings group (ROSCA). |
| **Esusu / Isusu** | Yoruba/Igbo term for the same. |
| **Ajo** | Yoruba; rotating savings, sometimes daily collection by an `alajo`. |
| **Alajo** | The traditional collector/coordinator who holds and rotates the money. |
| **ROSCA** | Rotating Savings and Credit Association — the general term. |
| **Circle** | Our name for one savings group in the app. |
| **Round** | One rotation period; the pot pays out to one member. |
| **Cycle** | A full set of rounds — every member has collected once. |
| **Pot** | The total collected in a round (members × contribution). |
| **Aso ebi** | Matching fabric guests wear to a celebration; a form of event contribution. |
| **Kobo** | 1/100 of a naira; our integer money unit. |
| **PSP** | Payment Service Provider (Paystack, Flutterwave). |
| **KYC** | Know Your Customer — identity verification. |
| **BVN / NIN** | Bank Verification Number / National Identity Number. |
| **NDPR** | Nigeria Data Protection Regulation. |
| **CBN** | Central Bank of Nigeria — the regulator. |

---

_This document is v0.1 and expected to change. Propose edits via PR against
`docs/PROJECT_BIBLE.md`._
