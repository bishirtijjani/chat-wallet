import { randomUUID } from 'node:crypto';
import type { LedgerTransaction, Wallet } from '@caw/shared';
import { SYSTEM_ACCOUNTS, computeCashOutFee, kobo } from '@caw/shared';
import { withTransaction } from '../../db/pool.js';
import { AppError } from '../../http/errors.js';
import {
  getAccountByCode,
  getBalance,
  getOrCreateUserWallet,
  lockAccount,
  postTransaction,
} from './ledger.service.js';
import { getPsp } from './psp.js';

/**
 * Wallet operations for M1. Each one opens a single DB transaction, locks the
 * accounts it touches, checks balances, and posts one balanced ledger
 * transaction. No code outside the ledger service mutates balances.
 */

export async function getWallet(userId: string): Promise<Wallet> {
  return withTransaction(async (client) => {
    const account = await getOrCreateUserWallet(client, userId);
    const balance = await getBalance(client, account.id);
    return { accountId: account.id, userId, balance, currency: 'NGN' };
  });
}

export async function getHistory(
  userId: string,
  limit = 50,
): Promise<
  Array<{
    transactionId: string;
    kind: string;
    reference: string;
    direction: 'debit' | 'credit';
    amount: number;
    createdAt: string;
  }>
> {
  return withTransaction(async (client) => {
    const account = await getOrCreateUserWallet(client, userId);
    const { rows } = await client.query(
      `SELECT e.transaction_id, t.kind, t.reference, e.direction, e.amount, e.created_at
         FROM ledger_entries e
         JOIN ledger_transactions t ON t.id = e.transaction_id
        WHERE e.account_id = $1
        ORDER BY e.created_at DESC
        LIMIT $2`,
      [account.id, limit],
    );
    return rows.map((r) => ({
      transactionId: r.transaction_id as string,
      kind: r.kind as string,
      reference: r.reference as string,
      direction: r.direction as 'debit' | 'credit',
      amount: Number(r.amount),
      createdAt: (r.created_at as Date).toISOString(),
    }));
  });
}

/**
 * Fund a wallet. The PSP pulls real money into the platform float; we mirror it
 * as: debit float, credit user_wallet.
 */
export async function fundWallet(params: {
  userId: string;
  amount: number;
  idempotencyKey?: string;
}): Promise<{ transaction: LedgerTransaction; balance: number }> {
  const amount = kobo(params.amount);
  const reference = `fund_${randomUUID()}`;

  // Charge the PSP first (outside the DB tx). In sandbox this always succeeds.
  const charge = await getPsp().charge({
    amountKobo: amount,
    userId: params.userId,
    reference,
  });

  return withTransaction(async (client) => {
    const wallet = await getOrCreateUserWallet(client, params.userId);
    const float = await getAccountByCode(client, SYSTEM_ACCOUNTS.float);

    const transaction = await postTransaction(client, {
      kind: 'wallet_funding',
      reference,
      idempotencyKey: params.idempotencyKey ?? null,
      metadata: { providerReference: charge.providerReference, provider: getPsp().name },
      legs: [
        { accountId: float.id, direction: 'debit', amount },
        { accountId: wallet.id, direction: 'credit', amount },
      ],
    });

    const balance = await getBalance(client, wallet.id);
    return { transaction, balance };
  });
}

/**
 * Move money between two users' wallets in-app: debit sender, credit recipient.
 * Free (contributions/payouts within the app don't leave — PROJECT_BIBLE §6).
 */
export async function transfer(params: {
  fromUserId: string;
  toUserId: string;
  amount: number;
  note?: string;
  idempotencyKey?: string;
}): Promise<{ transaction: LedgerTransaction; balance: number }> {
  if (params.fromUserId === params.toUserId) {
    throw AppError.badRequest('Cannot transfer to yourself');
  }
  const amount = kobo(params.amount);
  const reference = `xfer_${randomUUID()}`;

  return withTransaction(async (client) => {
    const from = await getOrCreateUserWallet(client, params.fromUserId);
    const to = await getOrCreateUserWallet(client, params.toUserId);

    // Lock both wallets in a stable order to avoid deadlocks.
    for (const accountId of [from.id, to.id].sort()) {
      await lockAccount(client, accountId);
    }

    const senderBalance = await getBalance(client, from.id);
    if (senderBalance < amount) {
      throw AppError.unprocessable('Insufficient balance', {
        balance: senderBalance,
        required: amount,
      });
    }

    const transaction = await postTransaction(client, {
      kind: 'wallet_transfer',
      reference,
      idempotencyKey: params.idempotencyKey ?? null,
      metadata: { note: params.note ?? null, toUserId: params.toUserId },
      legs: [
        { accountId: from.id, direction: 'debit', amount },
        { accountId: to.id, direction: 'credit', amount },
      ],
    });

    const balance = await getBalance(client, from.id);
    return { transaction, balance };
  });
}

/**
 * Cash out to a bank account. We debit the wallet for amount + fee, credit
 * fees_revenue with the fee, and credit float with the amount leaving; the PSP
 * then pushes the money to the bank.
 */
export async function cashOut(params: {
  userId: string;
  amount: number;
  bankAccountNumber: string;
  bankCode: string;
  idempotencyKey?: string;
}): Promise<{ transaction: LedgerTransaction; balance: number; fee: number }> {
  const amount = kobo(params.amount);
  const fee = computeCashOutFee(amount);
  const total = amount + fee;
  const reference = `cashout_${randomUUID()}`;

  const result = await withTransaction(async (client) => {
    const wallet = await getOrCreateUserWallet(client, params.userId);
    const float = await getAccountByCode(client, SYSTEM_ACCOUNTS.float);
    const fees = await getAccountByCode(client, SYSTEM_ACCOUNTS.feesRevenue);

    await lockAccount(client, wallet.id);

    const balance = await getBalance(client, wallet.id);
    if (balance < total) {
      throw AppError.unprocessable('Insufficient balance for amount plus fee', {
        balance,
        amount,
        fee,
        required: total,
      });
    }

    const transaction = await postTransaction(client, {
      kind: 'wallet_cashout',
      reference,
      idempotencyKey: params.idempotencyKey ?? null,
      metadata: {
        bankAccountNumber: params.bankAccountNumber,
        bankCode: params.bankCode,
        fee,
      },
      legs: [
        { accountId: wallet.id, direction: 'debit', amount: total },
        { accountId: float.id, direction: 'credit', amount },
        { accountId: fees.id, direction: 'credit', amount: fee },
      ],
    });

    const newBalance = await getBalance(client, wallet.id);
    return { transaction, balance: newBalance, fee };
  });

  // Push to the bank via PSP after the ledger commits. In sandbox this always
  // succeeds; a real integration reconciles failures via webhook + reversal.
  await getPsp().payout({
    amountKobo: amount,
    bankAccountNumber: params.bankAccountNumber,
    bankCode: params.bankCode,
    reference,
  });

  return result;
}
