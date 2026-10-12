import { UserRoleEnum } from '../../common/enums';
import { ChatGateway } from './chat.gateway';

const makeGateway = (summaryError?: Error) => {
  const user = { uid: 'customer-1', role: UserRoleEnum.CUSTOMER, rid: 'r1' };
  const chatRealtimeService = {
    registerServer: jest.fn(),
    getInboxRoomsForUser: jest.fn().mockReturnValue(['chat:user:customer-1']),
    emitInitialSummary: jest.fn((socket: { emit: jest.Mock }) => {
      if (summaryError) return Promise.reject(summaryError);
      socket.emit('chat.inbox.summary', { scope: 'customer', total: 3 });
      return Promise.resolve();
    }),
  };
  const currentSessionValidator = {
    assertCurrentSession: jest.fn().mockResolvedValue(undefined),
  };
  const chatService = {
    details: jest.fn().mockResolvedValue({ data: {} }),
    reply: jest.fn().mockResolvedValue({ data: {} }),
    markRead: jest.fn().mockResolvedValue({ data: {} }),
    assign: jest.fn().mockResolvedValue({ data: {} }),
  };
  const gateway = new ChatGateway(
    { verifyAsync: jest.fn().mockResolvedValue(user) } as never,
    currentSessionValidator as never,
    chatService as never,
    chatRealtimeService as never,
    {
      begin: jest.fn().mockReturnValue({ allowed: true }),
      bindUser: jest.fn().mockReturnValue({ allowed: true }),
      release: jest.fn(),
    } as never,
  );
  const client = {
    id: 'socket-1',
    data: {} as { user?: unknown },
    handshake: {
      auth: { token: 'token' },
      headers: {},
      address: '203.0.113.1',
    },
    join: jest.fn().mockResolvedValue(undefined),
    emit: jest.fn(),
    disconnect: jest.fn(),
  };
  return {
    gateway,
    client,
    chatRealtimeService,
    chatService,
    currentSessionValidator,
    user,
  };
};

describe('ChatGateway inbox summary', () => {
  it('joins inbox rooms and emits chat.inbox.summary on connect', async () => {
    const { gateway, client, chatRealtimeService, user } = makeGateway();
    await gateway.handleConnection(client as never);
    expect(client.join).toHaveBeenCalledWith('chat:user:customer-1');
    expect(chatRealtimeService.emitInitialSummary).toHaveBeenCalledWith(
      client,
      user,
    );
    expect(client.emit).toHaveBeenCalledWith('chat.inbox.summary', {
      scope: 'customer',
      total: 3,
    });
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('keeps an authenticated socket connected when the summary query fails', async () => {
    const { gateway, client } = makeGateway(new Error('db slow'));
    await gateway.handleConnection(client as never);
    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.emit).not.toHaveBeenCalledWith(
      'chat.error',
      expect.anything(),
    );
  });

  it('does not emit a summary for a socket that failed authentication', async () => {
    const { gateway, client, chatRealtimeService } = makeGateway();
    client.handshake.auth = {} as never;
    await gateway.handleConnection(client as never);
    expect(chatRealtimeService.emitInitialSummary).not.toHaveBeenCalled();
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('re-emits chat.inbox.summary on explicit chat.inbox.subscribe', async () => {
    const { gateway, client, chatRealtimeService } = makeGateway();
    await gateway.handleConnection(client as never);
    client.emit.mockClear();
    chatRealtimeService.emitInitialSummary.mockClear();
    const result = await gateway.subscribeInbox(client as never);
    expect(chatRealtimeService.emitInitialSummary).toHaveBeenCalledTimes(1);
    expect(client.emit).toHaveBeenCalledWith('chat.inbox.summary', {
      scope: 'customer',
      total: 3,
    });
    expect(result).toEqual({
      success: true,
      data: { rooms: ['chat:user:customer-1'] },
    });
  });

  it('reports a failed explicit subscribe through the existing error envelope', async () => {
    const failing = makeGateway(new Error('db slow'));
    await failing.gateway.handleConnection(failing.client as never);
    const result = await failing.gateway.subscribeInbox(
      failing.client as never,
    );
    expect(result).toMatchObject({
      success: false,
      error: { code: 'CHAT_SOCKET_ERROR', message: 'db slow' },
    });
  });

  it.each([
    [
      'join',
      (gateway: ChatGateway, client: unknown) =>
        gateway.joinThread(client as never, { threadId: 'thread-1' }),
    ],
    [
      'send',
      (gateway: ChatGateway, client: unknown) =>
        gateway.sendMessage(client as never, {
          threadId: 'thread-1',
          message: 'x',
        }),
    ],
    [
      'read',
      (gateway: ChatGateway, client: unknown) =>
        gateway.markRead(client as never, { threadId: 'thread-1' }),
    ],
    [
      'assign',
      (gateway: ChatGateway, client: unknown) =>
        gateway.assignThread(client as never, { threadId: 'thread-1' }),
    ],
  ])(
    'rejects and disconnects a session revoked after connect before chat %s',
    async (_name, command) => {
      const ctx = makeGateway();
      await ctx.gateway.handleConnection(ctx.client as never);
      ctx.currentSessionValidator.assertCurrentSession.mockRejectedValue(
        new Error('Session is no longer valid'),
      );
      const result = await command(ctx.gateway, ctx.client);
      expect(result).toMatchObject({ success: false });
      expect(ctx.client.disconnect).toHaveBeenCalledWith(true);
      expect(ctx.chatService.details).not.toHaveBeenCalled();
      expect(ctx.chatService.reply).not.toHaveBeenCalled();
      expect(ctx.chatService.markRead).not.toHaveBeenCalled();
      expect(ctx.chatService.assign).not.toHaveBeenCalled();
    },
  );
});
