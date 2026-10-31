import { spawn, execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

export interface InstalledBrowser {
  name: string
  id: string
  executable: string
  isDefault?: boolean
}

/**
 * Escapes special characters for Windows cmd.exe start command.
 */
function escapeForCmdStart(url: string): string {
  if (/\s/.test(url)) return url
  return url.replace(/[&|<>^]/g, '^$&')
}

/**
 * Detect all installed browsers on Windows, identifying the user's default browser if possible.
 */
function getInstalledWindowsBrowsers(): InstalledBrowser[] {
  const localApp = process.env.LOCALAPPDATA || ''
  const progFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
  const progFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'

  // Query registry for default HTTPS handler
  let defaultProgId = ''
  try {
    const regOut = execSync(
      'reg query HKCU\\Software\\Microsoft\\Windows\\Shell\\Associations\\UrlAssociations\\https\\UserChoice /v ProgId',
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 1500 }
    )
    const match = regOut.match(/ProgId\s+REG_SZ\s+(\S+)/i)
    if (match?.[1]) {
      defaultProgId = match[1].toLowerCase()
    }
  } catch {}

  const definitions = [
    {
      name: 'Microsoft Edge',
      id: 'edge',
      progIdMatch: 'edge',
      paths: [
        path.join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(localApp, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      ],
    },
    {
      name: 'Google Chrome',
      id: 'chrome',
      progIdMatch: 'chrome',
      paths: [
        path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      ],
    },
    {
      name: 'Brave Browser',
      id: 'brave',
      progIdMatch: 'brave',
      paths: [
        path.join(progFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(progFilesX86, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
        path.join(localApp, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      ],
    },
    {
      name: 'Mozilla Firefox',
      id: 'firefox',
      progIdMatch: 'firefox',
      paths: [
        path.join(progFiles, 'Mozilla Firefox', 'firefox.exe'),
        path.join(progFilesX86, 'Mozilla Firefox', 'firefox.exe'),
      ],
    },
    {
      name: 'Opera',
      id: 'opera',
      progIdMatch: 'opera',
      paths: [
        path.join(localApp, 'Programs', 'Opera', 'launcher.exe'),
        path.join(localApp, 'Programs', 'Opera GX', 'launcher.exe'),
      ],
    },
    {
      name: 'Vivaldi',
      id: 'vivaldi',
      progIdMatch: 'vivaldi',
      paths: [
        path.join(localApp, 'Vivaldi', 'Application', 'vivaldi.exe'),
        path.join(progFiles, 'Vivaldi', 'Application', 'vivaldi.exe'),
      ],
    },
  ]

  const found: InstalledBrowser[] = []

  for (const def of definitions) {
    for (const p of def.paths) {
      if (fs.existsSync(p)) {
        const isDefault = Boolean(defaultProgId && defaultProgId.includes(def.progIdMatch))
        found.push({
          name: def.name,
          id: def.id,
          executable: p,
          isDefault,
        })
        break
      }
    }
  }

  // Sort so default browser appears first
  found.sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
  return found
}

/**
 * Spawns a browser executable directly in detached mode.
 */
function trySpawnBrowser(executable: string, args: string[]): Promise<boolean> {
  return new Promise(resolve => {
    try {
      const child = spawn(executable, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false,
      })

      let failed = false
      child.on('error', () => {
        failed = true
        resolve(false)
      })

      child.unref()

      // Allow a brief moment to ensure no immediate ENOENT or spawn failure
      setTimeout(() => {
        if (!failed) resolve(true)
      }, 50)
    } catch {
      resolve(false)
    }
  })
}

export interface OpenBrowserResult {
  success: boolean
  browserName?: string
  error?: string
}

/**
 * Directly open a URL in a browser on the user's machine.
 *
 * Highlights:
 * 1. Checks and prioritizes the system's default browser (e.g. Edge, Chrome, Firefox).
 * 2. If default fails or is not accessible, automatically tries ANY installed browser on the machine.
 * 3. Supports requesting a specific browser via `preferredBrowser` (e.g., 'chrome', 'edge', 'brave', 'firefox').
 * 4. Falls back to OS-level launchers (`cmd.exe /c start`, `explorer.exe`, `open`, `xdg-open`).
 */
export async function openBrowser(
  url: string,
  preferredBrowser?: string
): Promise<OpenBrowserResult> {
  const platform = process.platform

  // Normalize requested browser name
  const requested = preferredBrowser ? preferredBrowser.toLowerCase().trim() : undefined

  if (platform === 'win32') {
    const installed = getInstalledWindowsBrowsers()

    // 1. If user requested a specific browser (e.g. /login chrome or /login edge)
    if (requested) {
      const target = installed.find(
        b => b.id === requested || b.name.toLowerCase().includes(requested)
      )
      if (target) {
        const ok = await trySpawnBrowser(target.executable, [url])
        if (ok) {
          return { success: true, browserName: target.name }
        }
      }
    }

    // 2. Try detected default browser directly
    const defaultBrowser = installed.find(b => b.isDefault)
    if (defaultBrowser) {
      const ok = await trySpawnBrowser(defaultBrowser.executable, [url])
      if (ok) {
        return { success: true, browserName: defaultBrowser.name }
      }
    }

    // 3. Try any other installed browsers on the machine
    for (const b of installed) {
      if (b === defaultBrowser) continue
      const ok = await trySpawnBrowser(b.executable, [url])
      if (ok) {
        return { success: true, browserName: b.name }
      }
    }

    // 4. Fallback: cmd.exe start
    try {
      const cmd = spawn(
        'cmd.exe',
        ['/c', 'start', '""', escapeForCmdStart(url)],
        { detached: true, stdio: 'ignore', windowsHide: true }
      )
      cmd.unref()
      return { success: true, browserName: 'Default Browser' }
    } catch {}

    // 5. Fallback: explorer.exe
    try {
      const exp = spawn('explorer.exe', [url], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      })
      exp.unref()
      return { success: true, browserName: 'Default Browser' }
    } catch {}

    return {
      success: false,
      error: 'Unable to launch any installed browser on Windows.',
    }
  }

  if (platform === 'darwin') {
    try {
      const args = requested ? ['-a', requested, url] : [url]
      const p = spawn('open', args, { detached: true, stdio: 'ignore' })
      p.unref()
      return { success: true, browserName: requested || 'Default Browser' }
    } catch {
      return { success: false, error: 'Failed to open browser on macOS.' }
    }
  }

  // Linux / Unix
  try {
    const p = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' })
    p.unref()
    return { success: true, browserName: 'Default Browser' }
  } catch {
    return { success: false, error: 'Failed to open browser on Linux.' }
  }
}


