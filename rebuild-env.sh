#!/usr/bin/env bash
# Rebuilds the sandbox after a reset: JDK 21, Maven, PostgreSQL, the database,
# backend jar, frontend dependencies + build, and the Playwright runner in /tmp.
#
#   bash /home/user/rebuild-env.sh          # everything
#   bash /home/user/rebuild-env.sh --quick  # skip apt if the tools are already there
set -euo pipefail

ROOT=/home/user
BACKEND="$ROOT/reSOURCE/backend"
FRONTEND="$ROOT/reSOURCE/frontend"
PW=/tmp/pw6

step() { printf '\n\033[1m== %s\033[0m\n' "$1"; }

if [[ "${1:-}" != "--quick" ]]; then
  step "packages"
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
    openjdk-21-jdk-headless maven postgresql postgresql-client >/dev/null
fi

step "postgres"
sudo pg_ctlcluster 17 main start 2>/dev/null || true
sleep 2
sudo -u postgres psql -tAc "select 1 from pg_roles where rolname='resource_user'" | grep -q 1 \
  || sudo -u postgres psql -c "CREATE ROLE resource_user LOGIN PASSWORD 'resource_pass' SUPERUSER;" >/dev/null
sudo -u postgres psql -tAc "select 1 from pg_database where datname='resource_db'" | grep -q 1 \
  || sudo -u postgres createdb -O resource_user resource_db

step "backend jar"
cd "$BACKEND"
JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 mvn -B -q -DskipTests package
ls -la target/resource-backend-0.0.1-SNAPSHOT.jar | awk '{print $5, $9}'

step "frontend"
cd "$FRONTEND"
[[ -d node_modules ]] || npm install --no-audit --no-fund >/dev/null
npm run build | tail -3

step "playwright"
mkdir -p "$PW" && cd "$PW"
[[ -f package.json ]] || npm init -y >/dev/null
[[ -d node_modules/playwright ]] || npm install playwright >/dev/null
npx playwright install chromium-headless-shell >/dev/null 2>&1 || true
sudo npx playwright install-deps chromium >/dev/null 2>&1 || true
cp "$ROOT/reSOURCE/tests/browser/"*.mjs "$PW/"

mkdir -p /tmp/pw2/fixtures "$ROOT/preview"
python3 - <<'PY'
import zlib, struct, pathlib
def png(path, w, h, rgb):
    raw = b''.join(b'\x00' + bytes(rgb) * w for _ in range(h))
    def chunk(tag, data):
        payload = tag + data
        return struct.pack('>I', len(data)) + payload + struct.pack('>I', zlib.crc32(payload) & 0xffffffff)
    header = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    pathlib.Path(path).write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header)
        + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))
for name, size, colour in [('ground-a.png', (240, 160), (120, 160, 120)),
                           ('ground-b.png', (200, 200), (90, 130, 170)),
                           ('ground-c.png', (180, 140), (200, 170, 120))]:
    png(f'/tmp/pw2/fixtures/{name}', size[0], size[1], colour)
pathlib.Path('/tmp/pw2/fixtures/not-an-image.txt').write_text('this is not an image at all\n')
print('fixtures ready')
PY

cat <<'NOTE'

Now start the stack (each in its own shell, or with start_process):

  1. node reSOURCE/tests/mock-ai-provider.mjs                       # :8787
  2. cd reSOURCE/backend && set -a && . ./.env && set +a \
       AI_API_KEY=mock-provider-key-for-tests AI_BASE_URL=http://127.0.0.1:8787/v1 \
       AI_MODEL=mock-vision-model AI_MAX_IMAGE_EDGE=4096 \
       java -Xmx300m -jar target/resource-backend-0.0.1-SNAPSHOT.jar --server.port=8081
  3. cd reSOURCE/frontend && VITE_PROXY_TARGET=http://localhost:8081 \
       npx vite preview --port 5174 --strictPort                    # :5174
  4. regenerate geolocation fixtures inside /tmp/pw6/fixtures      # phase 7
NOTE
