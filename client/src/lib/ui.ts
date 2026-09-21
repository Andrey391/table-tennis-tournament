// Class strings that several screens repeated verbatim. Every screen takes its
// surfaces, buttons, fields and captions from here, so a change of look is one edit.

// --- Text ---

// Page heading. Margin is left to the caller (a heading next to an action is a flex row).
export const pageTitle = "text-2xl font-bold tracking-tight";

// The small uppercase caption above a block of content (add `mb-2`).
export const sectionLabel = "text-xs font-medium text-[#6b84a0] uppercase tracking-wider";

// The same caption above a form field.
export const fieldLabel = "block text-xs font-medium text-[#6b84a0] mb-1.5 uppercase tracking-wider";

// "< Back" at the top of a page opened from another one.
export const backLink = "text-[#6b84a0] mb-3 text-sm";

// --- Surfaces ---

// A plain panel: a list, a form, a block of stats.
export const card = "bg-[#101f36] rounded-lg border border-[#1c3350]";

// A feature card: an event, a result, the home hero. Same navy, with the gradient.
export const cardFeature = "bg-gradient-to-br from-[#16304f] via-[#101f36] to-[#0d1a2e] rounded-2xl border border-[#1c3350]";

// --- Fields ---

// Text input / select / textarea on a card.
export const field = "w-full px-3 py-2.5 bg-[#0a1628] rounded-lg border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none";

// A search box sitting on the page itself rather than on a card.
export const searchField = "w-full px-3 py-2.5 bg-[#101f36] rounded-lg border border-[#1c3350] text-sm focus:border-[#ccff00] focus:outline-none";

// --- Buttons: py-3 everywhere, so every one is a thumb-sized target. Add `w-full` for a block. ---

const btn = "py-3 px-5 rounded-lg text-sm transition disabled:opacity-50";
export const btnPrimary = `${btn} bg-[#ccff00] text-[#0a1628] font-bold active:scale-[0.98]`;
export const btnSecondary = `${btn} bg-[#1c3350] text-[#93a8c2] font-medium active:brightness-110`;
export const btnGhost = `${btn} bg-transparent text-[#93a8c2] font-medium border border-[#1c3350] active:bg-[#1c3350]`;
export const btnDanger = `${btn} bg-red-500 text-white font-bold active:scale-[0.98]`;
// The one action a screen is about (start the round, start the match): larger type, taller.
export const btnPrimaryLg = "py-3.5 px-5 rounded-lg text-base font-bold transition disabled:opacity-40 bg-[#ccff00] text-[#0a1628] active:scale-[0.98]";
// A compact secondary action in a row of them (live board, chat, share).
export const btnSmall = "px-3 py-2 rounded-lg text-sm bg-[#1c3350] text-[#93a8c2] border border-[#1c3350] active:brightness-110";

// --- Feedback ---

export const errorBox = "bg-red-500/10 text-red-400 p-3 rounded-lg text-sm border border-red-500/20";
export const noticeBox = "bg-[#ccff00]/10 text-[#ccff00] p-3 rounded-lg text-sm border border-[#ccff00]/20 text-center";

// --- Chips and ranks ---

// A filter chip; `on` is the selected one.
export const chip = (on: boolean) => `px-3 py-1.5 rounded-full text-xs font-medium border shrink-0 ${on ? "bg-[#ccff00] text-[#0a1628] border-[#ccff00]" : "bg-[#101f36] text-[#93a8c2] border-[#1c3350]"}`;

// Gold, silver, bronze — the podium colours used wherever a top three is shown.
export const MEDALS = ["#ccff00", "#93a8c2", "#c08457"];
