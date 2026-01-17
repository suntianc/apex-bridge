#!/bin/bash
#
# SurrealDB Data Sync Script
# Sync data from SQLite to SurrealDB for staging verification
#
# Usage: ./scripts/sync-to-surrealdb.sh [--dry-run]
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SURREAL_URL="${SURREAL_URL:-http://localhost:12470}"
SURREAL_NS="${SURREAL_NS:-apexbridge}"
SURREAL_DB="${SURREAL_DB:-staging}"
SURREAL_USER="${SURREAL_USER:-root}"
SURREAL_PASS="${SURREAL_PASS:-root}"

DRY_RUN=false
if [ "$1" == "--dry-run" ]; then
    DRY_RUN=true
    echo -e "${YELLOW}[DRY RUN MODE]${NC}"
fi

# Helper function to execute SurrealDB query
surrealdb_query() {
    local query="$1"
    local extra_headers="${2:-}"
    
    if [ "$DRY_RUN" == "true" ]; then
        echo -e "${BLUE}[DRY RUN]${NC} Query: $query"
        return 0
    fi
    
    curl -s -X POST "$SURREAL_URL/sql" \
        -H "Accept: application/json" \
        -H "Surreal-NS: $SURREAL_NS" \
        -H "Surreal-DB: $SURREAL_DB" \
        -u "$SURREAL_USER:$SURREAL_PASS" \
        -d "$query"
}

echo "=========================================="
echo "SQLite → SurrealDB Data Sync"
echo "=========================================="
echo ""
echo "Configuration:"
echo "  SurrealDB: $SURREAL_URL"
echo "  Namespace: $SURREAL_NS"
echo "  Database:  $SURREAL_DB"
echo "  Mode:      $([ "$DRY_RUN" == "true" ] && echo "DRY RUN" || echo "LIVE SYNC")"
echo ""

# Track sync status
SYNC_SUCCESS=true
RECORDS_SYNCED=0

# ==========================================
# 1. Sync LLM Providers
# ==========================================
echo -e "${YELLOW}1. Syncing LLM Providers...${NC}"

# Read providers from SQLite
providers=$(sqlite3 .data/llm_providers.db "SELECT id, provider, name, base_config, enabled FROM llm_providers;" 2>/dev/null || echo "")

if [ -z "$providers" ]; then
    echo -e "   ${YELLOW}⚠ No providers found${NC}"
else
    echo "$providers" | while IFS='|' read -r id provider_key name base_config_json enabled; do
        echo "   Provider: $name (key: $provider_key)"
        
        if [ "$DRY_RUN" != "true" ]; then
            # Check if record already exists
            check=$(surrealdb_query "SELECT id FROM llm_config WHERE provider_key = '$provider_key' LIMIT 1;" 2>/dev/null)
            if echo "$check" | grep -q "id"; then
                echo -e "   ${YELLOW}   → Already exists, skipping${NC}"
            else
                # Parse base_config JSON to extract base_url
                base_url=$(echo "$base_config_json" | grep -o '"baseURL":"[^"]*"' | sed 's/"baseURL":"//;s/"$//' || echo "")
                
                result=$(surrealdb_query "CREATE llm_config SET provider_key = '$provider_key', name = '$name', base_config = '$base_config_json', base_url = '$base_url', enabled = $enabled, type = 'provider', sqlite_id = $id, synced_at = time::now();")
                if echo "$result" | grep -q '"status":"OK"'; then
                    echo -e "   ${GREEN}   → Synced✓${NC}"
                    ((RECORDS_SYNCED++))
                else
                    echo -e "   ${RED}   → Failed: $result${NC}"
                    SYNC_SUCCESS=false
                fi
            fi
        else
            ((RECORDS_SYNCED++))
        fi
    done
fi

# ==========================================
# 2. Sync LLM Models
# ==========================================
echo -e "\n${YELLOW}2. Syncing LLM Models...${NC}"

models=$(sqlite3 .data/llm_providers.db "SELECT id, provider_id, model_key, model_name, model_type, model_config, enabled FROM llm_models;" 2>/dev/null || echo "")

if [ -z "$models" ]; then
    echo -e "   ${YELLOW}⚠ No models found${NC}"
else
    echo "$models" | while IFS='|' read -r id provider_id model_key model_name model_type model_config_json enabled; do
        echo "   Model: $model_name (key: $model_key)"
        
        if [ "$DRY_RUN" != "true" ]; then
            check=$(surrealdb_query "SELECT id FROM llm_config WHERE model_key = '$model_key' AND type = 'model' LIMIT 1;" 2>/dev/null)
            if echo "$check" | grep -q "id"; then
                echo -e "   ${YELLOW}   → Already exists, skipping${NC}"
            else
                result=$(surrealdb_query "CREATE llm_config SET provider_id = $provider_id, model_key = '$model_key', name = '$model_name', model_type = '$model_type', model_config = '$model_config_json', enabled = $enabled, type = 'model', sqlite_id = $id, synced_at = time::now();")
                if echo "$result" | grep -q '"status":"OK"'; then
                    echo -e "   ${GREEN}   → Synced✓${NC}"
                    ((RECORDS_SYNCED++))
                else
                    echo -e "   ${RED}   → Failed: $result${NC}"
                    SYNC_SUCCESS=false
                fi
            fi
        else
            ((RECORDS_SYNCED++))
        fi
    done
