#!/usr/bin/env python3
"""Build a local permissions-enabled Dashboard candidate, without publishing."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
from repo_workflow import build_output
output_directory = build_output(root, 'Dashboard')
package = json.loads((root / 'package.json').read_text())
fixture = os.environ.get('DASHBOARD_FIXTURE') == '1'
subprocess.run(['node', str(root / 'scripts/generate-config.cjs')], cwd=root, check=True)
subprocess.run(['pebble', 'clean'], cwd=root, check=True)
subprocess.run(['python3', str(root / 'scripts/bundle-plugin.py'), str(root / 'build/plugin.js')], cwd=root, check=True)
subprocess.run(['pebble', 'build'], cwd=root, check=True)
source_pbw = root / 'build' / (root.name + '.pbw')
with zipfile.ZipFile(source_pbw) as source:
    entries = {name: source.read(name) for name in source.namelist()}
appinfo = json.loads(entries['appinfo.json'])
appinfo.update(manifestVersion=2, usesPermissions=package['pebble']['usesPermissions'],
               configPage='config.html', plugin=package['pebble']['plugin'])
entries['appinfo.json'] = json.dumps(appinfo, indent=2).encode()
entries['plugin.js'] = (root / 'build/plugin.js').read_bytes()
entries['config.html'] = (root / 'config.html').read_bytes()
debug = {name: entries.pop(name) for name in list(entries) if name.endswith('.map')}
for name in ('pebble-js-app.js', 'plugin.js'):
    debug[name] = entries[name]
for name in ('LICENSE', 'THIRD-PARTY-NOTICES.md', 'licenses/Apache-2.0.txt'):
    entries[name] = (root / name).read_bytes()
for name in ('OFL-Fredoka.txt', 'OFL-RobotoCondensed.txt'):
    entries['licenses/' + name] = (root / 'resources/fonts' / name).read_bytes()
entries['licenses/pebble-activities-LICENSE.txt'] = (root / 'node_modules/pebble-activities/LICENSE').read_bytes()
suffix = '-fixture' if fixture else ''
destination = output_directory / ('Dashboard-' + package['version'] + suffix + '.pbw')
destination.parent.mkdir(parents=True, exist_ok=True)
debug_path = destination.with_name(destination.stem + '-debug.zip')
debug['build.json'] = json.dumps({'version': package['version'], 'fixture': fixture,
    'sources': {str(path.relative_to(root)): hashlib.sha256(path.read_bytes()).hexdigest()
                for directory in ('src', 'resources') for path in sorted((root / directory).rglob('*')) if path.is_file()}}, indent=2).encode()
for path, contents in ((destination, entries), (debug_path, debug)):
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as output:
        for name, content in sorted(contents.items()):
            item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.external_attr = 0o644 << 16
            output.writestr(item, content)
paths = (destination, debug_path)
(output_directory / ('SHA256SUMS-' + package['version'] + suffix + '.txt')).write_text(''.join(
    hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n' for path in paths))
from repo_workflow import record_build
record_build(root, destination, debug_path)
print(destination)
print(debug_path)
