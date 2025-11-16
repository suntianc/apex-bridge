## ADDED Requirements

### Requirement: Web Admin Framework
The system SHALL provide a web-based administrative interface for system configuration and management.

#### Scenario: Access admin interface
- **WHEN** user navigates to `/admin` route
- **THEN** the system SHALL serve the admin interface
- **AND** if setup is not completed, redirect to `/setup`
- **AND** if not logged in, redirect to `/admin/login`

#### Scenario: Admin interface UI style
- **WHEN** admin interface is displayed
- **THEN** the UI SHALL follow Anthropic website design style
- **AND** the UI SHALL use soft colors, generous whitespace, and elegant typography

---

### Requirement: Setup Wizard
The system SHALL provide a setup wizard for first-time configuration.

#### Scenario: First launch detection
- **WHEN** system starts for the first time
- **AND** `config/admin-config.json` does not exist
- **THEN** the system SHALL create default configuration template
- **AND** the system SHALL redirect to setup wizard

#### Scenario: Complete setup wizard
- **WHEN** user completes setup wizard
- **AND** all required configurations are provided
- **THEN** the system SHALL save configuration to `config/admin-config.json`
- **AND** the system SHALL mark setup as completed
- **AND** the system SHALL redirect to login page

#### Scenario: Migrate from .env file
- **WHEN** setup wizard detects existing `.env` file
- **THEN** the system SHALL offer to import configuration from `.env`
- **AND** when user accepts, the system SHALL convert `.env` format to JSON format
- **AND** the system SHALL populate setup wizard forms with imported values

---

### Requirement: Configuration Management
The system SHALL allow all system configurations to be managed through the web interface.

#### Scenario: Read configuration
- **WHEN** user accesses configuration management page
- **THEN** the system SHALL read configuration from `config/admin-config.json`
- **AND** the system SHALL display all configuration groups
- **AND** the system SHALL show current values for all configuration items

#### Scenario: Update configuration
- **WHEN** user modifies configuration values
- **AND** user saves changes
- **THEN** the system SHALL validate configuration values
- **AND** the system SHALL save to `config/admin-config.json`
- **AND** if system parameters (PORT, HOST) are changed, the system SHALL warn that restart is required
- **AND** for non-system parameters, the system SHALL apply changes without restart (if possible)

#### Scenario: Reset configuration
- **WHEN** user requests to reset configuration
- **THEN** the system SHALL create backup of current configuration
- **AND** the system SHALL reset to default values
- **AND** the system SHALL save reset configuration

#### Scenario: Import/Export configuration
- **WHEN** user exports configuration
- **THEN** the system SHALL return JSON file with current configuration
- **WHEN** user imports configuration
- **AND** configuration is valid
- **THEN** the system SHALL replace current configuration with imported values
- **AND** the system SHALL validate imported configuration

---

### Requirement: Node Management
The system SHALL provide interface for managing distributed nodes.

#### Scenario: View node list
- **WHEN** user accesses node management page
- **THEN** the system SHALL display all registered nodes
- **AND** the system SHALL show node status (online/offline, health)
- **AND** the system SHALL show node metadata (name, type, registration time)

#### Scenario: Register new node
- **WHEN** user provides node information
- **AND** submits registration form
- **THEN** the system SHALL register the node
- **AND** the system SHALL assign unique node ID
- **AND** the system SHALL add node to node list

#### Scenario: Update node configuration
- **WHEN** user modifies node configuration
- **AND** saves changes
- **THEN** the system SHALL update node configuration
- **AND** the system SHALL persist changes

#### Scenario: Delete node
- **WHEN** user requests to delete a node
- **THEN** the system SHALL remove node from registry
- **AND** the system SHALL clean up node-related data

---

### Requirement: Dashboard
The system SHALL provide dashboard showing system status and statistics.

#### Scenario: Display system status
- **WHEN** user accesses dashboard
- **THEN** the system SHALL display server running status
- **AND** the system SHALL display active request count
- **AND** the system SHALL display node count and status

#### Scenario: Display statistics
- **WHEN** dashboard loads
- **THEN** the system SHALL display today's request count
- **AND** the system SHALL display total conversation count
- **AND** the system SHALL display system resource usage (if available)

---

### Requirement: Authentication
The system SHALL provide authentication for admin interface.

#### Scenario: Login
- **WHEN** user provides correct credentials
- **THEN** the system SHALL authenticate user
- **AND** the system SHALL issue authentication token
- **AND** the system SHALL redirect to dashboard

#### Scenario: Unauthorized access
- **WHEN** user accesses protected route without authentication
- **THEN** the system SHALL redirect to login page
- **AND** the system SHALL preserve intended destination

