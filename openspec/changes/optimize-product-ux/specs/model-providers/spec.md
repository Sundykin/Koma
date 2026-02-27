## MODIFIED Requirements

### Requirement: Provider Connection Testing
The system SHALL execute real API validation when the user clicks "Test Connection" for any provider configuration. The test MUST return a clear success/failure result with latency information on success and a user-friendly error message on failure.

#### Scenario: Successful TTI connection test
- **WHEN** user clicks "Test Connection" on a configured TTI provider
- **THEN** the system calls the provider's testConnection() method with a 10s timeout
- **THEN** displays a green checkmark with response latency (e.g., "连接成功 (320ms)")

#### Scenario: Failed LLM connection test
- **WHEN** user clicks "Test Connection" with an invalid API key
- **THEN** the system displays a red error icon with message "API Key 无效，请检查配置"

#### Scenario: Connection test timeout
- **WHEN** the provider does not respond within 10 seconds
- **THEN** the system displays "连接超时，请检查网络或服务地址"

## ADDED Requirements

### Requirement: Provider Availability Status
The system SHALL display the implementation status of each provider type. Providers marked as "coming-soon" MUST show a visual indicator and MUST NOT be selectable as the default provider.

#### Scenario: User views coming-soon provider
- **WHEN** user opens provider configuration and sees a coming-soon provider (e.g., Runway)
- **THEN** the provider card displays a grey "即将支持" badge
- **THEN** the provider cannot be set as default

#### Scenario: User attempts to use coming-soon provider
- **WHEN** user tries to generate content with a coming-soon provider selected
- **THEN** the system shows a modal explaining the provider is not yet available and suggests alternatives

### Requirement: User-Friendly Error Messages
The system SHALL translate technical API errors into user-understandable messages with actionable suggestions.

#### Scenario: API quota exceeded
- **WHEN** a generation request fails with a quota/rate-limit error
- **THEN** the system displays "API 额度不足或请求过于频繁，请稍后重试或检查账户余额"

#### Scenario: Network error during generation
- **WHEN** a generation request fails due to network issues
- **THEN** the system displays "网络连接失败，请检查网络设置" with a retry button
