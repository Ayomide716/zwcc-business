/**
 * Renders one `FieldDefinition` from the form configuration.
 *
 * This component is why adding a question to `form.config.ts` needs no screen
 * change: the step screen maps over its fields and hands each one here.
 */
import { useCallback } from 'react';

import { Checkbox, RadioGroup, Select } from '@/components/ui/Choice';
import { TextField } from '@/components/ui/TextField';
import type { FieldDefinition } from '@/config/form.config';
import { GRANT_PROGRAM } from '@/config/program.config';
import { formatCurrencyInput, parseCurrencyInput } from '@/lib/format';

export interface FormFieldRendererProps {
  field: FieldDefinition;
  value: unknown;
  error?: string;
  onChange: (value: unknown) => void;
  disabled?: boolean;
}

export function FormFieldRenderer({
  field,
  value,
  error,
  onChange,
  disabled,
}: FormFieldRendererProps) {
  const asString = typeof value === 'string' ? value : '';

  const handleCurrencyChange = useCallback(
    (text: string) => {
      // Store a number; display a grouped string. Doing the conversion here
      // means validation and the database only ever see a number.
      onChange(parseCurrencyInput(text));
    },
    [onChange],
  );

  switch (field.type) {
    case 'acknowledgement':
    case 'checkbox':
      return (
        <Checkbox
          label={field.label}
          checked={value === true}
          onChange={onChange}
          error={error}
          required={field.required}
        />
      );

    case 'radio':
      return (
        <RadioGroup
          label={field.label}
          options={field.options ?? []}
          value={asString}
          onChange={onChange}
          required={field.required}
          error={error}
          helpText={field.helpText}
        />
      );

    case 'select':
      return (
        <Select
          label={field.label}
          options={field.options ?? []}
          value={asString}
          onChange={onChange}
          required={field.required}
          error={error}
          helpText={field.helpText}
          placeholder={field.placeholder ?? 'Select an option'}
        />
      );

    case 'currency':
      return (
        <TextField
          label={field.label}
          value={typeof value === 'number' ? formatCurrencyInput(String(value)) : ''}
          onChangeText={handleCurrencyChange}
          keyboardType="number-pad"
          inputMode="numeric"
          prefix={GRANT_PROGRAM.currencySymbol}
          placeholder="0"
          required={field.required}
          error={error}
          helpText={field.helpText}
          editable={!disabled}
        />
      );

    case 'number':
      return (
        <TextField
          label={field.label}
          value={typeof value === 'number' ? String(value) : ''}
          onChangeText={(text) => {
            const digits = text.replace(/[^\d]/g, '');
            onChange(digits ? Number.parseInt(digits, 10) : null);
          }}
          keyboardType="number-pad"
          inputMode="numeric"
          placeholder={field.placeholder}
          required={field.required}
          error={error}
          helpText={field.helpText}
          editable={!disabled}
        />
      );

    case 'date':
      return (
        <TextField
          label={field.label}
          value={asString}
          onChangeText={onChange}
          placeholder="YYYY-MM-DD"
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          required={field.required}
          error={error}
          helpText={field.helpText ?? 'Enter as YYYY-MM-DD, for example 1990-04-23.'}
          editable={!disabled}
        />
      );

    case 'email':
      return (
        <TextField
          label={field.label}
          value={asString}
          onChangeText={onChange}
          keyboardType="email-address"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          placeholder={field.placeholder}
          required={field.required}
          error={error}
          helpText={field.helpText}
          editable={!disabled}
        />
      );

    case 'phone':
      return (
        <TextField
          label={field.label}
          value={asString}
          onChangeText={onChange}
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          placeholder={field.placeholder ?? '080 0000 0000'}
          required={field.required}
          error={error}
          helpText={field.helpText}
          editable={!disabled}
        />
      );

    case 'textarea':
      return (
        <TextField
          label={field.label}
          value={asString}
          onChangeText={onChange}
          rows={field.rows ?? 4}
          maxLength={field.maxLength}
          showCounter={Boolean(field.maxLength)}
          placeholder={field.placeholder}
          required={field.required}
          error={error}
          helpText={field.helpText}
          autoCapitalize={field.autoCapitalize ?? 'sentences'}
          editable={!disabled}
        />
      );

    case 'text':
    default:
      return (
        <TextField
          label={field.label}
          value={asString}
          onChangeText={onChange}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          required={field.required}
          error={error}
          helpText={field.helpText}
          autoCapitalize={field.autoCapitalize ?? 'sentences'}
          editable={!disabled}
        />
      );
  }
}
