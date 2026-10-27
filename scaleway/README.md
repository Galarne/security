# scw-env

Loads secrets from the **Scaleway Secret Manager** into `process.env` before the application starts. A single file, Node ≥ 18, no dependencies.

```dockerfile
COPY scw-env.mjs /opt/scw-env.mjs
CMD ["node", "--import", "/opt/scw-env.mjs", "server.js"]
```

The `.env` only holds the credentials:

```
SCW_SECRET_KEY=…
SCW_DEFAULT_PROJECT_ID=…
SCW_DEFAULT_REGION=fr-par      # default
SCW_SECRETS_PATH=/myapp/prod   # folder of the secrets to load
```

## Rules

- All secrets in `SCW_SECRETS_PATH` **and its subfolders** are loaded, in their latest enabled version.
- The subfolder (relative to `SCW_SECRETS_PATH`) prefixes the name:

  | `SCW_SECRETS_PATH` | Secret folder | Name | Variable |
  |--------------------|---------------|------|----------|
  | `/` | `/position` | `foobar` | `POSITION_FOOBAR` |
  | `/myapp/prod` | `/myapp/prod` | `db-password` | `DB_PASSWORD` |
  | `/myapp/prod` | `/myapp/prod/position` | `foobar` | `POSITION_FOOBAR` |

- `key_value` secret → one variable per key, with the same prefix (`/myapp/prod/db` + `{"user": …}` → `DB_USER`).
- `SCW_SECRET_KEY` is removed from `process.env`.
- If a secret is inaccessible, or if two secrets map to the same variable, the application does not start.
- Only variable names are logged.

## IAM

One IAM application per project and per environment, with a policy scoped to the project: `SecretManagerReadOnly` + `SecretManagerSecretAccess`.

## Rotation

```sh
scw secret version create <secret-id> data="<new value>"
docker compose up -d --force-recreate api
scw secret version disable <secret-id> revision=<old>   # after validation
```

Rollback: disable the new version, then restart.

### With Terraform

```hcl
variable "db_password" {
  sensitive = true
}

resource "scaleway_secret" "db_password" {
  name = "db-password"
  path = "/myapp/prod"
}

resource "scaleway_secret_version" "db_password" {
  secret_id = scaleway_secret.db_password.id
  data      = var.db_password
}
```

```sh
terraform apply -var db_password="<new value>"
docker compose up -d --force-recreate api
```

Changing `data` replaces the version (the old one is deleted): to roll back, apply the old value again. The value is stored in the Terraform state, so keep the state in a protected backend.

## Tests

```sh
node --test test/*.test.mjs
```
