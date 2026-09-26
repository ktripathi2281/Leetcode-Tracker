import { useState, type ChangeEvent, type FormEvent } from 'react';
import { z } from 'zod';
import { getErrorMessage } from '../api/client';

/**
 * Form state validated with a shared zod schema before submitting.
 * Field errors show under inputs; server errors show as one form-level message.
 */
export function useForm<K extends string, T>(
  schema: z.ZodType<T>,
  initial: Record<K, string>,
  onValid: (data: T) => Promise<void>,
) {
  const [values, setValues] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const field = (name: K) => ({
    name,
    value: values[name],
    error: errors[name],
    onChange: (e: ChangeEvent<HTMLInputElement>) => {
      setValues((v) => ({ ...v, [name]: e.target.value }));
      setErrors((errs) => ({ ...errs, [name]: undefined }));
    },
  });

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setFormError('');

    const result = schema.safeParse(values);
    if (!result.success) {
      const fieldErrors = z.flattenError(result.error).fieldErrors as Record<string, string[] | undefined>;
      const firstErrors: Partial<Record<K, string>> = {};
      for (const key of Object.keys(initial) as K[]) firstErrors[key] = fieldErrors[key]?.[0];
      setErrors(firstErrors);
      return;
    }

    setSubmitting(true);
    try {
      await onValid(result.data);
    } catch (err) {
      setFormError(getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return { field, handleSubmit, formError, submitting };
}
