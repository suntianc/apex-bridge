## ADDED Requirements

### Requirement: Relationship Management System
The system SHALL provide functionality to manage user relationships (family members, friends, important dates), enabling the AI to remember and proactively remind users of birthdays, anniversaries, and other important occasions.

#### Scenario: Create relationship
- **WHEN** an administrator sends a POST request to `/api/admin/relationships` with valid relationship data
- **THEN** the system SHALL validate the relationship data, store it in persistent storage, and return the created relationship with a success status

#### Scenario: Store relationship data
- **WHEN** a relationship is created or updated
- **THEN** the system SHALL store the relationship in a JSON file organized by userId, including metadata such as relationship type, name, birthday, anniversary, contact info, and notes

#### Scenario: List user relationships
- **WHEN** an administrator sends a GET request to `/api/admin/relationships` with a userId parameter
- **THEN** the system SHALL return a JSON array of all relationships for that user, including relationship type, name, birthday, anniversary, and metadata

#### Scenario: Get relationship details
- **WHEN** an administrator sends a GET request to `/api/admin/relationships/:id` with a valid relationship ID
- **THEN** the system SHALL return the complete relationship details including all stored information

#### Scenario: Update relationship
- **WHEN** an administrator sends a PUT request to `/api/admin/relationships/:id` with updated relationship data
- **THEN** the system SHALL validate the data, update the relationship in storage, and return the updated relationship with a success status

#### Scenario: Delete relationship
- **WHEN** an administrator sends a DELETE request to `/api/admin/relationships/:id`
- **THEN** the system SHALL delete the relationship from storage and return a success status

#### Scenario: Get relationship reminders
- **WHEN** an administrator sends a GET request to `/api/admin/relationships/:id/reminders`
- **THEN** the system SHALL return upcoming reminders (birthdays, anniversaries) for that relationship, including dates and days until the event

#### Scenario: Birthday reminder proactive scene
- **WHEN** a relationship has a birthday set and the current date is within the reminder window (e.g., 7 days before)
- **THEN** the ProactivityScheduler SHALL trigger a birthday reminder scene to proactively notify the user

#### Scenario: Anniversary reminder proactive scene
- **WHEN** a relationship has an anniversary set and the current date is within the reminder window (e.g., 7 days before)
- **THEN** the ProactivityScheduler SHALL trigger an anniversary reminder scene to proactively notify the user

#### Scenario: API authentication required
- **WHEN** an unauthenticated request is sent to any relationship management API endpoint
- **THEN** the system SHALL return a 401 Unauthorized error with an appropriate error message

### Requirement: Relationship Data Model
The system SHALL support the following relationship attributes:
- Relationship type (family, friend, colleague, other)
- Name (required)
- Birthday (optional, date format: YYYY-MM-DD or MM-DD)
- Anniversary (optional, date format: YYYY-MM-DD or MM-DD)
- Contact information (optional, phone, email, address)
- Notes (optional, additional information)
- Metadata (createdAt, updatedAt, userId, id)

### Requirement: Integration with Proactivity System
The system SHALL integrate relationship reminders with the ProactivityScheduler:
- Birthday reminders SHALL be triggered 7 days before the birthday
- Anniversary reminders SHALL be triggered 7 days before the anniversary
- Reminders SHALL respect the ProactivityScheduler's policy (quiet window, frequency limits, etc.)
- Reminder messages SHALL include the relationship name and the upcoming event date

### Requirement: Relationship Management Web Interface (Optional)
The system SHALL provide a web-based administration interface for viewing and managing relationships, allowing administrators to view, create, edit, and delete relationships through a user-friendly UI when the interface is implemented.

#### Scenario: View relationships list
- **WHEN** an administrator navigates to the relationship management page in the admin panel
- **THEN** the system SHALL display a list of all stored relationships, showing at minimum: name, type, birthday, anniversary, and action buttons (edit, delete)

#### Scenario: Create relationship manually
- **WHEN** an administrator clicks the "Create Relationship" button and fills out the relationship form with valid data
- **THEN** the system SHALL submit the data to the API, display a success message upon successful creation, and update the relationship list to include the new relationship

#### Scenario: Edit relationship
- **WHEN** an administrator clicks the "Edit" button for a relationship and modifies the data in the form
- **THEN** the system SHALL load the current relationship data into the form, allow modifications, submit the updated data to the API upon save, display a success message, and update the relationship list with the changes

#### Scenario: Delete relationship
- **WHEN** an administrator clicks the "Delete" button for a relationship and confirms the deletion
- **THEN** the system SHALL send a DELETE request to the API, display a success message upon successful deletion, and remove the relationship from the list

