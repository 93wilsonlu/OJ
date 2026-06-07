# GCP Deployment Guide

This guide documents the deployment owned by part C: GCP infrastructure,
deployment repeatability, and operational verification. The current demo uses a
single Compute Engine VM running the Docker Compose stack. The target production
architecture can later move stateless and managed dependencies to dedicated GCP
services while keeping the judge worker on a controlled compute host.

## Current Demo Deployment

- Demo URL: <https://oj.braveflamingdog.com>
- VM external IP: `104.199.188.64`
- Platform: GCP Compute Engine VM
- Runtime: Docker Compose
- Public entrypoint: host Nginx on ports `80` and `443`
- App upstream: Docker Compose frontend Nginx bound to `127.0.0.1:8080`
- Services: frontend, FastAPI API, PostgreSQL, Redis, MinIO, judge worker,
  Prometheus, and Grafana

This is an intentional demo deployment choice. The judge worker executes
candidate code inside sandbox containers, so it needs Docker access and stronger
host-level control than Cloud Run normally provides. Running the full stack on a
VM keeps the sandbox boundary explicit and easy to verify for the course demo.

## New VM Setup

Use an Ubuntu Compute Engine VM with HTTP traffic allowed. The exact machine size
depends on demo load, but use at least 2 vCPU and 4 GB memory so the API, Redis,
Postgres, MinIO, and judge worker can run together.

Install Docker and the Compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in after adding the user to the `docker` group.

Clone the repository:

```bash
git clone https://github.com/93wilsonlu/OJ.git
cd OJ
```

Create the environment file:

```bash
cp .env.production.example .env
nano .env
```

At minimum, replace these values before a public deployment:

- `SECRET_KEY`
- `ADMIN_PASSWORD`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`

Start the stack:

```bash
docker compose up -d --build
```

The Compose frontend Nginx binds to `127.0.0.1:8080`, so a host-level reverse
proxy should publish the site on public ports `80` and `443`.

Check service status and logs:

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f judge-worker
```

## HTTPS Setup

The deployed VM serves `oj.braveflamingdog.com` through host Nginx and a
Let's Encrypt certificate. DNS should point the domain to the VM external IP:

```text
oj.braveflamingdog.com A 104.199.188.64
```

Allow HTTP and HTTPS traffic to the VM. The current GCP deployment uses the
`oj-web` network tag:

```bash
gcloud compute firewall-rules create allow-oj-https \
  --project project-6d617c10-fed9-46d4-b8e \
  --allow tcp:443 \
  --source-ranges 0.0.0.0/0 \
  --target-tags oj-web \
  --description "Allow HTTPS traffic to OJ web VM"
```

Install host Nginx and Certbot on the VM:

```bash
sudo apt-get update
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

Create `/etc/nginx/sites-available/oj.braveflamingdog.com`:

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name oj.braveflamingdog.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the site and request the certificate:

```bash
sudo ln -sfn /etc/nginx/sites-available/oj.braveflamingdog.com /etc/nginx/sites-enabled/oj.braveflamingdog.com
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable --now nginx
sudo systemctl reload nginx
sudo certbot --nginx -d oj.braveflamingdog.com --redirect
sudo certbot renew --dry-run
```

## Database Migration and Seed Data

The API container runs migrations on startup through the Compose command:

```bash
uv run alembic upgrade head
```

To load demo data:

```bash
docker compose exec -T postgres psql -U oj -d oj < backend/seed_sample_exam.sql
docker compose exec -T api uv run python seed_testcases.py
```

## Update Deployment

Use this flow when a new commit is ready:

```bash
git pull --ff-only
docker compose up -d --build
docker compose ps
```

If only one service needs to be restarted:

```bash
docker compose restart api
docker compose restart judge-worker
```

## Operational Verification

The current deployed VM was checked with:

```bash
curl -I http://oj.braveflamingdog.com/login
curl -I https://oj.braveflamingdog.com/login
curl https://oj.braveflamingdog.com/api/v1/healthz
```

Expected current results:

- HTTP redirects to HTTPS with `301`.
- The HTTPS login page returns HTTP `200`.
- `GET /api/v1/healthz` returns `{"status":"ok"}`.

Full demo verification checklist:

| Check | Command or action | Expected result |
| --- | --- | --- |
| Frontend reachable | Open `https://oj.braveflamingdog.com/login` | Login page or app shell loads |
| API liveness | `curl https://oj.braveflamingdog.com/api/v1/healthz` | `{"status":"ok"}` |
| Containers running | `docker compose ps` | API, DB, Redis, MinIO, worker, Nginx are up |
| Worker active | `docker compose logs -f judge-worker` | Worker starts and consumes judge jobs |
| Demo flow | Submit a solution from the candidate UI | Submission reaches a final verdict |
| Storage path | Create or submit test cases | Objects are stored through MinIO |
| Queue path | Submit a solution | Redis queue dispatches work to the judge worker |
| Observability | Open Grafana on the VM if exposed | Queue and judge metrics are visible |

## Known Issues in the Current VM Deployment

The deployed VM currently proves that the app and API liveness route are online,
but some operational endpoints are not exposed as expected:

- `GET /health` returns the frontend HTML instead of API health JSON.
- `GET /ready` returns the frontend HTML instead of readiness JSON.
- `GET /api/v1/health` returns `404`.
- `GET /api/v1/ready` returns `404`.
- `GET /metrics` returns `404`.
- `GET /api/docs` returns `404`.

These are documented as follow-up routing and production-hardening tasks. They do
not block the current VM demo flow, but they should be fixed before presenting
the deployment as production-ready.

## Production Hardening Notes

- Restrict public ports to `80` or `443`; keep database, Redis, MinIO, Prometheus,
  and Grafana internal unless explicitly needed for the demo.
- Replace default secrets in `.env`.
- Use HTTPS before handling real user credentials.
- Move logs to Cloud Logging or keep a clear `docker compose logs` procedure for
  the demo.
- Keep judge execution isolated on a VM or dedicated node because it requires
  sandbox container execution.
- Treat `/metrics` as internal in production; it can expose operational details.
