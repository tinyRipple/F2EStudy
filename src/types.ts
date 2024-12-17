import type * as http from 'node:http';

export interface ServerOptions {
  port?: number;
  baseDir?: string;
  dataPosition?: string;
  cors?: boolean;
  cache?: boolean;
  compress?: boolean;
  maxAge?: number;
}

export type Res = http.ServerResponse<http.IncomingMessage> & {
  req: http.IncomingMessage;
};

export type Req = http.IncomingMessage;

export interface ResourceItem {
  id: string;
  [key: string]: any;
}
