export interface GeminiOptions {
  systemInstruction?: string;
  jsonMode?: boolean;
}

export class GeminiAPIError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
    this.name = 'GeminiAPIError';
  }
}

/**
 * Extract the first complete, balanced JSON object (or array) from a string.
 * Handles strings, escapes, and brackets balancing.
 */
export function extractJSON(str: string): any {
  const start = str.indexOf('{');
  const startArray = str.indexOf('[');
  
  let startIndex = -1;
  let openChar = '{';
  let closeChar = '}';
  
  if (start !== -1 && startArray !== -1) {
    if (start < startArray) {
      startIndex = start;
      openChar = '{';
      closeChar = '}';
    } else {
      startIndex = startArray;
      openChar = '[';
      closeChar = ']';
    }
  } else if (start !== -1) {
    startIndex = start;
    openChar = '{';
    closeChar = '}';
  } else if (startArray !== -1) {
    startIndex = startArray;
    openChar = '[';
    closeChar = ']';
  }
  
  if (startIndex === -1) {
    throw new Error('No valid JSON structure (object or array) found in response.');
  }

  // Try direct parsing from startIndex to last index of closeChar
  try {
    const endPos = str.lastIndexOf(closeChar);
    if (endPos > startIndex) {
      const candidate = str.substring(startIndex, endPos + 1);
      return JSON.parse(candidate);
    }
  } catch {
    // Fall back to scanning for brace/bracket balance
  }

  let braceCount = 0;
  let inString = false;
  let escape = false;

  for (let i = startIndex; i < str.length; i++) {
    const char = str[i];

    if (escape) {
      escape = false;
      continue;
    }

    if (char === '\\') {
      escape = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (!inString) {
      if (char === openChar) {
        braceCount++;
      } else if (char === closeChar) {
        braceCount--;
        if (braceCount === 0) {
          const candidate = str.substring(startIndex, i + 1);
          try {
            return JSON.parse(candidate);
          } catch (e: any) {
            throw new Error(`Failed to parse extracted JSON structure: ${e.message}. Content: ${candidate}`);
          }
        }
      }
    }
  }

  throw new Error('No balanced JSON structure found in the response.');
}

async function fetchWithRetry(url: string, body: any, retries = 2, delay = 1000): Promise<any> {
  const timeoutMs = 15000; // 15s timeout — quiz generation needs time for JSON output

  for (let i = 0; i <= retries; i++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        return await res.json();
      }

      const txt = await res.text();
      // Retry on transient status codes (429 Rate Limit, 5xx server issues)
      if ((res.status === 429 || res.status >= 500) && i < retries) {
        console.warn(`Gemini API returned status ${res.status}. Retrying in ${delay}ms (attempt ${i + 1}/${retries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2;
        continue;
      }

      throw new GeminiAPIError(`Gemini API error ${res.status}: ${txt}`, res.status);
    } catch (err: any) {
      clearTimeout(timeoutId);

      if (err instanceof GeminiAPIError) {
        throw err;
      }

      const isTimeout = err.name === 'AbortError';
      const errorMessage = isTimeout ? `Request timed out after ${timeoutMs}ms` : err.message;

      if (i === retries) {
        throw new GeminiAPIError(`Failed to contact Gemini API: ${errorMessage}`);
      }

      console.warn(`Request failed (${errorMessage}). Retrying in ${delay}ms (attempt ${i + 1}/${retries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
}

function getResponseText(data: any): string {
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!content) {
    const candidate = data?.candidates?.[0];
    if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
      throw new Error(`Gemini API failed to generate complete response. Finish reason: ${candidate.finishReason}`);
    }
    if (data?.promptFeedback?.blockReason) {
      throw new Error(`Gemini API request was blocked: ${data.promptFeedback.blockReason}`);
    }
    throw new Error(`Gemini API returned no content. Response payload: ${JSON.stringify(data)}`);
  }
  
  return String(content);
}

export async function callGemini(prompt: string, options: GeminiOptions = {}) {
  const primaryKey = process.env.GEMINI_API_KEY;
  const fallbackKey = process.env.GEMINI_API_KEY_FALLBACK;

  if (!primaryKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set. Please set it in your environment (e.g. Netlify dashboard or local .env.local file).');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';
  const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${primaryKey}`;

  const body: any = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ],
    generationConfig: {}
  };

  if (options.jsonMode) {
    body.generationConfig.responseMimeType = 'application/json';
  }

  if (options.systemInstruction) {
    body.systemInstruction = {
      parts: [
        {
          text: options.systemInstruction
        }
      ]
    };
  }

  try {
    const data = await fetchWithRetry(url, body);
    return getResponseText(data);
  } catch (err: any) {
    const isRateLimit = err instanceof GeminiAPIError && (err.status === 429 || err.status === 403);
    
    if (isRateLimit && fallbackKey) {
      console.warn(`Primary Gemini API Key was rate-limited/refused (${err.status}). Trying with fallback API key...`);
      const fallbackUrl = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${fallbackKey}`;
      try {
        const data = await fetchWithRetry(fallbackUrl, body);
        return getResponseText(data);
      } catch (fallbackErr: any) {
        console.error('Fallback Gemini API execution error:', fallbackErr);
        throw fallbackErr;
      }
    }

    console.error('Gemini API execution error:', err);
    throw err;
  }
}
