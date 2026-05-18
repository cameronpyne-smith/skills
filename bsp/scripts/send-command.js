#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

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

const { Server, Schema, Version, Source, Data } = parseArgs(process.argv.slice(2));

if (!Server || !Schema || !Version || !Source || !Data) {
  console.error('Usage: node send-command.js --Server <name> --Schema <schema> --Version <version> --Source <source> --Data \'{"field":"value"}\'');
  process.exit(1);
}

const configPath = path.join(__dirname, '..', 'config', 'servers.json');
if (!fs.existsSync(configPath)) {
  console.error('No servers configured. Run: /bsp add-server <url>');
  process.exit(1);
}

const servers = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const all = Array.isArray(servers) ? servers : [servers];
const serverConfig = all.find(s => s.name === Server);
if (!serverConfig) {
  console.error(`Server '${Server}' not found. Available: ${all.map(s => s.name).join(', ')}`);
  process.exit(1);
}

// Build auth headers, substituting {{apiKey}} and {{tenantId}} placeholders
const headers = { 'Content-Type': 'application/json' };
for (const [key, value] of Object.entries(serverConfig.authHeaders)) {
  headers[key] = value
    .replace('{{apiKey}}', serverConfig.apiKey)
    .replace('{{tenantId}}', serverConfig.tenantId);
}

// Convert kebab-case schema to PascalCase (e.g. create-organisation -> CreateOrganisation)
const pascalType = Schema.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');

const eventId = randomUUID();

const cloudEvent = {
  specversion: '1.0',
  id: eventId,
  type: pascalType,
  source: Source,
  dataschema: `${Schema}/${Version}`,
  datacontenttype: 'application/json',
  time: new Date().toISOString(),
  data: JSON.parse(Data),
};

const commandsUri = `${serverConfig.endpoint}/commands`;

console.log(`Sending CloudEvent to ${commandsUri}`);
console.log(`  type:   ${pascalType}`);
console.log(`  source: ${Source}`);
console.log(`  id:     ${eventId}`);

(async () => {
  const res = await fetch(commandsUri, {
    method: 'POST',
    headers,
    body: JSON.stringify(cloudEvent),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`Command failed (HTTP ${res.status}): ${text}`);
    process.exit(1);
  }

  console.log('Success:');
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
})().catch(err => {
  console.error(`Request failed: ${err.message}`);
  process.exit(1);
});
