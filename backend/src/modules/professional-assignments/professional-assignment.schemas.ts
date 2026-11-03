import { z } from 'zod';

// Fiteatsy application identities predate UUID-only IDs. Governed external
// consultant accounts are persisted as `ext_<uuid>` in users.id and are valid
// assignment principals. Keep this intentionally narrower than arbitrary text.
export const applicationUserIdSchema = z.string().trim().refine(
  (value) => z.string().uuid().safeParse(value).success || /^ext_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value),
  { message: 'Expected a UUID or governed external consultant identity.' },
);

export const professionalAssignmentSchema = z.object({
  clientUserId: applicationUserIdSchema,
  professionalUserId: applicationUserIdSchema,
  professionalType: z.enum(['CONSULTANT', 'PRACTITIONER', 'MENTOR']),
  relationshipType: z.string().trim().min(2).max(80),
  reason: z.string().trim().max(240).optional(),
  allowReassignment: z.boolean().optional().default(false),
}).strict();

export const professionalAssignmentBatchSchema = professionalAssignmentSchema
  .omit({ clientUserId: true })
  .extend({
    clientUserIds: z.array(applicationUserIdSchema).min(1).max(100).transform((values) => [...new Set(values)]),
  })
  .strict();
