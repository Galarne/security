// scw-env.mjs — charge les secrets du Scaleway Secret Manager dans process.env
// avant le démarrage de l'application. Node >= 18, aucune dépendance.
//
//   node --import /opt/scw-env.mjs server.js
const env = process.env;
const key = env.SCW_SECRET_KEY;
const project = env.SCW_DEFAULT_PROJECT_ID;
const path = env.SCW_SECRETS_PATH || '/';
const base = `${env.SCW_API_URL || 'https://api.scaleway.com'}/secret-manager/v1beta1/regions/${env.SCW_DEFAULT_REGION || 'fr-par'}`;

// GET avec 3 nouvelles tentatives sur erreur réseau, 429 ou 5xx.
async function get(url) {
  for (let attempt = 1; ; attempt++) {
    let retry = true;
    let error;
    try {
      const res = await fetch(base + url, { headers: { 'X-Auth-Token': key }, signal: AbortSignal.timeout(10_000) });
      if (res.ok) return await res.json();
      retry = res.status === 429 || res.status >= 500;
      error = new Error(`HTTP ${res.status} ${await res.text()}`);
    } catch (e) {
      error = e;
    }
    if (!retry || attempt === 4) throw error;
    await new Promise((r) => setTimeout(r, 1000 * attempt));
  }
}

// "db-password" -> "DB_PASSWORD"
const envName = (s) => s.toUpperCase().replace(/[^A-Z0-9_]/g, '_');

try {
  if (!key || !project) throw new Error('SCW_SECRET_KEY et SCW_DEFAULT_PROJECT_ID sont requis');

  // Tous les secrets du projet, filtrés sur `path` et ses sous-dossiers.
  const root = path.replace(/\/+$/, '');
  const secrets = [];
  for (let page = 1, seen = 0; ; page++) {
    const q = new URLSearchParams({ project_id: project, page, page_size: 100 });
    const res = await get(`/secrets?${q}`);
    seen += res.secrets.length;
    secrets.push(...res.secrets.filter((s) => s.path === (root || '/') || s.path.startsWith(`${root}/`)));
    if (seen >= res.total_count || res.secrets.length === 0) break;
  }

  const vars = {};
  for (const s of secrets) {
    const v = await get(`/secrets/${s.id}/versions/latest_enabled/access`);
    const data = Buffer.from(v.data, 'base64').toString('utf8');
    // Le sous-dossier sert de préfixe : /position + foobar -> POSITION_FOOBAR.
    const prefix = s.path.slice(root.length).replace(/^\/+|\/+$/g, '');
    // key_value : une variable par clé ; sinon : une variable au nom du secret.
    const entries = s.type === 'key_value' ? Object.entries(JSON.parse(data)) : [[s.name, data]];
    for (const [k, val] of entries) {
      const name = envName(prefix ? `${prefix}/${k}` : k);
      if (name in vars) throw new Error(`variable ${name} définie par plusieurs secrets`);
      vars[name] = String(val);
    }
  }

  Object.assign(env, vars);
  delete env.SCW_SECRET_KEY; // l'application n'a pas besoin de la clé
  console.error(`scw-env: ${Object.keys(vars).length} secret(s) chargé(s) depuis ${path}: ${Object.keys(vars).join(' ')}`);
} catch (e) {
  console.error(`scw-env: erreur: ${e.message}`);
  process.exit(1);
}
