import { Router } from 'express';
import {
  createConversationSchema,
  listMessagesQuerySchema,
  markReadSchema,
  sendMessageSchema,
} from '@caw/shared';
import { asyncHandler } from '../../http/async-handler.js';
import { validate } from '../../http/validate.js';
import { requireParam } from '../../http/params.js';
import { AppError } from '../../http/errors.js';
import { authenticate, requireUserId, type AuthedRequest } from '../../middleware/authenticate.js';
import { requireUserIdByPhone, resolveUserIdsByPhones } from '../user/user.service.js';
import * as chat from './chat.service.js';

export const chatRouter: Router = Router();

chatRouter.use(authenticate);

/** GET /conversations — the caller's conversations with last message + unread. */
chatRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const conversations = await chat.listConversations(requireUserId(req));
    res.status(200).json({ conversations });
  }),
);

/** POST /conversations — open a direct chat or create a group. */
chatRouter.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const userId = requireUserId(req);
    const body = validate(createConversationSchema, req.body);

    if (body.type === 'direct') {
      const otherUserId = await requireUserIdByPhone(body.participantPhone);
      const conversation = await chat.createDirectConversation(userId, otherUserId);
      res.status(201).json({ conversation });
      return;
    }

    const { found, missing } = await resolveUserIdsByPhones(body.memberPhones ?? []);
    if (missing.length > 0) {
      throw AppError.unprocessable('Some phone numbers are not registered users', { missing });
    }
    const conversation = await chat.createGroupConversation({
      userId,
      title: body.title,
      memberUserIds: found,
    });
    res.status(201).json({ conversation });
  }),
);

/** GET /conversations/:id/messages — paginated history (newest first). */
chatRouter.get(
  '/:id/messages',
  asyncHandler(async (req: AuthedRequest, res) => {
    const query = validate(listMessagesQuerySchema, req.query);
    const messages = await chat.getMessages(requireUserId(req), requireParam(req, 'id'), {
      before: query.before,
      limit: query.limit,
    });
    res.status(200).json({ messages });
  }),
);

/** POST /conversations/:id/messages — send a message. */
chatRouter.post(
  '/:id/messages',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(sendMessageSchema, req.body);
    const message = await chat.sendMessage({
      userId: requireUserId(req),
      conversationId: requireParam(req, 'id'),
      body: body.body,
      type: body.type,
      metadata: body.metadata,
      idempotencyKey: body.idempotencyKey,
    });
    res.status(201).json({ message });
  }),
);

/** POST /conversations/:id/read — mark read up to a message seq. */
chatRouter.post(
  '/:id/read',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(markReadSchema, req.body);
    await chat.markRead(requireUserId(req), requireParam(req, 'id'), body.seq);
    res.status(204).end();
  }),
);
