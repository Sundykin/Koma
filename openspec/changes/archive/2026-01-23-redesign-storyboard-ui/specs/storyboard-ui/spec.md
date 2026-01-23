## ADDED Requirements

### Requirement: Storyboard Layout Redesign
The Storyboard module SHALL use a structured, spacious layout that clearly separates toolbar actions from the content grid.

#### Scenario: Main Layout Structure
- **WHEN** user views the Storyboard Editor
- **THEN** display a persistent toolbar at the top
- **AND** display a scrollable content area below containing shot cards
- **AND** ensure adequate padding and margins to reduce visual clutter

### Requirement: Enhanced Shot Card Visuals
The Shot Card component SHALL be redesigned to improve readability and information hierarchy.

#### Scenario: Shot Card Sections
- **WHEN** a shot card is rendered
- **THEN** clearly visually distinguish between the Script/Text area, the Visual Prompt area, and the Media Preview area
- **AND** use consistent spacing and borders/backgrounds to define these sections

#### Scenario: Active Shot Indication
- **WHEN** a shot is selected or active
- **THEN** highlight the entire card with a distinct border or shadow
- **AND** ensure action buttons for that shot are clearly visible

## MODIFIED Requirements

### Requirement: Storyboard Editable Script Content
The system SHALL support inline editing of script content within the redesigned shot card.

#### Scenario: Inline Edit Interaction
- **WHEN** user clicks on the script text in a shot card
- **THEN** switch the view to an editable text area (using `ScriptEditor` if applicable)
- **AND** maintain the visual style of the text (font size, line height) during editing
- **AND** save changes on blur

### Requirement: Optimized Prompt Editor Layout
The prompt editor SHALL fit naturally within the new shot card design without overwhelming other content.

#### Scenario: Prompt Editor Display
- **WHEN** viewing the prompt section of a shot
- **THEN** display the prompt text in a constrained, scrollable area
- **AND** provide a clear "Edit" or "Expand" action for detailed editing if needed

### Requirement: Multi-Image Card Grid
The image selection interface SHALL be integrated cleanly into the media section of the shot card.

#### Scenario: Image Grid Layout
- **WHEN** viewing the visual reference section
- **THEN** display candidate images in a compact grid
- **AND** ensure the selected image is visually prominent
