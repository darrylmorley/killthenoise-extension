#!/bin/bash

# Where to output the final zip
OUTPUT="killthenoise.zip"

# Folder to pull files from
SOURCE_DIR="./"

# Files/folders to exclude
EXCLUDES=(
  "README.md"
  ".git/*"
  ".vscode/*"
  "defaultKeywords.txt"
  "build.sh"
  "killthenoise.zip"
  "icon2.png"
)

# Create the exclude args for zip
EXCLUDE_ARGS=()
for pattern in "${EXCLUDES[@]}"; do
  EXCLUDE_ARGS+=("-x" "$pattern")
done

# Remove existing zip if it exists
rm -f $OUTPUT

# Create the zip
zip -r "$OUTPUT" $SOURCE_DIR "${EXCLUDE_ARGS[@]}"

echo "✅ Created $OUTPUT for release."