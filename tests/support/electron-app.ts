// Test-only Electron loader fixture. Production builds use the real module.
let root = ''
export function setAppRoot(path: string): void {
  root = path
}
export const app = {
  isPackaged: true,
  getAppPath: () => `${root}/app.asar`,
  getPath: (_name: string) => root
}
