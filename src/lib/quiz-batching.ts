/** Splits large client requests so each Netlify action stays independently bounded. */
export const CLIENT_GENERATION_BATCH_SIZE = 10;

export function splitQuestionCount(total: number, batchSize = CLIENT_GENERATION_BATCH_SIZE): number[] {
  const batches: number[] = [];
  for (let remaining = total; remaining > 0; remaining -= batchSize) {
    batches.push(Math.min(batchSize, remaining));
  }
  return batches;
}
