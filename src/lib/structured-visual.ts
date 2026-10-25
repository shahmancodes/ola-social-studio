import {z} from 'zod';

/** Shared editable label/detail contract for copy generation, repair and layout. */
export const StructuredVisualSchema=z.object({
 kind:z.enum(['checklist','process','comparison','example']),
 items:z.array(z.object({label:z.string().min(1).max(72),detail:z.string().max(150)})).min(1).max(4),
});
