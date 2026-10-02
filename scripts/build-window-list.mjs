import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const output = join(root, 'out/bin/window-list')
mkdirSync(dirname(output), { recursive: true })
execFileSync(
  'xcrun',
  [
    'clang',
    '-fobjc-arc',
    '-arch',
    'arm64',
    '-arch',
    'x86_64',
    '-framework',
    'AppKit',
    '-framework',
    'CoreGraphics',
    '-o',
    output,
    join(root, 'src/native/window-list.m')
  ],
  { stdio: 'inherit' }
)
