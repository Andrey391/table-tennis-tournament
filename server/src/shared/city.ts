// A city is typed by hand at signup, on the profile and when adding a club, so
// "Москва", "москва" and "Москва " arrive as three different strings. Everything
// that compares or lists cities goes through these two.

// What gets stored: no stray spaces at the ends or doubled inside.
export const normalizeCity = (s: string) => s.trim().replace(/\s+/g, " ");

// What two spellings of the same city have in common.
export const cityKey = (s: string) => normalizeCity(s).toLocaleLowerCase();
