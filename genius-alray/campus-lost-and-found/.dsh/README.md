# `.dsh/` — DeepSeek Harness project layer

This directory holds the project-level configuration for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (`dsh`).

## Supabase MCP

`mcp.supabase.patch.yml` declares the hosted Supabase MCP server
(`project_ref=iehxleycijdqlglnfbby`) through `@deepseek-ai/dsh-mcp-client`.

dsh does not read a `.mcp.json` and has no auto-discovered project scope the way
Claude Code does. MCP servers are plugin entries, and a project supplies its own
layer with the launcher's `--patch` flag, so the project-scoped equivalent of
`claude mcp add --scope project ...` is:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_...      # scoped personal access token
dsh web --patch .dsh/mcp.supabase.patch.yml
```

### Authentication

dsh's MCP client supports static request headers only — there is no OAuth or
dynamic client registration flow — so Supabase's default browser login cannot be
used. Supabase supports this case by accepting a scoped personal access token in
the `Authorization` header:

1. Open <https://supabase.com/dashboard/account/tokens> and create a token,
   scoped to project `iehxleycijdqlglnfbby` with only the permissions the enabled
   tool groups need.
2. Export it as `SUPABASE_ACCESS_TOKEN` in the environment that launches `dsh`.

The token is never written to this file: the patch reads it through a `!!js`
expression, and the entry is `disabled` while the variable is unset, so dsh
skips the server instead of retrying a failing connection at startup.

### Verifying it works

After launch, the server's tools are exposed as `mcp__supabase__<tool>`, for
example `mcp__supabase__list_tables`. Because `dsh-mcp-resources` is mounted by
the shipped profiles, `list_mcp_resources` / `read_mcp_resource` also accept
`supabase` as the `server` argument.

If the tools do not appear, check the harness log for an MCP connection error and
confirm `SUPABASE_ACCESS_TOKEN` is visible to the dsh process
(`dsh` config expressions read `process.env` of the launcher).

### Scope of the server

The URL keeps the feature groups from the Supabase guide, and the entry is
**writable**: the shipped patch does not set `read_only=true`, so every mutating
tool stays available. To harden the project layer, add `read_only=true` to the
query string, which removes every mutating tool:

```
https://mcp.supabase.com/mcp?project_ref=iehxleycijdqlglnfbby&read_only=true&features=...
```
