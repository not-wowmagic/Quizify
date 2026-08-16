import { describe, it, expect } from 'vitest';
import { formatTopicLabel } from '@/lib/utils';

describe('formatTopicLabel', () => {
  it('inserts spaces into camelCase/PascalCase AI topic slugs', () => {
    expect(formatTopicLabel('PhotosynthesisOverview')).toBe('Photosynthesis Overview');
    expect(formatTopicLabel('Light-DependentReactions')).toBe('Light-Dependent Reactions');
    expect(formatTopicLabel('PhotosyntheticOrganisms')).toBe('Photosynthetic Organisms');
    expect(formatTopicLabel('Calvin Cycle')).toBe('Calvin Cycle');
  });

  it('handles empty, null, and whitespace-only input', () => {
    expect(formatTopicLabel('')).toBe('');
    expect(formatTopicLabel(undefined)).toBe('');
    expect(formatTopicLabel(null)).toBe('');
    expect(formatTopicLabel('   ')).toBe('');
  });

  it('does not break acronyms or single words', () => {
    expect(formatTopicLabel('DNA')).toBe('DNA');
    expect(formatTopicLabel('Chloroplasts')).toBe('Chloroplasts');
  });

  it('collapses multiple internal spaces and trims edges', () => {
    expect(formatTopicLabel('  Cell   Division  ')).toBe('Cell Division');
    expect(formatTopicLabel('Cell\tDivision')).toBe('Cell Division');
  });

  it('handles consecutive capitals as part of acronym runs', () => {
    expect(formatTopicLabel('USHistory')).toBe('USHistory');
    expect(formatTopicLabel('HTTPRequests')).toBe('HTTPRequests');
    expect(formatTopicLabel('WorldWarII')).toBe('World War II');
  });

  it('leaves already-space-separated input unchanged except collapsing whitespace', () => {
    expect(formatTopicLabel('Cellular Respiration')).toBe('Cellular Respiration');
    expect(formatTopicLabel('The French Revolution')).toBe('The French Revolution');
  });

  it('handles digits at word boundaries', () => {
    expect(formatTopicLabel('Chapter12Review')).toBe('Chapter12 Review');
  });
});
