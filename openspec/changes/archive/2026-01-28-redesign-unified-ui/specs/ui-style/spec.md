## MODIFIED Requirements

### Requirement: Color System
The application SHALL use a consistent color palette based on Zinc and Emerald color scales.

#### Scenario: Background Colors
- **WHEN** rendering UI backgrounds
- **THEN** use the following color tokens:
  - App background: #09090b (--bg-app)
  - Surface background: #18181b (--bg-surface)
  - Card background: #18181b (--bg-card)
  - Elevated background: #27272a (--bg-elevated)
  - Hover state: #3f3f46 (--bg-hover)

#### Scenario: Text Colors
- **WHEN** rendering text content
- **THEN** use the following color tokens:
  - Primary text: #f4f4f5 (--text-primary)
  - Secondary text: #a1a1aa (--text-secondary)
  - Muted text: #52525b (--text-muted)

#### Scenario: Accent Colors
- **WHEN** rendering interactive elements
- **THEN** use the following color tokens:
  - Accent: #10b981 (--accent)
  - Accent hover: #059669 (--accent-hover)
  - Accent glow: #10b98133 (--accent-glow)
  - Danger: #ef4444 (--danger)
  - Warning: #f59e0b (--warning)

#### Scenario: Border Colors
- **WHEN** rendering borders
- **THEN** use the following color tokens:
  - Primary border: #3f3f46 (--border)
  - Subtle border: #27272a (--border-subtle)

### Requirement: Border Radius System
The application SHALL use consistent border radius values.

#### Scenario: Border Radius Values
- **WHEN** applying border radius
- **THEN** use the following tokens:
  - Small: 4px (--radius-sm) for badges, tags
  - Medium: 8px (--radius-md) for buttons, inputs
  - Large: 12px (--radius-lg) for cards, modals

### Requirement: Typography System
The application SHALL use Inter as the primary font family.

#### Scenario: Font Sizes
- **WHEN** rendering text
- **THEN** use the following size scale:
  - XS: 10px (status badges, meta info)
  - SM: 13px (labels, secondary content)
  - Base: 14px (body text, button labels)
  - MD: 15-16px (card titles)
  - LG: 18px (modal titles)
  - XL: 20px (page titles)

#### Scenario: Font Weights
- **WHEN** applying font weight
- **THEN** use the following scale:
  - Normal: 400 (body text)
  - Medium: 500 (labels, buttons)
  - Semibold: 600 (titles, emphasis)
  - Bold: 700 (logo, headings)

### Requirement: Spacing System
The application SHALL use consistent spacing values.

#### Scenario: Padding Values
- **WHEN** applying padding
- **THEN** use multiples of 4px:
  - 4px: tight spacing
  - 8px: compact spacing
  - 12px: normal spacing
  - 16px: comfortable spacing
  - 20px: section padding
  - 24px: container padding

#### Scenario: Gap Values
- **WHEN** applying flex gap
- **THEN** use multiples of 4px:
  - 4px: inline elements
  - 8px: related items
  - 12px: grouped items
  - 16px: sections
  - 20px: major sections
