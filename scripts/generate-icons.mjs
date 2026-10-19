import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const iconDirectory = fileURLToPath(new URL('../public/icons/', import.meta.url))
const source = await readFile(`${iconDirectory}icon.svg`)

const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
  ['apple-touch-icon.png', 180],
]

await Promise.all(
  targets.map(([filename, size]) =>
    sharp(source)
      .resize(Number(size), Number(size))
      .png({ compressionLevel: 9 })
      .toFile(`${iconDirectory}${filename}`),
  ),
)

console.log(`Generated ${targets.length} PWA icons.`)
