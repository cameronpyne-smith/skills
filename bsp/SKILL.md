---
name: bsp
description: Interact with any BSP (Behavioral State Protocol) or OAP-compliant service. Use when the user wants to query data from, send commands to, or configure a BSP/OAP endpoint. Invoke with /bsp followed by a natural language request or a management command like "add-server".
argument-hint: "[server-name] <natural language request> | add-server <url>"
---

You are connected to one or more BEST/BSP-compliant services via configuration in `config/servers.json` relative to this skill's directory.

## Protocol naming

The protocol's short name changed **BSP → BEST** in spec 0.9.0 (the full name, Behavioral State Protocol, is unchanged). Current spec: 0.9.1. Both names refer to the same protocol, and services in the wild run a mix of versions:

- **0.9+** — discovery at `/.well-known/best`, manifest root key `best`, capabilities named `io.best.agents.*`, absolute `dataschema` URIs
- **pre-0.9** — discovery at `/.well-known/bsp`, root key `bsp`, capabilities `io.bsp.agents.*`, relative `dataschema`

The scripts handle both. Never assume which one a service speaks — read its manifest.

## Configuration

Read the server list from `config/servers.json` (relative to this skill directory). If the file does not exist, tell the user no servers are configured and ask them to run `/bsp add-server <url>` to add one.

Each entry looks like:
```json
{
  "name": "remundo-prod-staff",
  "endpoint": "https://api.baas.remundo.com/api/bsp/tenants/staff-wp3zv",
  "apiKey": "...",
  "tenantId": "staff-wp3zv",
  "authHeaders": {
    "X-Api-Key": "{{apiKey}}",
    "X-Tenant-Id": "{{tenantId}}"
  },
  "protocolVersion": "0.7.1",
  "absoluteDataschema": false,
  "manifestUrl": "https://api.baas.remundo.com/.well-known/bsp",
  "capabilities": ["io.bsp.agents.commands", "io.bsp.agents.queries", "io.bsp.agents.events", "io.remundo.workflows"]
}
```

`endpoint` is already tenant-scoped — paths append directly to it. `capabilities` records what the service declared; check it before calling `/events`, `/subscriptions`, or `/workflows`. An entry may also carry `authQuery` when the service takes its credential as a query parameter instead of a header.

When the user specifies a server by name (e.g. "in remundo-dev, how many orgs"), use that server. If only one is configured, use it by default. If several are configured and none is specified, ask which one — **never guess between a dev and a prod server.**

If `apiKey` is `<PASTE_API_KEY>`, the entry was created without a credential: tell the user to add their key to `config/servers.json` (or rerun `add-server` with `--ApiKey`) before anything else.

## Adding a server

When the user says `/bsp add-server <url>` or asks to add a server:

```bash
node scripts/add-server.js --Url "<url>" [--Name "<name>"] [--ApiKey "<key>"] [--TenantId "<tenantId>"]
```

The script walks discovery properly: it tries `/.well-known/best` then `/.well-known/bsp`, at both the URL given and its origin (hosts commonly serve the manifest at the origin root even when the service surface lives under a path like `/api/bsp`). If the root manifest declares `tenants.manifest`, it expands that URI template with `--TenantId` and fetches the fully-scoped tenant manifest. Auth headers, protocol version, `absoluteDataschema`, and the capability list are all derived from the manifest — do not hand-write them.

If `--ApiKey` is omitted in a non-interactive shell the entry is written with a placeholder rather than failing, so discovery output is still captured. Override the dataschema form with `--AbsoluteDataschema` / `--RelativeDataschema` only when a server disagrees with its own declared version.

## Making requests

Use `get.js` for all reads — it resolves the endpoint, auth headers, and any query credential from `config/servers.json`, so request snippets never hardcode header names:

```bash
node scripts/get.js --Server "<name>" --Path "queries"
```

**Error handling:** a non-2xx status is reported with the response body and a non-zero exit. A 404 means the path is wrong or the capability is not supported — it does **not** mean empty results. Only report "no data" when a 200 returns an empty array/collection. Relay error messages verbatim; BEST error responses (`{"error": {"code", "message", "details"}}`) are designed to be actionable.

