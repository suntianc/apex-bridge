#!/bin/bash
# SurrealDB Migration Verification Script
# Usage: ./scripts/verify-migration.sh [--quick|--full]

set -e

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
QUICK_MODE=false
SURREAL_URL="${SURREAL_URL:-ws://localhost:8000}"
SURREAL_NS="${SURREAL_NS:-apexbridge}"
SURREAL_DB="${SURREAL_DB:-staging}"
SURREAL_USER="${SURREAL_USER:-root}"
SURREAL_PASS="${SURREAL_PASS:-}"

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --quick)
            QUICK_MODE=true
            shift
            ;;
        --full)
            QUICK_MODE=false
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--quick|--full]"
            exit 1
            ;;
    esac
done

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Header
echo ""
echo "=========================================="
echo "  SurrealDB Migration Verification"
echo "=========================================="
echo ""

# Check if SurrealDB is running
check_surrealdb() {
    echo ""
    echo "----------------------------------------"
    echo "Checking SurrealDB Connectivity"
    echo "----------------------------------------"

    # Check WebSocket connection
    log_info "Testing WebSocket connection to ${SURREAL_URL}..."

    if curl -s --max-time 5 "${SURREAL_URL%/}/status" > /dev/null 2>&1; then
        log_success "SurrealDB WebSocket endpoint is reachable"
    else
        # Try alternative health check
        if curl -s --max-time 5 -H "NS: ${SURREAL_NS}" -H "DB: ${SURREAL_DB}" \
           "${SURREAL_URL%/}/health" > /dev/null 2>&1; then
            log_success "SurrealDB is reachable (health check passed)"
        else
            log_error "SurrealDB is not reachable at ${SURREAL_URL}"
            log_info "Please ensure SurrealDB is running: docker run -p 8000:8000 surrealdb/surrealdb"
            return 1
        fi
    fi

    # Verify authentication
    log_info "Testing authentication..."
    if [ -n "${SURREAL_PASS}" ]; then
        AUTH_RESULT=$(curl -s -X POST "${SURREAL_URL%/}/signin" \
            -H "NS: ${SURREAL_NS}" \
            -H "DB: ${SURREAL_DB}" \
            -H "Accept: application/json" \
            -d "{\"user\": \"${SURREAL_USER}\", \"pass\": \"${SURREAL_PASS}\"}" | jq -r '.code // empty' 2>/dev/null || echo "")

        if [ "${AUTH_RESULT}" = "200" ] || [ -z "${AUTH_RESULT}" ]; then
            log_success "Authentication successful (or anonymous access allowed)"
        else
            log_warn "Authentication may have failed (code: ${AUTH_RESULT})"
        fi
    fi

    # Get SurrealDB version
    VERSION=$(curl -s "${SURREAL_URL%/}/version" 2>/dev/null | head -1 || echo "unknown")
    log_info "SurrealDB version: ${VERSION}"
}

# Verify namespace and database exist
verify_namespace() {
    echo ""
    echo "----------------------------------------"
    echo "Verifying Namespace and Database"
    echo "----------------------------------------"

    log_info "Checking namespace '${SURREAL_NS}'..."

    # Use SurrealQL to check namespace info
    NS_CHECK=$(curl -s -X POST "${SURREAL_URL%/}/sql" \
        -H "NS: ${SURREAL_NS}" \
        -H "DB: ${SURREAL_DB}" \
        -H "Accept: application/json" \
        -d "INFO FOR NAMESPACE;" 2>/dev/null | jq -r '.[0].result // empty' 2>/dev/null || echo "")

    if [ -n "${NS_CHECK}" ]; then
        log_success "Namespace '${SURREAL_NS}' is accessible"
        echo "${NS_CHECK}" | head -20
    else
        log_warn "Could not verify namespace (may need to create it)"
    fi
}

