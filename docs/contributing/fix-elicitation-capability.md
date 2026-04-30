# Fix: MCP Elicitation Broken Post-2.4.0

## Status

- **Severity**: High — elicitation feature completely non-functional
- **Introduced in**: Commit that migrated from `@modelcontextprotocol/sdk` to `@modelcontextprotocol/client@2.0.0-alpha.2`
- **Working version**: v2.2.0 (`@mcpjam/sdk@0.9.3`)
- **Broken versions**: v2.4.0+ (`@mcpjam/sdk@1.3.1`)

## Root Cause

The `normalizeClientCapabilities()` function in `sdk/src/mcp-client-manager/capabilities.ts` was changed to no longer always include the `elicitation: {}` capability.

### Before (v2.2.0 — working)

```typescript
// sdk/src/mcp-client-manager/capabilities.ts
export function normalizeClientCapabilities(
  capabilities?: ClientCapabilityOptions
): ClientCapabilityOptions {
  const normalized: ClientCapabilityOptions = {
    ...(capabilities ?? {}),
  };

  if (!normalized.elicitation) {
    normalized.elicitation = {};  // ← ALWAYS included
  }

  return normalized;
}
```

### After (current — broken)

```typescript
export function normalizeClientCapabilities(
  capabilities?: ClientCapabilityOptions
): ClientCapabilityOptions {
  return {
    ...(capabilities ?? {}),
  };
}
```

Additionally, `mergeClientCapabilities()` previously called `normalizeClientCapabilities()` at the end (which always added `elicitation: {}`), but now returns the merged object directly:

```diff
-  return normalizeClientCapabilities(merged as ClientCapabilityOptions);
+  return merged as ClientCapabilityOptions;
```

## Why This Breaks

In the MCP SDK v2 client (`@modelcontextprotocol/client@2.0.0-alpha.2`), `Client.setRequestHandler()` calls `assertRequestHandlerCapability()` which throws an `SdkError` if the capability is not declared:

```javascript
// @modelcontextprotocol/client/dist/index.mjs (line ~1972)
assertRequestHandlerCapability(method) {
    switch (method) {
        case "elicitation/create":
            if (!this._capabilities.elicitation)
                throw new SdkError(SdkErrorCode.CapabilityNotSupported,
                    `Client does not support elicitation capability (required for ${method})`);
            break;
    }
}
```

The current code attempts to conditionally gate the `elicitation: {}` capability through `applyRuntimeClientCapabilities()` and `buildCapabilities()`, but this introduces a **timing race**:

1. `buildCapabilities()` checks `elicitationManager.hasHandler(serverId)` — only true if a callback is already set
2. If the elicitation callback is registered after connection, `setElicitationCallback()` checks `hasNegotiatedElicitation(state)` which looks at `state.initializedClientCapabilities.elicitation`
3. Since `elicitation: {}` was never included in the initial capabilities, `hasNegotiatedElicitation()` returns `false`
4. The handler is never applied, and the client throws `SdkError` when trying to set it

## Fix Plan

### File: `sdk/src/mcp-client-manager/capabilities.ts`

Restore the unconditional `elicitation: {}` inclusion in client capabilities:

1. In `normalizeClientCapabilities()`: re-add the logic that always includes `elicitation: {}` when not already set
2. In `mergeClientCapabilities()`: restore the call to `normalizeClientCapabilities()` for the final merge

The `applyRuntimeClientCapabilities()` function can remain as-is since `normalizeClientCapabilities()` will handle the default case. The conditional gating in `buildCapabilities()` and `hasNegotiatedElicitation()` will also continue to work correctly — they just won't need to be the sole path for elicitation capability inclusion.

### Why This Is Safe

- Always declaring `elicitation: {}` in client capabilities simply tells the server "this client supports elicitation"
- It does NOT actually install a handler — `setRequestHandler` must still be called separately
- If no handler is installed, the server's elicitation requests will simply get an error, which is the same as not declaring the capability
- This matches the v2.2.0 behavior that was working

## Implementation Steps

1. Edit `sdk/src/mcp-client-manager/capabilities.ts`:
   - Restore `elicitation: {}` in `normalizeClientCapabilities()`
   - Restore `normalizeClientCapabilities()` call in `mergeClientCapabilities()`
2. Verify the SDK builds: `cd sdk && npm run build`
3. Run existing tests: `cd sdk && npm test`