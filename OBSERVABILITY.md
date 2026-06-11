# Observability and Stability

This project exposes operational signals through health endpoints, readiness checks,
Prometheus metrics, structured JSON logs, and a pre-provisioned Grafana dashboard.

## Endpoints

- `GET /health` or `GET /api/v1/health`: process liveness. Returns `{"status":"ok"}`.
- `GET /ready` or `GET /api/v1/ready`: dependency readiness for DB, GCS storage,
  and Pub/Sub.
  Returns HTTP `503` when any dependency is unavailable.
- `GET /metrics`: Prometheus text format metrics for API and judge operation.

## Metrics

Important custom metrics:

- `oj_queue_length`: number of unacknowledged messages in the Pub/Sub judge subscription backlog.
- `oj_judge_success_total`: judge jobs that completed and persisted a result.
- `oj_judge_failure_total`: judge jobs that failed with a system error.
- `oj_judge_average_seconds`: average wall-clock judge time.
- `oj_worker_heartbeat_unixtime`: latest worker heartbeat timestamp.
- `oj_stuck_submissions_marked_total`: submissions automatically marked failed after
  being stuck in `judging`.
- `oj_readiness_dependency_up{dependency="db|storage|pubsub"}`: dependency status.

The judge worker reports heartbeat and judge results to internal API endpoints. The API
stores those values in Postgres and exports them from `/metrics`, so Prometheus only
needs to scrape the API container. Queue length is read from the GCP Pub/Sub
subscription backlog through Cloud Monitoring.

## Structured Logging

The API and worker use `structlog` JSON logs. Useful events:

- `admin.seed.done`: startup admin seed completed.
- `judge.started`: worker started judging a submission.
- `judge.completed`: worker persisted the final verdict.
- `judge.failed`: worker caught an internal exception.
- `judge.stuck_submissions.marked`: stuck submissions were marked as failed.
- `worker.started`: judge worker process started.

In GCP, these JSON logs can be collected by Cloud Logging. Because the logs are JSON,
fields such as `event`, `submission_id`, `verdict`, and `duration_seconds` can be used
directly in Logs Explorer filters.

Example filters:

```text
jsonPayload.event="judge.failed"
jsonPayload.event="judge.completed" AND jsonPayload.duration_seconds>10
jsonPayload.event="judge.stuck_submissions.marked"
```

## Grafana

Start the stack:

```bash
docker compose up --build
```

Open:

- Prometheus: <http://localhost:9090>
- Grafana: <http://localhost:3000>

Grafana login:

- username: `admin`
- password: `admin`

The dashboard is provisioned automatically under `OJ / OJ Observability`. It shows:

- queue length
- average judge time
- worker heartbeat age
- DB / GCS / Pub/Sub readiness
- judge success/failure/stuck counters
- judge throughput

## Stuck Submission Handling

The `judge-monitor` service periodically scans for submissions that stayed in `judging`
longer than `STUCK_SUBMISSION_SECONDS` seconds. The default is `300` seconds.

When a stuck submission is found:

1. A generic `System Error` judge result is created if one does not already exist.
2. The submission status is changed to `failed`.
3. `oj_stuck_submissions_marked_total` reflects the new `System Error` result.
4. A `judge.stuck_submissions.marked` warning log is emitted.

The user-facing error remains generic. Internal exception details stay in server logs.

## Demo Flow

1. Run the stack with `docker compose up --build`.
2. Open Grafana at <http://localhost:3000>.
3. Submit a problem from the frontend.
4. Watch `oj_queue_length` increase when the job is queued.
5. Watch worker logs for `judge.started` and `judge.completed`.
6. Open the submission page and confirm the final verdict/result.
7. Refresh `/metrics` and confirm the judge counters and average judge time changed.

## How To Detect Instability

- API is alive but not usable: `/health` returns `200`, but `/ready` returns `503`.
- DB / GCS / Pub/Sub issue: `oj_readiness_dependency_up` drops to `0`.
- Worker stopped: `time() - oj_worker_heartbeat_unixtime` keeps increasing.
- Judge backlog: `oj_queue_length` stays high or grows continuously.
- Judge regression: `oj_judge_average_seconds` rises after a code or infra change.
- Internal judge failures: `oj_judge_failure_total` increases.
- Stuck jobs: `oj_stuck_submissions_marked_total` increases or
  `judge.stuck_submissions.marked` appears in logs.

## GCP Logging and Monitoring Notes

For GCP deployment:

1. Send container stdout/stderr to Cloud Logging. The current JSON log format is already
   suitable for field-based querying.
2. Run Prometheus/Grafana as shown in Docker Compose for the class demo, or replace it
   with Google Managed Service for Prometheus in GKE.
3. Create alerts for:
   - `/ready` failing or `oj_readiness_dependency_up == 0`
   - worker heartbeat age greater than 60 seconds
   - queue length greater than an expected threshold
   - judge failure counter increasing
   - stuck submission counter increasing
4. Use Cloud Monitoring dashboards for SLO-style views, and Grafana for the demo
   dashboard required by the project.
