#!/usr/bin/env node
'use strict';

const { resolveServer } = require('./lib/server');

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

const args = parseArgs(process.argv.slice(2));

if (!args.Path) {
  console.error('Usage: node get.js [--Server <name>] --Path "queries" [--Raw]');
  process.exit(1);
}

// Git Bash / MSYS rewrites a leading "/" into a Windows path before node sees it.
if (/^[A-Za-z]:[\\/]/.test(args.Path) || args.Path.startsWith('\\\\')) {
  console.error(`--Path was rewritten by the shell to "${args.Path}". Pass it without a leading slash, e.g. --Path "queries".`);
  process.exit(1);
}

(async () => {
  const { headers, url } = resolveServer(args.Server);
  const target = url(args.Path);

  const res = await fetch(target, { headers: { Accept: 'application/json', ...headers } });
  const text = await res.text();

  if (!res.ok) {
    console.error(`GET ${target.pathname} failed (HTTP ${res.status}): ${text}`);
    process.exit(1);
  }

  if (args.Raw) {
    console.log(text);
    return;
  }

  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
})().catch(err => {
  console.error(err.message);
  process.exit(1);
});
