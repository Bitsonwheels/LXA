'use client';

import * as React from 'react';
import { InfoIcon } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field';
import type { Instance } from '@/app/(main)/instances/_lib/instances.d';
import {
  CLOUD_INIT_USER_DATA_KEY,
  getRootPasswordFromUserData,
  setRootPasswordInUserData,
} from '@/app/(main)/_lib/cloud-init';
import {
  setRootPassword as execSetRootPassword,
  updateInstanceSettings,
} from '../../_lib/instance';
import { ManagementFooter } from './footer';
import { ManagementShell } from './shell';
import { PasswordInput } from '@/app/(main)/_components/root-password-field';

export default function Security({
  instance,
  onMutate,
  onBack,
}: {
  instance: Instance;
  onMutate: () => Promise<void>;
  onBack?: () => void;
}) {
  const instanceConfig = React.useMemo(() => instance.config ?? {}, [instance.config]);
  const currentUserData = React.useMemo(
    () => instance.expanded_config?.[CLOUD_INIT_USER_DATA_KEY] ?? instanceConfig[CLOUD_INIT_USER_DATA_KEY],
    [instance.expanded_config, instanceConfig],
  );
  // Older instances kept the root password as plaintext in the user-data.
  // Saving the new exec-based password also strips that legacy entry.
  const hasLegacyPlaintextEntry = React.useMemo(
    () => getRootPasswordFromUserData(currentUserData) !== undefined,
    [currentUserData],
  );

  const [rootPassword, setRootPassword] = React.useState('');
  const [rootPasswordConfirm, setRootPasswordConfirm] = React.useState('');
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const lastInstanceNameRef = React.useRef<string | null>(null);
  const saveAbortControllerRef = React.useRef<AbortController | null>(null);

  const isRunning = instance.status === 'Running';
  const isDirty = rootPassword.trim().length > 0;
  const confirmMismatch = rootPassword !== rootPasswordConfirm;

  // A server-side instance switch resets the draft, but never while the user
  // has unsaved edits.
  React.useEffect(() => {
    const instanceChanged = lastInstanceNameRef.current !== instance.name;

    if (!instanceChanged && isDirty) return;

    lastInstanceNameRef.current = instance.name;
    setRootPassword('');
    setRootPasswordConfirm('');
  }, [instance.name, isDirty]);

  React.useEffect(() => {
    return () => {
      saveAbortControllerRef.current?.abort();
    };
  }, []);

  const handleCancel = () => {
    setRootPassword('');
    setRootPasswordConfirm('');
  };

  const handleSave = async () => {
    if (confirmMismatch) return;

    try {
      setSaveError(null);
      setIsSaving(true);
      saveAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      saveAbortControllerRef.current = abortController;

      if (!isRunning) {
        setSaveError('The instance must be running so the password can be set directly on it. Start it first.');
        return;
      }

      const trimmed = rootPassword.trim();
      await execSetRootPassword({
        name: instance.name,
        project: instance.project ?? 'default',
        password: trimmed,
        signal: abortController.signal,
      });

      // Migrate away from the old plaintext-in-user-data approach.
      if (hasLegacyPlaintextEntry) {
        const nextUserData = setRootPasswordInUserData(currentUserData, '');
        if (nextUserData !== null) {
          const nextConfig = { ...instanceConfig };
          if (nextUserData) {
            nextConfig[CLOUD_INIT_USER_DATA_KEY] = nextUserData;
          } else {
            delete nextConfig[CLOUD_INIT_USER_DATA_KEY];
          }
          await updateInstanceSettings({
            instance,
            nextConfig,
            signal: abortController.signal,
          });
        }
      }

      await onMutate();
      setRootPassword('');
      setRootPasswordConfirm('');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setSaveError(error instanceof Error ? error.message : 'Unable to update root password.');
    } finally {
      saveAbortControllerRef.current = null;
      setIsSaving(false);
    }
  };

  return (
    <ManagementShell
      error={saveError}
      footer={
        <ManagementFooter
          backLabel={onBack ? 'Back' : 'Reset'}
          onBack={onBack ?? handleCancel}
          backDisabled={isSaving}
          primaryLabel="Save Changes"
          onPrimary={handleSave}
          primaryDisabled={!isDirty || isSaving || confirmMismatch}
          primaryLoading={isSaving}
        />
      }
    >
      <div className="space-y-4 py-1">
        <Alert>
          <InfoIcon className="size-4" />
          <AlertTitle>Applies immediately</AlertTitle>
          <AlertDescription>
            The password is set directly on the running instance and is not
            stored in the UI or in the instance configuration.
          </AlertDescription>
        </Alert>

        <Field>
          <FieldLabel htmlFor="instance-root-password">New Root Password</FieldLabel>
          <PasswordInput
            id="instance-root-password"
            value={rootPassword}
            onChange={setRootPassword}
            disabled={isSaving}
          />
          <FieldError>{!isRunning ? 'The instance is not running.' : undefined}</FieldError>
        </Field>

        <Field>
          <FieldLabel htmlFor="instance-root-password-confirm">Confirm Root Password</FieldLabel>
          <PasswordInput
            id="instance-root-password-confirm"
            value={rootPasswordConfirm}
            onChange={setRootPasswordConfirm}
            autoComplete="off"
            disabled={isSaving}
          />
          {confirmMismatch ? (
            <FieldError>Passwords do not match</FieldError>
          ) : (
            <FieldDescription>Applies to the root user only.</FieldDescription>
          )}
        </Field>
      </div>
    </ManagementShell>
  );
}
