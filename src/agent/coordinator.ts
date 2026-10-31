import fs from 'node:fs'
import path from 'node:path'
import { tinyFish, type SearchResult } from '../services/tinyfish.js'
import { antigravityTransport } from '../antigravity/transport.js'
import { agentMemory, type VisitedWebsite } from './memory.js'

export interface ProposedFileEdit {
  filePath: string
  reasoning: string
  newContent: string
  originalContent?: string
}

export interface DualAgentResult {
  reasoningText: string
  visitedWebsites: VisitedWebsite[]
  proposedEdit?: ProposedFileEdit
  usage?: { totalTokenCount: number } | null
}

export interface CoordinatorStep {
  mode: 'search' | 'browse' | 'fetch' | 'agent' | 'context' | 'reasoning'
  title: string
  details?: string
}

export interface CoordinatorOptions {
  model: string
  conversationHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }>
  signal?: AbortSignal
  onStep?: (step: CoordinatorStep) => void
  onVisitingWebsite?: (site: { url: string; title?: string }) => void
  onResearchSnippet?: (snippet: string) => void
  onStatusUpdate?: (status: string) => void
}

/**
 * Checks if a user prompt warrants web research.
 */
function shouldPerformResearch(prompt: string): boolean {
  const p = prompt.trim().toLowerCase()
  // Casual greetings don't need web research
  if (['hi', 'hello', 'hey', 'help', 'thanks', 'clear'].includes(p)) {
    return false
  }
  return true
}

/**
 * Extracts proposed file edit block from Antigravity output.
 */
function extractFileEdit(text: string): { cleanedText: string; edit?: ProposedFileEdit } {
  const markerRegex = /<<<FILE_EDIT>>>\s*(?:PATH|FILE):\s*([^\r\n]+)\s*REASON:\s*([^\r\n]+)\s*(?:CONTENT:)?\s*([\s\S]*?)<<<END_FILE_EDIT>>>/i
  const match = text.match(markerRegex)

  if (!match) {
    return { cleanedText: text }
  }

  const rawPath = match[1]?.trim() || ''
  const reasoning = match[2]?.trim() || ''
  const newContent = match[3]?.replace(/^\n+|\n+$/g, '') || ''

  // Normalize path relative to cwd if not absolute
  const targetPath = path.isAbsolute(rawPath) ? rawPath : path.resolve(process.cwd(), rawPath)

  let originalContent: string | undefined
  try {
    if (fs.existsSync(targetPath)) {
      originalContent = fs.readFileSync(targetPath, 'utf8')
    }
  } catch {}

  const cleanedText = text.replace(markerRegex, '').trim()

  return {
    cleanedText,
    edit: {
      filePath: rawPath,
      reasoning,
      newContent,
      originalContent,
    },
  }
}

/**
 * Executes a collaborative task combining Tiny Fish (Web Research) & Antigravity (Coding Agent).
 */
export async function runDualAgentWorkflow(
  userPrompt: string,
  options: CoordinatorOptions
): Promise<DualAgentResult> {
  const { model, conversationHistory, signal, onStep, onVisitingWebsite } = options
  const visitedThisTurn: VisitedWebsite[] = []

  // Check if aborted before starting
  if (signal?.aborted) {
    throw new Error('Operation aborted by user.')
  }

  // Phase 1: Tiny Fish (Web Exploration & Research Agent)
  if (shouldPerformResearch(userPrompt)) {
    onStep?.({
      mode: 'search',
      title: 'Tiny Fish Search Mode',
      details: `Searching web index for: "${userPrompt.slice(0, 70)}"`,
    })

    try {
      // Formulate concise search query
      const searchRes = await tinyFish.search(userPrompt)
      const topResults = (searchRes.results || []).slice(0, 2)

      for (const res of topResults) {
        if (signal?.aborted) throw new Error('Operation aborted by user.')

        onVisitingWebsite?.({ url: res.url, title: res.title })

        onStep?.({
          mode: 'browse',
          title: 'Tiny Fish Browse Mode',
          details: `Navigating to ${res.url}${res.title ? ` (${res.title})` : ''}`,
        })

        onStep?.({
          mode: 'fetch',
          title: 'Tiny Fish Fetch Mode',
          details: `Extracting page content & markdown from ${res.url}`,
        })

        // Fetch page details with Tiny Fish
        let pageContent = ''
        try {
          const fetched = await tinyFish.fetchContent(res.url)
          pageContent = typeof fetched === 'string' ? fetched : fetched.content || fetched.markdown || ''
        } catch {
          pageContent = res.snippet || ''
        }

        const siteEntry = agentMemory.addWebsite({
          url: res.url,
          title: res.title,
          snippet: res.snippet,
          contentSummary: pageContent.slice(0, 800),
        })

        visitedThisTurn.push(siteEntry)
      }
    } catch (err: any) {
      if (signal?.aborted) throw err
      // If TinyFish search encounters an error, proceed to Antigravity with available context
    }
  }

  if (signal?.aborted) {
    throw new Error('Operation aborted by user.')
  }

  // Phase 2: Synchronize Agent Memory & Context
  const synchronizedResearch = agentMemory.getSynchronizedContext()
  const cwd = process.cwd()

  onStep?.({
    mode: 'context',
    title: 'Antigravity Context Ingestion',
    details: `Ingesting ${visitedThisTurn.length} live web sources + workspace (${cwd}) into ${model}`,
  })

  const systemInstruction = `You are Antigravity, an expert coding and reasoning agent working in pair with Tiny Fish (the web research agent) in Ingressus AI.
Tiny Fish explores websites, searches live docs, and extracts fresh facts from the web.
You synthesize those findings, explain your architectural reasoning, and write/edit code to accomplish the user's goal.

Workspace directory: ${cwd}

${synchronizedResearch ? `[SYNCHRONIZED MEMORY & WEB RESEARCH]:\n${synchronizedResearch}\n` : ''}

INSTRUCTIONS FOR CODE AND FILE EDITS:
If the user asks you to write, build, fix, update, or edit a file, provide your architectural reasoning, and then output your proposed edit strictly using this format:

<<<FILE_EDIT>>>
PATH: <relative-path-to-file>
REASON: <concise summary of why this change is made>
CONTENT:
<complete new or updated file content>
<<<END_FILE_EDIT>>>

The user will be prompted for permission in the terminal before your changes are applied to disk.
`

  onStep?.({
    mode: 'reasoning',
    title: 'Antigravity Reasoning & Coding',
    details: `Synthesizing research & generating solution with ${model}...`,
  })

  // Construct contents with conversation history + current user prompt
  const contents = [
    ...conversationHistory,
    {
      role: 'user' as const,
      parts: [{ text: userPrompt }],
    },
  ]

  const { text: rawOutput, usage } = await antigravityTransport.generateContentWithUsage({
    model,
    contents,
    systemInstruction: { parts: [{ text: systemInstruction }] },
    signal,
  })

  // Phase 3: Parse reasoning & proposed file edit
  const { cleanedText, edit } = extractFileEdit(rawOutput)

  return {
    reasoningText: cleanedText || rawOutput,
    visitedWebsites: visitedThisTurn,
    proposedEdit: edit,
    usage,
  }
}
