export interface SearchResult {
  position: number
  title: string
  url: string
  snippet: string
  site_name?: string
  date?: string
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  total_results?: number
}

export class TinyFishClient {
  private apiKey: string
  private upstreamUrl: string
  private sessionId: string | null = null
  private nextId = 1

  constructor(
    apiKey: string = process.env.TINYFISH_API_KEY || 'sk-tinyfish-5AEChG3cpqG-2-LGQgcicnLxm00_1Wls',
    upstreamUrl = 'https://agent.tinyfish.ai/mcp'
  ) {
    this.apiKey = apiKey
    this.upstreamUrl = upstreamUrl
  }

  private async ensureSession(): Promise<string> {
    if (this.sessionId) return this.sessionId

    const res = await fetch(this.upstreamUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'X-API-Key': this.apiKey,
        'X-TF-Request-Origin': 'ingressus-ai',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'ingressus-ai', version: '1.0.0' },
        },
      }),
    })

    if (!res.ok) {
      throw new Error(`TinyFish initialize failed with HTTP ${res.status}: ${await res.text()}`)
    }

    const sid = res.headers.get('mcp-session-id')
    if (sid) {
      this.sessionId = sid
    }
    return this.sessionId || ''
  }

  async callTool(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const sid = await this.ensureSession()

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'X-API-Key': this.apiKey,
      'X-TF-Request-Origin': 'ingressus-ai',
    }

    if (sid) {
      headers['mcp-session-id'] = sid
    }

    const res = await fetch(this.upstreamUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: this.nextId++,
        method: 'tools/call',
        params: {
          name,
          arguments: args,
        },
      }),
    })

    if (!res.ok) {
      throw new Error(`TinyFish call failed (${res.status}): ${await res.text()}`)
    }

    const data = await res.json()
    if (data.error) {
      throw new Error(data.error.message || JSON.stringify(data.error))
    }

    const content = data.result?.content?.[0]
    if (content?.type === 'text') {
      try {
        return JSON.parse(content.text)
      } catch {
        return content.text
      }
    }
    return data.result
  }

  async search(query: string): Promise<SearchResponse> {
    const raw = await this.callTool('search', { query })
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw)
      } catch {
        return { query, results: [] }
      }
    }
    return raw as SearchResponse
  }

  async fetchContent(url: string): Promise<{ url: string; content?: string; markdown?: string; [key: string]: any }> {
    const raw = await this.callTool('fetch_content', { url })
    if (typeof raw === 'string') {
      return { url, content: raw }
    }
    return raw
  }

  async getWallet(): Promise<any> {
    return await this.callTool('get_wallet', {})
  }

  async listSessions(): Promise<any> {
    return await this.callTool('list_browser_sessions', { limit: 10, page: 1 })
  }
}

export const tinyFish = new TinyFishClient()

