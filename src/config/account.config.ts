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
