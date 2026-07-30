import { Router } from 'express';
import { asyncHandler } from '../../http/async-handler.js';
import { authenticate, requireUserId, type AuthedRequest } from '../../middleware/authenticate.js';
import { getReputation } from '../rosca/trust.service.js';

export const userRouter: Router = Router();

userRouter.use(authenticate);

/** GET /users/me/reputation — the caller's derived trust signal. */
userRouter.get(
  '/me/reputation',
  asyncHandler(async (req: AuthedRequest, res) => {
    const reputation = await getReputation(requireUserId(req));
    res.status(200).json({ reputation });
  }),
);
