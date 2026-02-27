## ADDED Requirements

### Requirement: Auto-Generate Full Pipeline
The system SHALL provide a one-click workflow that automatically executes the full production pipeline: script analysis → asset generation → storyboard generation → image generation → video generation. Each step MUST be skippable and individually retryable.

#### Scenario: One-click full generation
- **WHEN** user clicks "一键成片" on the project overview
- **THEN** the system sequentially executes: script analysis, asset generation, storyboard creation, image generation, video generation
- **THEN** a progress panel shows the current step and overall progress

#### Scenario: Step failure with retry
- **WHEN** image generation fails for 2 out of 10 shots during auto-generate
- **THEN** the pipeline continues with remaining shots
- **THEN** failed shots are listed with individual retry buttons
- **THEN** user can retry failed shots without re-running the entire pipeline

#### Scenario: User skips a step
- **WHEN** user has already generated assets manually
- **THEN** the auto-generate pipeline detects existing assets and skips the asset generation step

## MODIFIED Requirements

### Requirement: TTS Audio Persistence
The system SHALL save all generated TTS audio to persistent local files within the project directory. Audio results MUST return local file paths, not temporary Blob URLs.

#### Scenario: OpenAI TTS generates audio
- **WHEN** TTS provider generates audio for a shot dialogue
- **THEN** the audio data is saved to `projects/{id}/audio/{shotId}.mp3`
- **THEN** the returned AudioResult.path points to the local file

#### Scenario: Audio playback after restart
- **WHEN** user reopens a project that has generated TTS audio
- **THEN** all previously generated audio files are accessible and playable
