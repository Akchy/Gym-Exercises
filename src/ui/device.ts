/**
 * Workout mode (the full-screen, swipe-through workout) is made for phones: a touch screen
 * that is small in at least one direction, so a phone turned sideways still counts but
 * tablets and computers get the list view.
 */
export const PHONE_QUERY = '(pointer: coarse) and (max-width: 640px), (pointer: coarse) and (max-height: 640px)';

export function isPhone(): boolean {
  return typeof matchMedia === 'function' && matchMedia(PHONE_QUERY).matches;
}

/** Where "Start workout" goes for a plan day: workout mode on phones, the list view elsewhere. */
export function startWorkoutHref(dayId: string): string {
  return isPhone() ? `#/workout/${dayId}` : `#/log/${dayId}`;
}
