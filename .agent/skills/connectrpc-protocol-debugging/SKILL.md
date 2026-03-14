---
name: connectrpc-protocol-debugging
description: Use when debugging ConnectRPC Connect/gRPC-Web protocol issues — framing errors, 415 responses, streaming parse failures, or integrating with envd-style services. Covers envelope format, trailer frames, and diagnostic techniques.
---

# ConnectRPC Connect Protocol Debugging

## When to Use

- 415 Unsupported Media Type from ConnectRPC endpoints
- Streaming responses return garbled data or `exitCode: -1`
- "promised N bytes" errors in request body
- Integrating with envd (E2B-style sandbox) APIs
- Any `/service.Method/RPC` path returning unexpected results

## Protocol Quick Reference

### Request Framing (Streaming)

```
Content-Type: application/connect+json

[1 byte flags][4 bytes big-endian uint32 length][JSON payload bytes]
```

- **flags**: `0x00` = data frame
- **length**: payload size in bytes (big-endian uint32)
- JSON payload is UTF-8 encoded

```typescript
function buildConnectEnvelope(body: unknown): Uint8Array {
    const json = JSON.stringify(body);
    const payload = new TextEncoder().encode(json);
    const envelope = new Uint8Array(5 + payload.length);
    envelope[0] = 0x00;
    envelope[1] = (payload.length >> 24) & 0xFF;
    envelope[2] = (payload.length >> 16) & 0xFF;
    envelope[3] = (payload.length >> 8) & 0xFF;
    envelope[4] = payload.length & 0xFF;
    envelope.set(payload, 5);
    return envelope;
}
```

### Response Framing (Server-Streaming)

Same 5-byte envelope per frame in the response body:
- `flags=0x00` → data frame (parse as JSON)
- `flags=0x02` → trailer frame (end-of-stream metadata, also JSON)

### Unary Requests

Standard `Content-Type: application/json` with plain JSON body. No envelope needed.

## Common Pitfalls

| Symptom | Root Cause | Fix |
|---------|-----------|-----|
| 415 Unsupported Media Type | Missing `application/connect+json` Content-Type | Set header explicitly |
| "promised N bytes" | Sending plain JSON to streaming endpoint | Wrap in 5-byte envelope |
| `exitCode: -1` | Not parsing trailer frame or wrong field name | Check `flags=0x02` trailer + parse `status` field |
| Binary data garbled | `bytes` fields are base64 in JSON mode | Decode with `Buffer.from(str, 'base64')` |
| FormData rejected | Setting Content-Type manually for multipart | Let `fetch()` auto-set boundary |

## Diagnostic Technique

When unsure about API protocol, use a diagnostic script pattern:

```typescript
// Step 1: Raw fetch to probe the endpoint
const res = await fetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/connect+json', 'Authorization': `Basic ${token}` },
  body: buildConnectEnvelope({ process: { cmd: '/bin/echo', args: ['test'] } }),
});

// Step 2: Read raw bytes to inspect framing
const buf = new Uint8Array(await res.arrayBuffer());
console.log('flags:', buf[0], 'length:', new DataView(buf.buffer).getUint32(1));
const json = JSON.parse(new TextDecoder().decode(buf.slice(5, 5 + length)));
console.log('payload:', json);
```

## envd-Specific Notes

- **Auth**: `Basic` auth with `envdAccessToken` from create response
- **URL**: `https://{sandboxId}-{port}.{domain}` (port 49982 for envd)
- **File ops**: Mix of ConnectRPC (ListDir, Stat, MakeDir, Remove) and HTTP REST (Read=GET, Write=POST multipart) at `/files?path={path}&user=user`
- **Process end event**: Returns `{exited: true, status: "exit status N"}` — parse exit code from `status` string, not a direct `exitCode` field
