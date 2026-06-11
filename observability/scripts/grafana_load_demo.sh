#!/usr/bin/env bash
set -euo pipefail

# Scenario 2: concurrent submissions Grafana demo
# This script only performs demo actions and prints what step is running.
# It does NOT print Prometheus metric values; watch Grafana for metric changes.

API_BASE="${API_BASE:-http://localhost:8080/api/v1}"
RESET_DEMO="${RESET_DEMO:-0}"
SLEEP_SECONDS="${SLEEP_SECONDS:-0.5}"
SCRAPE_WAIT_SECONDS="${SCRAPE_WAIT_SECONDS:-3}"
DRAIN_WATCH_ROUNDS="${DRAIN_WATCH_ROUNDS:-5}"

EXAM_ID="${EXAM_ID:-eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee}"
CANDIDATE_PASSWORD="${CANDIDATE_PASSWORD:-Candidate123!}"

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
  echo "[setup] reset demo submissions and judge results"
  docker compose exec -T postgres psql -U oj -d oj -c 'DELETE FROM judge_results; DELETE FROM submissions;' >/dev/null
}

login_candidate() {
  local email="$1"
  local login_body login_resp
  login_body="$("$PYTHON_BIN" - <<PY
import json
print(json.dumps({"email": "$email", "password": "$CANDIDATE_PASSWORD"}))
PY
)"
  login_resp="$(curl -fsS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    --data "$login_body")"
  printf '%s' "$login_resp" | json_get '["access_token"]'
}

problem_code() {
  local problem_id="$1"
  "$PYTHON_BIN" - "$problem_id" "$SLEEP_SECONDS" <<'PY'
import sys
problem_id = sys.argv[1]
sleep_seconds = float(sys.argv[2])

codes = {
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1": """import sys, time\ntime.sleep(SLEEP)\nnums=list(map(int, sys.stdin.read().split()))\nprint(sum(nums))\n""",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2": """import sys, time\ntime.sleep(SLEEP)\nwords=sys.stdin.read().split()\nprint(' '.join(reversed(words)))\n""",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3": """import sys, bisect, time\ntime.sleep(SLEEP)\ndata=list(map(int, sys.stdin.read().split()))\nn=data[0]; arr=data[1:1+n]\ndp=[]\nfor x in arr:\n    i=bisect.bisect_left(dp,x)\n    if i==len(dp): dp.append(x)\n    else: dp[i]=x\nprint(len(dp))\n""",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4": """import sys, collections, time\ntime.sleep(SLEEP)\nlines=sys.stdin.read().splitlines()\nh,w=map(int,lines[0].split())\ng=[list(x) for x in lines[1:1+h]]\nS=T=None\nfor i in range(h):\n    for j in range(w):\n        if g[i][j]=='S': S=(i,j)\n        if g[i][j]=='T': T=(i,j)\nq=collections.deque([(S[0],S[1],0)])\nseen={S}\nwhile q:\n    i,j,d=q.popleft()\n    if (i,j)==T:\n        print(d); break\n    for di,dj in [(1,0),(-1,0),(0,1),(0,-1)]:\n        ni,nj=i+di,j+dj\n        if 0<=ni<h and 0<=nj<w and g[ni][nj] != '#' and (ni,nj) not in seen:\n            seen.add((ni,nj)); q.append((ni,nj,d+1))\nelse:\n    print(-1)\n""",
    "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5": """import sys, time\ntime.sleep(SLEEP)\nlines=sys.stdin.read().splitlines()\nn,q=map(int,lines[0].split())\na=list(map(int,lines[1].split()))\nout=[]\nfor line in lines[2:]:\n    parts=line.split()\n    if parts[0]=='set':\n        a[int(parts[1])-1]=int(parts[2])\n    else:\n        l=int(parts[1])-1; r=int(parts[2])\n        out.append(str(sum(a[l:r])))\nprint('\\n'.join(out))\n""",
}
code = codes[problem_id].replace("SLEEP", repr(sleep_seconds))
print(code, end="")
PY
}

submit_one() {
  local email="$1"
  local problem_id="$2"
  local token body code_file
  token="$(login_candidate "$email")"
  code_file="$(mktemp)"
  problem_code "$problem_id" > "$code_file"
  body="$("$PYTHON_BIN" - "$EXAM_ID" "$problem_id" "$code_file" <<'PY'
import json, sys
exam_id, problem_id, code_file = sys.argv[1], sys.argv[2], sys.argv[3]
with open(code_file, "r", encoding="utf-8") as f:
    code = f.read()
print(json.dumps({
    "exam_id": exam_id,
    "problem_id": problem_id,
    "language": "python3",
    "code": code,
}))
PY
)"
  rm -f "$code_file"
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

echo "[setup] start required dashboard/API services"
docker compose up -d --remove-orphans postgres redis api nginx prometheus grafana >/dev/null
wait_for_api
seed_demo_data
if [[ "$RESET_DEMO" == "1" ]]; then
  reset_demo_state
fi

if docker compose config --services | grep -qx "worker"; then
  echo "[setup] start compose worker service"
  docker compose up -d worker >/dev/null
else
  echo "[info] no compose worker service found; make sure the GCP Pub/Sub worker is running elsewhere"
fi

# Seeded assignments from backend/seed_sample_exam.sql.
declare -a JOBS=(
  "alice.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
  "alice.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"
  "alice.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5"
  "bob.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
  "bob.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
  "bob.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4"
  "carol.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
  "carol.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3"
  "david.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
  "david.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4"
  "david.candidate@example.com aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5"
)

echo "submit ${#JOBS[@]} candidate/problem pairs concurrently"
pids=()
for job in "${JOBS[@]}"; do
  # shellcheck disable=SC2086
  submit_one $job &
  pids+=("$!")
done

failed=0
for pid in "${pids[@]}"; do
  if ! wait "$pid"; then
    failed=$((failed + 1))
  fi
done
if [[ "$failed" -gt 0 ]]; then
  echo "[warning] $failed submissions failed. Use RESET_DEMO=1 or wait if rate limit was triggered." >&2
else
  echo "      all demo submissions were created"
fi
pause_for_grafana



echo "[done] load/concurrent-submission demo actions completed"
echo "       Watch: queue length, judge success total, judge average seconds."
