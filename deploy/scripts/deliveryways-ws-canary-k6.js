import ws from 'k6/ws';
import { check, sleep } from 'k6';
export const options = { vus: 250, iterations: 5000, maxDuration: '10m' };
const BASE = __ENV.BASE || 'wss://api.delivery-way.de/__dw_ws_canary__/socket.io/?EIO=4&transport=websocket';
const TOKEN = __ENV.DW_CANARY_TOKEN;
export default function () {
  const r = ws.connect(BASE, { headers: { 'X-DW-Canary-Token': TOKEN } }, socket => {
    socket.setTimeout(() => socket.close(), 5000);
  });
  check(r, { 'edge admission is bounded': x => x && [101, 429].includes(x.status) });
  sleep(Math.random());
}
