import { fromYaml, toYaml } from './yaml';

/**
 * Cloud-init user-data key used to ship the root password to the guest.
 * This is an instance-level config key Incus understands out of the box.
 */
export const CLOUD_INIT_USER_DATA_KEY = 'cloud-init.user-data';

const CLOUD_CONFIG_HEADER = '#cloud-config';

type CloudConfig = Record<string, unknown>;

/**
 * Parse a `#cloud-config` user-data blob. Returns null when the blob is not a
 * mergeable cloud-config: empty, a shell script, a multi-part document or
 * anything we did not write. Callers must never silently rewrite such a blob.
 */
function parseUserData(userData: string | undefined): CloudConfig | null {
  const trimmed = (userData ?? '').trim();
  if (!trimmed) return null;

  const hasHeader = trimmed.startsWith(CLOUD_CONFIG_HEADER);
  if (!hasHeader) return null;

  try {
    const parsed = fromYaml(trimmed);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    // shortcut: a scalar YAML that resolves to an empty object should not
    // be treated as a writable cloud-config (would silently rewrite).
    if (Object.keys(parsed).length === 0 && trimmed !== CLOUD_CONFIG_HEADER) return null;
    return parsed;
  } catch {
    return null;
  }
}

function serializeUserData(cloudConfig: CloudConfig): string {
  return `${CLOUD_CONFIG_HEADER}\n${toYaml(cloudConfig)}`;
}

function chpasswdListEntries(chpasswd: unknown): string[] {
  const list = (chpasswd as { list?: unknown } | null)?.list;
  if (typeof list !== 'string') return [];

  return list
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/**
 * Build the guest-side argv for an Incus exec that sets a password directly on
 * the running instance. The secret never lands in daemon config: it lives only
 * inside the `sh -c` argv of the exec call (`printf %s\n user:pw | chpasswd`),
 * and argv is not argv: we pipe through stdin, so no password argument.
 *
 * printf over echo: echo interprets leading '-' and some escapes; printf %s
 * sends the line to chpasswd verbatim. Guests always provide `sh`.
 */
export function buildChpasswdCommand(user: string, password: string): string[] {
  if (/[\r\n]/.test(password)) {
    throw new Error('The password must not contain line breaks.');
  }
  return [
    'sh',
    '-c',
    `printf '%s\\n' ${shellQuoteSh(`${user}:${password}`)} | chpasswd`,
  ];
}

/** Single-quote for POSIX shell: an embedded ' becomes `'\''`. */
function shellQuoteSh(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/**
 * Read the root password out of a cloud-init `chpasswd` list.
 * Returns undefined when the blob has no root entry (unknown / unset password).
 */
export function getRootPasswordFromUserData(userData: string | undefined): string | undefined {
  const cloudConfig = parseUserData(userData);
  if (!cloudConfig) return undefined;

  const rootEntry = chpasswdListEntries(cloudConfig.chpasswd).find((entry) =>
    entry.startsWith('root:'),
  );

  return rootEntry ? rootEntry.slice('root:'.length) : undefined;
}

/**
 * Merge (or remove) the root password into cloud-init user-data, keeping the
 * rest of the user's `#cloud-config` content intact.
 *
 * Returns null when a password cannot be written into a blob we do not own
 * (a shell script, for example) — the caller must surface that instead of
 * silently dropping the password. An empty password never fails: it simply
 * leaves the unmergeable blob as it is.
 */
export function setRootPasswordInUserData(
  userData: string | undefined,
  password: string,
): string | null {
  const existing = parseUserData(userData);
  const trimmedPassword = password.trim();

  if (!existing) {
    if (!trimmedPassword) return userData ?? '';
    if ((userData ?? '').trim().length > 0) return null;
    return serializeUserData({
      chpasswd: {
        expire: false,
        list: `root:${trimmedPassword}`,
      },
    });
  }

  const keptEntries = chpasswdListEntries(existing.chpasswd).filter(
    (entry) => !entry.startsWith('root:'),
  );

  if (!trimmedPassword) {
    if (keptEntries.length === 0) {
      const rest = { ...existing } as Record<string, unknown>;
      delete rest.chpasswd;
      // Nothing of ours left: drop the user-data entirely (empty string makes
      // callers delete the config key).
      if (Object.keys(rest).length === 0) return '';
      return serializeUserData(rest);
    }

    return serializeUserData({
      ...existing,
      chpasswd: { list: keptEntries.join('\n') },
    });
  }

  return serializeUserData({
    ...existing,
    chpasswd: {
      list: [...keptEntries, `root:${trimmedPassword}`].join('\n'),
      expire: false,
    },
  });
}
