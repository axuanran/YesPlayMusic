import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { createLazyDiscordRpcClient } from '../discordRpcClient.js';

class DiscordClientStub extends EventEmitter {
  constructor() {
    super();
    this.disconnect = vi.fn();
  }
}

describe('lazy Discord RPC client', () => {
  it('does not create the IPC client until explicitly connected', () => {
    const createClient = vi.fn(() => new DiscordClientStub());

    createLazyDiscordRpcClient({ clientId: 'client-id', createClient });

    expect(createClient).not.toHaveBeenCalled();
  });

  it('reuses one client while enabled and forwards active events', () => {
    const client = new DiscordClientStub();
    const createClient = vi.fn(() => client);
    const onConnected = vi.fn();
    const onError = vi.fn();
    const controller = createLazyDiscordRpcClient({
      clientId: 'client-id',
      createClient,
      onConnected,
      onError,
    });

    expect(controller.connect()).toBe(client);
    expect(controller.connect()).toBe(client);
    client.emit('connected');
    client.emit('error', new Error('unavailable'));

    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith('client-id');
    expect(onConnected).toHaveBeenCalledWith(client);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('disconnects when disabled and ignores stale client events', () => {
    const clients = [];
    const createClient = vi.fn(() => {
      const client = new DiscordClientStub();
      clients.push(client);
      return client;
    });
    const onConnected = vi.fn();
    const controller = createLazyDiscordRpcClient({
      clientId: 'client-id',
      createClient,
      onConnected,
    });

    const firstClient = controller.connect();
    expect(controller.disconnect()).toBe(true);
    firstClient.emit('connected');
    const secondClient = controller.connect();
    secondClient.emit('connected');

    expect(firstClient.disconnect).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledTimes(2);
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(onConnected).toHaveBeenCalledWith(secondClient);
  });
});
