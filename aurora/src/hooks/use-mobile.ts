import * as React from "react"

/** Phone / small tablet — bottom sheets, compact chrome. */
const MOBILE_BREAKPOINT = 768
/** Matches messenger single-column layout (sidebar ↔ chat swap at xl). */
const NARROW_LAYOUT_BREAKPOINT = 1280

function getIsBelow(bp: number) {
  if (typeof window === "undefined") return false
  return window.innerWidth < bp
}

function useBreakpoint(bp: number) {
  const [matches, setMatches] = React.useState<boolean>(() => getIsBelow(bp))

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${bp - 1}px)`)
    const onChange = () => setMatches(window.innerWidth < bp)
    mql.addEventListener("change", onChange)
    setMatches(window.innerWidth < bp)
    return () => mql.removeEventListener("change", onChange)
  }, [bp])

  return matches
}

export function useIsMobile() {
  // Sync initial value on the client so the first paint uses the correct sheet side
  // (avoid desktop w-3/4 flash on phones while state is still undefined).
  return useBreakpoint(MOBILE_BREAKPOINT)
}

/** True while messenger uses the single-column mobile chrome (< xl). */
export function useIsNarrowLayout() {
  return useBreakpoint(NARROW_LAYOUT_BREAKPOINT)
}

export const MESSENGER_NARROW_MAX_WIDTH = NARROW_LAYOUT_BREAKPOINT