## Reading current state (queries)

```bash
node scripts/get.js --Server "<name>" --Path "queries"                        # catalogue
node scripts/get.js --Server "<name>" --Path "queries/<schema>/<version>"     # parameters + response shape
node scripts/get.js --Server "<name>" --Path "queries/<schema>?key=value"     # execute
```

Query parameters are query-string key-value pairs matching the schema's `parameters` block. Queries are synchronous — the result is the response body. They are not a query language: no filters, joins, or aggregations beyond the declared parameters.

## Sending commands

Commands are **asynchronous**. `POST /commands` returns `201 Created` with `{"id": "..."}`, meaning the command was durably queued — not that it succeeded. The outcome arrives as one or more events.

1. **Discover commands**
   ```bash
   node scripts/get.js --Server "<name>" --Path "commands"
   ```

2. **Get the command schema** — always do this before sending. The top-level `description` states the required `source` value, and the optional `produces` array lists the events the command can raise.
   ```bash
   node scripts/get.js --Server "<name>" --Path "commands/<schema>/<version>"
   ```

3. **Gather required fields** from the user if not already provided. Never invent field values.

4. **Send the command**
   ```bash
   node scripts/send-command.js \
     --Server "<name>" \
     --Schema "<schema>" \
     --Version "<version>" \
     --Source "<source-from-schema-description>" \
     --Data '{"field":"value"}'
   ```

The script builds the CloudEvents 1.0 envelope deterministically: `id` (a UUID, which is the idempotency key — reusing it with a different payload returns 409), `type` (PascalCase of the kebab-case schema name), `dataschema` (absolute or relative per the server's `absoluteDataschema` setting), and `time`.

**Critical rule on `source`:** `source` is a routing input on the server and must be an RFC 3986 URI-reference. Its required value is stated in the schema `description` returned by step 2. NEVER invent or guess it. If the description does not specify one, ask the user before proceeding.

5. **Observe the outcome** — use the correlation id echoed in the `201` response:
   ```bash
   node scripts/get.js --Server "<name>" --Path "events?correlationId=<id>"
   ```
   Do not report a command as having worked on the strength of the `201` alone. If the service declares no events capability, say that the outcome cannot be confirmed through the protocol.

## Events

Only when the server's `capabilities` include an `agents.events` entry:

```bash
node scripts/get.js --Server "<name>" --Path "events?correlationId=<id>"      # history, filterable
node scripts/get.js --Server "<name>" --Path "events/<schema>/<version>"      # event schema
```

`GET /events/stream` is a Server-Sent Events stream of live events — long-lived, so only open it when the user explicitly wants to watch, and tell them how to stop. `GET /events` carries no replay guarantee: it returns whatever the server currently exposes, with no promise of completeness or ordering. Webhook subscriptions are `POST /subscriptions` and `DELETE /subscriptions/{id}`.

## Workflows

Some services publish named, ordered command sequences for common business processes (a descriptive extension — no execution engine, just documentation of the intended order):

```bash
node scripts/get.js --Server "<name>" --Path "workflows"
```

Check `capabilities` first; a service that publishes none simply has no `/workflows` endpoint. When a request maps to a published workflow, follow its sequence rather than inventing an order.

## General guidance

- Always read `config/servers.json` at the start of each interaction to get current endpoints and credentials
- Prefer the declared `capabilities` list over trial-and-error probing; re-run `add-server` to refresh it if a service has been upgraded
- A 401 usually means the key was rotated — ask the user for a new one, then rerun `add-server` with `--ApiKey`
- Never echo an API key into the transcript; reference the config entry by name instead
- Spec reference: https://behavioralstate.io/specs — commands `/specs/agents/commands`, queries `/specs/agents/queries`, events `/specs/agents/events`, discovery `/specs/discovery`, HTTP transport `/specs/transports/http`. The older `/docs/*` URLs are dead.
