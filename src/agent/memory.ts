/**
 * Synchronized Agent Memory
 * Coordinates shared context between Tiny Fish (Web Research Agent) and Antigravity (Coding Agent)
 */

export interface VisitedWebsite {
  url: string
  title?: string
  snippet?: string
  contentSummary?: string
  visitedAt: number
}

export interface EditedFileRecord {
  filePath: string
  summary: string
  timestamp: number
  linesChanged?: number
}

export interface ResearchFact {
  topic: string
  fact: string
  sourceUrl?: string
  timestamp: number
}

export class AgentMemory {
  private visitedWebsites: VisitedWebsite[] = []
  private editedFiles: EditedFileRecord[] = []
  private researchFacts: ResearchFact[] = []

  addWebsite(site: Omit<VisitedWebsite, 'visitedAt'>): VisitedWebsite {
    const entry: VisitedWebsite = {
      ...site,
      visitedAt: Date.now(),
    }
    // De-duplicate by URL
    this.visitedWebsites = this.visitedWebsites.filter(s => s.url !== site.url)
    this.visitedWebsites.push(entry)
    // Keep last 15 websites
    if (this.visitedWebsites.length > 15) {
      this.visitedWebsites.shift()
    }
    return entry
  }

  recordFileEdit(record: Omit<EditedFileRecord, 'timestamp'>): EditedFileRecord {
    const entry: EditedFileRecord = {
      ...record,
      timestamp: Date.now(),
    }
    this.editedFiles.push(entry)
    return entry
  }

  addFact(fact: Omit<ResearchFact, 'timestamp'>): ResearchFact {
    const entry: ResearchFact = {
      ...fact,
      timestamp: Date.now(),
    }
    this.researchFacts.push(entry)
    if (this.researchFacts.length > 20) {
      this.researchFacts.shift()
    }
    return entry
  }

  getWebsites(): readonly VisitedWebsite[] {
    return this.visitedWebsites
  }

  getEditedFiles(): readonly EditedFileRecord[] {
    return this.editedFiles
  }

  getFacts(): readonly ResearchFact[] {
    return this.researchFacts
  }

  getSynchronizedContext(): string {
    const parts: string[] = []

    if (this.visitedWebsites.length > 0) {
      parts.push('### Live Research from Tiny Fish (Web Agent):')
      for (const w of this.visitedWebsites.slice(-5)) {
        parts.push(`- **URL**: ${w.url}${w.title ? ` (${w.title})` : ''}`)
        if (w.snippet) parts.push(`  *Summary*: ${w.snippet}`)
        if (w.contentSummary) parts.push(`  *Key Content*: ${w.contentSummary.slice(0, 400)}`)
      }
    }

    if (this.editedFiles.length > 0) {
      parts.push('\n### Recent File Modifications by Antigravity:')
      for (const f of this.editedFiles.slice(-5)) {
        parts.push(`- **File**: ${f.filePath} - ${f.summary}`)
      }
    }

    return parts.join('\n')
  }

  clear() {
    this.visitedWebsites = []
    this.editedFiles = []
    this.researchFacts = []
  }
}

export const agentMemory = new AgentMemory()
