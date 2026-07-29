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

/** The kinds of money movement the ledger records in M1. */
export type TransactionKind =
  | 'wallet_funding' // PSP → user wallet
  | 'wallet_transfer' // user wallet → user wallet (in-app p2p)
  | 'wallet_cashout' // user wallet → PSP (bank)
  | 'cashout_fee' // user wallet → fees_revenue
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
