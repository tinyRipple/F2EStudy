import process from 'node:process';
import type { ResourceItem } from './types';

export const DEFAULT_PORT = 8080;
export const DEFAULT_BASE_DIR = process.cwd();

export const TMPL = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>htttp-server</title>
</head>
<body>
  <ul>
    <% directories.forEach(({ contentName, href, size }) => { %>
      <li><a href="<%= href %>"><%= contentName %></a>(size: <%= size %>bytes)</li>
    <% }) %>
  </ul>
</body>
</html>
`;

export const API_PREFIX = '/api';

export const DEFAULT_DATA: { [k: string]: ResourceItem[] } = {
  users: [
    {
      id: 1,
      name: 'tinywaves',
      age: 10,
    },
    {
      id: 2,
      name: 'Lyle Zheng',
      age: 20,
    },
  ],
};
