#!/bin/bash

# Script to generate blog post banner images using Gemini AI
# Usage: ./scripts/generate-blog-image.sh "Article Title" "tags" "output-filename"
# Example: ./scripts/generate-blog-image.sh "My New Article" "web3, security" "my-new-article"

set -e

# Check if GEMINI_API_KEY is set
if [ -z "$GEMINI_API_KEY" ]; then
  echo "Error: GEMINI_API_KEY environment variable is not set"
  echo "Usage: GEMINI_API_KEY=your_key ./scripts/generate-blog-image.sh \"Title\" \"tags\" \"filename\""
  exit 1
fi

# Check arguments
if [ $# -lt 3 ]; then
  echo "Usage: $0 \"Article Title\" \"tags\" \"output-filename\""
  echo "Example: $0 \"My New Article\" \"web3, security\" \"my-new-article\""
  exit 1
fi

TITLE="$1"
TAGS="$2"
FILENAME="$3"
OUTPUT_DIR="$(dirname "$0")/../public/images/blog/"

# Create output directory if it doesn't exist
mkdir -p "$OUTPUT_DIR"

echo "Generating image for: $TITLE"
echo "Tags: $TAGS"
echo "Output: $OUTPUT_DIR/$FILENAME.png"

# Create the prompt
PROMPT="Create a professional dark-themed blog banner image (16:9 aspect ratio) for a cybersecurity/hacking article titled '$TITLE'. Style: dark background with subtle tech patterns, accent color amber/gold (#FFC107), minimalist, modern. Topics: $TAGS. No text in the image."

# Call Gemini API
RESPONSE=$(curl -s -X POST \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-pro-image-preview:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"contents\": [{
      \"parts\": [
        {\"text\": \"$PROMPT\"}
      ]
    }]
  }")

# Extract base64 image data
IMAGE_DATA=$(echo "$RESPONSE" | jq -r '.candidates[0].content.parts[0].inlineData.data' 2>/dev/null)

if [ "$IMAGE_DATA" != "null" ] && [ -n "$IMAGE_DATA" ]; then
  echo "$IMAGE_DATA" | base64 -d > "$OUTPUT_DIR/$FILENAME.png"
  echo "✓ Image saved successfully: $OUTPUT_DIR/$FILENAME.png"
  echo ""
  echo "Add this to your blog post frontmatter:"
  echo "image: '/images/blog/2025/$FILENAME.png'"
else
  echo "✗ Failed to generate image"
  echo "Response:"
  echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
  exit 1
fi
