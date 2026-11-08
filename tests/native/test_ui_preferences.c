#include <pebble.h>
#include <assert.h>
#include <stdio.h>
#include <string.h>
#include "../../src/c/dashboard_ui_preferences.h"

static uint8_t stored[DASHBOARD_UI_PREFERENCES_BYTES];
static bool blob_exists,legacy_exists,fail_write,fail_read,wrong_readback;
static bool legacy=true;
static int stored_size=DASHBOARD_UI_PREFERENCES_BYTES;
static unsigned blob_writes;
bool persist_exists(uint32_t key){assert(key==2||key==3);return key==2?legacy_exists:blob_exists;}
int persist_get_size(uint32_t key){assert(key==3);return stored_size;}
bool persist_read_bool(uint32_t key){assert(key==2);return legacy_exists&&legacy;}
int persist_write_bool(uint32_t key,bool value){assert(key==2);legacy_exists=true;legacy=value;return sizeof(value);}
int persist_read_data(uint32_t key,void *data,size_t size){
 assert(key==3&&size==sizeof(stored));if(fail_read||!blob_exists)return -1;
 memcpy(data,stored,size);if(wrong_readback)((uint8_t *)data)[8]^=1;return (int)size;
}
int persist_write_data(uint32_t key,const void *data,size_t size){
 assert(key==3&&size==sizeof(stored));++blob_writes;if(fail_write)return -1;
 memcpy(stored,data,size);blob_exists=true;return (int)size;
}
int main(void){
 DashboardUiPreferences prefs;assert(dashboard_ui_preferences_load(&prefs)&&prefs.revision==0&&!dashboard_ui_preferences_dark(&prefs));
 legacy_exists=true;assert(dashboard_ui_preferences_load(&prefs)&&dashboard_ui_preferences_dark(&prefs)&&prefs.text_size==0);
 prefs=(DashboardUiPreferences){0x12345678,3,0,2};
 uint8_t bytes[DASHBOARD_UI_PREFERENCES_BYTES],status,flags;
 dashboard_ui_preferences_encode(&prefs,0,0,bytes);
 assert(bytes[0]==1&&bytes[1]==3&&bytes[4]==0x78&&bytes[7]==0x12&&bytes[8]==3&&bytes[12]==0&&bytes[16]==2);
 DashboardUiPreferences decoded;assert(dashboard_ui_preferences_decode(bytes,sizeof(bytes),&decoded,&status,&flags)&&!status&&!flags);
 assert(dashboard_ui_preferences_save(&prefs));unsigned writes=blob_writes;
 assert(dashboard_ui_preferences_save(&prefs)&&writes==blob_writes);
 legacy=false;assert(dashboard_ui_preferences_load(&decoded)&&decoded.appearance==0&&dashboard_ui_preferences_dark(&decoded));
 prefs.text_size=1;fail_write=true;assert(!dashboard_ui_preferences_save(&prefs));fail_write=false;
 assert(dashboard_ui_preferences_load(&decoded)&&decoded.text_size==3);
 wrong_readback=true;assert(!dashboard_ui_preferences_save(&prefs));wrong_readback=false;
 fail_read=true;assert(!dashboard_ui_preferences_save(&prefs));fail_read=false;
 assert(dashboard_ui_preferences_save(&prefs)&&dashboard_ui_preferences_load(&decoded)&&decoded.text_size==1);
 for(unsigned i=0;i<4;++i){uint8_t changed[sizeof(bytes)];memcpy(changed,bytes,sizeof(bytes));changed[i]=99;assert(!dashboard_ui_preferences_decode(changed,sizeof(changed),&decoded,NULL,NULL));}
 assert(!dashboard_ui_preferences_decode(bytes,sizeof(bytes)-1,&decoded,NULL,NULL));
 bytes[8]=4;assert(!dashboard_ui_preferences_decode(bytes,sizeof(bytes),&decoded,NULL,NULL));
 prefs.appearance=1;prefs.last_explicit=2;assert(!dashboard_ui_preferences_save(&prefs));
 prefs.appearance=0;prefs.revision=0;assert(!dashboard_ui_preferences_save(&prefs));
 stored[0]=99;assert(!dashboard_ui_preferences_load(&decoded));
 assert(decoded.revision==0&&decoded.text_size==0);
 puts("UI prefs: exact wire, legacy migration, retained Follow fallback, verified commit/reopen and isolated failure paths passed");
 return 0;
}
