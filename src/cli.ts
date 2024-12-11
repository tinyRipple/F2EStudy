import process from 'node:process';
import { program } from 'commander';
import Server from '.';
import { DEFAULT_PORT, DEFAULT_BASE_DIR } from './constants';

const cliOptions = [
  {
    option: '-p, --port <port>',
    description: 'The port to listen on',
    defaultValue: DEFAULT_PORT,
    usage: `htttp-server -p ${DEFAULT_PORT}`,
  },
  {
    option: '-d, --directory <directory>',
    description: 'The directory to serve',
    defaultValue: DEFAULT_BASE_DIR,
    usage: `htttp-server -d ${DEFAULT_BASE_DIR}`,
  },
];

cliOptions.forEach(({ option, description, defaultValue }) => program.option(option, description, defaultValue.toString()));
program.on('--help', () => {
  console.log('Examples:');
  cliOptions
    .map(({ usage }) => usage)
    .forEach((usage) => console.log(`\x20\x20${usage}`));
});
program.parse(process.argv);
const opts = program.opts();

const server = new Server({
  port: opts.port,
  baseDir: opts.directory,
});
server.start();