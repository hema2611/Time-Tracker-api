// The only place that knows which AI is in use. Switch with AI_PROVIDER in .env.
// A provider is one file exporting configured() and generateJson({ text, pdf?, schema }).
import config from '../config.js'
import * as gemini from './gemini.js'
import * as proposalSpec from './proposalSpec.js'
import * as assistantSpec from './assistantSpec.js'
import * as inboxSpec from './inboxSpec.js'

const PROVIDERS = { gemini }

export const provider = () => PROVIDERS[config.ai.provider] ? config.ai.provider : null
export const aiReady = () => !!provider() && PROVIDERS[provider()].configured()

export async function readProposal(pdf) {
  const out = await PROVIDERS[provider()].generateJson({ text: proposalSpec.PROMPT, pdf, schema: proposalSpec.SCHEMA })
  return { ...out, provider: provider(), data: proposalSpec.normalize(out.data) }
}

export async function assistantReply(context) {
  const out = await PROVIDERS[provider()].generateJson({ text: assistantSpec.buildPrompt(context), schema: assistantSpec.SCHEMA })
  return { ...out, provider: provider(), data: assistantSpec.normalize(out.data) }
}

export async function readMessages(context) {
  const out = await PROVIDERS[provider()].generateJson({ text: inboxSpec.buildPrompt(context), schema: inboxSpec.SCHEMA })
  return { ...out, provider: provider(), data: inboxSpec.normalize(out.data) }
}

// Message safe to show a user; the raw error goes to the server log and the usage tables.
export const friendlyAiError = err =>
  err?.status === 429 ? 'The AI usage limit is reached for now. Try again later.'
    : err?.status === 503 || err?.status === 500 ? 'The AI service is busy right now. Try again in a minute.'
    : err?.status === 401 || err?.status === 403 ? 'The AI key is not valid. Ask the admin to check the server settings.'
    : 'The AI could not answer this time. Please try again.'
