## ADDED Requirements

### Requirement: Timeline Building System
The system SHALL provide functionality to build chronological timelines from user memories, organizing memories by time and generating narrative summaries when the timeline is implemented.

#### Scenario: Build timeline for user
- **WHEN** a request is made to build a timeline for a user with a specified time range
- **THEN** the system SHALL retrieve all memories within that time range from the memory service, sort them chronologically from oldest to newest, convert them to TimelineEvent format, and return the timeline events array

#### Scenario: Filter timeline by time range
- **WHEN** a timeline request includes a days parameter (e.g., days=7)
- **THEN** the system SHALL only include memories within the last N days from the current time, calculated from the memory timestamp

#### Scenario: Include different event types
- **WHEN** memories of different types are retrieved (chat, emotion, preference)
- **THEN** the system SHALL convert each memory to a TimelineEvent with the appropriate type based on the memory metadata, and include all event types in the timeline

#### Scenario: Timeline event format
- **WHEN** memories are converted to TimelineEvent format
- **THEN** each TimelineEvent SHALL contain at minimum: id, type, content, timestamp, and metadata fields as defined in the TimelineEvent interface

#### Scenario: Empty timeline for no memories
- **WHEN** a timeline request is made for a user with no memories in the specified time range
- **THEN** the system SHALL return an empty array of TimelineEvent objects

### Requirement: Timeline Management API
The system SHALL provide REST API endpoints for retrieving user timelines, allowing administrators to view chronological memory events for users.

#### Scenario: Get user timeline
- **WHEN** an administrator sends a GET request to `/api/admin/timeline` with a userId query parameter and optional days parameter
- **THEN** the system SHALL return a JSON array of TimelineEvent objects for that user, sorted chronologically, within the specified time range (defaulting to last 30 days if days parameter is not provided)

#### Scenario: Timeline with custom time range
- **WHEN** an administrator sends a GET request to `/api/admin/timeline` with userId and days parameters (e.g., days=7 for last 7 days)
- **THEN** the system SHALL return only TimelineEvent objects within the last N days from the current time

#### Scenario: Search timeline events
- **WHEN** an administrator sends a GET request to `/api/admin/timeline/search` with userId and query parameters
- **THEN** the system SHALL return TimelineEvent objects that match the search query in their content or metadata, filtered to the specified time range if provided

#### Scenario: API authentication required
- **WHEN** an unauthenticated request is sent to any timeline management API endpoint
- **THEN** the system SHALL return a 401 Unauthorized error with an appropriate error message

#### Scenario: Invalid time range parameter
- **WHEN** an administrator sends a GET request with an invalid days parameter (e.g., negative number or non-numeric value)
- **THEN** the system SHALL return a 400 Bad Request error with an appropriate validation error message

