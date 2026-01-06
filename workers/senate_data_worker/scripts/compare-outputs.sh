#!/bin/bash
#
# Compare Rust CLI output with Worker output for validation.
#
# Usage:
#   ./scripts/compare-outputs.sh <rust_output.json> <worker_output.json>
#
# This script normalizes both outputs and compares:
# - Vote numbers
# - NY senator votes per vote
# - Vote counts
#

set -euo pipefail

if [ $# -ne 2 ]; then
    echo "Usage: $0 <rust_output.json> <worker_output.json>"
    exit 1
fi

RUST_OUTPUT="$1"
WORKER_OUTPUT="$2"

if [ ! -f "$RUST_OUTPUT" ]; then
    echo "Error: Rust output file not found: $RUST_OUTPUT"
    exit 1
fi

if [ ! -f "$WORKER_OUTPUT" ]; then
    echo "Error: Worker output file not found: $WORKER_OUTPUT"
    exit 1
fi

# Check if jq is installed
if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed. Install it with: brew install jq"
    exit 1
fi

echo "=========================================="
echo "Comparing Rust CLI vs Worker Output"
echo "=========================================="
echo ""

# Extract vote numbers from Rust output
# Rust vote IDs are formatted as "vote-{congress}-{session}-{vote_number}"
echo "1. Extracting vote numbers from Rust output..."
RUST_VOTES=$(jq -r '.[] | select(.event_type == "vote") | .id | split("-") | .[3]' "$RUST_OUTPUT" 2>/dev/null | sort -n | uniq)
RUST_VOTE_COUNT=$(echo "$RUST_VOTES" | grep -c . || echo "0")

# Extract vote numbers from Worker output
echo "2. Extracting vote numbers from Worker output..."
WORKER_VOTES=$(jq -r '.votes[].vote_number | tostring' "$WORKER_OUTPUT" 2>/dev/null | sort -n | uniq)
WORKER_VOTE_COUNT=$(echo "$WORKER_VOTES" | grep -c . || echo "0")

echo ""
echo "Vote Counts:"
echo "  Rust CLI:   $RUST_VOTE_COUNT votes"
echo "  Worker:     $WORKER_VOTE_COUNT votes"
echo ""

# Compare vote numbers
echo "3. Comparing vote numbers..."
MISSING_IN_WORKER=$(comm -23 <(echo "$RUST_VOTES") <(echo "$WORKER_VOTES") | tr '\n' ' ')
MISSING_IN_RUST=$(comm -13 <(echo "$RUST_VOTES") <(echo "$WORKER_VOTES") | tr '\n' ' ')

if [ -n "$MISSING_IN_WORKER" ]; then
    echo "  ⚠️  Votes in Rust but not in Worker: $MISSING_IN_WORKER"
else
    echo "  ✓ All Rust votes found in Worker"
fi

if [ -n "$MISSING_IN_RUST" ]; then
    echo "  ⚠️  Votes in Worker but not in Rust: $MISSING_IN_RUST"
else
    echo "  ✓ All Worker votes found in Rust"
fi

# Compare NY senator votes for each vote
echo ""
echo "4. Comparing NY senator votes per vote..."

# Create temporary files for comparison
RUST_VOTES_TMP=$(mktemp)
WORKER_VOTES_TMP=$(mktemp)
trap "rm -f $RUST_VOTES_TMP $WORKER_VOTES_TMP" EXIT

# Extract normalized vote data from Rust
jq -r '.[] | select(.event_type == "vote") | 
  .id as $vote_id |
  ($vote_id | split("-") | .[3]) as $vote_num |
  .senator_votes // [] | 
  .[] | 
  "\($vote_num)|\(.name)|\(.position)"' "$RUST_OUTPUT" | sort > "$RUST_VOTES_TMP"

# Extract normalized vote data from Worker
jq -r '.votes[] | 
  .vote_number as $vote_num |
  .members[] | 
  "\($vote_num)|\(.name)|\(.vote_cast)"' "$WORKER_OUTPUT" | sort > "$WORKER_VOTES_TMP"

# Compare senator votes
DIFF_OUTPUT=$(diff "$RUST_VOTES_TMP" "$WORKER_VOTES_TMP" || true)

if [ -z "$DIFF_OUTPUT" ]; then
    echo "  ✓ NY senator votes match exactly"
else
    echo "  ⚠️  Differences found in NY senator votes:"
    echo ""
    echo "$DIFF_OUTPUT" | head -20
    if [ $(echo "$DIFF_OUTPUT" | wc -l) -gt 20 ]; then
        echo "  ... (showing first 20 differences)"
    fi
fi

# Compare vote counts
echo ""
echo "5. Comparing vote counts..."

# Extract counts from Rust
jq -r '.[] | select(.event_type == "vote") | 
  .id as $vote_id |
  ($vote_id | split("-") | .[3]) as $vote_num |
  .vote_result // {} |
  "\($vote_num)|\(.yeas // 0)|\(.nays // 0)|\(.present // 0)|\(.not_voting // 0)"' "$RUST_OUTPUT" | sort > "$RUST_VOTES_TMP"

# Extract counts from Worker
jq -r '.votes[] | 
  "\(.vote_number)|\(.counts.yeas)|\(.counts.nays)|\(.counts.present)|\(.counts.absent)"' "$WORKER_OUTPUT" | sort > "$WORKER_VOTES_TMP"

COUNT_DIFF=$(diff "$RUST_VOTES_TMP" "$WORKER_VOTES_TMP" || true)

if [ -z "$COUNT_DIFF" ]; then
    echo "  ✓ Vote counts match exactly"
else
    echo "  ⚠️  Differences found in vote counts:"
    echo ""
    echo "$COUNT_DIFF" | head -20
    if [ $(echo "$COUNT_DIFF" | wc -l) -gt 20 ]; then
        echo "  ... (showing first 20 differences)"
    fi
fi

echo ""
echo "=========================================="
echo "Comparison complete"
echo "=========================================="

