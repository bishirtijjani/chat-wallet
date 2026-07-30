import { Router } from 'express';
import {
  addCircleMemberSchema,
  createCircleSchema,
  setPayoutOrderSchema,
} from '@caw/shared';
import { asyncHandler } from '../../http/async-handler.js';
import { validate } from '../../http/validate.js';
import { requireParam } from '../../http/params.js';
import { authenticate, requireUserId, type AuthedRequest } from '../../middleware/authenticate.js';
import { requireUserIdByPhone } from '../user/user.service.js';
import * as circles from './circle.service.js';
import { collectDueContributions, settleRound } from './round.engine.js';

export const circleRouter: Router = Router();

circleRouter.use(authenticate);

/** GET /circles — circles the caller belongs to. */
circleRouter.get(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const list = await circles.listCircles(requireUserId(req));
    res.status(200).json({ circles: list });
  }),
);

/** POST /circles — create a circle (caller becomes the coordinator). */
circleRouter.post(
  '/',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(createCircleSchema, req.body);
    const circle = await circles.createCircle({
      coordinatorId: requireUserId(req),
      name: body.name,
      contributionAmount: body.contributionAmount,
      frequency: body.frequency,
      memberCap: body.memberCap,
    });
    res.status(201).json({ circle });
  }),
);

/** GET /circles/:id — full circle detail (members, rounds, current contributions). */
circleRouter.get(
  '/:id',
  asyncHandler(async (req: AuthedRequest, res) => {
    const circle = await circles.getCircle(requireUserId(req), requireParam(req, 'id'));
    res.status(200).json({ circle });
  }),
);

/** POST /circles/:id/members — add a member by phone (coordinator only). */
circleRouter.post(
  '/:id/members',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(addCircleMemberSchema, req.body);
    const userId = await requireUserIdByPhone(body.phone);
    const member = await circles.addMember({
      coordinatorId: requireUserId(req),
      circleId: requireParam(req, 'id'),
      userId,
    });
    res.status(201).json({ member });
  }),
);

/** PUT /circles/:id/order — set the draggable payout order (coordinator only). */
circleRouter.put(
  '/:id/order',
  asyncHandler(async (req: AuthedRequest, res) => {
    const body = validate(setPayoutOrderSchema, req.body);
    await circles.setPayoutOrder({
      coordinatorId: requireUserId(req),
      circleId: requireParam(req, 'id'),
      order: body.order,
    });
    res.status(204).end();
  }),
);

/** POST /circles/:id/start — start the cycle and open round 1 (coordinator only). */
circleRouter.post(
  '/:id/start',
  asyncHandler(async (req: AuthedRequest, res) => {
    const result = await circles.startCircle({
      coordinatorId: requireUserId(req),
      circleId: requireParam(req, 'id'),
    });
    res.status(200).json(result);
  }),
);

/**
 * POST /circles/:id/collect — auto-collect due contributions for the open round
 * (coordinator only). The scheduled worker will call this on a cron later.
 */
circleRouter.post(
  '/:id/collect',
  asyncHandler(async (req: AuthedRequest, res) => {
    const circleId = requireParam(req, 'id');
    await circles.assertIsCoordinator(circleId, requireUserId(req));
    const result = await collectDueContributions(circleId);
    res.status(200).json(result);
  }),
);

/**
 * POST /circles/:id/settle — pay out the pot for the fully-funded open round and
 * open the next (coordinator only).
 */
circleRouter.post(
  '/:id/settle',
  asyncHandler(async (req: AuthedRequest, res) => {
    const circleId = requireParam(req, 'id');
    await circles.assertIsCoordinator(circleId, requireUserId(req));
    const result = await settleRound(circleId);
    res.status(200).json(result);
  }),
);
