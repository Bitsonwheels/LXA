'use client';

import * as React from 'react';
import { EyeIcon, EyeOffIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Password input with a reveal toggle. Used by the create wizard and the
 * security dialog so both behave identically.
 */
export function PasswordInput({
  id,
  value,
  onChange,
  placeholder = '••••••••',
  autoComplete = 'new-password',
  disabled,
  onBlur,
  'aria-describedby': ariaDescribedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  onBlur?: () => void;
  'aria-describedby'?: string;
}) {
  const [visible, setVisible] = React.useState(false);

  return (
    <div className="relative w-full max-w-md">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        placeholder={placeholder}
        autoComplete={autoComplete}
        disabled={disabled}
        onBlur={onBlur}
        aria-describedby={ariaDescribedBy}
        onChange={(event) => onChange(event.target.value)}
        className="pr-10 text-sm"
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute top-0 right-0 h-full px-3 hover:bg-transparent"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? `Hide ${id}` : `Show ${id}`}
        tabIndex={-1}
      >
        {visible ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </Button>
    </div>
  );
}
