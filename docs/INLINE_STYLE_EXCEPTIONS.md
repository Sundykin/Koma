# Inline Style And Color Exceptions

The theme system forbids business UI inline styles except CSS variable bridges.
This document records the narrow cases that are not UI theme styling.

## Allowed Inline Style Shape

Allowed:

```tsx
style={cssVars({ '--x': value })}
```

Every key must begin with `--`. The value is consumed from SCSS.
Literal objects with only `--*` keys remain mechanically valid, but new code
should prefer `cssVars(...)` so expression-style bridges are traceable by lint.

## Expression Style Exceptions

The only non-`cssVars(...)` expression exception currently allowed by
`frontend/scripts/check-style-discipline.ts` is:

- `frontend/src/components/linghui/canvas/components/LinghuiEdge.tsx`: React
  Flow `BaseEdge` requires forwarding its upstream `style` object for edge
  geometry. This is third-party structural style, not business UI theming.

## Non-UI Color Literals

These may stay outside theme files when they represent user data, exported media
content, tests, or immutable artwork rather than UI chrome:

- Tests and fixtures: `*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`.
- Theme authoring: `frontend/src/theme/palettes/**` and
  `frontend/src/theme/themes/**`.
- Canvas/export media defaults in `frontend/src/engine/simpleEngine.ts`,
  `frontend/src/services/simpleExportRenderer.ts`, and
  `frontend/src/services/draftExport/JianyingExporter.ts`.
- Brand or illustration assets when changing the color would change the asset,
  not the UI theme.

If a new exception is needed, document the reason here and add a precise
allowlist entry to `frontend/scripts/check-style-discipline.ts`. Avoid broad
directory exclusions.

## Still Not Allowed

- `style={{ color: '#...' }}` for icons, labels, borders, cards, or panels.
- `style={{ width: 200 }}` or `style={{ marginTop: 16 }}` for layout.
- Tailwind arbitrary hex such as `bg-[#101010]`.
- Dark-only flags such as `darkTheme={true}` or `colorMode="dark"`.
