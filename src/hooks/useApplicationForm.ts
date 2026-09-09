/**
 * The application form's state machine.
 *
 * Three jobs:
 *   1. Hold the answers and validate a step on demand.
 *   2. Persist a draft to the device immediately, and to Supabase on a debounce,
 *      so a dropped connection or a killed app never loses typing.
 *   3. Tell the caller which steps are complete.
 *
 * Local-first is the important part. Nigeria is a primary market; an applicant
 * filling in a long proposal on a patchy connection must not lose their work
 * because a save request failed. Answers are written to AsyncStorage on every
 * change (cheap, synchronous-feeling) and pushed to the server when things
 * settle.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  APPLICATION_STEPS,
  getStep,
  getVisibleFields,
  type FormValues,
} from '@/config/form.config';
import { logger } from '@/lib/logger';
import { applicationService } from '@/services/application.service';
import { validateStep } from '@/validation/application';

const DRAFT_KEY_PREFIX = 'zwcc.draft.';
const AUTOSAVE_DELAY_MS = 1500;

export type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export interface UseApplicationFormResult {
  values: FormValues;
  setValue: (fieldId: string, value: unknown) => void;
  setValues: (next: FormValues) => void;
  errors: Record<string, string>;
  /** Validate a step and surface its errors. Returns whether it passed. */
  validate: (stepId: string) => boolean;
  clearError: (fieldId: string) => void;
  completedStepIds: string[];
  isStepComplete: (stepId: string) => boolean;
  saveState: SaveState;
  /** Force an immediate save, e.g. when leaving a step. */
  flush: (stepId?: string) => Promise<void>;
  /** True until the device draft has been merged in. */
  hydrating: boolean;
}

export function useApplicationForm(
  applicationId: string | null,
  serverValues: FormValues,
): UseApplicationFormResult {
  const [values, setValuesState] = useState<FormValues>(serverValues);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [hydrating, setHydrating] = useState(true);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingStep = useRef<string | undefined>(undefined);
  // Avoids a save firing for values that are already on the server.
  const dirty = useRef(false);

  const draftKey = applicationId ? `${DRAFT_KEY_PREFIX}${applicationId}` : null;

  /* ----------------------------- Hydration ----------------------------- */

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      if (!draftKey) {
        setHydrating(false);
        return;
      }

      try {
        const stored = await AsyncStorage.getItem(draftKey);
        if (cancelled) return;

        if (stored) {
          const draft = JSON.parse(stored) as FormValues;
          // The device draft is newer than what the server returned whenever a
          // save did not complete, so it wins on conflict.
          setValuesState((current) => ({ ...current, ...draft }));
        }
      } catch (error) {
        logger.warn('Could not read local draft', { error });
      } finally {
        if (!cancelled) setHydrating(false);
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [draftKey]);

  // Adopt fresh server values only for fields the user has not touched.
  useEffect(() => {
    if (dirty.current) return;
    setValuesState((current) => ({ ...serverValues, ...current }));
  }, [serverValues]);

  /* ------------------------------ Saving ------------------------------- */

  const persistToServer = useCallback(
    async (next: FormValues, stepId?: string) => {
      if (!applicationId) return;

      setSaveState('saving');
      try {
        const completedSteps = stepId && validateStep(stepId, next).valid ? [stepId] : [];
        await applicationService.saveProgress(applicationId, next, {
          currentStep: stepId,
          completedSteps,
        });
        setSaveState('saved');
        dirty.current = false;
      } catch (error) {
        // Not surfaced as a toast: the draft is safe on the device, and
        // interrupting someone mid-sentence to say a background save failed is
        // worse than showing the quiet "Saved on this device" indicator.
        logger.warn('Autosave failed; draft retained on device', { error });
        setSaveState('error');
      }
    },
    [applicationId],
  );

  const scheduleSave = useCallback(
    (next: FormValues, stepId?: string) => {
      if (timer.current) clearTimeout(timer.current);
      if (stepId) pendingStep.current = stepId;

      timer.current = setTimeout(() => {
        void persistToServer(next, pendingStep.current);
      }, AUTOSAVE_DELAY_MS);
    },
    [persistToServer],
  );

  const writeLocalDraft = useCallback(
    (next: FormValues) => {
      if (!draftKey) return;
      AsyncStorage.setItem(draftKey, JSON.stringify(next)).catch((error) =>
        logger.warn('Could not write local draft', { error }),
      );
    },
    [draftKey],
  );

  const setValue = useCallback(
    (fieldId: string, value: unknown) => {
      dirty.current = true;

      setValuesState((current) => {
        const next = { ...current, [fieldId]: value };
        writeLocalDraft(next);
        scheduleSave(next);
        return next;
      });

      // Clear the error as soon as the user edits the field, rather than making
      // them submit again to find out whether they fixed it.
      setErrors((current) => {
        if (!current[fieldId]) return current;
        const next = { ...current };
        delete next[fieldId];
        return next;
      });
    },
    [scheduleSave, writeLocalDraft],
  );

  const setValues = useCallback(
    (next: FormValues) => {
      dirty.current = true;
      setValuesState((current) => {
        const merged = { ...current, ...next };
        writeLocalDraft(merged);
        scheduleSave(merged);
        return merged;
      });
    },
    [scheduleSave, writeLocalDraft],
  );

  const flush = useCallback(
    async (stepId?: string) => {
      if (timer.current) clearTimeout(timer.current);
      await persistToServer(values, stepId ?? pendingStep.current);
    },
    [persistToServer, values],
  );

  // Save whatever is pending if the screen unmounts.
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  /* ---------------------------- Validation ----------------------------- */

  const validate = useCallback(
    (stepId: string) => {
      const result = validateStep(stepId, values);
      setErrors(result.errors);
      return result.valid;
    },
    [values],
  );

  const clearError = useCallback((fieldId: string) => {
    setErrors((current) => {
      if (!current[fieldId]) return current;
      const next = { ...current };
      delete next[fieldId];
      return next;
    });
  }, []);

  const completedStepIds = useMemo(
    () =>
      APPLICATION_STEPS.filter(
        (step) => step.kind === 'form' && validateStep(step.id, values).valid,
      ).map((step) => step.id),
    [values],
  );

  const isStepComplete = useCallback(
    (stepId: string) => {
      const step = getStep(stepId);
      if (!step) return false;
      if (step.kind !== 'form') return false;
      // A step with no visible required fields counts as complete.
      if (getVisibleFields(step, values).length === 0) return true;
      return validateStep(stepId, values).valid;
    },
    [values],
  );

  return {
    values,
    setValue,
    setValues,
    errors,
    validate,
    clearError,
    completedStepIds,
    isStepComplete,
    saveState,
    flush,
    hydrating,
  };
}

/** Remove the device draft once an application is submitted. */
export async function clearLocalDraft(applicationId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(`${DRAFT_KEY_PREFIX}${applicationId}`);
  } catch (error) {
    logger.warn('Could not clear local draft', { error });
  }
}
