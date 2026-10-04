import React from 'react';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiFieldPassword,
  EuiFlexGroup,
  EuiFlexItem,
  EuiTextArea,
} from '@elastic/eui';

export type SecretAction = 'keep' | 'replace' | 'remove';

export interface SecretState {
  action: SecretAction;
  value: string;
}

export const initialSecret = (): SecretState => ({ action: 'keep', value: '' });

/** undefined = keep, null = remove, string = replace (matches the server patch contract). */
export const secretPatch = (s: SecretState): string | null | undefined =>
  s.action === 'remove' ? null : s.action === 'replace' && s.value.trim() ? s.value : undefined;

interface Props {
  isSet: boolean;
  state: SecretState;
  onChange: (s: SecretState) => void;
  placeholder: string;
  multiline?: boolean;
  configuredText?: React.ReactNode;
}

/**
 * Write-only secret input: the stored value is never sent back to the browser, so the admin can only
 * see that it is configured, replace it, or remove it.
 */
export const SecretField = ({
  isSet,
  state,
  onChange,
  placeholder,
  multiline,
  configuredText,
}: Props) => {
  if (isSet && state.action === 'keep') {
    return (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false} wrap>
        <EuiFlexItem grow={false}>
          <EuiBadge color="success" iconType="lock">
            Configured
          </EuiBadge>
        </EuiFlexItem>
        {configuredText && <EuiFlexItem grow={false}>{configuredText}</EuiFlexItem>}
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="xs"
            iconType="pencil"
            onClick={() => onChange({ action: 'replace', value: '' })}
          >
            Replace
          </EuiButtonEmpty>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="xs"
            color="danger"
            iconType="trash"
            onClick={() => onChange({ action: 'remove', value: '' })}
          >
            Remove
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
  if (state.action === 'remove') {
    return (
      <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiBadge color="danger">Will be removed when you save</EuiBadge>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty size="xs" onClick={() => onChange(initialSecret())}>
            Undo
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
  const set = (value: string) => onChange({ action: 'replace', value });
  return (
    <EuiFlexGroup gutterSize="s" alignItems="flexStart" responsive={false}>
      <EuiFlexItem>
        {multiline ? (
          <EuiTextArea
            fullWidth
            rows={5}
            placeholder={placeholder}
            value={state.value}
            onChange={(e) => set(e.target.value)}
            className="swordMono"
            spellCheck={false}
            autoComplete="off"
          />
        ) : (
          <EuiFieldPassword
            fullWidth
            type="dual"
            placeholder={placeholder}
            value={state.value}
            onChange={(e) => set(e.target.value)}
            autoComplete="new-password"
          />
        )}
      </EuiFlexItem>
      {isSet && (
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty size="s" onClick={() => onChange(initialSecret())}>
            Cancel
          </EuiButtonEmpty>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
