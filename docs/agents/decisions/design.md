# Decisions — Visual design

> Part of [DECISIONS.md](../DECISIONS.md), whose index lists every live decision. Status `approved` means obey.

## D-019 · Visual design inspired by smartportal, without university branding
- **Status:** approved
- **Date:** 2026-11-22
- **Rule:** The interface follows the style of smartportal.ulbsibiu.ro: dark theme with soft violet and blue glows, translucent cards with fine borders and large radii, a white pill-shaped primary button, a lavender-to-cyan gradient accent and status chips with a coloured dot and text. Dark is the default; a light variant with the same accents follows the system setting. The font is Inter, served by the app itself. The app's own name "Peer review" and its closed-eye logo are used, never the university's or smartUMS's logo, name or branding. Login is a two-column page.
- **Why:** The user found the first design unpleasant and chose this site as the reference. The app is not an official university product, so looking like one would mislead students. Serving the font locally sends no visitor data to a font host.
- **Rejected:** A separate landing page before login; a component library (Tailwind, MUI); fonts from Google Fonts; logo options A (exchange arrows, reads as "refresh") and C (two sheets, too generic).
- **Evidence:** docs/design/DESIGN.md, web/src/tokens.css, web/src/styles.css, web/public/logo.svg.
- **Source:** user · confidence high
- **Confirmed:** 2026-11-22
