#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const match = argv[i].match(/^--?(\w+)$/);
    if (match && argv[i + 1] && !argv[i + 1].startsWith('-')) {
      args[match[1]] = argv[++i];
    }
  }
  return args;
}

function prompt(question) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, answer => { rl.close(); resolve(answer.trim()); });
  });
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  let { Url, Name, ApiKey, TenantId } = args;

  if (!Url) {
    console.error('Required: --Url <url>');
    process.exit(1);
  }

  const baseUrl = Url.replace(/\/$/, '');

  const wellKnownUrl = TenantId
    ? `${baseUrl}/.well-known/bsp/${TenantId}`
    : `${baseUrl}/.well-known/bsp`;

  console.log(`Fetching BSP manifest from ${wellKnownUrl} ...`);

  let manifest;
  try {
    const res = await fetch(wellKnownUrl, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const body = await res.text();
      if (res.status === 404) {
        console.error(`No BSP manifest found at ${wellKnownUrl}. Is this a BSP-compliant service?`);
      } else {
        console.error(`Failed to fetch manifest (HTTP ${res.status}): ${body}`);
      }
      process.exit(1);
    }
    manifest = await res.json();
  } catch (err) {
    console.error(`Request failed: ${err.message}`);
    process.exit(1);
  }

  // Support flat BSP format and nested OAP format
  let endpoint = manifest.endpoint || manifest.href;
  if (!endpoint && manifest.oap?.services) {
    const services = Object.values(manifest.oap.services);
    endpoint = services.find(s => s.rest?.endpoint)?.rest?.endpoint;
  }
  if (!endpoint) {
    console.error("Manifest does not contain an 'endpoint' or 'href' field.");
    process.exit(1);
  }

  if (!Name) {
    Name = new URL(baseUrl).hostname.replace(/^www\./, '');
  }

  if (!ApiKey) {
    ApiKey = manifest.apiKey || await prompt(`Enter API key for ${Name}: `);
  }

  if (!TenantId) {
    TenantId = manifest.tenantId || await prompt(`Enter tenant ID for ${Name}: `);
  }

  const authScheme = manifest.oap?.authentication?.type === 'bearer' || manifest.auth?.scheme === 'bearer';
  const authHeaders = authScheme
    ? { Authorization: 'Bearer {{apiKey}}', 'X-Tenant-Id': '{{tenantId}}' }
    : { 'X-Api-Key': '{{apiKey}}', 'X-Tenant-Id': '{{tenantId}}' };

  const serverEntry = { name: Name, endpoint, apiKey: ApiKey, tenantId: TenantId, authHeaders };

  const configDir  = path.join(__dirname, '..', 'config');
  const configPath = path.join(configDir, 'servers.json');

  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });

  let servers = [];
  if (fs.existsSync(configPath)) {
    const existing = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    servers = (Array.isArray(existing) ? existing : [existing]).filter(s => s.name !== Name);
  }

  servers.push(serverEntry);
  fs.writeFileSync(configPath, JSON.stringify(servers, null, 2), 'utf8');

  console.log(`\nServer '${Name}' added to config/servers.json`);
  console.log(`  Endpoint:  ${endpoint}`);
  console.log(`  Tenant ID: ${TenantId}`);
  console.log(`\nYou can now use '/bsp' to query or send commands to this server.`);
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
