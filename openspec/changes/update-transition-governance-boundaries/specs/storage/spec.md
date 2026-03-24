## ADDED Requirements
### Requirement: Transition Timeline Persistence Boundary
The system MUST normalize supported transition-bearing timeline data at the storage boundary for both project timelines and episode timelines.

#### Scenario: Loading a supported timeline version
- **WHEN** a project or episode timeline with a supported version is loaded
- **THEN** the returned editor timeline shape SHALL be normalized before downstream editing or playback consumes it
- **AND** legacy clip-attached transition compatibility input SHALL be removed from the normalized editable shape

#### Scenario: Saving a timeline
- **WHEN** a project or episode timeline is saved
- **THEN** the persisted timeline SHALL be stamped with the current supported timeline version
- **AND** the persisted track data SHALL be normalized before writing

### Requirement: Unsupported Future Timeline Versions
The system MUST reject unsupported future timeline versions instead of silently coercing them into the current version.

#### Scenario: Loading a future version timeline
- **WHEN** the storage layer receives a timeline whose version is greater than the current supported version
- **THEN** loading SHALL fail explicitly
- **AND** the system SHALL NOT rewrite the timeline as the current version
