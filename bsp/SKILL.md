---
name: bsp
description: Interact with any BSP (Behavioral State Protocol) or OAP-compliant service. Use when the user wants to query data from, send commands to, or configure a BSP/OAP endpoint. Invoke with /bsp followed by a natural language request or a management command like "add-server".
argument-hint: "[server-name] <natural language request> | add-server <url>"
---

You are connected to one or more BSP-compliant services via configuration in `config/servers.json` relative to this skill's directory.

## Configuration

Read the server list from `config/servers.json` (relative to this skill directory). If the file does not exist, tell the user no servers are configured and ask them to run `/bsp add-server <url>` to add one.

Each entry in `servers.json` looks like:
```json
{
  "name": "remundo",
  "endpoint": "https://dev.api.baas.remundo.com/api/oap/tenants/XML-INT",
  "apiKey": "...",
  "tenantId": "XML-INT",
  "authHeaders": {
    "X-Api-Key": "{{apiKey}}",
    "X-Tenant-Id": "{{tenantId}}"
  }
}
```

When the user specifies a server by name (e.g. "in remundo, how many orgs"), use that server. If only one server is configured, use it by default. If multiple servers are configured and none is specified, ask the user which one to use.

Build the auth headers by substituting `{{apiKey}}` and `{{tenantId}}` from the server entry. Always include all declared `authHeaders` on every request.

## Adding a server

When the user says `/bsp add-server <url>` or asks to add a server:

Run the `add-server.js` script with the URL and any provided credentials:
```bash
node scripts/add-server.js --Url "<url>" [--Name "<name>"] [--ApiKey "<key>"] [--TenantId "<tenantId>"]
```

The script fetches `/.well-known/bsp/{tenantId}` (or `/.well-known/bsp` for the root manifest), discovers the endpoint and auth scheme, and writes to `config/servers.json`. If the API key or tenant ID are not provided, the script will prompt or the user should provide them.

## Reading current state (queries)

Use `node` with built-in `fetch` for all HTTP requests. Always include the auth headers.

### Discover available queries
```js
node --input-type=module -e "
const res = await fetch('<endpoint>/queries', {
  headers: { 'X-Api-Key': '<apiKey>', 'X-Tenant-Id': '<tenantId>' }
});
if (!res.ok) throw new Error(res.status + ': ' + await res.text());
console.log(JSON.stringify(await res.json(), null, 2));
"
```

### Get a query schema (to understand parameters and response shape)
```js
node --input-type=module -e "
const res = await fetch('<endpoint>/queries/<schema>/<version>', {
  headers: { 'X-Api-Key': '<apiKey>', 'X-Tenant-Id': '<tenantId>' }
});
if (!res.ok) throw new Error(res.status + ': ' + await res.text());
console.log(JSON.stringify(await res.json(), null, 2));
"
```

### Execute a query
```js
node --input-type=module -e "
const res = await fetch('<endpoint>/queries/<schema>', {
  headers: { 'X-Api-Key': '<apiKey>', 'X-Tenant-Id': '<tenantId>' }
});
if (!res.ok) throw new Error(res.status + ': ' + await res.text());
console.log(JSON.stringify(await res.json(), null, 2));
"
```

Append `?key=value` query parameters to the URL as needed.

**Error handling:** `fetch` rejects on network failure; a non-2xx status throws via the explicit `!res.ok` check above. A 404 means the path is wrong or the capability is not supported — it does NOT mean empty results. Only report "no data" when HTTP 200 returns an empty array/collection.

## Sending commands

Use the `send-command.js` script for all command dispatch. This script handles CloudEvent envelope construction (UUID, PascalCase type, dataschema, timestamp) deterministically.

### Workflow

1. **Discover commands**
   ```js
   node --input-type=module -e "
   const res = await fetch('<endpoint>/commands', {
     headers: { 'X-Api-Key': '<apiKey>', 'X-Tenant-Id': '<tenantId>' }
   });
   if (!res.ok) throw new Error(res.status + ': ' + await res.text());
   console.log(JSON.stringify(await res.json(), null, 2));
   "
   ```

2. **Get command schema** (always do this before sending — the `description` field contains the required `source` value)
   ```js
   node --input-type=module -e "
   const res = await fetch('<endpoint>/commands/<schema>/<version>', {
     headers: { 'X-Api-Key': '<apiKey>', 'X-Tenant-Id': '<tenantId>' }
   });
   if (!res.ok) throw new Error(res.status + ': ' + await res.text());
   console.log(JSON.stringify(await res.json(), null, 2));
   "
   ```

3. **Gather required fields** from the user if not already provided. Never invent field values.

4. **Send the command**
   ```bash
   node scripts/send-command.js \
     --Server "remundo" \
     --Schema "<schema>" \
     --Version "<version>" \
     --Source "<source-from-schema-description>" \
     --Data '{"field":"value"}'
   ```

**Critical rule on `source`:** The `source` field routes the CloudEvent on the server. Its required value is stated in the schema `description` returned by step 2. NEVER invent or guess this value. If the schema description does not specify a source value, ask the user before proceeding.

## Listing registered agents/services

```js
node --input-type=module -e "
const res = await fetch('<endpoint>/services', {
  headers: { 'X-Api-Key': '<apiKey>', 'X-Tenant-Id': '<tenantId>' }
});
if (!res.ok) throw new Error(res.status + ': ' + await res.text());
console.log(JSON.stringify(await res.json(), null, 2));
"
```

## General guidance

- Always read `config/servers.json` at the start of each BSP interaction to get current credentials
- If a request fails with 401, the API key may have changed — ask the user to re-run `/bsp add-server` for that server
- If a request fails with 404 on a capability endpoint (e.g. `/commands`), that capability may not be supported — check `/.well-known/bsp` to see what capabilities the server declares
- Relay error messages verbatim to the user — BSP error responses are designed to be actionable
- For protocol questions, edge cases, or unexpected behaviour, refer to the BSP specification: https://behavioralstate.io/docs
