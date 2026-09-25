/**
 * Email checks shared by sign-up, the application form and password reset.
 *
 * A well-formed address is not the same as a correct one. "name@gmil.com" has
 * the right shape and passed every check the app had, and a real applicant now
 * has an account whose emails — including the decision on their grant — go to
 * a domain that does not exist. On a phone keyboard those slips are common.
 *
 * So beyond the shape, this catches known misspellings of the providers people
 * actually use here and asks "did you mean…?". It only ever matches a domain
 * on the list below, so a company, school or church address is never refused
 * for being unfamiliar. When in doubt, a domain stays off the list: wrongly
 * blocking a real address is worse than missing a typo.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Misspelled domain → the domain it almost certainly meant. */
const DOMAIN_TYPOS: Record<string, string> = {
  // Gmail — by far the most common here.
  'gmil.com': 'gmail.com',
  'gmal.com': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gamil.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmali.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'gmaul.com': 'gmail.com',
  'gmsil.com': 'gmail.com',
  'gimail.com': 'gmail.com',
  'gemail.com': 'gmail.com',
  'gmaill.com': 'gmail.com',
  'gmaiil.com': 'gmail.com',
  'ggmail.com': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.cm': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmail.cim': 'gmail.com',
  'gmail.vom': 'gmail.com',
  // Yahoo
  'yaho.com': 'yahoo.com',
  'yahooo.com': 'yahoo.com',
  'yhoo.com': 'yahoo.com',
  'yaoo.com': 'yahoo.com',
  'yahho.com': 'yahoo.com',
  'yahoo.cm': 'yahoo.com',
  'yahoo.om': 'yahoo.com',
  // Hotmail / Outlook / Live
  'hotmial.com': 'hotmail.com',
  'hotmal.com': 'hotmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmil.com': 'hotmail.com',
  'hotamil.com': 'hotmail.com',
  'hotmail.cm': 'hotmail.com',
  'outlok.com': 'outlook.com',
  'outloo.com': 'outlook.com',
  'outllook.com': 'outlook.com',
  'otlook.com': 'outlook.com',
  'outlook.cm': 'outlook.com',
  // iCloud
  'iclod.com': 'icloud.com',
  'icoud.com': 'icloud.com',
  'icluod.com': 'icloud.com',
};

/**
 * Endings that are never a real top-level domain but are one slip from ".com".
 * Safe to correct for any domain, unlike ".co" or ".cm", which are real.
 */
const TLD_TYPOS: Array<[RegExp, string]> = [
  [/\.con$/, '.com'],
  [/\.comm$/, '.com'],
  [/\.coom$/, '.com'],
  [/\.cpm$/, '.com'],
  [/\.xom$/, '.com'],
];

/**
 * The address the person most likely meant, or null if nothing looks wrong.
 * Keeps whatever was typed before the "@" exactly as it was.
 */
export function suggestEmailCorrection(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf('@');
  if (at <= 0 || at === email.length - 1) return null;

  const local = email.slice(0, at);
  let domain = email.slice(at + 1);
  let changed = false;

  for (const [pattern, replacement] of TLD_TYPOS) {
    if (pattern.test(domain)) {
      domain = domain.replace(pattern, replacement);
      changed = true;
      break;
    }
  }

  const fixed = DOMAIN_TYPOS[domain];
  if (fixed) {
    domain = fixed;
    changed = true;
  }

  return changed ? `${local}@${domain}` : null;
}

/** Null when the address is fine, otherwise the message to show under the field. */
export function emailError(raw: string): string | null {
  const email = raw.trim();
  if (!EMAIL_PATTERN.test(email)) return 'Enter a valid email address.';
  const suggestion = suggestEmailCorrection(email);
  if (suggestion) return `Check the spelling. Did you mean ${suggestion}?`;
  return null;
}
