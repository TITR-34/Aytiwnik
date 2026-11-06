import { config } from './config';

// Text-only fallback used when Gemini is overloaded (503). Groq models cannot read images/PDF files.
export const groqEnabled = () => !!config.GROQ_API_KEY && !!config.GROQ_MODEL;

export async function groqJson(system: string, user: string): Promise<any> {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.GROQ_API_KEY}` },
    body: JSON.stringify({
      model: config.GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
    }),
  });
  if (!res.ok) { console.error('Groq error', res.status); throw new Error('groq ' + res.status); }
  const data: any = await res.json();
  return JSON.parse(data.choices?.[0]?.message?.content ?? '{}');
}
