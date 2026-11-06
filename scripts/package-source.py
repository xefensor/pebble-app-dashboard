#!/usr/bin/env python3
"""Package a deterministic, buildable local source snapshot without dependencies."""
from pathlib import Path
import argparse
import hashlib
import io
import json
import subprocess
import zipfile

root = Path(__file__).resolve().parents[1]
version = json.loads((root / 'package.json').read_text())['version']
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
files = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=root).decode().split('\0')
contents = {}
for name in sorted(set(files) - {''}):
    path = Path(name)
    if path.parts[0] in ('build', 'dist', 'node_modules', '.git', '.pebble'):
        continue
    if path.suffix in ('.pyc', '.pbw') or '__pycache__' in path.parts:
        continue
    if path.parts[:2] == ('docs', 'qa') and path.suffix.lower() in ('.png', '.gif'):
        continue
    source = root / path
    if not source.is_file() or source.is_symlink():
        continue
    contents[name] = source.read_bytes()
contents['SOURCE-MANIFEST.json'] = json.dumps({
    'version': version,
    'scope': 'Buildable source; install locked dependencies; generated QA PNGs and app/debug archives are separate.',
    'files': {name: hashlib.sha256(content).hexdigest() for name, content in contents.items()}
}, indent=2).encode() + b'\n'
buffer = io.BytesIO()
with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
    for name, content in sorted(contents.items()):
        info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o644 << 16
        archive.writestr(info, content)
destination = root / 'dist' / ('Dashboard-' + version + '-source.zip')
if args.check:
    assert destination.read_bytes() == buffer.getvalue(), 'Source archive is stale.'
else:
    destination.parent.mkdir(exist_ok=True)
    destination.write_bytes(buffer.getvalue())
    artifacts = [root / 'dist' / ('Dashboard-' + version + suffix) for suffix in ('.pbw', '-debug.zip', '-source.zip')]
    (root / 'dist/SHA256SUMS.txt').write_text(''.join(
        hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n' for path in artifacts))
print(str(destination))
