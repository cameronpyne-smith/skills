#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const API_KEY_PLACEHOLDER = '<PASTE_API_KEY>';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const match = argv[i].match(/^--?(\w+)$/);
    if (!match) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[match[1]] = argv[++i];
    } else {
      args[match[1]] = true;
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

// Calling process.exit() while stdin is still attached can abort the process on Windows
// before stderr flushes. Throw instead and let the top-level handler set the exit code.
function fail(message) {
  const err = new Error(message);
  err.expected = true;
  throw err;
}

function compareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) < (pb[i] || 0) ? -1 : 1;
  }
  return 0;
}

async function fetchJson(url, headers) {
  const res = await fetch(url, { headers: { Accept: 'application/json', ...headers } });
  const text = await res.text();
  if (!res.ok) return { ok: false, status: res.status, body: text };
  try {
    return { ok: true, json: JSON.parse(text) };
  } catch {
    return { ok: false, status: res.status, body: `Response was not JSON: ${text.slice(0, 200)}` };
  }
}

// The protocol short name changed BSP -> BEST in spec 0.9.0. Try the current path first,
// fall back to the legacy one. Hosts commonly serve the manifest at the origin root even
// when the service surface lives under a path, so try both bases.
function wellKnownCandidates(url) {
  const trimmed = url.replace(/\/+$/, '');
  const origin = new URL(trimmed).origin;
  const bases = trimmed === origin ? [origin] : [trimmed, origin];
  const candidates = [];
  for (const base of bases) {
    candidates.push(`${base}/.well-known/best`);
    candidates.push(`${base}/.well-known/bsp`);
  }
  return candidates;
}

function unwrapManifest(doc) {
  const root = doc.best || doc.bsp || doc.oap || doc;
  return root && typeof root === 'object' ? root : doc;
}

function pickService(manifest) {
  const services = manifest.services || {};
  const keys = Object.keys(services);
  if (!keys.length) return null;

  // Prefer whichever service implements the commands capability.
  const commandCap = (manifest.capabilities || [])
    .find(c => /agents\.commands$/.test(c.name || ''));
  const preferred = commandCap && services[commandCap.service] ? commandCap.service : null;
  const key = preferred || keys.find(k => services[k]?.http?.endpoint) || keys[0];
  return { key, service: services[key] };
}

