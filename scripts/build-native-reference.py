#!/usr/bin/env python3
"""Build explicitly separate locale-lookup and heap-log emulator fixtures."""
from pathlib import Path
import json,os,shutil,subprocess
from repo_workflow import candidate,check_build

root=Path(__file__).resolve().parents[1]
check_build(root,candidate(root,'Dashboard'))
output=root/'build/qa/native-reference';project=output/'project'
project.mkdir(parents=True,exist_ok=True)
for directory in ('src','resources','vendor','node_modules'):
    shutil.copytree(root/directory,project/directory,dirs_exist_ok=True)
for name in ('package.json','package-lock.json','wscript'):
    shutil.copyfile(root/name,project/name)
for name,locale in (('heap-diagnostic',None),('locale-cs','cs_CZ'),('locale-de','de_DE')):
    source=(root/'src/c/localization.c').read_text()
    if locale:source=source.replace('i18n_get_system_locale()',json.dumps(locale))
    (project/'src/c/localization.c').write_text(source)
    main=(root/'src/c/main.c').read_text()
    if not locale:
        main=main.replace('button_pressed(BUTTON_ID_SELECT);cancel_hold_preview();s_hold_intent=false;', 'UI_DIAG("raw screen=%u intent=%d active=%d",s_current_screen,s_hold_intent,s_press.active);button_pressed(BUTTON_ID_SELECT);cancel_hold_preview();s_hold_intent=false;')
        main=main.replace('button_released(BUTTON_ID_SELECT);cancel_hold_preview();', 'UI_DIAG("click screen=%u intent=%d active=%d confirm=%d",s_current_screen,s_hold_intent,s_press.active,s_command.confirmation);button_released(BUTTON_ID_SELECT);cancel_hold_preview();')
        main=main.replace('static void window_disappear(Window *window){', 'static void window_disappear(Window *window){ UI_DIAG("disappear current=%u own=%d",s_current_screen,window==s_windows[s_current_screen]);')
    (project/'src/c/main.c').write_text(main)
    env={**os.environ,'DASHBOARD_DIAGNOSTICS':'0' if locale else '1'}
    subprocess.run(['pebble','clean'],cwd=project,env=env,check=True)
    subprocess.run(['pebble','build'],cwd=project,env=env,check=True)
    shutil.copyfile(project/'build/project.pbw',output/(name+'.pbw'))
print(output)
