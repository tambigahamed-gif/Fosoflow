import { z } from 'zod';

const productId = z.string().uuid();
const productTask = z.object({ task: z.enum(['product_description', 'listing_improvement', 'price_suggestion']), productId }).strict();
const salesTask = z.object({ task: z.literal('sales_stock_analysis'), productId: productId.optional() }).strict();
const genericTask = z.object({ task: z.enum(['recommendation', 'alert', 'daily_summary', 'weekly_summary']) }).strict();

export const intelligenceRequestSchema = z.discriminatedUnion('task', [
  productTask,
  salesTask,
  genericTask,
]);

export type IntelligenceRequest = z.infer<typeof intelligenceRequestSchema>;
export type IntelligenceTask = IntelligenceRequest['task'];

export const TASKS: readonly IntelligenceTask[] = [
  'product_description',
  'listing_improvement',
  'price_suggestion',
  'sales_stock_analysis',
  'recommendation',
  'alert',
  'daily_summary',
  'weekly_summary',
];
