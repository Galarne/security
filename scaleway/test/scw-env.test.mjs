// node --test   (depuis la racine du projet ou depuis test/)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scw-env.mjs', import.meta.url));

const SECRETS = [
  { id: '1', name: 'db-password', path: '/app', type: 'opaque', data: 'multi\nligne "s3cr=t"\n' },
  { id: '2', name: 'api', path: '/app', type: 'key_value', data: '{"STRIPE_KEY":"sk_1","RETRIES":3}' },
  { id: '3', name: 'foobar', path: '/app/position', type: 'opaque', data: 'pos' },
  { id: '4', name: 'creds', path: '/app/db/main', type: 'key_value', data: '{"user":"u"}' },
  { id: '5', name: 'lookalike', path: '/application', type: 'opaque', data: 'non' },
  { id: '6', name: 'foobar', path: '/position', type: 'opaque', data: 'racine' },
  { id: '7', name: 'a', path: '/', type: 'opaque', data: 'x', project: 'dup' },
  { id: '8', name: 'A', path: '/', type: 'opaque', data: 'y', project: 'dup' },
  ...Array.from({ length: 150 }, (_, i) => ({ id: `p${i}`, name: `s${i}`, path: '/many', type: 'opaque', data: 'v' })),
];

let server;
let url;

before(async () => {
  server = createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    const send = (code, body) => res.writeHead(code).end(JSON.stringify(body));
    if (req.headers['x-auth-token'] !== 'tok') return send(401, { message: 'denied' });
    if (u.pathname.endsWith('/secrets')) {
      const page = Number(u.searchParams.get('page'));
      const size = Number(u.searchParams.get('page_size'));
      const project = u.searchParams.get('project_id');
      const list = SECRETS.filter((s) => (s.project ?? 'proj') === project).map(({ data, ...s }) => s);
      return send(200, { secrets: list.slice((page - 1) * size, page * size), total_count: list.length });
    }
    const s = SECRETS.find((x) => u.pathname.endsWith(`/secrets/${x.id}/versions/latest_enabled/access`));
    if (s) return send(200, { data: Buffer.from(s.data).toString('base64') });
    send(404, {});
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  url = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

function run(extra) {
  const env = { SCW_API_URL: url, SCW_SECRET_KEY: 'tok', SCW_DEFAULT_PROJECT_ID: 'proj', ...extra };
  const args = ['--import', script, '-e', 'process.stdout.write(JSON.stringify(process.env))'];
  return new Promise((resolve) => execFile(process.execPath, args, { env }, (err, stdout, stderr) =>
    resolve({ code: err ? err.code : 0, env: stdout && JSON.parse(stdout), stderr })));
}

test('charge le dossier et ses sous-dossiers, retire la clé', async () => {
  const { code, env, stderr } = await run({ SCW_SECRETS_PATH: '/app' });
  assert.equal(code, 0, stderr);
  assert.equal(env.DB_PASSWORD, 'multi\nligne "s3cr=t"\n');
  assert.equal(env.STRIPE_KEY, 'sk_1');
  assert.equal(env.RETRIES, '3');
  assert.equal(env.POSITION_FOOBAR, 'pos');
  assert.equal(env.DB_MAIN_USER, 'u');
  assert.equal(env.LOOKALIKE, undefined); // /application n'est pas sous /app
  assert.equal(env.SCW_SECRET_KEY, undefined);
  assert.doesNotMatch(stderr, /sk_1|s3cr/);
});

test('racine "/" : le chemin complet sert de préfixe', async () => {
  const { code, env, stderr } = await run({ SCW_SECRETS_PATH: '/' });
  assert.equal(code, 0, stderr);
  assert.equal(env.POSITION_FOOBAR, 'racine');
  assert.equal(env.APP_POSITION_FOOBAR, 'pos');
  assert.equal(env.APP_DB_PASSWORD, 'multi\nligne "s3cr=t"\n');
  assert.equal(env.DB_PASSWORD, undefined);
});

test('pagination', async () => {
  const { code, env, stderr } = await run({ SCW_SECRETS_PATH: '/many' });
  assert.equal(code, 0, stderr);
  assert.equal(Object.keys(env).filter((k) => /^S\d+$/.test(k)).length, 150);
});

test('mauvaise clé : l\'application ne démarre pas', async () => {
  const { code, env, stderr } = await run({ SCW_SECRET_KEY: 'bad', SCW_SECRETS_PATH: '/app' });
  assert.equal(code, 1);
  assert.ok(!env);
  assert.match(stderr, /401/);
});

test('deux secrets pour la même variable : échec', async () => {
  const { code, stderr } = await run({ SCW_DEFAULT_PROJECT_ID: 'dup' });
  assert.equal(code, 1);
  assert.match(stderr, /plusieurs secrets/);
});
