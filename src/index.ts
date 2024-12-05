import process from 'node:process';
import * as http from 'node:http';
import * as os from 'node:os';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import chalk from 'chalk';
import type { ServerOptions } from './types';

class Server {
  port: number = 8080;
  baseDir: string = process.cwd();

  constructor(options?: ServerOptions) {
    if (options?.port) {
      this.port = options.port;
    }
    if (options?.baseDir) {
      this.baseDir = options.baseDir;
    }
  }

  start() {
    const server = http.createServer(async (req, res) => {
      try {
        const wholePath = path.join(this.baseDir, req.url ?? '/');
        const stat = await fs.stat(wholePath);
        if (stat.isDirectory()) {
          const content = await fs.readdir(wholePath);
          res.end(content.join('\n'));
        } else {
          res.end('Not a directory');
        }
      } catch {
        res.end('Not found');
      }
    });
    server.listen(this.port, () => {
      console.log(chalk.yellow('Server is running on:'));
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
}

const server = new Server();
server.start();
