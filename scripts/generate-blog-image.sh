#!/bin/bash

# Generate a banner matching the site's Open Laboratory art direction.
# Usage: ./scripts/generate-blog-image.sh "Title" "tags" "2026/slug" ["Visual brief"]
# DRY_RUN=1 prints the JSON request without calling the API or requiring a key.
# GEMINI_IMAGE_MODEL and GEMINI_IMAGE_SIZE override the defaults below.
set -euo pipefail

if [ "$#" -lt 3 ] || [ "$#" -gt 4 ]; then
  echo "Usage: $0 \"Article title\" \"tags\" \"year/slug\" [\"Visual brief\"]" >&2
  exit 1
fi

for dependency in jq curl base64; do
  command -v "$dependency" >/dev/null || { echo "Missing dependency: $dependency" >&2; exit 1; }
done

TITLE="$1"
TAGS="$2"
FILENAME="$3"
VISUAL_BRIEF="${4:-Choose one concrete visual idea from the title and topics.}"
MODEL="${GEMINI_IMAGE_MODEL:-gemini-nano-banana-2.1}"
IMAGE_SIZE="${GEMINI_IMAGE_SIZE:-2K}"
SCRIPT_DIR="$(cd -- "$(dirname -- "$0")" && pwd)"
OUTPUT_DIR="${BLOG_IMAGE_OUTPUT_DIR:-$SCRIPT_DIR/../public/images/blog}"

# Accept a slug or nested year/slug, always relative to the blog image directory.
if [[ ! "$FILENAME" =~ ^[a-zA-Z0-9_-]+(/[a-zA-Z0-9_-]+)*$ ]]; then
  echo "Output must be a relative slug such as 2026/my-article, without an extension." >&2
  exit 1
fi
case "$IMAGE_SIZE" in 1K|2K|4K) ;; *) echo "GEMINI_IMAGE_SIZE must be 1K, 2K or 4K." >&2; exit 1 ;; esac

STYLE_PROMPT="$(cat "$SCRIPT_DIR/blog-image-prompt.txt")"
PROMPT="$(printf '%s\n\nARTICLE CONTEXT\nTitle: %s\nTopics: %s\nVisual brief: %s\n' "$STYLE_PROMPT" "$TITLE" "$TAGS" "$VISUAL_BRIEF")"
REQUEST="$(jq -n --arg prompt "$PROMPT" --arg size "$IMAGE_SIZE" '{
  contents: [{parts: [{text: $prompt}]}],
  generationConfig: {
    responseModalities: ["TEXT", "IMAGE"],
    imageConfig: {aspectRatio: "16:9", imageSize: $size}
  }
}')"

if [ "${DRY_RUN:-0}" = 1 ]; then
  printf '%s\n' "$REQUEST"
  exit 0
fi
if [ -z "${GEMINI_API_KEY:-}" ]; then
  echo "Set GEMINI_API_KEY before generating, or use DRY_RUN=1 to inspect the prompt." >&2
  exit 1
fi

work_dir="$(mktemp -d)"
trap 'rm -rf -- "$work_dir"' EXIT
printf '%s\n' "$REQUEST" > "$work_dir/request.json"
printf 'Generating with %s (%s, 16:9): %s\n' "$MODEL" "$IMAGE_SIZE" "$TITLE"

if ! curl --fail-with-body --silent --show-error --connect-timeout 20 --max-time 240 \
  "https://generativelanguage.googleapis.com/v1beta/models/$MODEL:generateContent" \
  -H "x-goog-api-key: $GEMINI_API_KEY" \
  -H "Content-Type: application/json" \
  --data-binary "@$work_dir/request.json" --output "$work_dir/response.json"; then
  jq -r '.error.message // "Image generation request failed."' "$work_dir/response.json" >&2 || true
  exit 1
fi

# Text or thinking parts can precede the final image. Do not assume parts[0].
if ! jq -e '[.candidates[]?.content.parts[]? |
  select(.thought != true) | .inlineData? |
  select((.mimeType // "") | startswith("image/"))][0] // empty' \
  "$work_dir/response.json" > "$work_dir/image.json"; then
  jq -r '.error.message // .promptFeedback.blockReason // .candidates[0].finishReason // "No image returned."' "$work_dir/response.json" >&2
  exit 1
fi

MIME_TYPE="$(jq -r '.mimeType' "$work_dir/image.json")"
case "$MIME_TYPE" in
  image/png) EXT=png ;;
  image/jpeg) EXT=jpg ;;
  image/webp) EXT=webp ;;
  *) echo "Unsupported image type: $MIME_TYPE" >&2; exit 1 ;;
esac
jq -er '.data | select(type == "string" and length > 0)' "$work_dir/image.json" | base64 -d > "$work_dir/image.$EXT"
[ -s "$work_dir/image.$EXT" ] || { echo "The returned image is empty." >&2; exit 1; }
OUTPUT_PATH="$OUTPUT_DIR/$FILENAME.$EXT"
mkdir -p "$(dirname -- "$OUTPUT_PATH")"
mv -- "$work_dir/image.$EXT" "$OUTPUT_PATH"
printf "Image saved: %s\n\nBlog frontmatter:\nimage: '/images/blog/%s.%s'\n" "$OUTPUT_PATH" "$FILENAME" "$EXT"