# Verify data consistency between SQLite and SurrealDB
verify_consistency() {
    echo ""
    echo "----------------------------------------"
    echo "Verifying Data Consistency"
    echo "----------------------------------------"

    local SQLITE_PATH="${APEX_BRIDGE_DATA_DIR:-./.data}/llm_providers.db"

    # Check if SQLite exists
    if [ -f "${SQLITE_PATH}" ]; then
        log_info "SQLite database found at ${SQLITE_PATH}"

        # Count records in SQLite
        PROVIDERS_SQLITE=$(sqlite3 "${SQLITE_PATH}" "SELECT COUNT(*) FROM providers;" 2>/dev/null || echo "0")
        MODELS_SQLITE=$(sqlite3 "${SQLITE_PATH}" "SELECT COUNT(*) FROM models;" 2>/dev/null || echo "0")

        log_info "SQLite providers count: ${PROVIDERS_SQLITE}"
        log_info "SQLite models count: ${MODELS_SQLITE}"
    else
        log_warn "SQLite database not found at ${SQLITE_PATH}"
    fi

    # Check SurrealDB for matching records
    log_info "Querying SurrealDB for provider records..."

    PROVIDERS_SURREAL=$(curl -s -X POST "${SURREAL_URL%/}/sql" \
        -H "NS: ${SURREAL_NS}" \
        -H "DB: ${SURREAL_DB}" \
        -H "Accept: application/json" \
        -d "SELECT COUNT(*) as count FROM type::table('provider');" 2>/dev/null | jq -r '.[0].result[0].count // 0' || echo "0")

    MODELS_SURREAL=$(curl -s -X POST "${SURREAL_URL%/}/sql" \
        -H "NS: ${SURREAL_NS}" \
        -H "DB: ${SURREAL_DB}" \
        -H "Accept: application/json" \
        -d "SELECT COUNT(*) as count FROM type::table('model');" 2>/dev/null | jq -r '.[0].result[0].count // 0' || echo "0")

    log_info "SurrealDB provider count: ${PROVIDERS_SURREAL}"
    log_info "SurrealDB model count: ${MODELS_SURREAL}"

    # Compare counts
    if [ -f "${SQLITE_PATH}" ]; then
        if [ "${PROVIDERS_SQLITE}" = "${PROVIDERS_SURREAL}" ]; then
            log_success "Provider counts match between SQLite and SurrealDB"
        else
            log_warn "Provider count mismatch: SQLite=${PROVIDERS_SQLITE}, SurrealDB=${PROVIDERS_SURREAL}"
        fi

        if [ "${MODELS_SQLITE}" = "${MODELS_SURREAL}" ]; then
            log_success "Model counts match between SQLite and SurrealDB"
        else
            log_warn "Model count mismatch: SQLite=${MODELS_SQLITE}, SurrealDB=${MODELS_SURREAL}"
        fi
    fi
}

