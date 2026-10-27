# Security

Two independent tools to get secrets out of plaintext `.env` files.

| Tool | For | Where the secrets live |
|------|-----|------------------------|
| [`senv`](senv/senv.sh) | the development workstation | an age-encrypted `.env`, decryptable only with a YubiKey |
| [`scw-env`](scaleway/README.md) | Node applications in production | the Scaleway Secret Manager |

## senv

Bash function (3.2+: Linux, macOS, Git Bash / MSYS2, WSL) that encrypts a variables file with [age](https://github.com/FiloSottile/age) and [age-plugin-yubikey](https://github.com/str4d/age-plugin-yubikey). The private key stays in the YubiKey: every decryption requires touching it.

### Installation

```sh
git clone <repo> && cd <repo>
bash senv/senv.sh setup
```

`setup` checks the dependencies (`age`, `age-plugin-yubikey`, `vim`), creates or reuses an age key on the YubiKey (touch required, PIN once per session), installs `senv.sh` in `~/.config/senv/` (symlink, copy on Windows) and sources it from `~/.bashrc`.

### Usage

```sh
senv edit      # decrypt, open in vim, re-encrypt
senv decode    # load the variables into the current shell
```

| Command | Effect |
|---------|--------|
| `senv setup` | dependencies + YubiKey key + installation + `~/.bashrc` |
| `senv setup-key [name]` | create a new key on the YubiKey, then `init` |
| `senv init` | save the YubiKey identity and the age recipient |
| `senv decode [file.age]` | decrypt and export the variables |
| `senv edit [file.age]` | edit the encrypted file |

The file may only contain blank lines, comments or `export NAME=value` lines; any other line is rejected.

| Variable | Default | Purpose |
|----------|---------|---------|
| `SENV_FILE` | `~/.env.age` | encrypted file |
| `SENV_DIR` | `~/.config/senv` | identity and recipient |

### Safeguards

- `decode` works in memory only: the plaintext is never written to disk.
- `edit` uses a temporary file (in `/dev/shm` on Linux), with no swap, viminfo, backup or undo, wiped on exit, even on Ctrl-C.
- The previous version is kept in `<file>.age.bak`.

## scw-env

Node module (18+, no dependencies) loaded with `node --import` that populates `process.env` from the Scaleway Secret Manager before the application starts. The server's `.env` only holds the Scaleway credentials.

```dockerfile
COPY scw-env.mjs /opt/scw-env.mjs
CMD ["node", "--import", "/opt/scw-env.mjs", "server.js"]
```

Naming rules, IAM, rotation and tests: see [scaleway/README.md](scaleway/README.md). Examples: [scaleway/examples/](scaleway/examples/).

## License

[MIT](LICENSE)
