import type * as http from 'node:http';

export interface ServerOptions {
  port?: number;
  baseDir?: string;
}

export type Res = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
};
