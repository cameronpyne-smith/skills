'use strict';

const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '..', '..', 'config', 'servers.json');

function loadServers() {
  if (!fs.existsSync(configPath)) {
    throw new Error('No servers configured. Run: /bsp add-server <url>');
  }
  const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return Array.isArray(parsed) ? parsed : [parsed];
}

function resolveServer(name) {
  const servers = loadServers();

  let server;
  if (name) {
    server = servers.find(s => s.name === name);
    if (!server) {
      throw new Error(`Server '${name}' not found. Available: ${servers.map(s => s.name).join(', ')}`);
    }
  } else if (servers.length === 1) {
    server = servers[0];
  } else {
    throw new Error(`Multiple servers configured — pass --Server <name>. Available: ${servers.map(s => s.name).join(', ')}`);
  }

  if (!server.apiKey || server.apiKey.startsWith('<')) {
    throw new Error(`Server '${server.name}' has no API key set in config/servers.json.`);
  }

  const substitute = value => value
    .replace('{{apiKey}}', server.apiKey)
    .replace('{{tenantId}}', server.tenantId || '');

  const endpoint = server.endpoint.replace(/\/+$/, '');

  const headers = {};
  for (const [key, value] of Object.entries(server.authHeaders || {})) {
    headers[key] = substitute(value);
  }

  const url = (pathAndQuery) => {
    const target = new URL(`${endpoint}${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`);
    for (const [key, value] of Object.entries(server.authQuery || {})) {
      target.searchParams.set(key, substitute(value));
    }
    return target;
  };

  return { server, endpoint, headers, url };
}

function hasCapability(server, suffix) {
  return (server.capabilities || []).some(c => c.endsWith(suffix));
}

module.exports = { resolveServer, hasCapability };
