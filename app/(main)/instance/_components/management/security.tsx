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
import { updateInstanceSettings } from '../../_lib/instance';
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

  // expanded_config already folds in the profiles, so it is the effective
  // password the guest currently boots with.
  const currentUserData = React.useMemo(
    () => instance.expanded_config?.[CLOUD_INIT_USER_DATA_KEY] ?? instanceConfig[CLOUD_INIT_USER_DATA_KEY],
    [instance.expanded_config, instanceConfig],
  );
  const currentRootPassword = React.useMemo(
    () => getRootPasswordFromUserData(currentUserData) ?? '',
    [currentUserData],
  );

  const [rootPassword, setRootPassword] = React.useState(currentRootPassword);
  const [rootPasswordConfirm, setRootPasswordConfirm] = React.useState(currentRootPassword);
  const [isSaving, setIsSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const lastInstanceNameRef = React.useRef<string | null>(null);
  const saveAbortControllerRef = React.useRef<AbortController | null>(null);

  const isDirty = rootPassword !== currentRootPassword;
  const confirmMismatch = rootPassword !== rootPasswordConfirm;

  // Follow the house pattern: a server-side config change resets the draft,
  // but never while the user has unsaved edits.
  React.useEffect(() => {
    const instanceChanged = lastInstanceNameRef.current !== instance.name;

    if (!instanceChanged && isDirty) return;

    lastInstanceNameRef.current = instance.name;
    setRootPassword(currentRootPassword);
    setRootPasswordConfirm(currentRootPassword);
  }, [currentRootPassword, instance.name, isDirty]);

  React.useEffect(() => {
    return () => {
      saveAbortControllerRef.current?.abort();
    };
  }, []);

  const handleCancel = () => {
    setRootPassword(currentRootPassword);
    setRootPasswordConfirm(currentRootPassword);
  };

  const handleSave = async () => {
    if (confirmMismatch) return;

    try {
      setSaveError(null);
      setIsSaving(true);
      saveAbortControllerRef.current?.abort();
      const abortController = new AbortController();
      saveAbortControllerRef.current = abortController;

      const nextUserData = setRootPasswordInUserData(currentUserData, rootPassword);
      if (nextUserData === null) {
        setSaveError(
          `The existing "${CLOUD_INIT_USER_DATA_KEY}" value is not a #cloud-config document, so the root password cannot be added to it. Edit the instance YAML to remove or rewrite it.`,
        );
        return;
      }

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
      await onMutate();
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
          <AlertTitle>Takes effect on next boot</AlertTitle>
          <AlertDescription>
            Cloud-init applies the user-data when the instance boots, so the new
            root password takes effect on the next start.
          </AlertDescription>
        </Alert>

        <Field>
          <FieldLabel htmlFor="instance-root-password">Root Password</FieldLabel>
          <PasswordInput
            id="instance-root-password"
            value={rootPassword}
            onChange={setRootPassword}
            disabled={isSaving}
          />
          <FieldDescription>
            Prefilled from the cloud-init user-data of this instance. Leave it
            empty to remove the root password.
          </FieldDescription>
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
