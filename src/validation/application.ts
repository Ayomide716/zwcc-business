/**
 * Validation, derived from the form configuration.
 *
 * There is deliberately no hand-written schema per step: a schema is built from
 * `APPLICATION_STEPS` on demand. Adding a question to the config gives it
 * validation automatically, and the rules can never drift from what is
 * rendered.
 */
import { z } from 'zod';

import {
  getStep,
  getVisibleFields,
  type FieldDefinition,
  type FormValues,
  type StepDefinition,
} from '@/config/form.config';

export interface FieldError {
  fieldId: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Nigerian mobile numbers, accepting 0803…, +234803… and 234803… forms. */
const PHONE_PATTERN = /^(\+?234|0)[789]\d{9}$/;

/* -------------------------------------------------------------------------- */
/* Per-field schema                                                            */
/* -------------------------------------------------------------------------- */

function buildFieldSchema(field: FieldDefinition): z.ZodTypeAny {
  const required = field.required === true;

  switch (field.type) {
    case 'acknowledgement':
    case 'checkbox': {
      const schema = z.boolean();
      return required
        ? schema.refine((value) => value === true, {
            message: 'Please confirm this to continue.',
          })
        : schema.optional();
    }

    case 'number':
    case 'currency': {
      let schema = z.number({ message: 'Enter a number.' }).finite();
      if (field.min !== undefined) {
        schema = schema.min(field.min, {
          message:
            field.type === 'currency' && field.min === 1
              ? 'Enter the amount you are requesting.'
              : `Must be ${field.min} or more.`,
        });
      }
      // Grant amount has no configured maximum by design (brief §8).
      if (field.max !== undefined) {
        schema = schema.max(field.max, { message: `Must be ${field.max} or less.` });
      }
      return required
        ? schema
        : schema.nullish().transform((value) => (value === null ? undefined : value));
    }

    case 'date': {
      const schema = z
        .string()
        .refine((value) => !Number.isNaN(new Date(value).getTime()), {
          message: 'Enter a valid date.',
        });
      return required ? schema.min(1, { message: 'This is required.' }) : schema.optional();
    }

    case 'email': {
      const schema = z
        .string()
        .trim()
        .regex(EMAIL_PATTERN, { message: 'Enter a valid email address.' });
      return required ? schema : schema.or(z.literal('')).optional();
    }

    case 'phone': {
      const schema = z
        .string()
        .trim()
        .transform((value) => value.replace(/[\s()-]/g, ''))
        .refine((value) => PHONE_PATTERN.test(value), {
          message: 'Enter a valid Nigerian phone number, e.g. 08031234567.',
        });
      return required ? schema : z.string().trim().optional();
    }

    case 'select':
    case 'radio': {
      const allowed = (field.options ?? []).map((option) => option.value);
      const schema = z.string().refine((value) => allowed.includes(value), {
        message: 'Choose one of the options.',
      });
      return required ? schema : schema.or(z.literal('')).optional();
    }

    case 'text':
    case 'textarea':
    default: {
      let schema = z.string().trim();
      if (required) {
        schema = schema.min(field.minLength ?? 1, {
          message: field.minLength
            ? `Please write at least ${field.minLength} characters.`
            : 'This is required.',
        });
      }
      if (field.maxLength !== undefined) {
        schema = schema.max(field.maxLength, {
          message: `Please keep this under ${field.maxLength} characters.`,
        });
      }
      return required ? schema : schema.optional();
    }
  }
}

/**
 * Schema for one step, given the current answers — `values` matters because
 * conditional fields are only validated while they are visible.
 */
export function buildStepSchema(step: StepDefinition, values: FormValues) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of getVisibleFields(step, values)) {
    shape[field.id] = buildFieldSchema(field);
  }
  return z.object(shape);
}

/* -------------------------------------------------------------------------- */
/* Public API                                                                  */
/* -------------------------------------------------------------------------- */

/** Validate one step. Only fields visible under the current answers are checked. */
export function validateStep(stepId: string, values: FormValues): ValidationResult {
  const step = getStep(stepId);
  if (!step || step.kind !== 'form') return { valid: true, errors: {} };

  const schema = buildStepSchema(step, values);
  const subset: FormValues = {};
  for (const field of getVisibleFields(step, values)) {
    subset[field.id] = values[field.id];
  }

  const result = schema.safeParse(subset);
  if (result.success) return { valid: true, errors: {} };

  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !errors[key]) {
      errors[key] = issue.message;
    }
  }
  return { valid: false, errors };
}

/** Validate a single field in isolation, for on-blur feedback. */
export function validateField(field: FieldDefinition, value: unknown): string | null {
  const result = buildFieldSchema(field).safeParse(value);
  if (result.success) return null;
  return result.error.issues[0]?.message ?? 'This value is not valid.';
}

/** Every form step that does not yet pass validation. */
export function getIncompleteSteps(values: FormValues): string[] {
  const incomplete: string[] = [];
  for (const step of ['personal', 'business', 'grant_request', 'proposal', 'church', 'declaration']) {
    if (!validateStep(step, values).valid) incomplete.push(step);
  }
  return incomplete;
}

/** The `form_complete` workflow guard resolves to this. */
export function isFormComplete(values: FormValues): boolean {
  return getIncompleteSteps(values).length === 0;
}

/* -------------------------------------------------------------------------- */
/* Sanitisation                                                                */
/* -------------------------------------------------------------------------- */

/**
 * C0 and C1 control characters, excluding tab, newline and carriage return
 * so multi-line answers survive intact. Built with RegExp rather than a
 * literal to keep the source file plain ASCII.
 */
const CONTROL_CHARACTERS = new RegExp(
  '[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F-\\u009F]',
  'g',
);

/**
 * Answers are rendered as text (never as HTML) so injection is not a concern
 * here, but stray control characters and unbounded whitespace still make their
 * way in from mobile keyboards and paste. Strip them before persisting.
 */
export function sanitiseFormValues(values: FormValues): FormValues {
  const clean: FormValues = {};

  for (const [key, value] of Object.entries(values)) {
    if (typeof value === 'string') {
      clean[key] = value
        .replace(CONTROL_CHARACTERS, '')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
    } else {
      clean[key] = value;
    }
  }

  return clean;
}
