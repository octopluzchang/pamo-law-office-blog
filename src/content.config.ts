import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.date(),
    cover: z.string().optional(),
    category: z.enum(['chehuo', 'budongchan', 'yichan', 'jiedaigenyi']),
    categoryLabel: z.string(),
    draft: z.boolean().optional().default(false)
  })
});

const cases = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/cases' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional().default(''),
    date: z.date(),
    cover: z.string().optional().default(''),
    amount: z.string(),
    unit: z.string().default('萬'),
    draft: z.boolean().optional().default(false)
  })
});

export const collections = { articles, cases };