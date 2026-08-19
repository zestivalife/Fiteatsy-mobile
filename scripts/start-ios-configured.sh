#!/bin/sh

set -eu

: "${EXPO_PUBLIC_API_BASE_URL:?Set EXPO_PUBLIC_API_BASE_URL to the reachable Fiteatsy API before starting Metro (for example, http://192.168.1.2:4001 or the production HTTPS gateway).}"

case "$EXPO_PUBLIC_API_BASE_URL" in
  http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*)
    echo "Refusing loopback API URL for the iOS simulator: $EXPO_PUBLIC_API_BASE_URL" >&2
    exit 1
    ;;
esac

echo "Starting Fiteatsy iOS dev client with API: $EXPO_PUBLIC_API_BASE_URL"
exec ./node_modules/.bin/expo start --clear --dev-client --lan --scheme com.fiteatsy.health "$@"
