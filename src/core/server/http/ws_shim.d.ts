/*
 * SPDX-License-Identifier: Apache-2.0
 *
 * The OpenSearch Contributors require contributions made to
 * this file be licensed under the Apache-2.0 license or a
 * compatible open source license.
 *
 * Any modifications Copyright OpenSearch Contributors. See
 * GitHub history for details.
 */

declare module 'ws' {
  import { EventEmitter } from 'events';
  import { IncomingMessage } from 'http';
  import { Duplex } from 'stream';

  export class WebSocket extends EventEmitter {
    static readonly OPEN: number;
    readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    on(event: 'message', listener: (data: string | Buffer) => void): this;
    on(event: 'close', listener: (code: number, reason: Buffer) => void): this;
    on(event: 'error', listener: (error: Error) => void): this;
  }

  export interface WebSocketServer {
    clients: Set<WebSocket>;
    handleUpgrade(
      request: IncomingMessage,
      socket: Duplex,
      head: Buffer,
      callback: (socket: WebSocket) => void
    ): void;
    close(): void;
  }

  export const WebSocketServer: new (options: { noServer?: boolean }) => WebSocketServer;
}
