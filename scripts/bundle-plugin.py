#!/usr/bin/env python3
"""Bundle config-only relative CommonJS modules without executing their code."""
from pathlib import Path
import re
import sys

root = Path(__file__).resolve().parents[1]
pattern = re.compile(r"\brequire\(\s*(['\"])([^'\"]+)\1\s*\)")

def bundle(entry):
    modules, identifiers = [], {}
    def visit(path):
        path = path.resolve()
        if path in identifiers:
            return identifiers[path]
        if not path.is_relative_to(root / 'src') or path.suffix != '.js' or not path.is_file():
            raise ValueError(f'Unsupported config module: {path}')
        index = len(modules)
        identifiers[path] = index
        modules.append(None)
        def replace(match):
            request = match.group(2)
            if not request.startswith('.'):
                raise ValueError(f'External config dependency: {request}')
            target = path.parent / request
            if target.suffix != '.js':
                target = target.with_suffix('.js')
            return f'require({visit(target)})'
        modules[index] = pattern.sub(replace, path.read_text())
        return index
    main = visit(entry)
    wrappers = ',\n'.join('function(module,exports,require){\n' + source + '\n}' for source in modules)
    return ("'use strict';\n// Dashboard config-only sources; see bundled LICENSE.\n"
            "(function(modules){var cache={};function load(id){if(cache[id])return cache[id].exports;"
            "var module={exports:{}};cache[id]=module;modules[id](module,module.exports,load);return module.exports;}"
            f"load({main});}})([\n{wrappers}\n]);\n")

if __name__ == '__main__':
    destination = Path(sys.argv[1])
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(bundle(root / 'src/plugin/index.js'))
