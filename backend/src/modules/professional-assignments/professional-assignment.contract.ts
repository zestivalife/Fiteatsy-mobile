import { z } from 'zod';

// PostgreSQL accepts canonical UUID text even when legacy identities do not
// carry an RFC version/variant nibble. These authoritative IDs must round-trip
// unchanged; malformed or non-canonical values remain rejected.
export const postgresUuidSchema = z.string().trim().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  'Must be a canonical PostgreSQL UUID.',
);

export const professionalAssignmentSchema = z.object({
  clientUserId: postgresUuidSchema,
  professionalUserId: postgresUuidSchema,
  professionalType: z.enum(['CONSULTANT', 'PRACTITIONER', 'MENTOR']),
  relationshipType: z.string().trim().min(2).max(80),
  reason: z.string().trim().max(240).optional(),
  allowReassignment: z.boolean().optional().default(false),
}).strict();

export const professionalAssignmentBatchSchema = professionalAssignmentSchema
  .omit({ clientUserId: true })
  .extend({
    clientUserIds: z.array(postgresUuidSchema).min(1).max(100)
      .transform((values) => [...new Set(values)]),
  })
  .strict();

export const assignmentValidationDetails = (error: z.ZodError) => ({
  fieldErrors: error.flatten().fieldErrors,
  formErrors: error.flatten().formErrors,
  issues: error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    code: issue.code,
    message: issue.message,
  })),
});
