#!/bin/bash
set -e

# Configuration
PROJECT_ID="project-6d617c10-fed9-46d4-b8e"
REGION="asia-east1"
REGISTRY="${REGION}-docker.pkg.dev"
IMAGE_NAME="judge-worker"
IMAGE_TAG="latest"
FULL_IMAGE="${REGISTRY}/${PROJECT_ID}/oj/${IMAGE_NAME}:${IMAGE_TAG}"

echo "🚀 Deploying judge-worker to GKE..."

# Step 1: Authenticate with Artifact Registry
echo "📝 Authenticating with Artifact Registry..."
gcloud auth configure-docker "${REGISTRY}"

# Step 2: Build the Docker image
echo "🔨 Building worker image..."
docker build -f backend/Dockerfile.worker -t "${FULL_IMAGE}" ./backend

# Step 3: Push to Artifact Registry
echo "📤 Pushing to Artifact Registry..."
docker push "${FULL_IMAGE}"

# Step 4: Apply the deployment
echo "⚙️  Applying Kubernetes deployment..."
kubectl apply -f k8s/judge-worker-deployment.yaml

# Step 6: Wait for rollout
echo "⏳ Waiting for deployment to roll out..."
kubectl rollout status deployment/judge-worker --timeout=5m

echo "✅ Deployment complete!"
kubectl get pods -l app=judge-worker
