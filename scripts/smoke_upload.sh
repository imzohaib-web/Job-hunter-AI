#!/usr/bin/env bash
set -euo pipefail

# JobPilot Smoke Test: Resume Upload Flow
# Usage: ./scripts/smoke_upload.sh [API_BASE_URL]

API_BASE_URL="${1:-${API_BASE_URL:-http://localhost:3001/api}}"
API_BASE_URL="${API_BASE_URL%/}"
EMAIL="${SMOKE_EMAIL:-smoke_tester@example.com}"
PASSWORD="${SMOKE_PASSWORD:-password123!}"

echo "[smoke_upload.sh] Starting smoke test against ${API_BASE_URL}..."

# Locate fixture
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FIXTURE=""
for candidate in \
  "${SCRIPT_DIR}/../apps/api/tests/fixtures/valid_resume.pdf" \
  "${SCRIPT_DIR}/../apps/ai-service/tests/fixtures/resume_single_column.pdf" \
  "${SCRIPT_DIR}/../apps/api/tests/fixtures/valid_resume.docx"; do
  if [ -f "$candidate" ]; then
    FIXTURE="$candidate"
    break
  fi
done

if [ -z "$FIXTURE" ]; then
  echo "[smoke_upload.sh] Creating temporary PDF fixture..."
  FIXTURE="/tmp/smoke_resume.pdf"
  printf "%%PDF-1.4\n1 0 obj\n<< /Title (Smoke Resume) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%%%EOF" > "$FIXTURE"
fi

echo "[smoke_upload.sh] Using fixture: ${FIXTURE}"

# 1. Authenticate (login or register)
echo "[smoke_upload.sh] Authenticating as ${EMAIL}..."
LOGIN_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API_BASE_URL}/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

HTTP_STATUS=$(echo "$LOGIN_RESP" | grep "HTTP_STATUS" | cut -d':' -f2)
BODY=$(echo "$LOGIN_RESP" | grep -v "HTTP_STATUS")

TOKEN=""
if [ "$HTTP_STATUS" -eq 200 ]; then
  TOKEN=$(echo "$BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
  echo "[smoke_upload.sh] Logged in successfully."
else
  echo "[smoke_upload.sh] Login failed (HTTP ${HTTP_STATUS}), attempting registration..."
  REG_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API_BASE_URL}/auth/register" \
    -H "Content-Type: application/json" \
    -d "{\"name\":\"Smoke Tester\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")

  REG_STATUS=$(echo "$REG_RESP" | grep "HTTP_STATUS" | cut -d':' -f2)
  REG_BODY=$(echo "$REG_RESP" | grep -v "HTTP_STATUS")

  if [ "$REG_STATUS" -eq 201 ]; then
    TOKEN=$(echo "$REG_BODY" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    echo "[smoke_upload.sh] Registered successfully."
  else
    echo "[smoke_upload.sh] Registration failed: ${REG_BODY}"
    exit 1
  fi
fi

if [ -z "$TOKEN" ]; then
  echo "[smoke_upload.sh] Failed to extract accessToken."
  exit 1
fi

# 2. Upload resume
echo "[smoke_upload.sh] Uploading fixture resume..."
UPLOAD_RESP=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "${API_BASE_URL}/resumes" \
  -H "Authorization: Bearer ${TOKEN}" \
  -F "file=@${FIXTURE}")

UPLOAD_STATUS=$(echo "$UPLOAD_RESP" | grep "HTTP_STATUS" | cut -d':' -f2)
UPLOAD_BODY=$(echo "$UPLOAD_RESP" | grep -v "HTTP_STATUS")

if [ "$UPLOAD_STATUS" -ne 201 ]; then
  echo "[smoke_upload.sh] Upload failed (HTTP ${UPLOAD_STATUS}): ${UPLOAD_BODY}"
  exit 1
fi

RESUME_ID=$(echo "$UPLOAD_BODY" | grep -o '"_id":"[^"]*' | head -n 1 | cut -d'"' -f4)
STATUS=$(echo "$UPLOAD_BODY" | grep -o '"status":"[^"]*' | head -n 1 | cut -d'"' -f4)
echo "[smoke_upload.sh] Resume uploaded! ID: ${RESUME_ID}, Status: ${STATUS}"

if [ "$STATUS" = "ready" ]; then
  echo "[smoke_upload.sh] Resume is immediately ready!"
  exit 0
fi

# 3. Poll resume status
MAX_POLLS=30
for i in $(seq 1 $MAX_POLLS); do
  POLL_RESP=$(curl -s -H "Authorization: Bearer ${TOKEN}" "${API_BASE_URL}/resumes/${RESUME_ID}")
  CURRENT_STATUS=$(echo "$POLL_RESP" | grep -o '"status":"[^"]*' | head -n 1 | cut -d'"' -f4)
  echo "[smoke_upload.sh] Poll ${i}/${MAX_POLLS}: status='${CURRENT_STATUS}'"

  if [ "$CURRENT_STATUS" = "ready" ]; then
    echo "========================================"
    echo " SUCCESS: Resume is ready!"
    echo "========================================"
    exit 0
  fi

  if [ "$CURRENT_STATUS" = "failed" ]; then
    ERROR_MSG=$(echo "$POLL_RESP" | grep -o '"error":"[^"]*' | cut -d'"' -f4)
    echo "========================================"
    echo " FAILED: Resume processing failed."
    echo " Error: ${ERROR_MSG}"
    echo "========================================"
    exit 1
  fi

  sleep 1.5
done

echo "[smoke_upload.sh] Timed out waiting for resume to finish."
exit 1
