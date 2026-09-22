/**
 * Church announcements shown inside the app.
 *
 * Declared as data for the same reason the workflow is: the church will want
 * to change these, and a notice about an event is exactly the kind of content
 * that should never require a developer to remove.
 *
 * The dates are what make this safe to ship. An announcement appears and
 * disappears on its own, so nobody has to remember to take down an invitation
 * to a conference that already happened — which is the usual way these end up
 * embarrassing.
 *
 * Adding one is a new object in the array. The banner shows whichever is
 * currently live; if several are, the first wins.
 */
import type { ImageSourcePropType } from 'react-native';

export interface Announcement {
  /**
   * Stable key. It is what a dismissal is remembered against, so changing it
   * makes the banner reappear for everyone who already closed it.
   */
  id: string;
  /** Short enough to read at a glance on the dashboard. */
  title: string;
  /** One line under the title. Not the whole flyer. */
  summary: string;
  /** Shown on the full-size view, under the image. */
  detail?: string[];
  /** Bundled artwork. Ships with an over-the-air update like any other asset. */
  image: ImageSourcePropType;
  /** Described to a screen reader, which cannot read the flyer. */
  imageAlt: string;
  /** ISO dates. Outside this window the announcement does not exist. */
  showFrom: string;
  showUntil: string;
}

export const ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'signs-and-wonders-2026',
    title: 'Signs and Wonders 2026',
    summary: 'A must attend. 26 to 29 November, Ikeja.',
    detail: [
      'Thursday 26 November, 5pm — Miracle Night',
      'Friday 27 November, 5pm — Wonder Night',
      'Saturday 28 November, 12 noon — Fire Conference',
      'Sunday 29 November, 8am — Anointing & the Miraculous',
      'Zion World Christian Center, Waterparks, 31/37 Toyin Street, Ikeja, Lagos.',
      'Enquiries: 0701 276 5732, 0701 215 1603, 0907 862 9004.',
    ],
    image: require('../../assets/announcements/signs-and-wonders-2026.webp'),
    imageAlt:
      'Signs and Wonders 2026, MOADA 26, hosted by Pastor Jude Osobase at Zion ' +
      'World Christian Center, Ikeja, Lagos, 26 to 29 November.',
    showFrom: '2026-09-22',
    // The day after the last session. It is gone on the 30th without anyone
    // touching anything.
    showUntil: '2026-11-29',
  },
];

/**
 * The announcement to show right now, or null.
 *
 * Compared against the device clock, which can be wrong. The consequence of a
 * badly set clock is a notice shown slightly early or late, which is a price
 * worth paying to avoid a network call before the dashboard can render.
 */
export function getLiveAnnouncement(now: Date = new Date()): Announcement | null {
  const today = now.toISOString().slice(0, 10);
  return (
    ANNOUNCEMENTS.find((a) => today >= a.showFrom && today <= a.showUntil) ?? null
  );
}
