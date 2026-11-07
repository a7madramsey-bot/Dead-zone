/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#F1ECDD',
    tint: '#D77943',

    // Core surfaces
    background: '#10140F',
    foreground: '#F1ECDD',

    // Cards / elevated surfaces
    card: '#1B2119',
    cardForeground: '#F1ECDD',

    // Primary action color (buttons, links, active states)
    primary: '#D77943',
    primaryForeground: '#17130F',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#293027',
    secondaryForeground: '#E1E1D4',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#333A30',
    mutedForeground: '#A4AA9B',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#E7B361',
    accentForeground: '#19150E',

    // Destructive actions (delete, error states)
    destructive: '#B84E40',
    destructiveForeground: '#FFF8ED',

    // Borders and input outlines
    border: '#394035',
    input: '#30382E',
  },

  dark: {
    text: '#F1ECDD',
    tint: '#D77943',
    background: '#10140F',
    foreground: '#F1ECDD',
    card: '#1B2119',
    cardForeground: '#F1ECDD',
    primary: '#D77943',
    primaryForeground: '#17130F',
    secondary: '#293027',
    secondaryForeground: '#E1E1D4',
    muted: '#333A30',
    mutedForeground: '#A4AA9B',
    accent: '#E7B361',
    accentForeground: '#19150E',
    destructive: '#B84E40',
    destructiveForeground: '#FFF8ED',
    border: '#394035',
    input: '#30382E',
  },

  radius: 8,
};

export default colors;
