import { z } from "zod";

export const interfaceLogQuerySchema = z.object({
  system: z.string().optional(),
  apiName: z.string().optional(),
  resultCode: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export type InterfaceLogQuery = z.infer<typeof interfaceLogQuerySchema>;
