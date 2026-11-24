// Reads one PDF with the configured AI provider and prints the result. No database writes.
// Run from the project folder:  node scripts/test-ai-read.js docs/Sample_Proposal_Inventory_Billing.pdf
import fs from 'node:fs'
import config from '../src/config.js'
import { aiReady, provider, readProposal } from '../src/ai/index.js'

const file = process.argv[2]
if (!file) { console.log('usage: node scripts/test-ai-read.js <file.pdf>'); process.exit(1) }
console.log('provider:', provider() || '(none)', '| model:', config.ai.geminiModel, '| key set:', aiReady())
if (!aiReady()) process.exit(1)

const t = Date.now()
try {
  const out = await readProposal(fs.readFileSync(file))
  console.log(`ok in ${((Date.now() - t) / 1000).toFixed(1)}s | tokens in/out: ${out.inputTokens}/${out.outputTokens}`)
  console.log(JSON.stringify(out.data, null, 1))
} catch (e) {
  console.log('FAILED | status:', e?.status, '|', String(e?.message || e).slice(0, 600))
  process.exit(1)
}
