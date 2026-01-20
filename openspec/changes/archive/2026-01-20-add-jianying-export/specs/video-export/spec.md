## ADDED Requirements

### Requirement: Draft Export Framework

The system SHALL provide an extensible draft export framework that supports exporting timeline data to various video editing software formats.

#### Scenario: Exporter registration and discovery

- **WHEN** the application initializes
- **THEN** the system registers all available draft exporters
- **AND** the export dialog can query available export formats

#### Scenario: Adding a new export format

- **WHEN** a developer implements a new DraftExporter
- **AND** registers it with the ExporterRegistry
- **THEN** the new format becomes available in the export dialog
- **AND** no changes are required to existing code

### Requirement: Coordinate System Abstraction

The system SHALL abstract coordinate system transformations to support different software conventions without modifying the editor's internal data structures.

#### Scenario: Editor coordinate preservation

- **WHEN** exporting timeline data
- **THEN** the original Track and Clip data remains unchanged
- **AND** all transformations are applied during the export process

#### Scenario: Target software coordinate conversion

- **WHEN** exporting to a target format
- **THEN** the system uses the appropriate CoordinateTransformer for that format
- **AND** position, scale, rotation, opacity, and time values are correctly converted

### Requirement: Jianying Draft Export

The system SHALL support exporting the timeline as a Jianying (CapCut) draft folder.

#### Scenario: Export timeline to Jianying draft

- **WHEN** user selects "Jianying Draft" format in the export dialog
- **AND** specifies a draft name and output directory
- **THEN** the system creates a draft folder containing:
  - `draft_content.json` with timeline data
  - `draft_meta_info.json` with metadata
- **AND** all video/audio/text clips are mapped to Jianying segments
- **AND** clip positions are converted from pixels to half-canvas units
- **AND** time values are converted from seconds to microseconds

#### Scenario: Material path handling

- **WHEN** exporting to Jianying draft
- **THEN** the system uses absolute file paths for all materials
- **AND** optionally copies material files to the draft folder if user enables the option

### Requirement: Export Format Selection

The export dialog SHALL allow users to choose between video export and draft export formats.

#### Scenario: Format selection in export dialog

- **WHEN** user opens the export dialog
- **THEN** the system displays available export types (Video, Draft)
- **AND** for Draft type, shows available formats from ExporterRegistry

#### Scenario: Format-specific options

- **WHEN** user selects a draft export format
- **THEN** the system displays format-specific options
- **AND** for Jianying: draft name, output directory, copy materials option