#### Scenario: Logout
- **WHEN** user logs out
- **THEN** the system SHALL invalidate authentication token
- **AND** the system SHALL redirect to login page

---

### Requirement: Configuration Storage
The system SHALL store all configuration in JSON format, replacing .env files.

#### Scenario: Configuration file creation
- **WHEN** system starts and `config/admin-config.json` does not exist
- **THEN** the system SHALL create default configuration template
- **AND** the template SHALL include all configuration groups with default values
- **AND** the system SHALL set setup_completed to false

#### Scenario: Configuration persistence
- **WHEN** configuration is updated through admin interface
- **THEN** the system SHALL save to `config/admin-config.json`
- **AND** the system SHALL create backup before saving
- **AND** the system SHALL validate JSON format before writing

#### Scenario: Configuration loading
- **WHEN** system starts
- **THEN** the system SHALL load configuration from `config/admin-config.json`
- **AND** if file does not exist, create default template
- **AND** if file is corrupted, restore from backup or create default

---

### Requirement: Static File Serving
The system SHALL serve admin interface static files.

#### Scenario: Serve admin interface
- **WHEN** request is made to `/admin/*` routes
- **AND** file exists in `admin/dist/`
- **THEN** the system SHALL serve static file
- **AND** the system SHALL not process as API route

#### Scenario: Admin API routes
- **WHEN** request is made to `/api/admin/*` routes
- **THEN** the system SHALL process as API request
- **AND** the system SHALL not serve as static file

---

### Requirement: Backward Compatibility
The system SHALL provide migration path for existing .env configurations.

#### Scenario: Detect existing .env
- **WHEN** system starts
- **AND** `.env` file exists
- **AND** setup is not completed
- **THEN** the system SHALL detect .env file
- **AND** the system SHALL offer to import configuration

#### Scenario: Migrate .env to JSON
- **WHEN** user accepts .env import
- **THEN** the system SHALL parse .env file
- **AND** the system SHALL convert to JSON format
- **AND** the system SHALL map all configuration keys correctly
- **AND** the system SHALL handle missing or invalid values gracefully

---

### Requirement: UI Design Style
The admin interface SHALL follow Anthropic website design style.

#### Scenario: Color scheme
- **WHEN** admin interface is rendered
- **THEN** the UI SHALL use soft blue color palette
- **AND** the UI SHALL use light gray background (#F9FAFB)
- **AND** the UI SHALL use white cards (#FFFFFF)
- **AND** the UI SHALL use dark gray text (#1F2937)

#### Scenario: Typography
- **WHEN** text is displayed
- **THEN** the UI SHALL use Inter or system font stack
- **AND** body text SHALL be 14px
- **AND** headings SHALL be 18-24px
- **AND** line height SHALL be 1.5-1.75

#### Scenario: Spacing and layout
- **WHEN** pages are rendered
- **THEN** the UI SHALL use generous whitespace (24-32px margins)
- **AND** cards SHALL have 24px padding
- **AND** elements SHALL maintain 16px, 24px, 32px spacing (8px multiples)
- **AND** cards SHALL have soft shadows and 8-12px border radius

---

### Requirement: Configuration Groups
The system SHALL organize configurations into logical groups.

#### Scenario: System parameters group
- **WHEN** configuration page loads
- **THEN** the system SHALL display system parameters group
- **AND** the group SHALL include: PORT, HOST, NODE_ENV, DEBUG_MODE
- **AND** modifications SHALL warn about restart requirement

#### Scenario: LLM configuration group
- **WHEN** configuration page loads
- **THEN** the system SHALL display LLM providers group
- **AND** the group SHALL include all providers (OpenAI, DeepSeek, Zhipu, Claude, Ollama, Custom)
- **AND** each provider SHALL show: API Key, Base URL, Default Model, Timeout, Max Retries

#### Scenario: Other configuration groups
- **WHEN** configuration page loads
- **THEN** the system SHALL display all configuration groups:
  - Authentication (VCP_KEY, VCP_API_KEY)
  - Plugins (PLUGIN_DIR, PLUGIN_AUTO_LOAD)
  - Logging (LOG_LEVEL, LOG_FILE)
  - Performance (WORKER_POOL_SIZE, REQUEST_TIMEOUT, MAX_REQUEST_SIZE)
  - Cache (Redis configuration if enabled)
  - Async Results Cleanup (all ASYNC_RESULT_*)
  - RAG (all RAG_*)
  - Memory Service (MEMORY_SYSTEM, VERIFY_MEMORY_SERVICE)
  - Rerank (all RERANK_*)

