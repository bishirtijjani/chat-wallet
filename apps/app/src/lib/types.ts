import type {
  Circle,
  CircleMember,
  Contribution,
  Conversation,
  Message,
  Round,
} from '@caw/shared';

/** API response shapes that aren't in @caw/shared (they're server-composed views). */

export interface HistoryItem {
  transactionId: string;
  kind: string;
  reference: string;
  direction: 'debit' | 'credit';
  amount: number;
  createdAt: string;
}

export type CircleMemberDetail = CircleMember & { displayName: string | null; phone: string };

export interface CircleDetail extends Circle {
  members: CircleMemberDetail[];
  rounds: Round[];
  currentRoundContributions: (Contribution & { userId: string })[];
}

export interface ConversationSummaryView extends Conversation {
  lastMessage: Message | null;
  unreadCount: number;
}

export interface DashboardView {
  circleId: string;
  status: string;
  currentRound: {
    roundNumber: number;
    status: string;
    recipientName: string | null;
    dueAt: string | null;
    potCollected: number;
    potTarget: number;
  } | null;
  members: {
    membershipId: string;
    name: string;
    position: number | null;
    isRecipientThisRound: boolean;
    currentStatus: 'paid' | 'due' | 'missed' | null;
    missedTotal: number;
  }[];
  roundsCompleted: number;
  roundsTotal: number;
}
