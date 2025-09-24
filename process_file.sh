#!/bin/sh

set -eu

INPUT_PATH=${1:-}
if [ -z "$INPUT_PATH" ]; then
  echo "No input file provided" >&2
  exit 1
fi

# Resolve to absolute path (no Python)
DIR="$(cd "$(dirname "$INPUT_PATH")" && pwd)"
INPUT_PATH="$DIR/$(basename "$INPUT_PATH")"

if [ ! -f "$INPUT_PATH" ]; then
  echo "Input file does not exist: $INPUT_PATH" >&2
  exit 2
fi

FILENAME="$(basename -- "$INPUT_PATH")"
EXT="${FILENAME##*.}"
NAME="${FILENAME%.*}"
EXT_LC="$(printf '%s' "$EXT" | tr '[:upper:]' '[:lower:]')"
NAME_LC="$(printf '%s' "$NAME" | tr '[:upper:]' '[:lower:]')"

# Simple categorization
CATEGORY="Misc"
case "$NAME_LC" in
  *invoice*) CATEGORY="Invoices" ;;
  *receipt*) CATEGORY="Receipts" ;;
  *report*)  CATEGORY="Reports" ;;
esac
case "$EXT_LC" in
  jpg|jpeg|png|gif) CATEGORY="Photos" ;;
esac

# Safe new name: <category>_YYYY-MM-DD_<orig>.ext
DATE_STR="$(date +%F)"
SAFE_NAME="$(printf '%s' "$NAME" | tr -cs '[:alnum:]_-' '_' | sed 's/^_\\+//; s/_\\+$//')"
LC_CATEGORY="$(printf '%s' "$CATEGORY" | tr '[:upper:]' '[:lower:]')"
NEW_NAME="${LC_CATEGORY}_${DATE_STR}_${SAFE_NAME}.${EXT_LC}"

# Destination on Desktop to avoid Documents permissions issues
DEST_DIR="$HOME/Desktop/Sorted/$CATEGORY"
mkdir -p "$DEST_DIR"

FINAL_PATH="$DEST_DIR/$NEW_NAME"
BASE_NO_EXT="${NEW_NAME%.*}"
COUNTER=1
while [ -e "$FINAL_PATH" ]; do
  FINAL_PATH="$DEST_DIR/${BASE_NO_EXT}_$COUNTER.$EXT_LC"
  COUNTER=$((COUNTER + 1))
done

# Copy first (preserve times), then try to remove original
if cp -p "$INPUT_PATH" "$FINAL_PATH"; then
  if rm "$INPUT_PATH"; then
    echo "Moved: $INPUT_PATH -> $FINAL_PATH" >&2
  else
    echo "Copied: $INPUT_PATH -> $FINAL_PATH (original could not be removed)" >&2
  fi
else
  echo "Failed to copy file: $INPUT_PATH" >&2
  exit 3
fi

# Output final path for Electron
echo "$FINAL_PATH"