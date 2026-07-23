#!/bin/bash
# Start Express API server in background
node server/index.js &
SERVER_PID=$!

# Start Vite dev server in foreground
npx vite

# If Vite exits, kill the server too
kill $SERVER_PID 2>/dev/null
