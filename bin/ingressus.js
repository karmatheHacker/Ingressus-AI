#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const cliPath = path.join(rootDir, 'src', 'cli.tsx')

// On Windows with shell:true, paths with spaces get split at the space.
// Fix: use npx.cmd directly with shell:false so args are passed raw.
const isWindows = process.platform === 'win32'
const npxCmd = isWindows ? 'npx.cmd' : 'npx'

const child = spawn(npxCmd, ['tsx', cliPath], {
  stdio: 'inherit',
  shell: false,
  cwd: process.cwd(),
})

child.on('exit', (code) => {
  process.exit(code ?? 0)
})

