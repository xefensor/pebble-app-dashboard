#!/usr/bin/env python3
"""Portable native parser/model checks, including real JS-encoded fixtures."""
from pathlib import Path
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
build = root / 'build' / 'native-tests'
build.mkdir(parents=True, exist_ok=True)
fixtures = sorted((root / 'tests' / 'fixtures').glob('*.bin'))
if not fixtures:
    raise SystemExit('No binary fixtures. Run node scripts/generate-fixtures.cjs first.')
compiler = os.environ.get('CC', 'cc')
command = [compiler, '-std=c99', '-Wall', '-Wextra', '-Werror', '-g', '-O1', '-Isrc/c',
           'src/c/dashboard.c', 'tests/native/test_dashboard.c', '-o', str(build / 'test_dashboard')]
if '--sanitize' in sys.argv:
    command += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
subprocess.run(command, cwd=root, check=True)
subprocess.run([str(build / 'test_dashboard'), *map(str, fixtures)], cwd=root, check=True)
deadline = [compiler, '-std=c99', '-Wall', '-Wextra', '-Werror', '-g', '-O1',
            '-Itests/fake-sdk', '-Isrc/c', 'src/c/dashboard_deadline.c',
            'tests/native/test_deadline.c', '-o', str(build / 'test_deadline')]
if '--sanitize' in sys.argv:
    deadline += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
subprocess.run(deadline, cwd=root, check=True)
subprocess.run([str(build / 'test_deadline')], cwd=root, check=True)
layout = [compiler, '-std=c99', '-Wall', '-Wextra', '-Werror', '-g', '-O1',
          '-Isrc/c', 'tests/native/test_layout.c', '-o', str(build / 'test_layout')]
if '--sanitize' in sys.argv:
    layout += ['-fsanitize=address,undefined', '-fno-omit-frame-pointer']
subprocess.run(layout, cwd=root, check=True)
subprocess.run([str(build / 'test_layout')], cwd=root, check=True)
if '--frames-dir' in sys.argv:
    at = sys.argv.index('--frames-dir')
    if at + 1 >= len(sys.argv):
        raise SystemExit('--frames-dir needs a directory')
    actual = sorted(Path(sys.argv[at + 1]).glob('*.bin'))
    if not actual:
        raise SystemExit('No actual runtime frames in ' + sys.argv[at + 1])
    subprocess.run([str(build / 'test_dashboard'), '--decode-only', *map(str, actual)], cwd=root, check=True)
