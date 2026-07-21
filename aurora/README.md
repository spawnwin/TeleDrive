# Aurora — Telegram/Max-style bottom nav

Patch applied to the live Aurora messenger on `135.106.173.99` (`/opt/aurora`).

## Change

Replaced the floating island bottom tab bar with a full-width Telegram/Max-style tab bar:

- Edge-to-edge, flush to the bottom (with safe-area inset)
- Thin top hairline border, no rounded “island”, no heavy shadow
- Active tab: accent color on icon + label (no gradient circle)
- Inactive: muted outline icons
- Banner offset and chat-list bottom padding adjusted to the new height

## Files

- `src/components/messenger/mobile-bottom-nav.tsx`
- `src/components/messenger/messenger.tsx` (sidebar bottom padding)
- `src/app/globals.css` (floating banner offset)
