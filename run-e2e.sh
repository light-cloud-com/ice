#!/bin/bash
# Run E2E tests with visible Chromium browser
# Usage: ./run-e2e.sh          (headed mode - see the browser)
#        ./run-e2e.sh --ui     (interactive UI mode)

cd "$(dirname "$0")"

# Start backend if not running
if ! curl -s http://localhost:5001/api/health > /dev/null 2>&1; then
  echo "Starting backend..."
  cd backend && npx tsx src/index.ts &
  cd ..
  sleep 3
fi

# Start web if not running
if ! curl -s http://localhost:5173 > /dev/null 2>&1; then
  echo "Starting web app..."
  cd packages/web && npx vite --port 5173 &
  cd ../..
  sleep 3
fi

echo "Backend: $(curl -s http://localhost:5001/api/health)"
echo "Web:     http://localhost:5173"
echo ""

# Run tests
npx playwright test --headed "$@"
