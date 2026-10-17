# dsh-web-search-router

English | [中文](./README.zh.md)

Channel-aware search routing for DeepSeek Harness: which provider a search uses depends on which model route is active, and when neither side is usable you get a readable reason instead of a bare 500.

## Why it exists

The built-in search only works on the official DeepSeek account route. On a third-party model route it fails silently, leaving the user with a vague error. This plugin wires up both sides:

| Active route | What gets used |
|---|---|
| Official DeepSeek account | The `web_search` tool over the Anthropic Messages protocol |
| Third-party route | Your own search endpoint (Parallel-compatible API) |

## Configuration

Settings → Search, then fill in the API key and endpoint of your search service.

Credentials resolve in this order; the first one that exists wins:

1. Account token
2. `DEEPSEEK_API_KEY` in the credential store
3. Launch environment variable

## Failure reporting

When a search fails, a notice appears in the bottom-right corner and names the step that failed:

- No key configured → "No search service is available yet. Set an API key in Settings → Search."
- Upstream refused → status and reason from the upstream response
- Timeout / network error → reported separately, never lumped together

Notices disappear after 12 seconds, and can also be dismissed manually.

## Install

```bash
pnpm add github:MCJF28/dsh-web-search-router
```

Then add `dsh-web-search-router` to `dsh.profile.bundles`.

## Notes

If your profile patch has the `web` row hard-coded to `searchProvider: deepseek-official` by the base bundle, override it in the profile's `cordis.patch.yml` — otherwise the provider this plugin registers is never selected:

```yaml
- id: web
  name: "@deepseek-ai/dsh-web"
  config:
    searchProvider: custom-search
    fetchProvider: http
```

Why: `resolveProvider` only walks the provider list looking for an available one while `configuredId === undefined`. Once a name is hard-coded in configuration, the plugin's `available()` is never even called.
