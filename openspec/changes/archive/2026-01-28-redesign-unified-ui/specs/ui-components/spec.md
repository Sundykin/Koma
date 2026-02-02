## MODIFIED Requirements

### Requirement: Button Component Variants
The application SHALL provide standardized button components with consistent styling.

#### Scenario: Primary Button
- **WHEN** rendering a primary action button
- **THEN** use emerald background (#10b981)
- **AND** white text and icon
- **AND** 8px border radius
- **AND** 10px vertical, 16px horizontal padding

#### Scenario: Secondary Button
- **WHEN** rendering a secondary action button
- **THEN** use elevated background (#27272a)
- **AND** primary text color (#f4f4f5)
- **AND** 1px border with border color (#3f3f46)
- **AND** 8px border radius

#### Scenario: Ghost Button
- **WHEN** rendering a tertiary/ghost button
- **THEN** use transparent background
- **AND** secondary text color (#a1a1aa)
- **AND** no border
- **AND** 8px border radius

#### Scenario: Icon Button
- **WHEN** rendering an icon-only button
- **THEN** use 36x36px square dimensions
- **AND** elevated background (#27272a)
- **AND** centered 18px icon
- **AND** 8px border radius

## ADDED Requirements

### Requirement: ProjectCard Component
The application SHALL use standardized project card components in project list.

#### Scenario: Project Card Display
- **WHEN** rendering a project card
- **THEN** display status badge in top-left
- **AND** display project title below badge
- **AND** display genre and mode tags
- **AND** display last edited time with clock icon
- **AND** card SHALL have 12px border radius
- **AND** card SHALL have subtle border (#27272a)

#### Scenario: Project Card Hover
- **WHEN** user hovers over project card
- **THEN** change border color to zinc-600
- **AND** show more options button (three dots)
- **AND** highlight title with accent color

### Requirement: ShotCard Component
The application SHALL use standardized shot card components in storyboard.

#### Scenario: Shot Card Display
- **WHEN** rendering a shot card
- **THEN** display thumbnail image at top (135px height)
- **AND** display shot number badge on thumbnail
- **AND** display shot description with text wrapping
- **AND** display duration and shot type metadata
- **AND** card SHALL have 8px border radius

### Requirement: CharacterCard Component
The application SHALL use standardized character card components.

#### Scenario: Character Card Display
- **WHEN** rendering a character card
- **THEN** display 64px circular avatar
- **AND** display character name (16px, semibold)
- **AND** display role description (13px, secondary color)
- **AND** display edit and delete action buttons
- **AND** card SHALL have 12px border radius

### Requirement: Input Component
The application SHALL use standardized input components.

#### Scenario: Input with Label
- **WHEN** rendering a labeled input
- **THEN** display label above input (13px, secondary color)
- **AND** input height SHALL be 40px
- **AND** input SHALL have 8px border radius
- **AND** input SHALL have elevated background
- **AND** input SHALL have subtle border

#### Scenario: Input with Icon
- **WHEN** input has leading icon
- **THEN** display 16px icon with 12px left padding
- **AND** placeholder text color SHALL be muted (#52525b)

### Requirement: Modal Component
The application SHALL use standardized modal components.

#### Scenario: Modal Structure
- **WHEN** displaying a modal
- **THEN** render header with title and close button
- **AND** render body content area
- **AND** render footer with cancel and confirm buttons
- **AND** modal SHALL have 16px border radius
- **AND** modal background SHALL be surface color

#### Scenario: Modal Header
- **WHEN** rendering modal header
- **THEN** title SHALL be 18px semibold
- **AND** close button SHALL be 32px square
- **AND** header SHALL have bottom border

#### Scenario: Modal Footer
- **WHEN** rendering modal footer
- **THEN** buttons SHALL be right-aligned
- **AND** cancel button uses secondary style
- **AND** confirm button uses primary style
- **AND** footer SHALL have top border
