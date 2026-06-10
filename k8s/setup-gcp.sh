#!/usr/bin/env bash
# GCP setup script for the OJ judge worker on GKE.
# Run once per project to create the necessary resources.
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project PROJECT_ID
#   APIs: container.googleapis.com, pubsub.googleapis.com,
#         storage.googleapis.com, iam.googleapis.com
#
# Usage:
#   PROJECT_ID=my-gcp-project CLUSTER=oj-cluster REGION=us-central1 bash setup-gcp.sh

set -euo pipefail

: "${PROJECT_ID:?Set PROJECT_ID}"
: "${CLUSTER:?Set CLUSTER (GKE cluster name)}"
: "${REGION:?Set REGION (e.g. us-central1)}"
BUCKET="${BUCKET:-oj-storage-${PROJECT_ID}}"
GCP_SA="judge-worker@${PROJECT_ID}.iam.gserviceaccount.com"
K8S_NS="${K8S_NS:-default}"
K8S_SA="${K8S_SA:-judge-worker-ksa}"

echo "=== Creating GCP service account ==="
gcloud iam service-accounts create judge-worker \
  --project="${PROJECT_ID}" \
  --display-name="OJ Judge Worker" 2>/dev/null || echo "SA already exists"

echo "=== Granting Pub/Sub roles ==="
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${GCP_SA}" \
  --role="roles/pubsub.subscriber"

gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${GCP_SA}" \
  --role="roles/pubsub.publisher"

echo "=== Creating GCS bucket ==="
gcloud storage buckets create "gs://${BUCKET}" \
  --project="${PROJECT_ID}" \
  --location="${REGION}" 2>/dev/null || echo "Bucket already exists"

echo "=== Granting GCS Storage Object Admin ==="
gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
  --member="serviceAccount:${GCP_SA}" \
  --role="roles/storage.objectAdmin"

# Also grant the Compute Engine VM default SA access to GCS (for the backend API).
# Replace COMPUTE_SA with the VM's service account email.
# gcloud storage buckets add-iam-policy-binding "gs://${BUCKET}" \
#   --member="serviceAccount:COMPUTE_SA@developer.gserviceaccount.com" \
#   --role="roles/storage.objectAdmin"

echo "=== Creating Pub/Sub topics ==="
gcloud pubsub topics create judge-submissions \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Topic already exists"

gcloud pubsub topics create judge-runs \
  --project="${PROJECT_ID}" 2>/dev/null || echo "Topic already exists"

echo "=== Creating Pub/Sub subscriptions ==="
# 600s ack deadline: generous for long judge sessions (many test cases).
gcloud pubsub subscriptions create judge-submissions-sub \
  --project="${PROJECT_ID}" \
  --topic=judge-submissions \
  --ack-deadline=600 2>/dev/null || echo "Subscription already exists"

gcloud pubsub subscriptions create judge-runs-sub \
  --project="${PROJECT_ID}" \
  --topic=judge-runs \
  --ack-deadline=120 2>/dev/null || echo "Subscription already exists"

echo "=== Creating GKE cluster (if it doesn't exist) ==="
# Creates a minimal cluster with Workload Identity enabled from the start.
# The default node pool (1 × e2-small) runs only system pods.
# Judge worker pods run on the gVisor node pool created below.
if ! gcloud container clusters describe "${CLUSTER}" \
    --project="${PROJECT_ID}" --region="${REGION}" &>/dev/null; then
  gcloud container clusters create "${CLUSTER}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --num-nodes=1 \
    --machine-type=e2-small \
    --disk-type=pd-standard \
    --disk-size=20 \
    --workload-pool="${PROJECT_ID}.svc.id.goog"
else
  echo "Cluster already exists — ensuring Workload Identity is enabled"
  gcloud container clusters update "${CLUSTER}" \
    --project="${PROJECT_ID}" \
    --region="${REGION}" \
    --workload-pool="${PROJECT_ID}.svc.id.goog"
fi

echo "=== Binding Workload Identity ==="
# This allows the Kubernetes SA to impersonate the GCP SA.
gcloud iam service-accounts add-iam-policy-binding "${GCP_SA}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:${PROJECT_ID}.svc.id.goog[${K8S_NS}/${K8S_SA}]"

echo "=== Configuring GKE node pool with gVisor ==="
# Creates a dedicated node pool for the judge worker with gVisor sandbox.
# Adjust --num-nodes and --machine-type to fit your workload.
gcloud container node-pools create gvisor-pool \
  --cluster="${CLUSTER}" \
  --project="${PROJECT_ID}" \
  --region="${REGION}" \
  --machine-type=n2-standard-2 \
  --num-nodes=1 \
  --disk-type=pd-standard \
  --disk-size=20 \
  --sandbox=type=gvisor \
  --workload-metadata=GKE_METADATA \
  --node-labels=sandbox=gvisor 2>/dev/null || echo "Node pool already exists"

echo ""
echo "=== Next steps ==="
echo "1. Replace PROJECT_ID, REGION, and TAG placeholders in k8s/*.yaml"
echo "2. Create the Kubernetes secret with DB/Redis credentials:"
echo "   kubectl create secret generic oj-worker-secrets \\"
echo "     --from-literal=DATABASE_URL='postgresql+asyncpg://...' \\"
echo "     --from-literal=REDIS_URL='redis://INTERNAL_VM_IP:6379/0' \\"
echo "     --from-literal=SECRET_KEY='...' \\"
echo "     --from-literal=ADMIN_EMAIL='...' \\"
echo "     --from-literal=ADMIN_PASSWORD='...'"
echo "3. Expose PostgreSQL and Redis on the VM's internal IP:"
echo "   Edit docker-compose.yml — add 'ports: [\"INTERNAL_IP:5432:5432\"]' for postgres"
echo "   and 'ports: [\"INTERNAL_IP:6379:6379\"]' for redis."
echo "   Add firewall rule: allow TCP 5432,6379 from GKE node IP range."
echo "4. Migrate MinIO data to GCS:"
echo "   rclone sync minio:oj-storage gs://${BUCKET}"
echo "5. Build and push the worker image:"
echo "   docker build -f backend/Dockerfile.worker -t REGION-docker.pkg.dev/PROJECT_ID/oj/judge-worker:TAG backend/"
echo "   docker push REGION-docker.pkg.dev/PROJECT_ID/oj/judge-worker:TAG"
echo "6. Apply manifests:"
echo "   kubectl apply -f k8s/"
echo ""
echo "Done."
