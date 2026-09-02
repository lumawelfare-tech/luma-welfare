#!/usr/bin/env bash
# ============================================================================
# EDGE FUNCTION DEPLOYMENT SCRIPT
# Deploys all (or specified) Edge Functions to the linked Supabase project.
#
# Usage:
#   ./scripts/deploy-edge-functions.sh              # deploy all functions
#   ./scripts/deploy-edge-functions.sh admin-members  # deploy single function
#   npm run deploy:functions                        # deploy all (from project root)
#
# Prerequisites:
#   1. supabase CLI installed (npm install -g supabase)
#   2. Project linked: supabase link --project-ref <ref>
#   3. SUPABASE_ACCESS_TOKEN set in environment
#      Get at: https://supabase.com/dashboard/account/tokens
#      Export: export SUPABASE_ACCESS_TOKEN="<your-token>"
#
# Secrets required (set in Supabase dashboard → Project Settings → Edge Functions):
#   RESEND_API_KEY, OTP_HASH_SECRET, EMAIL_FROM, EMAIL_TEST_MODE,
#   MPESA_ENV, MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET,
#   MPESA_SHORTCODE, MPESA_PASSKEY, MPESA_CALLBACK_URL, PAYMENTS_ENABLED
#
# Note: SUPABASE_SERVICE_ROLE_KEY and SUPABASE_ANON_KEY are injected automatically
# by the Supabase platform — do NOT set them manually.
# ============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Load project ref from supabase config
PROJECT_REF=$(grep 'project_id' supabase/config.toml 2>/dev/null | head -1 | sed 's/.*= *"\([^"]*\)"/\1/' || echo "")
if [ -z "$PROJECT_REF" ]; then
  echo -e "${RED}ERROR: Could not find project_id in supabase/config.toml${NC}"
  echo "Run: supabase link --project-ref <your-project-ref>"
  exit 1
fi

# Verify linked project
LINKED_REF=$(supabase projects list 2>/dev/null | grep '●' | awk '{print $3}' || echo "")
if [ "$LINKED_REF" != "$PROJECT_REF" ]; then
  echo -e "${RED}ERROR: Project $PROJECT_REF is not linked. Run: supabase link --project-ref $PROJECT_REF${NC}"
  exit 1
fi

# Check for access token
if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo -e "${RED}ERROR: SUPABASE_ACCESS_TOKEN is not set.${NC}"
  echo "Get a token at: https://supabase.com/dashboard/account/tokens"
  echo "Export it: export SUPABASE_ACCESS_TOKEN='<your-token>'"
  exit 1
fi

echo ""
echo "============================================="
echo "  EDGE FUNCTION DEPLOYMENT"
echo "  Project: $PROJECT_REF"
echo "============================================="

# All functions that need deploying
ALL_FUNCTIONS=(
  admin-claims
  admin-contributions
  admin-dashboard
  admin-gallery
  admin-members
  admin-monitoring
  admin-news
  admin-notifications
  admin-packages
  admin-reconciliation
  admin-registration-fee
  admin-reports
  admin-scheduled-reports
  admin-settings
  admin-subscriptions
  admin-exports
  admin-exports-worker
  auth-google-authorize
  auth-login
  auth-me
  auth-oauth-provision
  auth-register
  auth-verify-email
  health
  member-claims
  member-contributions
  member-dashboard
  member-family
  member-notification-prefs
  member-notifications
  member-profile
  member-receipts
  member-registration-fee
  member-subscriptions
  payments-callback
  payments-initiate
  payments-list
  public-data
  send-email
  send-report-email
)

# Determine which functions to deploy
if [ $# -gt 0 ]; then
  FUNCTIONS=("$@")
  MODE="specific"
else
  FUNCTIONS=("${ALL_FUNCTIONS[@]}")
  MODE="all"
fi

echo ""
echo "Deploy mode: $MODE"
echo "Functions: ${#FUNCTIONS[@]}"
echo ""

DEPLOYED=0
SKIPPED=0
FAILED=0
FAILED_LIST=()

for fn in "${FUNCTIONS[@]}"; do
  SRC="supabase/functions/${fn}/index.ts"

  if [ ! -f "$SRC" ]; then
    echo -e "  ${YELLOW}⚠${NC}  $fn — not found, skipping"
    SKIPPED=$((SKIPPED + 1))
    continue
  fi

  echo -n "  Deploying $fn... "

  if supabase functions deploy "$fn" \
    --project-ref "$PROJECT_REF" \
    --no-verify-jwt \
    2>&1 | grep -q "error"; then
    echo -e "${RED}FAILED${NC}"
    FAILED=$((FAILED + 1))
    FAILED_LIST+=("$fn")
  else
    echo -e "${GREEN}OK${NC}"
    DEPLOYED=$((DEPLOYED + 1))
  fi
done

echo ""
echo "============================================="
echo "  RESULTS"
echo "  Deployed: $DEPLOYED"
echo "  Skipped:  $SKIPPED"
echo "  Failed:   $FAILED"
echo "============================================="

if [ $FAILED -gt 0 ]; then
  echo ""
  echo -e "${RED}FAILED FUNCTIONS:${NC}"
  for fn in "${FAILED_LIST[@]}"; do
    echo -e "  ${RED}✗ $fn${NC}"
  done
  echo ""
  echo "To retry a specific function:"
  echo "  ./scripts/deploy-edge-functions.sh admin-members"
  exit 1
fi

echo ""
echo -e "${GREEN}All functions deployed successfully.${NC}"
echo ""
echo "Run the smoke test:"
echo "  npm run verify:deploy"
