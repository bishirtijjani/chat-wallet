/**
 * Domain types shared between the API and the client. These mirror the
 * database's ledger and identity model (see docs/PROJECT_BIBLE.md §3).
 */

/** Ledger account types. See PROJECT_BIBLE §3.3. */
export type AccountType =
  | 'user_wallet' // one per user — money we hold on their behalf
  | 'circle_escrow' // one per circle — holds the pot mid-round (M3)
  | 'fees_revenue' // system — our cut (cycle fee, cash-out fee)
  | 'float' // system — bridges to the real bank/PSP
  | 'suspense'; // system — unreconciled funds

/**
 * Each account type has a "normal balance". An entry that matches the account's
 * normal side increases its balance; the opposite side decreases it. This lets
 * one signed formula derive balances for every account type.
 */
export type NormalBalance = 'debit' | 'credit';

export const ACCOUNT_NORMAL_BALANCE: Record<AccountType, NormalBalance> = {
  user_wallet: 'credit', // we owe the user; crediting increases what we owe
  circle_escrow: 'credit', // we owe the circle's members
  fees_revenue: 'credit', // revenue is normal-credit
  float: 'debit', // an asset (cash held at the PSP)
  suspense: 'credit',
};

export type EntryDirection = 'debit' | 'credit';

export interface LedgerEntry {
  id: string;
  transactionId: string;
  accountId: string;
  direction: EntryDirection;
  /** Positive integer kobo. */
  amount: number;
  createdAt: string;
}

/** The kinds of money movement the ledger records. */
export type TransactionKind =
  | 'wallet_funding' // PSP → user wallet
  | 'wallet_transfer' // user wallet → user wallet (in-app p2p)
  | 'wallet_cashout' // user wallet → PSP (bank)
  | 'cashout_fee' // user wallet → fees_revenue
  | 'contribution' // user wallet → circle escrow (a member pays into a round)
  | 'payout' // circle escrow → user wallet (the round's pot is disbursed)
  | 'cycle_fee' // coordinator wallet → fees_revenue (per-cycle coordinator fee)
  | 'reversal'; // corrects a prior transaction

export interface LedgerTransaction {
  id: string;
  kind: TransactionKind;
  reference: string;
  idempotencyKey: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  entries: LedgerEntry[];
}

export interface User {
  id: string;
  phone: string; // E.164, e.g. +2348012345678
  displayName: string | null;
  kycTier: 0 | 1 | 2 | 3;
  createdAt: string;
}

export interface Wallet {
  accountId: string;
  userId: string;
  /** Derived balance in kobo. */
  balance: number;
  currency: 'NGN';
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until the access token expires
}

// ── Chat (PROJECT_BIBLE §3.4) ────────────────────────────────────────────────

export type ConversationType = 'direct' | 'group';

/** Member role within a conversation. Circle coordinators are group admins. */
export type ConversationRole = 'admin' | 'member';

export type MessageType = 'text' | 'system' | 'image';

export interface Conversation {
  id: string;
  type: ConversationType;
  title: string | null; // set for groups
  /** Set when a ROSCA circle owns this group conversation (M3). */
  circleId: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface ConversationMember {
  conversationId: string;
  userId: string;
  role: ConversationRole;
  lastReadSeq: number;
  joinedAt: string;
}

export interface Message {
  id: string;
  conversationId: string;
  /** Monotonic per-message cursor used for ordering and read tracking. */
  seq: number;
  senderId: string | null; // null for system messages
  type: MessageType;
  body: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

/** A conversation plus the viewer-specific extras shown in a chat list. */
export interface ConversationSummary extends Conversation {
  lastMessage: Message | null;
  unreadCount: number;
}

/** Real-time socket event names shared by server and clients. */
export const SOCKET_EVENTS = {
  messageNew: 'message:new',
  conversationUpdated: 'conversation:updated',
} as const;

// ── ROSCA / Savings circles (PROJECT_BIBLE §3.2) ─────────────────────────────

export type Frequency = 'daily' | 'weekly' | 'monthly';

/** Only 'fixed' (admin-set draggable order) ships in v1; the rest come later. */
export type PayoutOrderMethod = 'fixed' | 'lottery' | 'auction' | 'needs_based';

export type CircleStatus = 'forming' | 'active' | 'completed' | 'cancelled';

export type MembershipStatus = 'invited' | 'active' | 'defaulted' | 'left';

export type RoundStatus = 'pending' | 'collecting' | 'paid' | 'closed';

export type ContributionStatus = 'due' | 'paid' | 'missed';

export interface Circle {
  id: string;
  name: string;
  contributionAmount: number; // kobo, per member per round
  frequency: Frequency;
  payoutOrderMethod: PayoutOrderMethod;
  memberCap: number; // slots = rounds in a full cycle
  status: CircleStatus;
  startDate: string | null;
  coordinatorId: string;
  escrowAccountId: string;
  conversationId: string;
  currentRound: number; // 0 while forming
  createdAt: string;
}

export interface CircleMember {
  id: string;
  circleId: string;
  userId: string;
  position: number | null; // payout turn (1..N); null until the order is set
  status: MembershipStatus;
  joinedAt: string;
}

export interface Round {
  id: string;
  circleId: string;
  roundNumber: number;
  recipientMembershipId: string | null;
  potAmount: number; // kobo
  status: RoundStatus;
  openedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface Contribution {
  id: string;
  roundId: string;
  membershipId: string;
  amount: number; // kobo
  status: ContributionStatus;
  transactionId: string | null;
  paidAt: string | null;
}

export interface Payout {
  id: string;
  roundId: string;
  recipientMembershipId: string;
  amount: number; // kobo
  transactionId: string;
  createdAt: string;
}

export type DisputeStatus = 'open' | 'resolved' | 'withdrawn';

export interface Dispute {
  id: string;
  circleId: string;
  raisedBy: string;
  subjectMembershipId: string | null;
  reason: string;
  status: DisputeStatus;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

/** Derived trust signal for a user, computed from their contribution history. */
export interface Reputation {
  totalContributions: number;
  paid: number;
  missed: number;
  onTime: number;
  /** On-time payments as a percentage of all contributions, or null if none yet. */
  reliabilityPct: number | null;
  circlesCompleted: number;
  circlesActive: number;
  circlesTotal: number;
}
