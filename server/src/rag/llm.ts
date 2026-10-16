import { config } from '../config.js';
import { getSettings } from '../store/db.js';

let chat: any = null;

/** True when an OpenAI-compatible key is configured and generation via LLM is enabled. */
export function llmEnabled() {
  return !!config.openaiApiKey && getSettings().useLlm;
}

async function client(json = false) {
  const { ChatOpenAI } = await import('@langchain/openai');
  if (!chat || json) {
    const c = new ChatOpenAI({
      apiKey: config.openaiApiKey,
      model: config.chatModel,
      temperature: 0,
      ...(config.openaiBaseUrl ? { configuration: { baseURL: config.openaiBaseUrl } } : {}),
      ...(json ? { modelKwargs: { response_format: { type: 'json_object' } } } : {}),
    });
    if (json) return c;
    chat = c;
  }
  return chat;
}

export async function streamChat(system: string, user: string, onToken: (t: string) => void) {
  const c = await client();
  let full = '';
  const stream = await c.stream([
    ['system', system],
    ['human', user],
  ]);
  for await (const part of stream) {
    const t = typeof part.content === 'string' ? part.content : '';
    if (t) { full += t; onToken(t); }
  }
  return full;
}

export async function jsonChat<T>(system: string, user: string): Promise<T> {
  const c = await client(true);
  const res = await c.invoke([
    ['system', `${system}\nRespond with a single JSON object only.`],
    ['human', user],
  ]);
  const text = typeof res.content === 'string' ? res.content : JSON.stringify(res.content);
  return JSON.parse(text.replace(/^```json\s*|```$/g, '')) as T;
}
