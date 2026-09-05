import { z } from 'zod';
import { canonicalHash } from './food-curation/canonical-food-foundation.js';
import { COMPONENT_ROLES, MEAL_HEADS } from './common-food-engine.js';
export const templateComponentSchema = z.object({ semanticRole: z.enum(COMPONENT_ROLES), catalogEntityId: z.string().trim().min(1), servingSelection: z.object({ servingId: z.string().trim().min(1), multiplier: z.number().positive().max(10) }), servingLock: z.boolean(), order: z.number().int().min(0) });
export const templateStructureSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().trim().max(600).optional(), mealHead: z.enum(MEAL_HEADS), mealStructure: z.record(z.string(), z.unknown()).default({}), components: z.array(templateComponentSchema).min(1).max(12).superRefine((items, ctx) => { if (new Set(items.map(x => x.catalogEntityId)).size !== items.length)
        ctx.addIssue({ code: 'custom', message: 'DUPLICATE_TEMPLATE_COMPONENT' }); if (new Set(items.map(x => x.order)).size !== items.length)
        ctx.addIssue({ code: 'custom', message: 'DUPLICATE_COMPONENT_ORDER' }); }), visibility: z.enum(['PRIVATE', 'TEAM']), teamId: z.string().trim().min(1).optional() }).superRefine((value, ctx) => { if (value.visibility === 'TEAM' && !value.teamId)
    ctx.addIssue({ code: 'custom', message: 'TEAM_ID_REQUIRED' }); if (value.visibility === 'PRIVATE' && value.teamId)
    ctx.addIssue({ code: 'custom', message: 'PRIVATE_TEMPLATE_CANNOT_HAVE_TEAM' }); });
export const templateStructureHash = (value) => canonicalHash({ mealHead: value.mealHead, mealStructure: value.mealStructure, components: [...value.components].sort((a, b) => a.order - b.order) });
export const stableTemplateId = (name, actorId) => `TPL_${canonicalHash({ name: name.trim().toLowerCase(), actorId, nonce: crypto.randomUUID() }).slice(0, 24).toUpperCase()}`;
