#!/bin/bash
# ============================================================================
# DEPLOY VERIFICATION SCRIPT
# Verifies all critical Edge Functions are deployed and responding.
# Run after deploying to catch missing function deployments.
# ============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Project ref: CI env, linked project, config.toml, then the hosted fallback.
PROJECT_REF="${SUPABASE_PROJECT_REF:-}"
if [ -z "$PROJECT_REF" ] && [ -f "supabase/.temp/project-ref" ]; then
  PROJECT_REF=$(cat supabase/.temp/project-ref)
fi
if [ -z "$PROJECT_REF" ] && [ -f "supabase/.temp/linked-project.json" ]; then
  PROJECT_REF=$(node -e "console.log(JSON.parse(require('fs').readFileSync('supabase/.temp/linked-project.json','utf8')).project_ref)" 2>/dev/null || echo "")
fi
if [ -z "$PROJECT_REF" ] && [ -f "supabase/config.toml" ]; then
  PROJECT_REF=$(grep 'project_id' supabase/config.toml | head -1 | sed 's/.*= *"\(.*\)"/\1/' 2>/dev/null || echo "")
fi
if [ -z "$PROJECT_REF" ]; then
  PROJECT_REF="mkbxigxmhqdhxmptanqr"
fi

# Publishable/anon key: env first (CI), then gitignored local files. Never require a committed .env.
API_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-${SUPABASE_ANON_KEY:-${SUPABASE_PUBLISHABLE_KEY:-}}}"
if [ -z "$API_KEY" ]; then
  for envfile in frontend/.env frontend/.env.local .env.local .env; do
    if [ -f "$envfile" ]; then
      API_KEY=$(grep -E '^[[:space:]]*VITE_SUPABASE_PUBLISHABLE_KEY=' "$envfile" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' || true)
      if [ -n "$API_KEY" ]; then
        break
      fi
    fi
  done
fi
if [ -z "$API_KEY" ]; then
  echo -e "${RED}ERROR: Set VITE_SUPABASE_PUBLISHABLE_KEY or SUPABASE_ANON_KEY (env or gitignored .env.local)${NC}"
  exit 1
fi

BASE_URL="https://${PROJECT_REF}.supabase.co/functions/v1"

echo ""
echo "============================================="
echo "  DEPLOY VERIFICATION"
echo "  Project: ${PROJECT_REF}"
echo "============================================="
echo ""

# Define critical Edge Functions that MUST be deployed
# Format: "function_name:expected_status_without_auth"
CRITICAL_FUNCTIONS=(
  "admin-dashboard:401"
  "admin-media:401"
  "admin-gallery:401"
  "admin-members:401"
  "admin-claims:401"
  "admin-contributions:401"
  "admin-subscriptions:401"
  "admin-packages:401"
  "admin-news:401"
  "admin-2fa:401"
  "admin-settings:401"
  "admin-reports:401"
  "admin-scheduled-reports:401"
  "admin-reconciliation:401"
  "admin-monitoring:401"
  "admin-exports:401"
  "auth-login:405"
  "auth-forgot-password:405"
  "auth-register:405"
  "auth-me:401"
  "member-dashboard:401"
  "member-profile:401"
  "public-data:200"
)

PASSED=0
FAILED=0
FAILED_LIST=()

for entry in "${CRITICAL_FUNCTIONS[@]}"; do
  IFS=':' read -r fn expected <<< "$entry"
  status=$(curl -s -o /dev/null -w "%{http_code}" \
    "${BASE_URL}/${fn}" \
    -H "apikey: ${API_KEY}" \
    -H "Authorization: Bearer invalid-token" 2>/dev/null || echo "000")

  if [ "$status" = "$expected" ]; then
    echo -e "  ${GREEN}✓${NC} ${fn} → ${status} (expected ${expected})"
    PASSED=$((PASSED + 1))
  else
    echo -e "  ${RED}✗${NC} ${fn} → ${status} (expected ${expected})"
    FAILED=$((FAILED + 1))
    FAILED_LIST+=("${fn}")
  fi
done

echo ""
echo "============================================="
echo "  RESULTS: ${PASSED} passed, ${FAILED} failed"
echo "============================================="

if [ $FAILED -gt 0 ]; then
  echo ""
  echo -e "${RED}FAILED FUNCTIONS:${NC}"
  for fn in "${FAILED_LIST[@]}"; do
    echo -e "  ${RED}✗ ${fn}${NC}"
  done
  echo ""
  echo -e "${YELLOW}These functions may not be deployed. Run:${NC}"
  echo "  supabase functions deploy <function-name> --no-verify-jwt"
  echo ""
  exit 1
fi

echo ""
echo -e "${GREEN}All critical Edge Functions are deployed and responding correctly.${NC}"
echo ""
