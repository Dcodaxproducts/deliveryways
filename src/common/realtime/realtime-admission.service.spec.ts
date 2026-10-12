import type { Socket } from 'socket.io';
import { RealtimeAdmissionService } from './realtime-admission.service';

const socket = (address: string): Socket =>
  ({ handshake: { address, headers: {} } }) as unknown as Socket;

describe('RealtimeAdmissionService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('bounds reconnect attempts and releases all active counters', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const service = new RealtimeAdmissionService();

    for (let index = 0; index < 20; index += 1) {
      expect(service.begin(`socket-${index}`, socket('198.51.100.1'))).toEqual({
        allowed: true,
      });
      expect(service.bindUser(`socket-${index}`, `user-${index}`)).toEqual({
        allowed: true,
      });
    }

    expect(service.begin('overflow', socket('198.51.100.1'))).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });

    for (let index = 0; index < 20; index += 1)
      service.release(`socket-${index}`);
    expect(service.getStats()).toMatchObject({
      activeSockets: 0,
      networkKeys: 0,
      userKeys: 0,
    });
  });

  it('keeps reconnect bookkeeping bounded under unique-address floods', () => {
    jest.spyOn(Date, 'now').mockReturnValue(1_000);
    const service = new RealtimeAdmissionService();

    for (let index = 0; index < 10_000; index += 1) {
      service.begin(
        `socket-${index}`,
        socket(`198.51.${Math.floor(index / 256)}.${index % 256}`),
      );
    }

    const stats = service.getStats();
    expect(stats.attemptKeys).toBeLessThanOrEqual(2_048);
    expect(stats.activeSockets).toBeLessThanOrEqual(2_000);
  });

  it('limits one authenticated user across reconnecting clients', () => {
    const service = new RealtimeAdmissionService();
    for (let index = 0; index < 6; index += 1) {
      expect(
        service.begin(`socket-${index}`, socket(`198.51.100.${index}`)),
      ).toEqual({ allowed: true });
      expect(service.bindUser(`socket-${index}`, 'shared-user')).toEqual({
        allowed: true,
      });
    }
    expect(service.begin('socket-6', socket('198.51.100.6'))).toEqual({
      allowed: true,
    });
    expect(service.bindUser('socket-6', 'shared-user')).toEqual({
      allowed: false,
      retryAfterSeconds: 1,
    });
    service.release('socket-6');
  });
});
