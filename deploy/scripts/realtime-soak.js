// Private authenticated realtime soak. Piped into `node -` INSIDE the realtime container
// (deploy/scripts/realtime-soak.sh) so it talks to 127.0.0.1 and reuses the container's own
// JWT_ACCESS_SECRET; nothing is exposed through ingress and no secret reaches the host shell.
//
// Speaks raw Engine.IO v4 / Socket.IO v4 over WebSocket (the production image ships no socket.io-client):
//   server `0{...}` open -> client `40/<ns>,<auth json>` connect -> server `40/<ns>,{sid}` accept,
//   `42/<ns>,[event, payload]` events, `2`/`3` ping/pong, `41/<ns>` disconnect.
//
// Env: SOAK_ACTOR (JSON {uid, role, ver, tid?, rid?, bid?}; read from the database row of a dedicated
// soak account), SOAK_SECONDS (default 20), JWT_ACCESS_SECRET, REALTIME_PORT (default 3001).
'use strict';
const crypto = require('node:crypto');

const port = process.env.REALTIME_PORT || '3001';
const http = 'http://127.0.0.1:' + port;
const wsUrl = 'ws://127.0.0.1:' + port + '/socket.io/?EIO=4&transport=websocket';
const soakMs = Number(process.env.SOAK_SECONDS || 20) * 1000;
const secret = process.env.JWT_ACCESS_SECRET;
const actor = JSON.parse(process.env.SOAK_ACTOR || 'null');

const fail = (message) => {
  console.error('soak FAILED: ' + message);
  process.exit(1);
};
if (!secret) fail('JWT_ACCESS_SECRET is not set in the realtime container');
if (!actor || !actor.uid || !actor.role || !Number.isInteger(actor.ver)) fail('SOAK_ACTOR must carry uid, role and an integer ver');

const b64 = (value) => Buffer.from(value).toString('base64url');
const mint = (key) => {
  const now = Math.floor(Date.now() / 1000);
  const body = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' })) + '.' + b64(JSON.stringify({ ...actor, iat: now, exp: now + 300 }));
  return body + '.' + crypto.createHmac('sha256', key).update(body).digest('base64url');
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (label, predicate, timeoutMs) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(50);
  }
  fail('timed out waiting for ' + label);
};

function connect(namespace, token, label) {
  const socket = { label, namespace, accepted: false, rejected: false, disconnected: false, closed: false, events: [] };
  const ws = new WebSocket(wsUrl);
  socket.close = () => ws.close();
  ws.onmessage = (message) => {
    const data = String(message.data);
    if (data[0] === '0') ws.send('40' + namespace + ',' + JSON.stringify(token ? { token } : {}));
    else if (data === '2') ws.send('3');
    else if (data.startsWith('40' + namespace + ',')) socket.accepted = true;
    else if (data.startsWith('44' + namespace + ',')) socket.rejected = true;
    else if (data.startsWith('41' + namespace)) socket.disconnected = true;
    else if (data.startsWith('42' + namespace + ',')) {
      const [event, payload] = JSON.parse(data.slice(3 + namespace.length));
      socket.events.push({ event, payload });
    }
  };
  ws.onclose = () => { socket.closed = true; };
  ws.onerror = () => { socket.closed = true; };
  return socket;
}

const errorEvents = (socket) => socket.events.filter((entry) => /\.error$/.test(entry.event));
const hasEvent = (socket, name) => socket.events.some((entry) => entry.event === name);

async function assertReady(stage) {
  const health = await fetch(http + '/health');
  if (!health.ok) fail('/health returned ' + health.status + ' ' + stage);
  const response = await fetch(http + '/ready');
  const body = await response.json().catch(() => ({}));
  if (!response.ok) fail('/ready returned ' + response.status + ' ' + stage + ': ' + JSON.stringify(body));
  // Single-instance deployment: the one replica must hold the dispatcher lease and have both adapter clients.
  if (body.outbox?.leader !== true) fail('this single realtime instance is not the outbox leader ' + stage);
  if (body.adapter?.ready !== true) fail('Socket.IO Redis adapter is not ready ' + stage);
}

async function main() {
  await assertReady('before soak');

  // The gateway admits at most four active Engine.IO sessions from one network.
  // Keep the soak at that production bound; unauthenticated probes run after these close.
  const good = [
    ...['a', 'b'].map((id) => connect('/chat', mint(secret), 'chat-' + id)),
    ...['a', 'b'].map((id) => connect('/orders-tracking', mint(secret), 'tracking-' + id)),
  ];
  const wantsSummary = actor.role === 'SUPER_ADMIN' || (actor.role === 'CUSTOMER' && actor.rid) || (actor.role === 'DELIVERYMAN' && actor.rid);
  await until('authenticated sockets to be accepted', () => good.every((socket) => socket.accepted || socket.rejected), 10_000);
  for (const socket of good) if (!socket.accepted) fail(socket.label + ' was rejected by namespace admission');
  if (wantsSummary) {
    await until('chat.inbox.summary on every authenticated /chat socket', () => good.filter((s) => s.namespace === '/chat').every((s) => hasEvent(s, 'chat.inbox.summary')), 15_000);
  }

  await sleep(soakMs);
  for (const socket of good) {
    if (socket.closed || socket.disconnected) fail(socket.label + ' dropped during the soak');
    if (errorEvents(socket).length) fail(socket.label + ' received ' + errorEvents(socket)[0].event);
  }
  await assertReady('after soak');
  for (const socket of good) socket.close();
  await until('authenticated sockets to close', () => good.every((socket) => socket.closed), 5_000);

  const bad = [
    connect('/chat', undefined, 'chat-anonymous'),
    connect('/chat', mint('not-the-real-secret'), 'chat-forged'),
    connect('/orders-tracking', undefined, 'tracking-anonymous'),
    connect('/orders-tracking', mint('not-the-real-secret'), 'tracking-forged'),
  ];
  await until('unauthenticated sockets to be refused', () => bad.every((socket) => errorEvents(socket).length > 0 && (socket.disconnected || socket.closed)), 10_000);
  for (const socket of bad) {
    if (!errorEvents(socket).some((entry) => entry.payload && entry.payload.code === 'UNAUTHORIZED')) fail(socket.label + ' was refused without UNAUTHORIZED');
    socket.close();
  }
  console.log('soak ok: ' + good.length + ' authenticated sockets held ' + soakMs / 1000 + 's, ' + bad.length + ' unauthenticated refused, /ready leader+adapter ok');
  process.exit(0);
}

main().catch((error) => fail(error && error.message ? error.message : String(error)));
