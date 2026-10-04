/**
 * Whether a key pressed in a search field inside a menu belongs to the field.
 *
 * Radix runs a typeahead on the menu content and listens to whatever bubbles up
 * to it, so a printable key moves focus to the first row starting with that
 * letter — out of the field and into the list, mid-word. Arrows, Enter, Escape
 * and the rest are navigation and still belong to the menu.
 *
 * A picker escapes this only when no row begins with a letter someone would
 * type. The timezone rows start with "[", which is why that picker looked
 * correct while every other one built the same way is not.
 */
export function isMenuTypeaheadKey(key: string): boolean {
  return key.length === 1;
}
