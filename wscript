top = '.'
out = 'build'

def options(ctx):
    ctx.load('pebble_sdk')

def configure(ctx):
    ctx.load('pebble_sdk')

def build(ctx):
    import os
    ctx.load('pebble_sdk')
    cached_env = ctx.env
    binaries = []
    for platform in ctx.env.TARGET_PLATFORMS:
        ctx.env = ctx.all_envs[platform]
        if os.environ.get('DASHBOARD_DIAGNOSTICS') == '1':
            ctx.env.append_value('CFLAGS', ['-DDASHBOARD_DIAGNOSTICS=1'])
        if os.environ.get('DASHBOARD_FIXTURE') == '1':
            ctx.env.append_value('CFLAGS', ['-DDASHBOARD_FIXTURE'])
        ctx.set_group(ctx.env.PLATFORM_NAME)
        app_elf = '{}/pebble-app.elf'.format(ctx.env.BUILD_DIR)
        ctx.pbl_build(source=ctx.path.ant_glob('src/c/**/*.c'), target=app_elf,
                      includes=['.'], bin_type='app')
        binaries.append({'platform': platform, 'app_elf': app_elf})
    ctx.env = cached_env
    ctx.set_group('bundle')
    ctx.pbl_bundle(binaries=binaries, js=ctx.path.ant_glob('src/pkjs/**/*.js'),
                   js_entry_file='src/pkjs/index.js')
