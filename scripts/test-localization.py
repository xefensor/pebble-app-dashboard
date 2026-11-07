#!/usr/bin/env python3
from pathlib import Path
import os,subprocess,tempfile
root=Path(__file__).resolve().parents[1]
subprocess.run(['python3',str(root/'scripts/generate-localization.py'),'--check'],check=True)
with tempfile.TemporaryDirectory(prefix='app-localization-') as scratch:
 binary=Path(scratch)/'localization'
 subprocess.run([os.environ.get('CC','cc'),'-std=c99','-Wall','-Wextra','-Werror','-pedantic','-DAPP_LOCALIZATION_TEST','-I',str(root/'src/c'),str(root/'src/c/localization.c'),str(root/'tests/test_localization.c'),'-o',str(binary)],check=True)
 subprocess.run([str(binary),str(root/'resources/localization.bin')],check=True)
