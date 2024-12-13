import * as http from 'node:http';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import { Buffer } from 'node:buffer';
import chalk from 'chalk';
import * as ejs from 'ejs';
import mine from 'mime';
import { DEFAULT_PORT, DEFAULT_BASE_DIR, TMPL, API_PREFIX, DEFAULT_DATA } from './constants';
import type { ServerOptions, Res, Req, ResourceItem } from './types';

export default class Server {
  port: number = DEFAULT_PORT;
  baseDir: string = DEFAULT_BASE_DIR;
  data: { [k: string]: ResourceItem[] } = {};

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
  }

  start() {
    const server = http.createServer(async (req, res) => {
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
            const item = resourceData.find((item) => item.id === Number(resourceId));
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
            const newItem = JSON.parse(body);
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
            const index = resourceData.findIndex((item) => item.id === Number(resourceId));
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
          const index = resourceData.findIndex((item) => item.id === Number(resourceId));
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
}
