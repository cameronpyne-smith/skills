#!/usr/bin/env node
'use strict';

const { randomUUID } = require('crypto');
const { resolveServer, hasCapability } = require('./lib/server');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const match = argv[i].match(/^--?(\w+)$/);
    if (match && argv[i + 1] && !argv[i + 1].startsWith('--')) {
      args[match[1]] = argv[++i];
    }
  }
  return args;
}

const { Server, Schema, Version, Source, Data } = parseArgs(process.argv.slice(2));

if (!Schema || !Version || !Source || !Data) {
  console.error('Usage: node send-command.js [--Server <name>] --Schema <schema> --Version <version> --Source <source> --Data \'{"field":"value"}\'');
  process.exit(1);
}

(async () => {
  const { server, endpoint, headers, url } = resolveServer(Server);
  const target = url('/commands');

  // CloudEvent type is the PascalCase form of the kebab-case schema name.
  const pascalType = Schema.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join('');

  // Spec 0.9.0 requires the absolute catalogue URI. Pre-0.9 servers expect the relative form.
  const dataschema = server.absoluteDataschema
    ? `${endpoint}/commands/${Schema}/${Version}`
    : `${Schema}/${Version}`;

  const eventId = randomUUID();

  const cloudEvent = {
    specversion: '1.0',
    id: eventId,
    type: pascalType,
    source: Source,
    dataschema,
    datacontenttype: 'application/json',
    time: new Date().toISOString(),
    data: JSON.parse(Data),
  };

  console.log(`Sending CloudEvent to ${target.origin}${target.pathname}`);
  console.log(`  type:       ${pascalType}`);
  console.log(`  source:     ${Source}`);
  console.log(`  dataschema: ${dataschema}`);
  console.log(`  id:         ${eventId}`);

  const res = await fetch(target, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(cloudEvent),
  });

  const text = await res.text();

  if (!res.ok) {
    console.error(`Command failed (HTTP ${res.status}): ${text}`);
    process.exit(1);
  }

  let body = text;
  try { body = JSON.parse(text); } catch { /* leave as text */ }

  console.log(`\nAccepted (HTTP ${res.status}):`);
  console.log(typeof body === 'string' ? body : JSON.stringify(body, null, 2));

  // Commands are asynchronous — the outcome is one or more published events, correlated by
  // the id returned here.
  const correlationId = (body && typeof body === 'object' && (body.id || body.commandId)) || eventId;
  if (hasCapability(server, 'agents.events')) {
    console.log(`\nOutcome is published as events. Correlation id: ${correlationId}`);
    console.log(`  history: node scripts/get.js --Server "${server.name}" --Path "/events?correlationId=${correlationId}"`);
    console.log(`  live:    ${endpoint}/events/stream?correlationId=${correlationId}`);
  }
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
