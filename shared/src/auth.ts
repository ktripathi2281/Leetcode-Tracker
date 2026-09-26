import { z } from 'zod';

// Validation rules shared by the API and the client forms, so both enforce the same limits.

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(30, 'Username must be at most 30 characters')
  .regex(/^[a-zA-Z0-9_-]+$/, 'Username can only use letters, numbers, _ and -');

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email('Enter a valid email'));

// bcrypt only uses the first 72 bytes of a password, so cap it there.
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters');

export const registerSchema = z.object({
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface AuthUser {
  id: string;
  username: string;
  email: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

// ─── Account management ───────────────────────────────────────────────────────

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const forgotPasswordSchema = z.object({ email: emailSchema });
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().trim().min(20, 'This reset link is incomplete').max(200),
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1, 'Enter your password to confirm'),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;

/** How long a password reset link works. */
export const PASSWORD_RESET_MINUTES = 30;
