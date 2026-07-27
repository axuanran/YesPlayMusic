import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AmllWsProtocolClient,
  DEFAULT_AMLL_WS_URL,
} from '../amllWsProtocol.js';

class FakeWebSocket {
  static OPEN = 1;
  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.listeners = {};
    this.sent = [];
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    this.listeners[type] = listener;
  }

  emit(type, data) {
    this.listeners[type]?.({ data });
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.emit('open');
  }

  send(payload) {
    this.sent.push(JSON.parse(payload));
  }

  close() {
    this.readyState = 3;
    this.emit('close');
  }
}

describe('AMLL WS Protocol client', () => {
  beforeEach(() => {
    FakeWebSocket.instances = [];
    vi.useRealTimers();
  });

  it('connects to the AMLL default address and replays cached V2 state', () => {
    const client = new AmllWsProtocolClient({
      WebSocketClass: FakeWebSocket,
    });
    client.publish({ update: 'setMusic', musicId: '1' });
    client.publish({ update: 'resumed' });
    client.enable();

    const socket = FakeWebSocket.instances[0];
    expect(socket.url).toBe(DEFAULT_AMLL_WS_URL);
    socket.open();
    expect(socket.sent).toEqual([
      { type: 'initialize' },
      {
        type: 'state',
        value: { update: 'setMusic', musicId: '1' },
      },
      { type: 'state', value: { update: 'resumed' } },
    ]);
  });

  it('answers ping and validates remote commands', () => {
    const commandHandler = vi.fn();
    const client = new AmllWsProtocolClient({
      WebSocketClass: FakeWebSocket,
    });
    client.enable(commandHandler);
    const socket = FakeWebSocket.instances[0];
    socket.open();

    socket.emit('message', JSON.stringify({ type: 'ping' }));
    socket.emit(
      'message',
      JSON.stringify({
        type: 'command',
        value: { command: 'setVolume', volume: 2 },
      })
    );
    socket.emit(
      'message',
      JSON.stringify({
        type: 'command',
        value: { command: 'setRepeatMode', mode: 'invalid' },
      })
    );

    expect(socket.sent.at(-1)).toEqual({ type: 'pong' });
    expect(commandHandler).toHaveBeenCalledWith({
      command: 'setVolume',
      volume: 1,
    });
    expect(commandHandler).toHaveBeenCalledTimes(1);
  });

  it('stops reconnecting after the switch is disabled', () => {
    vi.useFakeTimers();
    const client = new AmllWsProtocolClient({
      WebSocketClass: FakeWebSocket,
      reconnectDelay: 10,
    });
    client.enable();
    FakeWebSocket.instances[0].close();
    client.disable();
    vi.advanceTimersByTime(20);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});
