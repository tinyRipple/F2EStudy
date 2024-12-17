import * as http from 'node:http';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { Buffer } from 'node:buffer';
import chalk from 'chalk';
import * as ejs from 'ejs';
import mine from 'mime';
import { v4 } from 'uuid';
import { DEFAULT_PORT, DEFAULT_BASE_DIR, TMPL, API_PREFIX, DEFAULT_DATA } from './constants';
import type { ServerOptions, Res, Req, ResourceItem } from './types';

export default class Server {
  port: number = DEFAULT_PORT;
  baseDir: string = DEFAULT_BASE_DIR;
  data: { [k: string]: ResourceItem[] } = {};
  cors: boolean = false;
  cache: boolean = true;

  constructor(options?: ServerOptions) {
    if (options?.port) {
      this.port = options.port;
    }
    if (options?.baseDir) {
      this.baseDir = options.baseDir;
    }
    if (options?.dataPosition) {
      const dataJsonFilePath = options.dataPosition.startsWith('/')
        ? options.dataPosition
        : path.resolve(this.baseDir, options.dataPosition);
      const dataJsonFile = readFileSync(dataJsonFilePath, 'utf-8');
      this.data = JSON.parse(dataJsonFile);
    } else {
      this.data = DEFAULT_DATA;
    }
    if (options?.cors) {
      this.cors = true;
    }
    if (!options?.cache) {
      this.cache = false;
    }
  }

  start() {
    const server = http.createServer(async (req, res) => {
      if (this.cors) {
        this.processCors(req, res);
      }
      try {
        const requestUrl = decodeURIComponent(req.url ?? '/');
        if (requestUrl.startsWith(API_PREFIX)) {
          this.processApi(req, res);
        } else {
          const wholePath = path.join(this.baseDir, requestUrl);
          const stat = await fs.stat(wholePath);
          if (stat.isDirectory()) {
            this.processDirectory(wholePath, res, requestUrl);
          } else {
            this.processFile(wholePath, res);
          }
        }
      } catch {
        res.statusCode = 404;
        res.end('Not found');
      }
    });
    server.listen(this.port, () => {
      console.log(chalk.yellow('Server is running on:'), ` ${this.baseDir}`);
      this
        .getOsHosts()
        .forEach((host) => console.log(`\x20\x20${host}`));
    });
  }

  private getOsHosts() {
    return Object
      .values(os.networkInterfaces())
      .flat()
      .filter((item) => item?.family === 'IPv4')
      .map((item) => `http://${item.address}:${chalk.cyan(this.port)}`);
  }

  private async processDirectory(dir: string, res: Res, requestUrl: string) {
    const content = (await fs.readdir(dir)).map((contentName) => ({
      contentName,
      href: path.join(requestUrl, contentName),
      size: statSync(path.join(dir, contentName)).size,
    }));
    const html = ejs.render(TMPL, { directories: content });
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.end(html);
  }

  private async processFile(file: string, res: Res) {
    if (this.cache) {
      this.processCache(res, file); // The homepage will not be cached.
    }
    res.setHeader('Content-Type', `${mine.getType(file) ?? 'text/plain'};charset=utf-8`);
    createReadStream(file).pipe(res);
  }

  private async processApi(req: Req, res: Res) {
    const { method, url } = req;
    if (!url) {
      res.statusCode = 400;
      res.end(JSON.stringify({ error: 'Invalid URL' }));
      return;
    }

    const urlParts = url.replace(`${API_PREFIX}/`, '').split('/');
    const resourceName = urlParts[0];
    const resourceId = urlParts[1];

    const resourceData = this.data[resourceName] as ResourceItem[];
    if (!resourceData) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Resource not found' }));
      return;
    }

    res.setHeader('Content-Type', 'application/json');

    try {
      switch (method) {
        case 'GET': {
          if (resourceId) {
            const item = resourceData.find((item) => item.id === resourceId);
            if (!item) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Item not found' }));
              return;
            }
            res.end(JSON.stringify(item));
          } else {
            res.end(JSON.stringify(resourceData));
          }
          break;
        }
        case 'POST': {
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            const newItem = {
              ...JSON.parse(body),
              id: v4(),
            };
            resourceData.push(newItem);
            res.statusCode = 201;
            res.end(JSON.stringify(newItem));
          });
          break;
        }
        case 'PUT': {
          if (!resourceId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Resource ID is required' }));
            return;
          }
          const chunks: Buffer[] = [];
          req.on('data', (chunk: Buffer) => chunks.push(chunk));
          req.on('end', () => {
            const body = Buffer.concat(chunks).toString();
            const updateData = JSON.parse(body);
            const index = resourceData.findIndex((item) => item.id === resourceId);
            if (index === -1) {
              res.statusCode = 404;
              res.end(JSON.stringify({ error: 'Item not found' }));
              return;
            }
            resourceData[index] = { ...resourceData[index], ...updateData };
            res.end(JSON.stringify(resourceData[index]));
          });
          break;
        }
        case 'DELETE': {
          if (!resourceId) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Resource ID is required' }));
            return;
          }
          const index = resourceData.findIndex((item) => item.id === resourceId);
          if (index === -1) {
            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Item not found' }));
            return;
          }
          resourceData.splice(index, 1);
          res.statusCode = 204;
          res.end();
          break;
        }
        default:
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'Method not allowed' }));
      }
    } catch {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: 'Internal server error' }));
    }
  }

  private processCors(req: Req, res: Res) {
    // Browser will set `Origin` header when it is a cross-origin request.
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      // When request has a custom header or a complex request, browser will send an OPTIONS request first. (complex request: put, delete, simple request: get, post)
      if (req.method === 'OPTIONS') {
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Access-Control-Max-Age', '86400');
        res.statusCode = 200;
        return res.end();
      }
    }
  }

  private async processCache(res: Res, file: string) {
    // This method is not recommended for production use. Because this time is server time, not client time, but browsers use client time to adjust if the cache is expired.
    // res.setHeader('Expires', new Date(Date.now() + 10 * 1000).toUTCString());

    // res.setHeader('Cache-Control', 'no-cache'); <===> res.setHeader('Cache-Control', 'max-age=0');
    // res.setHeader('Cache-Control', 'no-store');
    // no-cache: The browser will send a request to the server to check if the cache is expired, but the browser has cached the response.
    // no-store: The browser will send a request to the server to check if the cache is expired, and the browser has not cached the response.
    // const stat = await fs.stat(file);
    // res.setHeader('Last-Modified', stat.mtime.toUTCString());
    // res.setHeader('Cache-Control', 'max-age=3600');
    // const ifModifiedSince = res.req?.headers['if-modified-since'];
    // if (ifModifiedSince && ifModifiedSince === stat.mtime.toUTCString()) {
    //   res.statusCode = 304;
    //   return res.end();
    // }

    // Use etag can solve the problem of: if a file is modified in the same second, the Last-Modified will be the same.
    const stat = await fs.stat(file);
    const etag = `${stat.mtime.getTime ()}-${stat.size}`;
    res.setHeader('Etag', etag);
    res.setHeader('Cache-Control', 'max-age=10');
    const ifNoneMatch = res.req?.headers['if-none-match'];
    if (ifNoneMatch && ifNoneMatch === etag) {
      res.statusCode = 304;
      return res.end();
    }
  }
}
