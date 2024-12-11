import * as http from 'node:http';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import * as path from 'node:path';
import chalk from 'chalk';
import * as ejs from 'ejs';
import mine from 'mime';
import { DEFAULT_PORT, DEFAULT_BASE_DIR } from './constants';
import type { ServerOptions, Res } from './types';

export default class Server {
  port: number = DEFAULT_PORT;
  baseDir: string = DEFAULT_BASE_DIR;
  tmpl: string = '';

  constructor(options?: ServerOptions) {
    if (options?.port) {
      this.port = options.port;
    }
    if (options?.baseDir) {
      this.baseDir = options.baseDir;
    }
    const tmpl = readFileSync(path.resolve(import.meta.dirname, './tmpl/index.ejs'));
    this.tmpl = tmpl.toString();
  }

  start() {
    const server = http.createServer(async (req, res) => {
      try {
        const requestUrl = decodeURIComponent(req.url ?? '/');
        const wholePath = path.join(this.baseDir, requestUrl);
        const stat = await fs.stat(wholePath);
        if (stat.isDirectory()) {
          this.processDirectory(wholePath, res, requestUrl);
        } else {
          this.processFile(wholePath, res);
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
    const html = ejs.render(this.tmpl, { directories: content });
    res.setHeader('Content-Type', 'text/html;charset=utf-8');
    res.end(html);
  }

  private async processFile(file: string, res: Res) {
    res.setHeader('Content-Type', `${mine.getType(file) ?? 'text/plain'};charset=utf-8`);
    createReadStream(file).pipe(res);
  }
}
