import { config } from 'dotenv';
config();

import '@/ai/flows/generate-quiz.ts';
import '@/ai/flows/generate-distractors.ts';
import '@/ai/flows/generate-explanation.ts';
import '@/ai/flows/generate-summary.ts';
