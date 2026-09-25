/**
 * Whether people can delete their own account from inside the app.
 *
 * Off while the app is Android-only and installed from the church's own site.
 * Everything behind it stays built, deployed and tested — the delete-account
 * function, the rule in migrations 0024/0025, the anonymous grant records and
 * the screen at /account/delete. Only the entry point is hidden.
 *
 * ⚠️ TURN THIS ON BEFORE THE APP STORE. Apple rejects any app that lets people
 * create an account but not delete it from within the app (App Store Review
 * Guideline 5.1.1(v)). Setting it to true is the whole change: it brings the
 * button back on every profile screen and switches the Privacy Policy from
 * "contact the church" to "delete it yourself", so the two can never disagree.
 */
export const ACCOUNT_DELETION_IN_APP = false;

/**
 * Accounts that see the Delete account button while it is hidden from everyone
 * else — for testing the flow end to end before it is switched on.
 *
 * Stored as SHA-256 fingerprints of the lower-cased email, never the address
 * itself: this repository is public, and a tester's email has no business
 * being readable in it. To add someone, hash their address the same way.
 *
 * This decides only who SEES the button. Deleting your own account is safe
 * for anyone, so the server does not enforce the list; it cannot be used to
 * reach anybody else's account either way.
 *
 * Irrelevant once ACCOUNT_DELETION_IN_APP is true, when everyone sees it.
 */
export const ACCOUNT_DELETION_PREVIEW_EMAIL_SHA256: readonly string[] = [
  'bf9fd26d1f8ca751521353af2aa34f290291253f8232c13e193bbf2f1e5ae459',
];
