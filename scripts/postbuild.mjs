import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const index = path.join(dist, 'index.html')
const notFound = path.join(dist, '404.html')

if (fs.existsSync(index)) {
  fs.copyFileSync(index, notFound)
  console.log('404.html written for client-side routes')
}
