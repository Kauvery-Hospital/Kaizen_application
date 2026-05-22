/**
 * Kauvery light theme surfaces — soft lavender base with brand purple / violet / pink accents.
 * Brand guide: Purple #962067, Violet #A1238E, Pink #EE2D67, Peach #FAA95F.
 */

/** Full-page background (login). */
export const KAUVERY_PAGE_BG =
  'bg-[radial-gradient(ellipse_at_0%_0%,rgba(150,32,103,0.10)_0%,transparent_55%),radial-gradient(ellipse_at_100%_0%,rgba(161,35,142,0.08)_0%,transparent_50%),linear-gradient(168deg,#fdf8fc_0%,#f8f4fc_48%,#f3eef8_100%)]';

/** Subtle mesh behind authenticated shell (use over white / lavender base). */
export const KAUVERY_SHELL_MESH =
  'bg-[radial-gradient(at_12%_18%,rgba(150,32,103,0.08)_0px,transparent_50%),radial-gradient(at_88%_12%,rgba(161,35,142,0.07)_0px,transparent_45%),radial-gradient(at_50%_90%,rgba(238,45,103,0.05)_0px,transparent_55%)]';

/** Dashboard / executive content panel (frosted white card). */
export const KAUVERY_PANEL_BG =
  'bg-white/92 backdrop-blur-md border border-kauvery-purple/15 shadow-kauvery-card';

export const KAUVERY_SIDEBAR_BG =
  'bg-gradient-to-b from-white via-[#fdf9fc] to-[#f6f0fa]';

export const KAUVERY_CARD_SURFACE = 'bg-white';

export const KAUVERY_TABLE_HEAD_BG = 'bg-gradient-to-r from-kauvery-purple/8 via-kauvery-violet/6 to-kauvery-pink/5';

export const KAUVERY_DROPDOWN_SURFACE = 'bg-white';

/** Modal overlay panel */
export const KAUVERY_MODAL_SURFACE =
  'bg-white border border-kauvery-purple/20 shadow-2xl shadow-kauvery-soft';
