#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DEVICE_ID="${FITEATSY_IOS_SIMULATOR_UDID:-}"
RESULT_PATH="${FITEATSY_XCRESULT_PATH:-/private/tmp/FiteatsyL4.xcresult}"
DERIVED_PATH="${FITEATSY_DERIVED_DATA_PATH:-/private/tmp/FiteatsyL4DerivedData}"

if [[ -z "$DEVICE_ID" ]]; then
  echo "FITEATSY_IOS_SIMULATOR_UDID is required" >&2
  exit 2
fi

if [[ -e "$RESULT_PATH" ]]; then
  echo "Result bundle already exists: $RESULT_PATH" >&2
  echo "Choose a new FITEATSY_XCRESULT_PATH; this runner never deletes evidence." >&2
  exit 3
fi

cd "$ROOT_DIR"
export ENTRY_FILE="node_modules/expo/AppEntry.js"
xcodebuild \
  -workspace ios/Fiteatsy.xcworkspace \
  -scheme FiteatsyUITests \
  -configuration Release \
  -destination "platform=iOS Simulator,id=$DEVICE_ID" \
  -derivedDataPath "$DERIVED_PATH" \
  -resultBundlePath "$RESULT_PATH" \
  test

echo "L4 result bundle: $RESULT_PATH"
