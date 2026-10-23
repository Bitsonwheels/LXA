import {
  getRootPasswordFromUserData,
  setRootPasswordInUserData,
  CLOUD_INIT_USER_DATA_KEY,
} from './cloud-init';

let failures = 0;

function assert(condition: unknown, message: string) {
  if (condition) return;
  failures += 1;
  console.error(`FAIL: ${message}`);
}

// 1. Round-trip: set then read back.
const created = setRootPasswordInUserData(undefined, 'secret123');
assert(created !== null, 'set on an empty blob must not fail');
assert(
  getRootPasswordFromUserData(created as string) === 'secret123',
  'password set on an empty blob should read back',
);
assert(
  (created as string).startsWith('#cloud-config\n'),
  'generated user-data must carry the header',
);
assert(
  (created as string).includes('expire: false'),
  'generated user-data should disable password expiry',
);

// 2. Keep the rest of the user's cloud-config intact.
const existingUserData = [
  '#cloud-config',
  'package_update: true',
  'packages:',
  '  - nginx',
  'runcmd:',
  '  - echo hi',
].join('\n');
const merged = setRootPasswordInUserData(existingUserData, 'p@ss w0rd!');
assert(merged !== null, 'merging into an existing cloud-config must not fail');
const mergedText = merged as string;
assert(mergedText.includes('package_update: true'), 'existing cloud-config keys must survive');
assert(mergedText.includes('- nginx'), 'existing package list must survive');
assert(mergedText.includes('- echo hi'), 'existing runcmd must survive');
assert(
  getRootPasswordFromUserData(mergedText) === 'p@ss w0rd!',
  'password with spaces and punctuation should read back verbatim',
);

// 3. Replacing an existing root entry must not duplicate it.
const replaced = setRootPasswordInUserData(mergedText, 'newpass');
assert(replaced !== null, 'replacing a known password must not fail');
const replacedText = replaced as string;
const rootEntries = replacedText
  .split('\n')
  .filter((line) => /^\s*root:/.test(line.trim()) || /root:[^:]*$/.test(line));
assert(
  rootEntries.length === 1,
  `replacing the password must leave a single root entry, got ${JSON.stringify(rootEntries)}`,
);
assert(getRootPasswordFromUserData(replacedText) === 'newpass', 'replacement password should read back');

// 4. Other chpasswd entries survive a change.
const multiUser = setRootPasswordInUserData(
  ['#cloud-config', 'chpasswd:', '  list: |', '    admin:oldpw', '    root:oldroot'].join('\n'),
  'freshroot',
);
const multiUserText = multiUser as string;
assert(multiUserText.includes('admin:oldpw'), 'other chpasswd users must survive');
assert(getRootPasswordFromUserData(multiUserText) === 'freshroot', 'root entry should be updated');

// 5. Clearing removes the root entry but keeps the rest.
const cleared = setRootPasswordInUserData(replacedText, '');
assert(cleared !== null, 'clearing an existing password must not fail');
const clearedText = cleared as string;
assert(getRootPasswordFromUserData(clearedText) === undefined, 'clearing removes the root password');
assert(clearedText.includes('package_update: true'), 'clearing keeps the rest of the config');

// 6. A non cloud-config blob (script) is never rewritten.
const script = '#!/bin/sh\necho hello';
assert(
  setRootPasswordInUserData(script, 'ignored') === null,
  'a script blob must not be rewritten (returns null)',
);
assert(
  setRootPasswordInUserData(script, '') === script,
  'clearing against a script blob leaves it untouched',
);
assert(
  setRootPasswordInUserData(undefined, '') === '',
  'setting nothing on nothing yields an empty blob',
);
assert(
  setRootPasswordInUserData('#cloud-config\n', 'x') !== null,
  'a bare header still accepts a password',
);

// 7. Undefined/script input yields undefined, not an empty-string false positive.
assert(getRootPasswordFromUserData(undefined) === undefined, 'undefined user-data has no password');
assert(getRootPasswordFromUserData(script) === undefined, 'a script blob has no readable password');
assert(
  getRootPasswordFromUserData('#cloud-config\n') === undefined,
  'a bare header has no readable password',
);

// 8. Tricky passwords round-trip.
const tricky = ['pa:ss:word', '#hashy', 'a"b\'c', '- dashlead', '  spaced  ', 'multi # part'];
tricky.forEach((password) => {
  const blob = setRootPasswordInUserData(undefined, password);
  assert(blob !== null, `password ${JSON.stringify(password)} must be writable`);
  assert(
    getRootPasswordFromUserData(blob as string) === password.trim(),
    `password ${JSON.stringify(password)} must round-trip (got ${JSON.stringify(
      getRootPasswordFromUserData(blob as string),
    )})`,
  );
});

assert(
  CLOUD_INIT_USER_DATA_KEY === 'cloud-init.user-data',
  'the user-data key must match the Incus config key',
);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}

console.log('cloud-init: all checks passed');
