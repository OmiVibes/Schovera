import { z } from 'zod';

export const accountInput = z
  .object({
    requestId: z.string().uuid(),
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email().max(254),
    password: z
      .string()
      .min(12)
      .max(128)
      .regex(/[a-z]/)
      .regex(/[A-Z]/)
      .regex(/[0-9]/)
      .regex(/[^A-Za-z0-9]/),
    role: z.enum(['parent', 'teacher', 'principal']),
    classIds: z.array(z.string().uuid()).max(50),
    childIds: z.array(z.string().uuid()).max(50),
    confirmPrincipal: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    const invalid =
      value.role === 'parent'
        ? !value.childIds.length || value.classIds.length > 0
        : value.role === 'teacher'
          ? !value.classIds.length || value.childIds.length > 0
          : !value.confirmPrincipal ||
            value.classIds.length > 0 ||
            value.childIds.length > 0;
    if (
      invalid ||
      new Set(value.classIds).size !== value.classIds.length ||
      new Set(value.childIds).size !== value.childIds.length
    )
      context.addIssue({
        code: 'custom',
        message: 'Choose the correct school relationships for this role.',
      });
  });
export type AccountInput = z.infer<typeof accountInput>;

// Passwords are deliberately excluded: a retry never changes an existing password.
export function accountPayload(input: AccountInput) {
  return {
    name: input.name,
    email: input.email,
    role: input.role,
    classIds: [...input.classIds].sort(),
    childIds: [...input.childIds].sort(),
    confirmPrincipal: input.confirmPrincipal,
  };
}
