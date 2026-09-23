import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * vaul 1.1.2 never forwards `modal` to Radix Dialog.Root (defaults to true).
 * Upstream merged that pass-through (emilkowalski/vaul#580) but has not
 * released it. Without this, `modal={false}` still aria-hides the page and
 * traps pointer events — unusable for a companion bill-chat drawer.
 */
const replacements = [
  {
    file: 'index.mjs',
    from: `            setIsOpen(open);
        },
        open: isOpen
    }, /*#__PURE__*/ React__default.createElement(DrawerContext.Provider, {`,
    to: `            setIsOpen(open);
        },
        open: isOpen,
        modal: modal
    }, /*#__PURE__*/ React__default.createElement(DrawerContext.Provider, {`,
  },
  {
    file: 'index.js',
    from: `            setIsOpen(open);
        },
        open: isOpen
    }, /*#__PURE__*/ React__namespace.default.createElement(DrawerContext.Provider, {`,
    to: `            setIsOpen(open);
        },
        open: isOpen,
        modal: modal
    }, /*#__PURE__*/ React__namespace.default.createElement(DrawerContext.Provider, {`,
  },
]

const dist = join(dirname(fileURLToPath(import.meta.url)), '../node_modules/vaul/dist')

for (const { file, from, to } of replacements) {
  const path = join(dist, file)
  const source = readFileSync(path, 'utf8')
  if (source.includes('open: isOpen,\n        modal: modal')) {
    continue
  }
  if (!source.includes(from)) {
    throw new Error(`vaul ${file} no longer matches the modal patch; update web/scripts/patch-vaul-modal.mjs`)
  }
  writeFileSync(path, source.replace(from, to))
}
