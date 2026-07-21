# Aurora — UI + chat/call fixes

Patches applied on the live Aurora messenger at `135.106.173.99` (`/opt/aurora`).

## UI (Telegram / Max style)

- Full-width flat bottom tab bar (no floating island, no gradient circle)
- Chat list: flat rows, underline folder tabs, muted “New chat” button
- Search / header cleaned up; list padding accounts for the tab bar

## Calls

- Wired coturn TURN into app env (`NEXT_PUBLIC_TURN_URL` + credentials) — calls across Wi‑Fi/mobile NAT were failing on STUN-only
- Wait briefly for call socket reconnect before starting a call
- Clearer ICE/connection failure handling and user-facing error

## Chat sockets

- Stop tearing down the chat WebSocket when profile name/avatar changes
- Infinite reconnect with backoff; retry after transient auth token failures

## Files

- `src/components/messenger/mobile-bottom-nav.tsx`
- `src/components/messenger/messenger.tsx`
- `src/components/messenger/chat-sidebar.tsx`
- `src/components/messenger/unread-indicator.tsx`
- `src/hooks/use-socket.ts`
- `src/hooks/use-webrtc.ts`
- `src/lib/ice-servers.ts`
- `src/app/globals.css`
