import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * Chat integration tests against real PostgreSQL, plus one true Socket.IO
 * round-trip. Skipped unless DATABASE_URL is set; CI runs them for real.
 */
const dbConfigured = Boolean(process.env.DATABASE_URL);
const skip = dbConfigured ? false : 'DATABASE_URL not set';

process.env.JWT_ACCESS_SECRET ??= 'test-access-secret';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret';
process.env.OTP_PEPPER ??= 'test-otp-pepper';
process.env.NODE_ENV ??= 'test';

let counter = 0;
async function createUser(): Promise<string> {
  const { pool } = await import('../../db/pool.js');
  counter += 1;
  const phone = `+2347${String(Date.now()).slice(-6)}${String(counter).padStart(3, '0')}`;
  const { rows } = await pool.query(
    `INSERT INTO users (phone, display_name) VALUES ($1, $2) RETURNING id`,
    [phone, `User ${counter}`],
  );
  return rows[0].id as string;
}

test('setup: migrations', { skip }, async () => {
  const { runMigrations } = await import('../../db/migrate.js');
  await runMigrations();
});

test('direct conversations are deduped between the same two users', { skip }, async () => {
  const chat = await import('./chat.service.js');
  const a = await createUser();
  const b = await createUser();

  const first = await chat.createDirectConversation(a, b);
  // Opened from the other side → same conversation.
  const second = await chat.createDirectConversation(b, a);
  assert.equal(first.id, second.id);
  assert.equal(first.type, 'direct');
});

test('non-members cannot read or send', { skip }, async () => {
  const chat = await import('./chat.service.js');
  const a = await createUser();
  const b = await createUser();
  const outsider = await createUser();
  const convo = await chat.createDirectConversation(a, b);

  await assert.rejects(
    chat.getMessages(outsider, convo.id, { limit: 50 }),
    /Not a member/,
  );
  await assert.rejects(
    chat.sendMessage({ userId: outsider, conversationId: convo.id, body: 'hi', type: 'text' }),
    /Not a member/,
  );
});

test('messages persist, paginate, and drive unread counts', { skip }, async () => {
  const chat = await import('./chat.service.js');
  const a = await createUser();
  const b = await createUser();
  const convo = await chat.createDirectConversation(a, b);

  let lastSeq = 0;
  for (let i = 1; i <= 5; i += 1) {
    const m = await chat.sendMessage({
      userId: a,
      conversationId: convo.id,
      body: `msg ${i}`,
      type: 'text',
    });
    lastSeq = m.seq;
  }

  // Newest-first page of 2, then the next page before the cursor.
  const page1 = await chat.getMessages(b, convo.id, { limit: 2 });
  assert.equal(page1.length, 2);
  assert.equal(page1[0]!.body, 'msg 5');
  const page2 = await chat.getMessages(b, convo.id, { limit: 2, before: page1[1]!.seq });
  assert.equal(page2[0]!.body, 'msg 3');

  // b hasn't read anything → all 5 unread; after marking read, zero.
  const before = (await chat.listConversations(b)).find((c) => c.id === convo.id);
  assert.equal(before?.unreadCount, 5);
  assert.equal(before?.lastMessage?.body, 'msg 5');

  await chat.markRead(b, convo.id, lastSeq);
  const after = (await chat.listConversations(b)).find((c) => c.id === convo.id);
  assert.equal(after?.unreadCount, 0);
});

test('system messages have no sender and post into the conversation', { skip }, async () => {
  const chat = await import('./chat.service.js');
  const a = await createUser();
  const b = await createUser();
  const convo = await chat.createDirectConversation(a, b);

  const sys = await chat.postSystemMessage(convo.id, 'Amina contributed ₦5,000', { kind: 'demo' });
  assert.equal(sys.type, 'system');
  assert.equal(sys.senderId, null);

  const [latest] = await chat.getMessages(a, convo.id, { limit: 1 });
  assert.equal(latest!.id, sys.id);
});

test('Socket.IO delivers a new message to a connected member in real time', { skip }, async () => {
  const { createServer } = await import('node:http');
  const { createApp } = await import('../../app.js');
  const { initRealtime, getIo } = await import('../../realtime/realtime.js');
  const { signAccessToken } = await import('../auth/tokens.js');
  const { io: ioClient } = await import('socket.io-client');
  const chat = await import('./chat.service.js');

  const a = await createUser();
  const b = await createUser();
  const convo = await chat.createDirectConversation(a, b);

  const server = createServer(createApp());
  initRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;

  const token = signAccessToken(b).token;
  const client = ioClient(`http://127.0.0.1:${port}`, { auth: { token } });

  try {
    const received = new Promise<{ body: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timed out waiting for message')), 4000);
      client.on('message:new', (msg: { body: string }) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });

    await new Promise<void>((resolve, reject) => {
      client.on('connect', () => resolve());
      client.on('connect_error', reject);
    });
    // Give the server a tick to run joinUserRooms after connect.
    await new Promise((r) => setTimeout(r, 150));

    await chat.sendMessage({
      userId: a,
      conversationId: convo.id,
      body: 'live hello',
      type: 'text',
    });

    const msg = await received;
    assert.equal(msg.body, 'live hello');
  } finally {
    client.close();
    getIo()?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
