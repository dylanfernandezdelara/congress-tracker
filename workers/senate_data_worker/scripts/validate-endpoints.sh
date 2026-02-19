#!/bin/bash
#
# Validate HTTP endpoints after ingestion.
#
# Usage:
#   ./scripts/validate-endpoints.sh [BASE_URL]
#
# BASE_URL defaults to http://localhost:8787
#

set -euo pipefail

BASE_URL="${1:-http://localhost:8787}"
STATE="${TARGET_STATE:-NY}"

echo "=========================================="
echo "Validating HTTP Endpoints"
echo "=========================================="
echo "Base URL: $BASE_URL"
echo "State: $STATE"
echo ""

ERRORS=0

# Function to check endpoint
check_endpoint() {
    local path="$1"
    local expected_status="${2:-200}"
    local description="$3"
    
    echo "Checking: $description"
    echo "  GET $path"
    
    response=$(curl -sS -w "\n%{http_code}" "$BASE_URL$path" || printf "\n000")
    http_code="${response##*$'\n'}"
    body="${response%$'\n'*}"
    
    if [ "$http_code" != "$expected_status" ]; then
        echo "  ❌ Expected status $expected_status, got $http_code"
        ERRORS=$((ERRORS + 1))
        return 1
    fi
    
    # Check Content-Type header
    headers=$(curl -sS -D - -o /dev/null "$BASE_URL$path" || true)
    content_type=$(printf "%s\n" "$headers" | awk -F': *' 'tolower($1)=="content-type"{print tolower($2); exit}' | tr -d '\r')
    if [[ ! "$content_type" =~ application/json ]]; then
        echo "  ⚠️  Content-Type is not application/json: $content_type"
    fi
    
    # Check CORS header
    cors=$(printf "%s\n" "$headers" | awk -F': *' 'tolower($1)=="access-control-allow-origin"{print $2; exit}' | tr -d '\r')
    if [ -z "$cors" ]; then
        echo "  ⚠️  Missing CORS header"
    fi
    
    # Validate JSON if status is 200
    if [ "$http_code" = "200" ]; then
        if ! echo "$body" | jq . > /dev/null 2>&1; then
            echo "  ❌ Response is not valid JSON"
            ERRORS=$((ERRORS + 1))
            return 1
        fi
    fi
    
    echo "  ✓ Status $http_code, valid JSON"
    return 0
}

# Check health endpoint
check_endpoint "/health" 200 "Health check endpoint"

# Check latest.json
check_endpoint "/state/$STATE/latest.json" 200 "Latest snapshot endpoint"

# Check _meta.json
check_endpoint "/state/$STATE/_meta.json" 200 "Metadata endpoint"

# Extract target date from _meta.json if available
if curl -s "$BASE_URL/state/$STATE/_meta.json" | jq -e '.target_vote_date' > /dev/null 2>&1; then
    TARGET_DATE=$(curl -s "$BASE_URL/state/$STATE/_meta.json" | jq -r '.target_vote_date')
    echo ""
    echo "Found target vote date: $TARGET_DATE"
    
    # Check dated snapshot
    check_endpoint "/state/$STATE/$TARGET_DATE.json" 200 "Dated snapshot endpoint ($TARGET_DATE)"
    
    # Check non-existent snapshot (should 404)
    check_endpoint "/state/$STATE/2020-01-01.json" 404 "Non-existent snapshot (404 test)"
else
    echo ""
    echo "⚠️  Could not extract target_vote_date from _meta.json"
    echo "   Skipping dated snapshot validation"
fi

# Validate JSON schemas
echo ""
echo "Validating JSON schemas..."

# Validate latest.json structure
if curl -s "$BASE_URL/state/$STATE/latest.json" | jq -e '.state, .vote_date, .generated_at, .congress, .session, .votes' > /dev/null 2>&1; then
    echo "  ✓ latest.json has required fields"
else
    echo "  ❌ latest.json missing required fields"
    ERRORS=$((ERRORS + 1))
fi

# Validate _meta.json structure
if curl -s "$BASE_URL/state/$STATE/_meta.json" | jq -e '.state, .congress, .session, .generated_at, .cutoff_date_et, .target_vote_date, .keys, .stats' > /dev/null 2>&1; then
    echo "  ✓ _meta.json has required fields"
    
    # Validate date invariant
    CUTOFF=$(curl -s "$BASE_URL/state/$STATE/_meta.json" | jq -r '.cutoff_date_et')
    TARGET=$(curl -s "$BASE_URL/state/$STATE/_meta.json" | jq -r '.target_vote_date')
    if [ "$TARGET" \< "$CUTOFF" ]; then
        echo "  ✓ Date invariant holds: $TARGET < $CUTOFF"
    else
        echo "  ❌ Date invariant violated: $TARGET >= $CUTOFF"
        ERRORS=$((ERRORS + 1))
    fi
else
    echo "  ❌ _meta.json missing required fields"
    ERRORS=$((ERRORS + 1))
fi

echo ""
echo "=========================================="
if [ $ERRORS -eq 0 ]; then
    echo "✓ All validations passed"
    exit 0
else
    echo "❌ $ERRORS validation error(s) found"
    exit 1
fi

