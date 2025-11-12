#!/bin/bash
#
# ALNScanner Merge Readiness Verification
# Validates all critical requirements before merging PR #4
#
# Usage: ./verify-merge-ready.sh
#

set -e

echo "======================================"
echo " ALNScanner Merge Readiness Check"
echo "======================================"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

fail_count=0

check() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓${NC} $1"
  else
    echo -e "${RED}✗${NC} $1"
    ((fail_count++))
  fi
}

# 1. Dependencies installed
echo "[1/8] Checking dependencies..."
npm list > /dev/null 2>&1
check "All npm dependencies installed"
echo ""

# 2. Critical files present
echo "[2/8] Checking critical files..."
files=(
  "babel.config.js"
  "vite.config.js"
  "package.json"
  "src/main.js"
  "src/network/networkedSession.js"
  "src/network/networkedQueueManager.js"
  "src/core/standaloneDataManager.js"
)

for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo -e "${GREEN}✓${NC} $file"
  else
    echo -e "${RED}✗${NC} $file MISSING"
    ((fail_count++))
  fi
done
echo ""

# 3. Vite plugin installed
echo "[3/8] Checking Vite plugin..."
if grep -q "@vitejs/plugin-basic-ssl" package.json; then
  check "Vite HTTPS plugin present in package.json"
else
  echo -e "${RED}✗${NC} @vitejs/plugin-basic-ssl missing from package.json"
  ((fail_count++))
fi
echo ""

# 4. Unit tests passing
echo "[4/8] Running unit tests..."
npm test --silent > /tmp/test-output.log 2>&1
if [ $? -eq 0 ]; then
  PASSED=$(grep -o "[0-9]* passed" /tmp/test-output.log | head -1 | awk '{print $1}')
  check "All unit tests passing ($PASSED/598)"
else
  echo -e "${RED}✗${NC} Unit tests failing"
  tail -20 /tmp/test-output.log
  ((fail_count++))
fi
echo ""

# 5. Build succeeds
echo "[5/8] Running Vite build..."
npm run build > /tmp/build-output.log 2>&1
check "Vite build successful"
echo ""

# 6. Build artifacts present
echo "[6/8] Verifying build artifacts..."
if [ -d "dist" ]; then
  check "dist/ directory created"
else
  echo -e "${RED}✗${NC} dist/ directory missing"
  ((fail_count++))
fi

if [ -f "dist/index.html" ]; then
  check "dist/index.html present"
else
  echo -e "${RED}✗${NC} dist/index.html missing"
  ((fail_count++))
fi

if ls dist/assets/main-*.js 1> /dev/null 2>&1 || ls dist/assets/index-*.js 1> /dev/null 2>&1; then
  check "JavaScript bundle present"
else
  echo -e "${RED}✗${NC} JavaScript bundle missing"
  ((fail_count++))
fi
echo ""

# 7. Bundle size check
echo "[7/8] Checking bundle size..."
SIZE=$(du -sk dist 2>/dev/null | cut -f1 || echo "0")
if [ "$SIZE" -gt 0 ] && [ "$SIZE" -lt 10240 ]; then
  check "Bundle size acceptable (${SIZE}KB < 10MB)"
else
  echo -e "${YELLOW}⚠${NC}  Bundle size: ${SIZE}KB"
fi
echo ""

# 8. Critical test coverage
echo "[8/8] Verifying critical module tests..."
npm test -- tests/unit/network/networkedSession.test.js --silent > /dev/null 2>&1
check "NetworkedSession tests passing"

npm test -- tests/unit/network/networkedQueueManager.test.js --silent > /dev/null 2>&1
check "NetworkedQueueManager tests passing"

npm test -- tests/unit/core/standaloneDataManager.test.js --silent > /dev/null 2>&1
check "StandaloneDataManager tests passing"
echo ""

# Summary
echo "======================================"
if [ $fail_count -eq 0 ]; then
  echo -e "${GREEN}✅ MERGE READY${NC}"
  echo "All verification checks passed!"
  echo ""
  echo "Next steps:"
  echo "  1. Review changes: git diff main"
  echo "  2. Commit remaining work"
  echo "  3. Push to GitHub"
  echo "  4. Merge PR #4"
  exit 0
else
  echo -e "${RED}❌ NOT READY${NC}"
  echo "$fail_count check(s) failed"
  echo ""
  echo "Fix the issues above before merging."
  exit 1
fi
