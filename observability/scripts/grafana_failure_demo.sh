#!/usr/bin/env bash
set -euo pipefail

# Scenario 1: failure/readiness Grafana demo
# This script only performs demo actions and prints what step is running.
# It does NOT print Prometheus metric values; watch Grafana for metric changes.

API_BASE="${API_BASE:-http://localhost/api/v1}"
CANDIDATE_EMAIL="${CANDIDATE_EMAIL:-alice.candidate@example.com}"
CANDIDATE_PASSWORD="${CANDIDATE_PASSWORD:-Candidate123!}"
EXAM_ID="${EXAM_ID:-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee}"
PROBLEM_ID="${PROBLEM_ID:-aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1}"
RESET_DEMO="${RESET_DEMO:-0}"
SCRAPE_WAIT_SECONDS="${SCRAPE_WAIT_SECONDS:-5}"

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "Missing command: $1" >&2
    exit 1
  }
}

find_python() {
  if command -v python3 >/dev/null 2>&1; then
    printf 'python3'
  elif command -v python >/dev/null 2>&1; then
    printf 'python'
  elif command -v py >/dev/null 2>&1; then
    printf 'py'
  else
    echo "Missing command: python3, python, or py" >&2
    exit 1
  fi
}

PYTHON_BIN="${PYTHON_BIN:-$(find_python)}"

json_get() {
  "$PYTHON_BIN" -c 'import json,sys; data=json.load(sys.stdin); print(data'"$1"')'
}

post_json() {
  local url="$1"
  local body="$2"
  local token="${3:-}"
  local tmp status
  tmp="$(mktemp)"

  if [[ -n "$token" ]]; then
    status="$(curl -sS -X POST "$url" \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $token" \
      --data "$body" \
      -o "$tmp" -w "%{http_code}")"
  else
    status="$(curl -sS -X POST "$url" \
      -H "Content-Type: application/json" \
      --data "$body" \
      -o "$tmp" -w "%{http_code}")"
  fi

  if [[ "$status" -ge 400 ]]; then
    echo "[error] POST $url failed with HTTP $status" >&2
    echo "[error] response body:" >&2
    cat "$tmp" >&2
    echo >&2
    echo "[error] submitted payload was:" >&2
    printf '%s\n' "$body" >&2
    rm -f "$tmp"
    exit 1
  fi

  cat "$tmp"
  rm -f "$tmp"
}

wait_for_api() {
  echo "[setup] wait for API health endpoint"
  for _ in $(seq 1 30); do
    if curl -fsS "${API_BASE%/api/v1}/health" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "API did not become healthy. Check docker compose logs api." >&2
  exit 1
}

seed_demo_data() {
  echo "[setup] seed sample exam and testcase objects"
  docker compose exec -T postgres psql -U oj -d oj < backend/seed_sample_exam.sql >/dev/null
  docker compose exec -T postgres psql -U oj -d oj -c "UPDATE exams SET start_time = now() - interval '10 minutes', end_time = now() + interval '7 days', anti_cheat_enabled = false, test_time_minutes = NULL WHERE exam_id = '$EXAM_ID'; DELETE FROM exam_attempts WHERE exam_id = '$EXAM_ID'; DELETE FROM exam_candidate_states WHERE exam_id = '$EXAM_ID';" >/dev/null
  docker compose exec -T api uv run python seed_testcases.py >/dev/null
}

reset_demo_state() {
  echo "[setup] reset demo submissions, judge results, Redis queue, and demo metrics"
  docker compose exec -T postgres psql -U oj -d oj -c 'DELETE FROM judge_results; DELETE FROM submissions;' >/dev/null
  docker compose exec -T redis redis-cli FLUSHDB >/dev/null
}

login_candidate() {
  local login_body login_resp
  login_body="$("$PYTHON_BIN" - <<PY
import json
print(json.dumps({"email": "$CANDIDATE_EMAIL", "password": "$CANDIDATE_PASSWORD"}))
PY
)"
  login_resp="$(curl -fsS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    --data "$login_body")"
  printf '%s' "$login_resp" | json_get '["access_token"]'
}

submit_two_sum() {
  local token="$1"
  local body
  body="$("$PYTHON_BIN" - <<PY
import json
code = """import sys\nnums=list(map(int, sys.stdin.read().split()))\nprint(sum(nums))\n"""
print(json.dumps({
    "exam_id": "$EXAM_ID",
    "problem_id": "$PROBLEM_ID",
    "language": "python3",
    "code": code,
}))
PY
)"
  post_json "$API_BASE/submissions" "$body" "$token"
}

pause_for_grafana() {
  echo "      waiting for Prometheus/Grafana to scrape the new state..."
  sleep "$SCRAPE_WAIT_SECONDS"
}

need_cmd docker
need_cmd curl

if [[ ! -f docker-compose.yml ]]; then
  echo "Run this script from the project root, where docker-compose.yml exists." >&2
  exit 1
fi

trap 'echo "[cleanup] make sure MinIO is running again"; docker compose up -d minio >/dev/null || true' EXIT

echo "[setup] start required services except judge-worker"
docker compose up -d postgres redis minio api nginx prometheus grafana >/dev/null
wait_for_api
seed_demo_data
if [[ "$RESET_DEMO" == "1" ]]; then
  reset_demo_state
fi

echo "[1] stop judge-worker"
docker compose stop judge-worker >/dev/null || true
pause_for_grafana

echo "[2] submit one solution while judge-worker is stopped"
token="$(login_candidate)"
submit_two_sum "$token"
echo "      one submission created; queue length should rise in Grafana"
pause_for_grafana

echo "[3] stop MinIO"
docker compose stop minio >/dev/null
echo "      storage readiness should drop in Grafana"
pause_for_grafana

echo "[4] restart judge-worker while MinIO is still down"
docker compose start judge-worker >/dev/null
echo "      worker should consume the queued job and produce a judge failure"
pause_for_grafana

echo "[5] restart MinIO"
docker compose start minio >/dev/null
echo "      storage readiness should recover in Grafana"
pause_for_grafana

echo "[done] failure/readiness demo actions completed"
echo "       Watch: queue length, heartbeat age, storage readiness, judge failure total."
