#!/bin/bash

echo "======================================"
echo "Playbook System Migration Verification"
echo "======================================"
echo ""

# Check database file
if [ -f "data/playbook.db" ]; then
    echo "✅ Database file exists: data/playbook.db"
    ls -lh data/playbook.db
else
    echo "❌ Database file not found"
    exit 1
fi

echo ""
echo "Tables created:"
sqlite3 data/playbook.db ".tables"

echo ""
echo "Migration history:"
sqlite3 data/playbook.db "SELECT version, name, executed_at FROM schema_migrations ORDER BY version;"

echo ""
echo "Index verification:"
echo "Checking indexes on type_vocabulary..."
INDEX_COUNT=$(sqlite3 data/playbook.db "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND tbl_name='type_vocabulary';")
echo "  Found $INDEX_COUNT indexes on type_vocabulary"

echo ""
echo "======================================"
echo "✅ Migration verification complete!"
echo "======================================"
