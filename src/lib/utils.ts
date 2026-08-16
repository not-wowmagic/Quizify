import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Humanizes a raw AI topic label for display. The generator emits
 * camelCase/PascalCase slugs (e.g. "PhotosynthesisOverview",
 * "Light-DependentReactions") that read poorly in the History charts, so we
 * insert a space before each embedded capital and trim whitespace.
 */
export function formatTopicLabel(topic?: string | null): string {
  if (!topic) return '';
  return topic
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}
