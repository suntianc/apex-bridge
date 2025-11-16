# security Specification

## Purpose
TBD - created by archiving change update-plugin-callback-security. Update Purpose after archive.
## Requirements
### Requirement: Plugin Callback Authentication Hardening
The system SHALL enforce HMAC-SHA256 authentication (with configurable time window) for every plugin callback request and disable legacy VCP keys by default.

#### Scenario: Valid callback accepted
- **WHEN** a callback request includes a configured client key, timestamp, and HMAC header whose digest matches the computed signature within the allowed time window
- **THEN** the system SHALL accept the request and forward it to the plugin runtime
- **AND** the request metadata (client id, timestamp) SHALL be recorded for replay detection.

#### Scenario: Legacy key blocked by default
- **WHEN** a callback uses the legacy VCP key or lacks the HMAC header
- **THEN** the system SHALL reject the request with a 401 error
- **AND** log the rejection reason so operators can audit migration progress.

#### Scenario: Replay window enforcement
- **WHEN** a callback timestamp falls outside the configured HMAC time window or has already been processed
- **THEN** the system SHALL reject it as a replay attempt and emit a structured security log entry.

---

### Requirement: Plugin Callback Rate Limiting
The system SHALL protect the `/api/plugin-callback` route with configurable rate limiting to mitigate brute-force and flood attacks.

#### Scenario: Requests within limits succeed
- **WHEN** a client sends callback requests within the configured requests-per-minute budget
- **THEN** the system SHALL process them normally without triggering throttling responses.

#### Scenario: Excess traffic is throttled
- **WHEN** a client exceeds the allowed callback rate
- **THEN** the system SHALL return HTTP 429 with a consistent JSON error body
- **AND** include headers (e.g., `Retry-After`) describing when the client may retry.

---

### Requirement: Plugin Callback Observability
The system SHALL emit structured security logs and provide operator documentation so that callback security incidents can be audited and mitigated quickly.

#### Scenario: Security log coverage
- **WHEN** callbacks succeed, fail authentication, or hit rate limits
- **THEN** the system SHALL produce structured log entries (including client identifier, reason, request id) for downstream SIEM pipelines.

#### Scenario: Operator guidance published
- **WHEN** the change ships
- **THEN** the operator-facing README/Admin guide SHALL describe how to configure `pluginCallback` settings, rotate keys, and validate the hardening features.