fi

# ==========================================
# 3. Sync MCP Servers
# ==========================================
echo -e "\n${YELLOW}3. Syncing MCP Servers...${NC}"

mcp_servers=$(sqlite3 .data/mcp_servers.db "SELECT id, config, enabled FROM mcp_servers;" 2>/dev/null || echo "")

if [ -z "$mcp_servers" ]; then
    echo -e "   ${YELLOW}⚠ No MCP servers found${NC}"
else
    echo "$mcp_servers" | while IFS='|' read -r server_id config_json enabled; do
        # Extract name from config JSON
        name=$(echo "$config_json" | grep -o '"name":"[^"]*"' | sed 's/"name":"//;s/"$//' || echo "unknown")
        
        echo "   MCP Server: $name (id: $server_id)"
        
        if [ "$DRY_RUN" != "true" ]; then
            check=$(surrealdb_query "SELECT id FROM mcp_config WHERE id = '$server_id' LIMIT 1;" 2>/dev/null)
            if echo "$check" | grep -q "id"; then
                echo -e "   ${YELLOW}   → Already exists, skipping${NC}"
            else
                result=$(surrealdb_query "CREATE mcp_config SET id = '$server_id', config = '$config_json', enabled = $enabled, synced_at = time::now();")
                if echo "$result" | grep -q '"status":"OK"'; then
                    echo -e "   ${GREEN}   → Synced✓${NC}"
                    ((RECORDS_SYNCED++))
                else
                    echo -e "   ${RED}   → Failed: $result${NC}"
                    SYNC_SUCCESS=false
                fi
            fi
        else
            ((RECORDS_SYNCED++))
        fi
    done
fi

# ==========================================
# 4. Sync Conversations
# ==========================================
echo -e "\n${YELLOW}4. Syncing Conversations...${NC}"

conversations=$(sqlite3 .data/conversation_history.db "SELECT id, conversation_id, role, content, timestamp FROM conversation_messages LIMIT 100;" 2>/dev/null || echo "")

if [ -z "$conversations" ]; then
    echo -e "   ${YELLOW}⚠ No conversations found${NC}"
else
    count=0
    echo "$conversations" | while IFS='|' read -r id conv_id role content timestamp; do
        count=$((count + 1))
        if [ $count -gt 5 ]; then
            echo "   ... and more (truncated for display)"
            break
        fi
        echo "   Message: $role - ${content:0:30}..."
        
        if [ "$DRY_RUN" != "true" ]; then
            content_escaped=$(echo "$content" | sed 's/"/\\"/g' | tr '\n' ' ' | sed 's/  */ /g')
            result=$(surrealdb_query "CREATE conversation SET conversation_id = '$conv_id', role = '$role', content = '$content_escaped', timestamp = '$timestamp', sqlite_id = $id, synced_at = time::now();")
            if echo "$result" | grep -q '"status":"OK"'; then
                ((RECORDS_SYNCED++))
            else
                echo -e "   ${RED}   → Failed${NC}"
                SYNC_SUCCESS=false
            fi
        else
            ((RECORDS_SYNCED++))
        fi
    done
fi

# ==========================================
# Summary
# ==========================================
echo ""
echo "=========================================="
echo "Sync Complete"
echo "=========================================="

if [ "$DRY_RUN" == "true" ]; then
    echo -e "${BLUE}[DRY RUN]${NC} Would sync $RECORDS_SYNCED records"
else
    if [ "$SYNC_SUCCESS" == "true" ]; then
        echo -e "${GREEN}✓ Successfully synced $RECORDS_SYNCED records${NC}"
        
        # Verify in SurrealDB
        echo ""
        echo "Verifying in SurrealDB..."
        llm_count=$(surrealdb_query "SELECT COUNT(*) as count FROM llm_config;" 2>/dev/null | grep -o '"result":[0-9]*' | grep -o '[0-9]*' || echo "0")
        mcp_count=$(surrealdb_query "SELECT COUNT(*) as count FROM mcp_config;" 2>/dev/null | grep -o '"result":[0-9]*' | grep -o '[0-9]*' || echo "0")
        conv_count=$(surrealdb_query "SELECT COUNT(*) as count FROM conversation;" 2>/dev/null | grep -o '"result":[0-9]*' | grep -o '[0-9]*' || echo "0")
        
        echo "  LLM Config: $llm_count records"
        echo "  MCP Config: $mcp_count records"
        echo "  Conversation: $conv_count records"
    else
        echo -e "${RED}✗ Sync completed with errors${NC}"
        echo "Check the output above for details"
    fi
fi

echo ""
echo "Next steps:"
echo "  1. Verify data in SurrealDB: curl '$SURREAL_URL/sql?ns=$SURREAL_NS&db=$SURREAL_DB' -d 'SELECT * FROM llm_config;' -u '$SURREAL_USER:$SURREAL_PASS'"
echo "  2. Run tests: npm test"
echo "  3. Enable dual-write: export APEX_SURREALDB_MCP_DUAL_WRITE=true"