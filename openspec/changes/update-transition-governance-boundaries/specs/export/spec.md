## ADDED Requirements
### Requirement: Transition Interchange Boundary Disclosure
The system MUST explicitly disclose unsupported transition-bearing interchange boundaries instead of implying round-trip support.

#### Scenario: Manju export with transition-bearing timeline data
- **WHEN** a project contains transition-bearing `TimelineData` and is exported through the current Manju path
- **THEN** the system SHALL NOT claim transition timeline round-trip support for that export path
- **AND** the transition-bearing timeline payload MAY be omitted until a dedicated compatibility design is approved

#### Scenario: Manju import with transition-bearing timeline payload
- **WHEN** a Manju project includes timeline payload outside the currently supported transition interchange boundary
- **THEN** the system SHALL NOT treat that payload as a supported transition round-trip result
- **AND** the unsupported boundary SHALL be handled explicitly rather than silently counted as Phase 3 workflow evidence
