import { z } from 'zod';
import { tool, zodToJsonSchema } from '@bowenqt/qiniu-ai-sdk/ai-tools';

const weatherTool = tool({
    description: 'Get current weather for a city',
    parameters: z.object({
        city: z.string(),
        unit: z.enum(['c', 'f']).optional(),
    }),
    execute: async ({ city, unit = 'c' }) => ({ city, unit, temp: 22 }),
});

const jsonSchema = zodToJsonSchema(weatherTool.parameters as z.ZodTypeAny);
console.log(jsonSchema);
