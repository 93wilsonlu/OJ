#!/usr/bin/env bash
set -euo pipefail

IMAGE=asia-east1-docker.pkg.dev/project-6d617c10-fed9-46d4-b8e/oj/judge-worker:latest

echo "=== Building judge-worker image ==="
docker build -f backend/Dockerfile.worker -t "$IMAGE" backend/

echo "=== Pushing to Artifact Registry ==="
docker push "$IMAGE"

echo "=== Rolling restart on GKE ==="
kubectl rollout restart deployment/judge-worker
kubectl rollout status deployment/judge-worker

echo "=== Done ==="
