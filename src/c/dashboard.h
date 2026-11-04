#ifndef DASHBOARD_H
#define DASHBOARD_H
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

#define DB_MAX_ITEMS 7
#define DB_PAGE_ITEMS 5
#define DB_FRAME_MAX 8192
#define DB_IMAGE_BYTES 800
#define DB_IMAGE_BUDGET 2048
#define DB_MAX_DEPTH 3

enum DbKey { DB_KEY_OPERATION=4000, DB_KEY_SESSION, DB_KEY_REQUEST, DB_KEY_MODE,
  DB_KEY_OFFSET, DB_KEY_TOKEN, DB_KEY_VERSION, DB_KEY_ACTION, DB_KEY_DATA,
  DB_KEY_RESULT, DB_KEY_TEXT, DB_KEY_CONFIRM, DB_KEY_INDEX };
enum DbOp { DB_OP_HELLO=1, DB_OP_VIEW, DB_OP_ACTION, DB_OP_OPEN, DB_OP_CANCEL, DB_OP_READY, DB_OP_FOCUS };
enum DbMode { DB_OVERVIEW=0, DB_ACTIVITIES=1, DB_PINNED=2, DB_MEDIA=3 };
enum DbStatus { DB_LOADING=0, DB_READY=1, DB_PARTIAL=2, DB_OFFLINE=3, DB_PERMISSION=4, DB_ERROR=5 };
enum DbResult { DB_PENDING=1, DB_SUCCESS=2, DB_FAILED=3, DB_STALE=4, DB_DENIED=5, DB_CANCELLED=6, DB_CONFIRM=7 };
enum DbFlag { DB_ACTION=1, DB_APP=2, DB_IS_MEDIA=4, DB_PRIVATE=8, DB_UNAVAILABLE=16,
  DB_PAUSED=32, DB_IS_PENDING=64, DB_IS_FAILED=128, DB_COUNTDOWN=256, DB_ELAPSED=512,
  DB_NOTIFICATION=1024, DB_CONFIRM_ACTION=2048, DB_LOCAL_WATCH=4096,
  DB_MEDIA_PREVIOUS=8192, DB_MEDIA_TOGGLE=16384, DB_MEDIA_NEXT=32768 };
enum DbKind { DB_GENERIC=0, DB_TIMER=1, DB_MUSIC=2, DB_NOTICE=3, DB_WEATHER=4,
  DB_PHONE=5, DB_LIGHT=6, DB_FIND=7, DB_WORKOUT=8, DB_NAVIGATION=9,
  DB_CALENDAR=10, DB_BATTERY=11, DB_SCENE=12 };
enum DbRole { DB_ROLE_ACTIVITY=0, DB_ROLE_NOTICE=1, DB_ROLE_PIN=2 };

typedef struct {
  uint32_t token,version,valid_until,anchor,base_seconds;
  uint16_t flags;
  uint8_t kind,clock_mode,role,width,height,palette_length;
  uint16_t pixel_length;
  char title[193],subtitle[129],value[49],app_label[33],action_label[33],name[65];
  char controls[3][33];
  uint8_t palette[16],pixels[DB_IMAGE_BYTES];
} DbItem;
typedef struct {
  uint32_t session,request,sequence,now;
  uint16_t total,offset,activities_total,pins_total;
  uint8_t mode,status,count;
  bool dark;
  DbItem items[DB_MAX_ITEMS];
} DbSnapshot;
typedef struct {
  uint8_t mode,focus;
  uint16_t index,offset;
  uint32_t token;
} DbReturn;
typedef struct {
  DbSnapshot snapshot;
  uint32_t session,view_request,last_sequence,selected_token;
  uint16_t selected_index,desired_index;
  uint8_t desired_mode,focus,depth;
  DbReturn back[DB_MAX_DEPTH];
  bool ready,loading,connected,selection_lost;
} DbState;

bool db_decode(const uint8_t *bytes,size_t length,DbSnapshot *out);
void db_state_init(DbState *state,uint32_t session);
void db_state_expect(DbState *state,uint32_t request,uint8_t mode,uint16_t index,uint32_t token);
bool db_state_apply(DbState *state,const DbSnapshot *snapshot);
const DbItem *db_selected(const DbState *state);
bool db_item_current(const DbItem *item,uint32_t now);
bool db_item_capability_current(const DbItem *item,uint32_t now);
bool db_item_actionable(const DbItem *item,uint32_t now);
int db_item_direct_action(const DbItem *item,uint32_t now);
void db_item_value(const DbItem *item,uint32_t now,char *buffer,size_t size);
bool db_state_move(DbState *state,int delta,uint16_t *index);
void db_state_remember(DbState *state);
bool db_state_back(DbState *state,DbReturn *value);
bool db_state_redact(DbState *state,uint32_t now,bool disconnected);
bool db_state_running_clock(const DbState *state,uint32_t now);
#endif
