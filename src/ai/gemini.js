import { GoogleGenAI } from '@google/genai'
import config from '../config.js'

let client
export const configured = () => !!config.ai.geminiKey

// A user is waiting on this, so no single attempt may run longer than the timeout.
const withTimeout = (promise, seconds, model) => Promise.race([
  promise,
  new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error(`${model} did not answer within ${seconds}s`), { status: 503 })), seconds * 1000).unref()),
])

async function callModel(model, content, schema) {
  client ||= new GoogleGenAI({ apiKey: config.ai.geminiKey })
  const out = await withTimeout(client.interactions.create({
    model,
    input: [{ type: 'user_input', content }],
    response_format: { type: 'text', mime_type: 'application/json', schema },
  }), config.ai.timeoutSeconds, model)
  if (!out.output_text) throw new Error('The AI returned no answer.')
  return {
    data: JSON.parse(out.output_text),
    model,
    inputTokens: out.usage?.total_input_tokens ?? null,
    outputTokens: out.usage?.total_output_tokens ?? null,
  }
}

// Sends text (and optionally a PDF) and gets JSON back in the given schema.
// The free tier is often busy (503) or rate-limited (429). When that happens, try the fallback model once.
export async function generateJson({ text, pdf, schema }) {
  const content = [...(pdf ? [{ type: 'document', data: pdf.toString('base64'), mime_type: 'application/pdf' }] : []), { type: 'text', text }]
  try {
    return await callModel(config.ai.geminiModel, content, schema)
  } catch (err) {
    const fallback = config.ai.geminiFallbackModel
    if (!fallback || fallback === config.ai.geminiModel || ![429, 500, 503].includes(err?.status)) throw err
    console.warn(`gemini: ${config.ai.geminiModel} failed with ${err.status}, trying ${fallback}`)
    return await callModel(fallback, content, schema)
  }
}
