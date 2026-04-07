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

/*
 * Licensed to Elasticsearch B.V. under one or more contributor
 * license agreements. See the NOTICE file distributed with
 * this work for additional information regarding copyright
 * ownership. Elasticsearch B.V. licenses this file to you under
 * the Apache License, Version 2.0 (the "License"); you may
 * not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *    http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

import type { IncomingHttpHeaders } from 'http';
import { WebSocket } from 'ws';

export interface OpenSearchDashboardsWebSocketRequest {
  url: string;
  headers: IncomingHttpHeaders;
}

export interface IOpenSearchDashboardsWebSocket {
  readonly readyState: number;
  send: (message: string) => void;
  close: (code?: number, reason?: string) => void;
  onMessage: (handler: (message: string) => void) => void;
  onClose: (handler: (code: number, reason: string) => void) => void;
  onError: (handler: (error: Error) => void) => void;
}

export interface WebSocketRouteConfig {
  path: string;
}

export type WebSocketRouteHandler = (
  socket: IOpenSearchDashboardsWebSocket,
  request: OpenSearchDashboardsWebSocketRequest
) => void;

export class OpenSearchDashboardsWebSocketAdapter implements IOpenSearchDashboardsWebSocket {
  constructor(private readonly socket: WebSocket) {}

  public get readyState() {
    return this.socket.readyState;
  }

  public send(message: string) {
    this.socket.send(message);
  }

  public close(code?: number, reason?: string) {
    this.socket.close(code, reason);
  }

  public onMessage(handler: (message: string) => void) {
    this.socket.on('message', (payload: string | Buffer) => {
      handler(typeof payload === 'string' ? payload : payload.toString('utf8'));
    });
  }

  public onClose(handler: (code: number, reason: string) => void) {
    this.socket.on('close', (code: number, reason: Buffer) => {
      handler(code, reason.toString('utf8'));
    });
  }

  public onError(handler: (error: Error) => void) {
    this.socket.on('error', handler);
  }
}