function buildAuth(manifest, service) {
  const auth = manifest.authentication || {};
  const type = (auth.type || 'apiKey').toLowerCase();
  const headers = {};
  let authQuery = null;

  if (type === 'none') {
    // no credentials
  } else if (type === 'bearer' || type === 'oauth2') {
    headers.Authorization = 'Bearer {{apiKey}}';
  } else if ((auth.in || 'header').toLowerCase() === 'query') {
    authQuery = { [auth.scheme || 'apikey']: '{{apiKey}}' };
  } else {
    headers[auth.scheme || 'X-Api-Key'] = '{{apiKey}}';
  }

  // Multi-header schemes (e.g. API key + tenant id) are declared on the MCP binding.
  // Adopt any additional header it names — the HTTP surface gates on the same values.
  const declared = service?.mcp?.authentication?.headers || [];
  for (const header of declared) {
    if (!header?.name || headers[header.name]) continue;
    if (auth.scheme && header.name.toLowerCase() === String(auth.scheme).toLowerCase()) continue;
    headers[header.name] = /tenant/i.test(header.name) ? '{{tenantId}}' : '{{apiKey}}';
  }

  return { authHeaders: headers, authQuery };
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  let { Url, Name, ApiKey, TenantId } = args;

  if (!Url) {
    fail('Required: --Url <url>\nUsage: node add-server.js --Url <url> [--Name <name>] [--ApiKey <key>] [--TenantId <id>] [--AbsoluteDataschema | --RelativeDataschema]');
  }

  ApiKey = ApiKey || process.env.BSP_API_KEY || process.env.BEST_API_KEY;

  let manifestUrl = null;
  let rootManifest = null;
  const attempts = [];

  for (const candidate of wellKnownCandidates(Url)) {
    const result = await fetchJson(candidate);
    if (result.ok) {
      manifestUrl = candidate;
      rootManifest = unwrapManifest(result.json);
      break;
    }
    attempts.push(`  ${candidate} -> HTTP ${result.status}`);
  }

  if (!rootManifest) {
    fail(`No discovery manifest found. Tried:\n${attempts.join('\n')}\nIs this a BEST/BSP-compliant service?`);
  }

  console.log(`Discovered manifest at ${manifestUrl}`);
  const rootVersion = rootManifest.version || 'unknown';
  console.log(`  Protocol version: ${rootVersion}`);

  // Multi-tenant hosts declare a URI template; the tenant manifest is fully self-contained.
  let manifest = rootManifest;
  const template = rootManifest.tenants?.manifest;

  if (template) {
    if (!TenantId) {
      if (process.stdin.isTTY) {
        TenantId = await prompt('This host is multi-tenant. Enter tenant ID: ');
      } else {
        fail(`Host is multi-tenant (template: ${template}) — rerun with --TenantId <id>.`);
      }
    }
    const tenantUrl = template.replace('{tenantId}', encodeURIComponent(TenantId));
    // Per spec, the tenant manifest needs at most the API key — never a tenant header.
    const keyHeaders = {};
    if (ApiKey && ApiKey !== API_KEY_PLACEHOLDER) {
      const scheme = rootManifest.authentication?.scheme || 'X-Api-Key';
      const type = (rootManifest.authentication?.type || 'apiKey').toLowerCase();
      if (type === 'bearer' || type === 'oauth2') keyHeaders.Authorization = `Bearer ${ApiKey}`;
      else keyHeaders[scheme] = ApiKey;
    }
    const result = await fetchJson(tenantUrl, keyHeaders);
    if (!result.ok) {
      fail(`Failed to fetch tenant manifest ${tenantUrl} (HTTP ${result.status}): ${result.body}`);
    }
    manifest = unwrapManifest(result.json);
    console.log(`  Tenant manifest:  ${tenantUrl}`);
  }

  const picked = pickService(manifest);
  let endpoint = picked?.service?.http?.endpoint || manifest.endpoint || manifest.href;

  if (!endpoint) {
    fail("Manifest declares no service with an 'http.endpoint'.");
  }
  endpoint = endpoint.replace(/\/+$/, '');

  // A root manifest may expose the collection base (".../tenants"); scope it ourselves.
  if (TenantId && !endpoint.split('/').includes(TenantId)) {
    if (/\/tenants$/.test(endpoint)) endpoint = `${endpoint}/${TenantId}`;
  }

  if (!Name) {
    const host = new URL(endpoint).hostname.replace(/^www\./, '');
    Name = TenantId ? `${host.split('.')[0]}-${TenantId}` : host;
  }

  if (!ApiKey) {
    if (process.stdin.isTTY) {
      ApiKey = await prompt(`Enter API key for ${Name}: `);
    } else {
      ApiKey = API_KEY_PLACEHOLDER;
    }
  }

  const { authHeaders, authQuery } = buildAuth(manifest, picked?.service);

  // Spec 0.9.0 made the command envelope a conformant CloudEvents 1.0 profile: dataschema
  // must be the absolute catalogue URI. Pre-0.9 servers expect the relative "{schema}/{version}".
  const version = manifest.version || rootVersion;
  let absoluteDataschema = version !== 'unknown' && compareVersions(version, '0.9.0') >= 0;
  if (args.AbsoluteDataschema) absoluteDataschema = true;
  if (args.RelativeDataschema) absoluteDataschema = false;

  const capabilities = (manifest.capabilities || []).map(c => c.name).filter(Boolean);

  const serverEntry = {
    name: Name,
    endpoint,
    apiKey: ApiKey,
    tenantId: TenantId || null,
    authHeaders,
    protocolVersion: version,
    absoluteDataschema,
    manifestUrl,
    capabilities,
  };
  if (authQuery) serverEntry.authQuery = authQuery;

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

  console.log(`\nServer '${Name}' written to config/servers.json`);
  console.log(`  Endpoint:   ${endpoint}`);
  console.log(`  Tenant ID:  ${TenantId || '(none)'}`);
  console.log(`  Auth:       ${Object.keys(authHeaders).join(', ') || '(none)'}${authQuery ? ` + query ${Object.keys(authQuery).join(', ')}` : ''}`);
  console.log(`  dataschema: ${absoluteDataschema ? 'absolute catalogue URI (spec >= 0.9)' : 'relative {schema}/{version} (spec < 0.9)'}`);
  console.log(`  Capabilities: ${capabilities.join(', ') || '(none declared)'}`);

  if (ApiKey === API_KEY_PLACEHOLDER) {
    console.log(`\n!! No API key supplied. Replace "${API_KEY_PLACEHOLDER}" in config/servers.json,`);
    console.log(`   or rerun: node scripts/add-server.js --Url "${Url}" --Name "${Name}"${TenantId ? ` --TenantId "${TenantId}"` : ''} --ApiKey "<key>"`);
  } else {
    console.log(`\nYou can now use '/bsp' to query or send commands to this server.`);
  }
})().catch(err => {
  console.error(err.expected ? err.message : (err.stack || err.message));
  process.exitCode = 1;
});
