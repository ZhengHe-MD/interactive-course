// Navigation policy for the desktop shell.
//
// Course pages are HTML the agent wrote, rendered in the preview iframe. They
// are allowed to be as adventurous as they like inside that frame, but a link
// in one must never be able to steer the shell somewhere else. Keeping the rule
// here — pure, and away from the Electron glue — makes it testable.

/** True when a URL belongs to the studio itself rather than the wider web. */
export function isStudioUrl(target: string, origin: string) {
  try {
    return new URL(target).origin === origin;
  } catch {
    return false;
  }
}

/**
 * True when a URL is a plain web link, and so safe to hand to the browser.
 * Anything else — `file:`, `javascript:`, a custom scheme — is dropped rather
 * than passed to the operating system to open.
 */
export function isExternalLink(target: string) {
  try {
    return /^https?:$/.test(new URL(target).protocol);
  } catch {
    return false;
  }
}