# Check dual-write status
check_dual_write() {
    echo ""
    echo "----------------------------------------"
    echo "Checking Dual-Write Status"
    echo "----------------------------------------"

    # Check environment variables
    log_info "Current dual-write configuration:"

    local DUAL_WRITE_VARS=(
        "APEX_SURREALDB_MCP_DUAL_WRITE"
        "APEX_SURREALDB_TRAJECTORY_DUAL_WRITE"
        "APEX_SURREALDB_LLM_CONFIG_DUAL_WRITE"
        "APEX_SURREALDB_CONVERSATION_DUAL_WRITE"
        "APEX_SURREALDB_VECTOR_DUAL_WRITE"
        "APEX_SURREALDB_VECTOR_RW_SPLIT"
    )

    local ENABLED_COUNT=0
    local TOTAL_COUNT=${#DUAL_WRITE_VARS[@]}

    for VAR in "${DUAL_WRITE_VARS[@]}"; do
        local VALUE="${!VAR:-false}"
        if [ "${VALUE}" = "true" ]; then
            echo -e "  ${VAR}=${GREEN}${VALUE}${NC}"
            ((ENABLED_COUNT++))
        else
            echo "  ${VAR}=${VALUE}"
        fi
    done

    echo ""
    log_info "Dual-write enabled: ${ENABLED_COUNT}/${TOTAL_COUNT}"

    if [ ${ENABLED_COUNT} -gt 0 ]; then
        log_info "Checking for dual-write errors in logs..."
        local LOG_FILE="${APEX_BRIDGE_LOG_DIR:-./logs}/apex-bridge.log"

        if [ -f "${LOG_FILE}" ]; then
            local DUAL_WRITE_ERRORS=$(grep -c "dual.*write.*error\|DUAL_WRITE_ERROR" "${LOG_FILE}" 2>/dev/null || echo "0")
            log_info "Recent dual-write errors: ${DUAL_WRITE_ERRORS}"

            if [ "${DUAL_WRITE_ERRORS}" -gt 0 ]; then
                log_warn "Found ${DUAL_WRITE_ERRORS} dual-write errors. Check logs for details."
                echo ""
                echo "Recent dual-write errors:"
                grep -i "dual.*write.*error\|DUAL_WRITE_ERROR" "${LOG_FILE}" | tail -10
            else
                log_success "No recent dual-write errors found"
            fi
        else
            log_warn "Log file not found: ${LOG_FILE}"
        fi
    fi
}

# Check vector migration status
check_vector_migration() {
    echo ""
    echo "----------------------------------------"
    echo "Checking Vector Migration Status"
    echo "----------------------------------------"

    local LANCEDB_PATH="${APEX_BRIDGE_VECTOR_STORE_DIR:-./.data/lancedb}"

    # Check LanceDB
    if [ -d "${LANCEDB_PATH}" ]; then
        log_info "LanceDB directory found at ${LANCEDB_PATH}"

        # Try to count vectors (requires Python/lancedb or use file count)
        local VECTOR_FILES=$(find "${LANCEDB_PATH}" -name "*.parquet" 2>/dev/null | wc -l)
        log_info "Vector data files found: ${VECTOR_FILES}"
    else
        log_warn "LanceDB directory not found at ${LANCEDB_PATH}"
    fi

    # Check SurrealDB for vectors
    log_info "Querying SurrealDB for vector records..."

    VECTORS_SURREAL=$(curl -s -X POST "${SURREAL_URL%/}/sql" \
        -H "NS: ${SURREAL_NS}" \
        -H "DB: ${SURREAL_DB}" \
        -H "Accept: application/json" \
        -d "SELECT COUNT(*) as count FROM type::table('vector');" 2>/dev/null | jq -r '.[0].result[0].count // 0' || echo "0")

    log_info "SurrealDB vector count: ${VECTORS_SURREAL}"

    if [ "${VECTORS_SURREAL}" -gt 0 ]; then
        log_success "Vectors found in SurrealDB"
    else
        log_info "No vectors found in SurrealDB (may need migration)"
    fi
}

# Show recent errors from logs
show_recent_errors() {
    echo ""
    echo "----------------------------------------"
    echo "Recent Errors from Logs"
    echo "----------------------------------------"

    local LOG_FILE="${APEX_BRIDGE_LOG_DIR:-./logs}/apex-bridge.log"

    if [ -f "${LOG_FILE}" ]; then
        log_info "Checking for errors in ${LOG_FILE}..."

        local ERROR_COUNT=$(grep -c -E "\[error\]|\[ERROR\]|Error:|error:" "${LOG_FILE}" 2>/dev/null || echo "0")
        log_info "Total errors in log: ${ERROR_COUNT}"

        if [ "${ERROR_COUNT}" -gt 0 ]; then
            echo ""
            echo "Last 20 error lines:"
            echo "----------------------------------------------------------------"
            grep -iE "\[error\]|\[ERROR\]|Error:|error:" "${LOG_FILE}" | tail -20
            echo "----------------------------------------------------------------"
        else
            log_success "No errors found in logs"
        fi
    else
        log_warn "Log file not found: ${LOG_FILE}"
    fi
}

# Quick health check
quick_health_check() {
    echo ""
    echo "----------------------------------------"
    echo "Quick Health Check"
    echo "----------------------------------------"

    # Check server is running
    local SERVER_PORT="${APEX_BRIDGE_PORT:-8088}"
    local SERVER_URL="http://localhost:${SERVER_PORT}"

    log_info "Checking ApexBridge server at ${SERVER_URL}..."

    if curl -s --max-time 5 "${SERVER_URL}/health" > /dev/null 2>&1; then
        log_success "ApexBridge server is healthy"

        # Check if SurrealDB features are enabled
        local HEALTH_RESPONSE=$(curl -s "${SERVER_URL}/health" 2>/dev/null || echo "")
        if echo "${HEALTH_RESPONSE}" | grep -q "surrealdb.*enabled\|SurrealDB"; then
            log_info "SurrealDB features appear to be enabled"
        else
            log_info "SurrealDB features may not be enabled"
        fi
    else
        log_warn "ApexBridge server is not responding at ${SERVER_URL}"
        log_info "Server may not be running or different port configured"
    fi
}

# Main execution
main() {
    echo ""
    if [ "${QUICK_MODE}" = true ]; then
        log_info "Running in QUICK mode - basic checks only"
        echo ""
        check_surrealdb
        quick_health_check
    else
        log_info "Running in FULL mode - comprehensive verification"
        echo ""

        check_surrealdb
        verify_namespace
        verify_consistency
        check_dual_write
        check_vector_migration
        show_recent_errors
    fi

    echo ""
    echo "=========================================="
    echo "  Verification Complete"
    echo "=========================================="
    echo ""
    log_info "Review any warnings above and take appropriate action."
    echo ""
    log_info "For detailed troubleshooting, see: docs/staging-verification-checklist.md"
    echo ""
}

main
