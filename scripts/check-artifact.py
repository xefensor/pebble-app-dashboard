#!/usr/bin/env python3
"""Verify installable identity, config, pinned library and permissions."""
from pathlib import Path
import argparse
from repo_workflow import candidate, check_build
import hashlib
import json
import zipfile

root = Path(__file__).resolve().parents[1]
package = json.loads((root / 'package.json').read_text())
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--pbw',type=Path,default=candidate(root, 'Dashboard'))
args=parser.parse_args()
check_build(root,args.pbw)
path = args.pbw
with zipfile.ZipFile(path) as archive:
    names = archive.namelist()
    assert len(names) == len(set(names)), 'duplicate archive entries'
    info = json.loads(archive.read('appinfo.json'))
    assert info['uuid'] == package['pebble']['uuid']
    assert info['manifestVersion'] == 2
    assert info['usesPermissions'] == package['pebble']['usesPermissions']
    assert info['plugin'] == package['pebble']['plugin']
    assert archive.read('config.html') == (root / 'config.html').read_bytes()
    binary = archive.read('emery/pebble-app.bin')
    for fixture in (root / 'tests/fixtures').glob('*.bin'):
        assert fixture.read_bytes() not in binary, 'Test fixture compiled into production native binary'
    assert 'emery/pebble-app.bin' in names and 'emery/app_resources.pbpack' in names
    for required in ('plugin.js', 'LICENSE', 'THIRD-PARTY-NOTICES.md', 'licenses/Apache-2.0.txt',
                     'licenses/pebble-activities-LICENSE.txt', 'licenses/OFL-Fredoka.txt', 'licenses/OFL-RobotoCondensed.txt'):
        assert archive.read(required), required
pin = json.loads((root / 'vendor/ACTIVITIES.json').read_text())
assert hashlib.sha256((root / 'vendor' / pin['archive']).read_bytes()).hexdigest() == pin['sha256']
print('Dashboard packaged artifact: PASS')
print(hashlib.sha256(path.read_bytes()).hexdigest(), path.name)

import subprocess
subprocess.run(["python3",str(root / "scripts/check-localization-fonts.py"),"--pbw",str(args.pbw)],check=True)
