import { EventEmitter } from 'events';

const clients: FakeClient[] = [];

class FakeClient extends EventEmitter {
  isReady = false;
  isOpen = false;
  connect = jest.fn(() => {
    this.isOpen = true;
    this.isReady = true;
    return Promise.resolve();
  });
  quit = jest.fn(() => {
    this.isOpen = false;
    this.isReady = false;
    return Promise.resolve();
  });
  duplicate(): FakeClient {
    return new FakeClient();
  }
}

jest.mock('redis', () => ({
  createClient: jest.fn(() => {
    const client = new FakeClient();
    clients.push(client);
    return client;
  }),
}));
jest.mock('@socket.io/redis-adapter', () => ({ createAdapter: jest.fn() }));

import { RedisBoundedSocketIoAdapter } from './redis-bounded-socket-io.adapter';

describe('RedisBoundedSocketIoAdapter readiness', () => {
  const make = () => {
    clients.length = 0;
    const adapter = new RedisBoundedSocketIoAdapter(
      {} as never,
      'redis://unused',
    );
    // createClient returns the pub client; duplicate() builds the sub client.
    const pub = clients[0];
    const sub = (adapter as unknown as { subClient: FakeClient }).subClient;
    return { adapter, pub, sub };
  };

  it('reports both clients not ready before connecting', () => {
    const { adapter } = make();
    expect(adapter.getHealth()).toEqual({ pubReady: false, subReady: false });
    expect(adapter.isReady()).toBe(false);
  });

  it('is ready only when both the pub and sub clients are ready', async () => {
    const { adapter, pub, sub } = make();
    await adapter.connect();
    expect(adapter.isReady()).toBe(true);
    sub.isReady = false;
    expect(adapter.getHealth()).toEqual({ pubReady: true, subReady: false });
    expect(adapter.isReady()).toBe(false);
    sub.isReady = true;
    pub.isReady = false;
    expect(adapter.getHealth()).toEqual({ pubReady: false, subReady: true });
    expect(adapter.isReady()).toBe(false);
  });

  it('recovers after a client error once the client reconnects', async () => {
    const { adapter, pub, sub } = make();
    await adapter.connect();
    pub.isReady = false;
    pub.emit('error', new Error('ECONNRESET'));
    expect(adapter.isReady()).toBe(false);
    pub.isReady = true;
    expect(adapter.isReady()).toBe(true);
    expect(sub.isReady).toBe(true);
  });

  it('closes both clients', async () => {
    const { adapter, pub, sub } = make();
    await adapter.connect();
    await adapter.close();
    expect(pub.quit).toHaveBeenCalledTimes(1);
    expect(sub.quit).toHaveBeenCalledTimes(1);
  });
});
