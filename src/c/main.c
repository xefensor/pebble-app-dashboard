#include <pebble.h>
#include "localization.h"
#include <pebble-xoce-ui/pebble-xoce-ui.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <limits.h>
#include "dashboard.h"
#include "dashboard_deadline.h"
#include "dashboard_press.h"
#include "dashboard_ui_preferences.h"

#define SCREEN_W 200
#define SCREEN_H 228
#define CONTENT_W (SCREEN_W - ACTION_BAR_WIDTH)
#define VIEW_TIMEOUT_MS 6000
#define ACTION_TIMEOUT_MS 12000
#define OUTBOX_CAPACITY 4
#define GUIDE_SEEN_KEY 1
#define THEME_DARK_KEY 2
#define HOLD_PREVIEW_MS 250
#ifndef DASHBOARD_DIAGNOSTICS
#define DASHBOARD_DIAGNOSTICS 0
#endif
#if DASHBOARD_DIAGNOSTICS
#define UI_DIAG(...) APP_LOG(APP_LOG_LEVEL_INFO,__VA_ARGS__)
#else
#define UI_DIAG(...) ((void)0)
#endif

typedef struct {uint8_t op,mode,action,confirm;uint16_t offset,index;uint32_t request,token,version;} Outbound;
typedef struct {uint32_t request,token,version;uint8_t action,result;char text[65];bool active,confirmation,ended;} Command;
enum {SCREEN_CONFIRM=4,SCREEN_GUIDE=5,SCREEN_COUNT=6};
static Window *s_window,*s_windows[SCREEN_COUNT];
static Layer *s_canvas,*s_canvases[SCREEN_COUNT];
static unsigned s_current_screen=DB_OVERVIEW,s_outgoing_screen=SCREEN_COUNT;
static DbState *s_outgoing_state,*s_presented_state;
static Command s_outgoing_command,s_presented_command;
static const DbState *s_paint_state;
static const Command *s_paint_command;
static bool s_paint_guide;
static DbState s_state;
static uint32_t s_counter;
static Outbound s_queue[OUTBOX_CAPACITY];
static uint8_t s_queue_count;
static bool s_sending,s_focused=true,s_has_connection=true;
static Command s_command;
static AppTimer *s_view_timeout,*s_action_timeout,*s_repeat,*s_hold_timer;
static DbDeadline s_expiry;
static bool s_guide,s_select_down,s_hold_preview,s_hold_intent,s_confirm_accept;
#ifndef DASHBOARD_FIXTURE
static bool s_saved_dark;
#endif
static int s_repeat_delta;
static bool s_repeat_held;
static DbPress s_press;
static unsigned s_text_size;
static PreferredContentSize s_system_text_size;
static DashboardUiPreferences s_ui_preferences;
static uint8_t s_ui_reply[DASHBOARD_UI_PREFERENCES_BYTES];
static bool s_ui_pending,s_ui_sending,s_ui_error;
static unsigned s_ui_attempts;
static uint32_t s_ui_generation,s_ui_flight;
static bool s_modern_type;
static uint8_t s_tick_seconds;
static unsigned s_last_minute;
static uint32_t s_last_tick;
typedef struct {uint32_t started;uint8_t offset;bool held,releasing;} ButtonMotion;
static AppTimer *s_button_motion_timer;
static ButtonMotion s_buttons[3];
static const uint8_t s_font_points[]={18,18,24,18,18,24,20,26,26,24,32,42,18,28,36};
static MenuLayer *s_collection_menu[2];
static ScrollLayer *s_snapshot_scroll;
static Layer *s_snapshot_body,*s_guide_body;
static ScrollLayer *s_guide_scroll;
static MenuLayer *s_confirm_menu,*s_action_menu;
static void sync_action_menu(bool animated);
static void sync_secondary(void);
static void confirmation_step(bool up);
static void guide_step(int direction);
static void sync_snapshot(bool animated);
static void sync_native_ui(bool animated);
static void sync_native_windows(void);
static void paint_begin(unsigned screen);

static uint32_t utc_now(void){return (uint32_t)time(NULL);}
static uint32_t next_request(void){s_counter=s_counter>=INT32_MAX?1:s_counter+1;return s_counter;}
static void repaint(void){if(s_canvas&&s_focused){
  if(s_command.confirmation){
    const DbItem *item=db_selected(&s_state);
    if(!s_has_connection||!db_item_capability_current(item,utc_now())||item->token!=s_command.token||item->version!=s_command.version){
      s_command.confirmation=false;s_command.result=DB_STALE;s_command.ended=true;
    }
  }
  sync_native_windows();sync_native_ui(false);layer_mark_dirty(s_canvas);
  *s_presented_state=s_state;s_presented_command=s_command;
}}
// Native controls own row/scroll motion. The app animates physical-button
// feedback; capability checks and logical selection remain synchronous.
static uint32_t input_milliseconds(void){time_t seconds;uint16_t milliseconds;time_ms(&seconds,&milliseconds);return (uint32_t)((uint64_t)seconds*1000u+milliseconds);}
static void settle_button_releases(void){
  for(unsigned i=0;i<3;i++)if(s_buttons[i].releasing){s_buttons[i].offset=0;s_buttons[i].releasing=false;}
  repaint();
}
static void release_frame(void *context){
  (void)context;s_button_motion_timer=NULL;uint32_t now=input_milliseconds(),next=XOCE_UI_PRESS_FRAME_MS;bool pending=false;
  for(unsigned i=0;i<3;i++){
    ButtonMotion *button=&s_buttons[i];if(!button->releasing)continue;
    uint32_t elapsed=now-button->started;
    if(elapsed>=XOCE_UI_PRESS_RELEASE_MS){button->offset=0;button->releasing=false;}
    else{
      uint32_t remaining=XOCE_UI_PRESS_RELEASE_MS-elapsed;
      button->offset=(uint8_t)xoce_ui_press_offset(elapsed);
      if(remaining<next)next=remaining;
      pending=true;
    }
  }
  repaint();if(pending&&s_focused){s_button_motion_timer=app_timer_register(next,release_frame,NULL);if(!s_button_motion_timer)settle_button_releases();}
}
static void button_pressed(ButtonId id){
  if(id<BUTTON_ID_UP||id>BUTTON_ID_DOWN)return;
  ButtonMotion *button=&s_buttons[id-BUTTON_ID_UP];button->held=true;button->releasing=false;button->offset=XOCE_UI_PRESS_DISTANCE;repaint();
}
static void button_released(ButtonId id){
  if(id<BUTTON_ID_UP||id>BUTTON_ID_DOWN)return;
  ButtonMotion *button=&s_buttons[id-BUTTON_ID_UP];if(!button->held)return;button->held=false;
  if(!s_focused){button->offset=0;return;}
  button->started=input_milliseconds();button->releasing=true;
  if(!s_button_motion_timer)s_button_motion_timer=app_timer_register(XOCE_UI_PRESS_FRAME_MS,release_frame,NULL);
  if(!s_button_motion_timer)settle_button_releases();
  repaint();
}
static void cancel_motion(void){
  if(s_button_motion_timer){app_timer_cancel(s_button_motion_timer);s_button_motion_timer=NULL;}
  for(unsigned i=0;i<3;i++){s_buttons[i].offset=0;s_buttons[i].held=false;s_buttons[i].releasing=false;}
}
static void update_ticks(void);
static void configure_clicks(void *context);
static void send_queued(void);
static void stop_repeat(void);
static void request_view(uint8_t mode,uint16_t offset,uint16_t index,uint32_t token,bool hello);
static const DbItem *pressed_item(void);
static bool control_available(const DbItem *item,unsigned index);
static void cancel_hold_preview(void){
  if(s_hold_timer){app_timer_cancel(s_hold_timer);s_hold_timer=NULL;}
  if(s_hold_preview){s_hold_preview=false;repaint();}
}
static const DbItem *preview_item(void){
  const DbItem *item=pressed_item();
  return s_paint_state==&s_state&&s_hold_preview&&s_select_down&&!s_guide&&!s_command.confirmation&&s_has_connection&&
    db_item_capability_current(item,utc_now())&&(item->flags&DB_APP)?item:NULL;
}
static GColor background(void){return (*s_paint_state).snapshot.dark?GColorBlack:GColorWhite;}
static GColor foreground(void){return (*s_paint_state).snapshot.dark?GColorWhite:GColorBlack;}
static GColor muted(void){return foreground();}
static GColor stroke(void){return (*s_paint_state).snapshot.dark?GColorDarkGray:GColorLightGray;}
static GColor accent(void){return (*s_paint_state).snapshot.dark?GColorTiffanyBlue:GColorJaegerGreen;}
static XoceUiTypeRole font_role(unsigned index) {
  return index==13?XOCE_UI_TYPE_HEADER:index==1||index==4?XOCE_UI_TYPE_MENU_SUBTITLE:
      index==2||index==5||index==9?XOCE_UI_TYPE_MENU_TITLE:XOCE_UI_TYPE_FOOTER;
}
static GFont font_at(unsigned index) {
  const char *key=index==6?FONT_KEY_LECO_20_BOLD_NUMBERS:index==7||index==8?FONT_KEY_LECO_26_BOLD_NUMBERS_AM_PM:
      index==10?FONT_KEY_LECO_32_BOLD_NUMBERS:index==11?FONT_KEY_LECO_42_NUMBERS:
      index==14?FONT_KEY_LECO_36_BOLD_NUMBERS:xoce_ui_native_font_key(s_text_size,font_role(index),s_modern_type);
  return fonts_get_system_font(key);
}
static GSize text_size(const char *value,unsigned index,int width) {
  return graphics_text_layout_get_content_size(value?value:"",font_at(index),GRect(0,0,width,2048),
      GTextOverflowModeWordWrap,GTextAlignmentLeft);
}
static int width_of(const char *value,unsigned index){return text_size(value,index,2048).w;}
static void pop_utf8(char *text){size_t n=strlen(text);if(!n)return;do{n--;}while(n&&((unsigned char)text[n]&0xc0)==0x80);text[n]=0;}
static void clean_text(char *out,size_t size,const char *value){
  if(!size)return;
  snprintf(out,size,"%s",value?value:"");
  for(char *p=out;*p;p++)if(*p=='\n'||*p=='\r'||*p=='\t')*p=' ';
}
static void fit_text(char text[265],const char *value,unsigned index,int width){
  clean_text(text,265,value);
  if(width_of(text,index)>width){
    while(text[0]){pop_utf8(text);size_t n=strlen(text);if(n+4>=265)continue;memcpy(text+n,"…",4);
      if(width_of(text,index)<=width)break;
      text[n]=0;}
  }
}
static void paint_text(GContext *ctx,const char *value,unsigned index,int x,int baseline,int width,GColor color,GTextAlignment alignment){
  const int height=text_size(value,index,width).h;
  graphics_context_set_text_color(ctx,color);
  graphics_draw_text(ctx,value,font_at(index),GRect(x,baseline-height,width,height),GTextOverflowModeWordWrap,alignment,NULL);
}
static int ink_height(const char *value,unsigned index,int width){
  char fitted[265];fit_text(fitted,value,index,width);return text_size(fitted,index,width).h;
}
static void text_top(GContext *ctx,const char *value,unsigned index,int x,int top,int width,GColor color,GTextAlignment align){
  if(width<=0)return;
  char fitted[265];fit_text(fitted,value,index,width);const int height=text_size(fitted,index,width).h;
  paint_text(ctx,fitted,index,x,top+height,width,color,align);
}
static void text_box(GContext *ctx,const char *value,unsigned index,GRect bounds,GColor color,GTextAlignment align){
  if(bounds.size.w<=0)return;
  const int height=ink_height(value,index,bounds.size.w);
  text_top(ctx,value,index,bounds.origin.x,bounds.origin.y+(bounds.size.h-height)/2,bounds.size.w,color,align);
}
static bool clock_chars(const char *text){
  for(const unsigned char *p=(const unsigned char *)text;*p;++p)if((*p<'0'||*p>'9')&&*p!=':')return false;
  return true;
}
static unsigned value_index(const char *value,int width,unsigned preferred){
  static const unsigned clocks[]={11,14,10,8,7},bodies[]={13,9,5,4};
  const unsigned *choices=clock_chars(value)?clocks:bodies;unsigned count=clock_chars(value)?5:4;
  for(unsigned i=0;i<count;i++){unsigned index=choices[i];if(s_font_points[index]<=preferred&&width_of(value,index)<=width)return index;}
  return 4;
}
static void fill(GContext *ctx,GRect bounds,GColor color,int radius){graphics_context_set_fill_color(ctx,color);graphics_fill_rect(ctx,bounds,radius,GCornersAll);}
static void edge(GContext *ctx,GRect bounds,GColor color,int radius){graphics_context_set_stroke_color(ctx,color);graphics_context_set_stroke_width(ctx,1);graphics_draw_round_rect(ctx,bounds,radius);}
static void segment(GContext *ctx,int x,int y,int x2,int y2,GColor color){graphics_context_set_stroke_color(ctx,color);graphics_context_set_stroke_width(ctx,1);graphics_draw_line(ctx,GPoint(x,y),GPoint(x2,y2));}
static bool item_selected(const DbItem *item){return item&&(*s_paint_state).selected_token==item->token&&!(*s_paint_state).loading&&!(*s_paint_state).selection_lost;}
static GColor panel(GContext *ctx,const DbItem *item,GRect bounds,bool outlined){
  if(item_selected(item)){
    fill(ctx,bounds,foreground(),0);return background();
  }
  if(outlined)edge(ctx,bounds,stroke(),0);
  return foreground();
}
static XoceUiIcon content_icon(uint8_t kind){
  switch(kind){
    case DB_TIMER:return XOCE_ICON_TIMER;
    case DB_MUSIC:return XOCE_ICON_MUSIC;
    case DB_PHONE:return XOCE_ICON_PHONE;
    case DB_FIND:return XOCE_ICON_FIND;
    case DB_NOTICE:return XOCE_ICON_NOTIFICATION;
    case DB_WEATHER:return XOCE_ICON_WEATHER;
    case DB_BATTERY:return XOCE_ICON_BATTERY;
    case DB_LIGHT:return XOCE_ICON_LIGHT;
    case DB_NAVIGATION:return XOCE_ICON_NAVIGATION;
    case DB_CALENDAR:return XOCE_ICON_CALENDAR;
    case DB_WORKOUT:return XOCE_ICON_WORKOUT;
    default:return XOCE_ICON_GENERIC;
  }
}
static void symbol(GContext *ctx,uint8_t kind,int x,int y,int size,GColor color){
  xoce_ui_draw_icon(ctx,content_icon(kind),GPoint(x+size/2,y+size/2),size,color);
}
static void picture(GContext *ctx,const DbItem *item,int x,int y,int size,GColor fallback){
  if(!item->width||!item->height||!db_item_current(item,utc_now())){symbol(ctx,item->kind,x,y,size,fallback);return;}
  const GRect fitted=xoce_ui_fit_image(GRect(x,y,size,size),item->width,item->height);
  const int width=fitted.size.w,height=fitted.size.h;
  unsigned stride=(item->width+1)/2;
  for(int row=0;row<height;row++){
    unsigned source_y=(unsigned)row*item->height/height;int start=0;uint8_t previous=0;
    for(int col=0;col<=width;col++){
      uint8_t color=0;
      if(col<width){unsigned source_x=(unsigned)col*item->width/width;uint8_t value=item->pixels[source_y*stride+source_x/2];unsigned index=source_x&1?value&15:value>>4;color=item->palette[index];}
      if(col==width||color!=previous){if(previous&0xc0)fill(ctx,GRect(fitted.origin.x+start,fitted.origin.y+row,col-start,1),(GColor){.argb=previous},0);previous=color;start=col;}
    }
  }
}
static const char *status_text(void){
  if(!s_has_connection)return app_text("Connect your phone");
  switch((*s_paint_state).snapshot.status){case DB_PERMISSION:return app_text("Allow access on phone");case DB_ERROR:return app_text("Data unavailable");case DB_OFFLINE:return app_text("Connect your phone");case DB_LOADING:return app_text("Loading sources…");default:return app_text("Nothing here yet");}
}
static const char *command_error(void){
  if(!(*s_paint_command).active||(*s_paint_command).confirmation)return NULL;
  switch((*s_paint_command).result){
    case DB_DENIED:return app_text("Allow access");
    case DB_STALE:return app_text("Item changed");
    case DB_FAILED:return (*s_paint_command).text[0]?app_text((*s_paint_command).text):app_text("Action failed");
    case DB_CANCELLED:return app_text("Cancelled");
    default:return NULL;
  }
}
static void header(GContext *ctx){
  const DbItem *preview=preview_item(),*item=db_selected(&(*s_paint_state));const char *status=NULL;
  char context[72];context[0]=0;
  if(s_ui_error)status=app_text("Not saved");
  else if(preview)status=preview->app_label;
  else if(!s_has_connection||(*s_paint_state).snapshot.status==DB_OFFLINE)status=app_text("Offline");
  else if(command_error())status=command_error();
  else if(item&&item->role==DB_ROLE_PIN&&!db_item_current(item,utc_now()))status=(item->flags&DB_UNAVAILABLE)&&item->subtitle[0]?app_text(item->subtitle):app_text("No data");
  else if(item&&(*s_paint_state).desired_mode==DB_MEDIA&&db_control_present(item,(*s_paint_state).focus)&&!control_available(item,(*s_paint_state).focus))status=app_text("Unavailable");
  const char *title=s_paint_guide?"Buttons":(*s_paint_command).confirmation?"Action":(*s_paint_state).desired_mode==DB_ACTIVITIES?"Activities":(*s_paint_state).desired_mode==DB_PINNED?"Pinned":(*s_paint_state).desired_mode==DB_MEDIA?"Action":"Dashboard";
  bool collection=!status&&((*s_paint_state).desired_mode==DB_ACTIVITIES||(*s_paint_state).desired_mode==DB_PINNED);
  if(collection){
    if((*s_paint_state).loading)snprintf(context,sizeof(context),"%s…",app_text(title));
    else snprintf(context,sizeof(context),"%u/%u",(*s_paint_state).snapshot.total?(*s_paint_state).selected_index+1:0,(*s_paint_state).snapshot.total);
    status=context;
  }
  // Collection position is more useful than repeating the collection title.
  const char *compact=!strcmp(title,"Dashboard")?"Home":!strcmp(title,"Activities")?"Activity":title;
  const char *left=collection&&!(*s_paint_state).loading?context:status?status:app_heading(compact);
  char right[16];time_t now=time(NULL);struct tm *local=localtime(&now);
  strftime(right,sizeof(right),clock_is_24h_style()?"%H:%M":"%I:%M",local);
  if(!clock_is_24h_style()&&right[0]=='0')memmove(right,right+1,strlen(right));
  const XoceUiHeaderLayout layout=xoce_ui_native_header_layout(right,s_text_size,s_modern_type,CONTENT_W,8,32);
  xoce_ui_native_draw(ctx,left,s_text_size,XOCE_UI_TYPE_HEADER,s_modern_type,layout.label,foreground(),GTextAlignmentLeft,GTextOverflowModeTrailingEllipsis);
  xoce_ui_native_draw(ctx,right,s_text_size,XOCE_UI_TYPE_HEADER,s_modern_type,layout.clock,foreground(),GTextAlignmentRight,GTextOverflowModeWordWrap);
  segment(ctx,0,layout.height-1,CONTENT_W,layout.height-1,stroke());
}
static bool control_available(const DbItem *item,unsigned index){const uint16_t bits[]={DB_MEDIA_PREVIOUS,DB_MEDIA_TOGGLE,DB_MEDIA_NEXT};return item&&index<3&&(item->flags&bits[index])&&db_item_actionable(item,utc_now());}
static void item_value(const DbItem *item,char *value,size_t size){
  if(item->flags&DB_LOCAL_WATCH){BatteryChargeState battery=battery_state_service_peek();snprintf(value,size,"%u%%",battery.charge_percent);return;}
  db_item_value(item,utc_now(),value,size);
}
static void media_identity(const DbItem *item,char *out,size_t size) {
  const char *identity=item->subtitle[0]?item->subtitle:item->name;
  if(item->flags&DB_PAUSED)snprintf(out,size,"%s · %s",app_text("Paused"),identity[0]?identity:app_text("Music"));
  else snprintf(out,size,"%s",identity);
}
static void empty_message(GContext *ctx,const char *title,const char *detail,int y){
  (void)y;const bool has_detail=detail&&detail[0];
  const int title_height=text_size(title,4,150).h,detail_height=has_detail?text_size(detail,0,150).h:0;
  const int height=title_height+(has_detail?8+detail_height:0),icon_space=height+48<=SCREEN_H-32?44:0;
  const int top=32+(SCREEN_H-32-height-icon_space)/2;
  if(icon_space)symbol(ctx,DB_GENERIC,(CONTENT_W-28)/2,top,28,muted());
  graphics_context_set_text_color(ctx,foreground());
  graphics_draw_text(ctx,title,font_at(4),GRect(8,top+icon_space,150,title_height),GTextOverflowModeWordWrap,GTextAlignmentCenter,NULL);
  if(has_detail)graphics_draw_text(ctx,detail,font_at(0),GRect(8,top+icon_space+title_height+8,150,detail_height),GTextOverflowModeWordWrap,GTextAlignmentCenter,NULL);
}
typedef struct {
  const DbItem *item;
  char title[265],detail[265],value[64];
  unsigned title_font,value_font;
  int title_height,value_height,value_width,label_width,detail_height,height;
} SnapshotRow;
static const DbItem *snapshot_item(unsigned slot){
  unsigned pins=0;
  for(unsigned i=0;i<(*s_paint_state).snapshot.count;++i){
    const DbItem *item=&(*s_paint_state).snapshot.items[i];
    if((slot==0&&item->role==DB_ROLE_ACTIVITY)||(slot==1&&item->role==DB_ROLE_NOTICE))return item;
    if(slot>=2&&item->role==DB_ROLE_PIN&&pins++==slot-2)return item;
  }
  return NULL;
}
static void snapshot_row(unsigned slot,SnapshotRow *row){
  memset(row,0,sizeof(*row));row->item=snapshot_item(slot);const DbItem *item=row->item;
  row->title_font=slot==0?5:4;row->value_font=5;
  if(!item){
    clean_text(row->title,sizeof(row->title),app_text(slot==0?"Nothing active":slot==1?"No notifications":slot==2?"Choose pins":"on phone"));
    row->title_font=4;
  }else if(!db_item_current(item,utc_now())){
    clean_text(row->title,sizeof(row->title),app_text(slot==0?"Activity unavailable":slot==1?"Notifications":"No data"));
    if(slot==1)clean_text(row->detail,sizeof(row->detail),app_text("No preview"));
  }else{
    clean_text(row->title,sizeof(row->title),item->title[0]?item->title:item->name);
    if(slot==0&&(item->flags&DB_IS_MEDIA))media_identity(item,row->detail,sizeof(row->detail));
    else if(slot!=1){
      item_value(item,row->value,sizeof(row->value));
      if(slot==0)clean_text(row->detail,sizeof(row->detail),item->subtitle);
    }else{
      if(!row->title[0])clean_text(row->title,sizeof(row->title),app_text("Notifications"));
      clean_text(row->detail,sizeof(row->detail),(item->flags&DB_PRIVATE)?(item->subtitle[0]?item->subtitle:app_text("New notification")):app_text(item->subtitle));
    }
  }
  /* Reserve complete values and units first. Only labels/previews ellipsize;
   * an atomic value that cannot fit uses the existing localized overflow. */
  if(row->value[0]&&width_of(row->value,row->value_font)>119){
    clean_text(row->value,sizeof(row->value),app_text("Too long"));row->value_font=4;
  }
  row->value_width=row->value[0]?width_of(row->value,row->value_font):0;
  row->label_width=119-(row->value_width?row->value_width+6:0);
  row->title_height=text_size("Ag",row->title_font,2048).h;
  row->value_height=row->value[0]?text_size(row->value,row->value_font,2048).h:0;
  row->height=row->title_height>row->value_height?row->title_height:row->value_height;
  if(row->height<24)row->height=24;
  row->height+=8;
}
static void snapshot_layout(SnapshotRow rows[4],int viewport){
  int used=0;
  for(unsigned slot=0;slot<4;++slot){snapshot_row(slot,&rows[slot]);used+=rows[slot].height;}
  /* A supporting line is optional. Activity identity has first claim, then
   * the notification preview; selection never changes these allocations. */
  for(unsigned slot=0;slot<2;++slot){
    if(!rows[slot].detail[0])continue;
    const int height=text_size("Ag",4,2048).h;
    if(used+4+height<=viewport){rows[slot].detail_height=height;rows[slot].height+=4+height;used+=4+height;}
  }
  for(unsigned slot=0;slot<4&&used<viewport;++slot){
    const int extra=(viewport-used)/(4-slot);rows[slot].height+=extra;used+=extra;
  }
}
static void snapshot_body_draw(Layer *layer,GContext *ctx){
  paint_begin(DB_OVERVIEW);fill(ctx,layer_get_bounds(layer),background(),0);int top=0;
  static SnapshotRow rows[4];snapshot_layout(rows,layer_get_bounds(layer).size.h);
  for(unsigned slot=0;slot<4;++slot){
    const SnapshotRow *row=&rows[slot];const GColor ink=panel(ctx,row->item,GRect(0,top,CONTENT_W,row->height),false);
    const int first=row->height-(row->detail_height?row->detail_height+4:0);
    if(row->item)picture(ctx,row->item,9,top+(first-24)/2,24,ink);
    else symbol(ctx,slot==1?DB_NOTICE:DB_GENERIC,9,top+(first-24)/2,24,ink);
    text_box(ctx,row->title,row->title_font,GRect(40,top,row->label_width,first),ink,GTextAlignmentLeft);
    if(row->value[0])text_box(ctx,row->value,row->value_font,GRect(159-row->value_width,top,row->value_width,first),ink,GTextAlignmentRight);
    if(row->detail_height)text_top(ctx,row->detail,4,40,top+first,119,ink,GTextAlignmentLeft);
    top+=row->height;segment(ctx,8,top-1,CONTENT_W-8,top-1,stroke());
  }
  paint_begin(s_current_screen);
}
static void sync_snapshot(bool animated){
  (void)animated;
  if(!s_snapshot_scroll||s_current_screen!=DB_OVERVIEW)return;
  const bool visible=s_state.ready&&!s_state.loading&&
      (s_state.snapshot.status<DB_OFFLINE||s_state.snapshot.count);
  layer_set_hidden(scroll_layer_get_layer(s_snapshot_scroll),!visible);if(!visible)return;
  /* ScrollLayer remains a container only. Collections/details keep their
   * native scrolling, while the overview always uses the real viewport. */
  const int viewport=layer_get_frame(scroll_layer_get_layer(s_snapshot_scroll)).size.h;
  layer_set_frame(s_snapshot_body,GRect(0,0,CONTENT_W,viewport));
  scroll_layer_set_content_size(s_snapshot_scroll,GSize(CONTENT_W,viewport));
  scroll_layer_set_content_offset(s_snapshot_scroll,GPointZero,false);
  layer_mark_dirty(s_snapshot_body);
}
typedef struct {
  char title[265],detail[144];
  int title_height,detail_height,height;
} CollectionRow;
static void collection_layout(const DbItem *item,CollectionRow *row){
  memset(row,0,sizeof(*row));
  fit_text(row->title,item->title[0]?item->title:item->name,5,119);
  if(item->flags&DB_IS_MEDIA)media_identity(item,row->detail,sizeof(row->detail));
  else item_value(item,row->detail,sizeof(row->detail));
  row->title_height=text_size(row->title,5,119).h;
  if(row->detail[0])row->detail_height=text_size(row->detail,4,119).h;
  if(item->flags&DB_IS_MEDIA){const int max=2*text_size("Ag",4,119).h;if(row->detail_height>max)row->detail_height=max;}
  row->height=row->title_height+(row->detail_height?4+row->detail_height:0)+12;
  if(row->height<36)row->height=36;
}
static int list_row_height(const DbItem *item){
  static CollectionRow row;collection_layout(item,&row);return row.height;
}
static void list_row(GContext *ctx,const DbItem *item,int y,int height,GColor ink){
  static CollectionRow row;collection_layout(item,&row);picture(ctx,item,9,y+(height-26)/2,26,ink);
  const int top=y+(height-row.title_height-(row.detail_height?4+row.detail_height:0))/2;
  graphics_context_set_text_color(ctx,ink);
  graphics_draw_text(ctx,row.title,font_at(5),GRect(40,top,119,row.title_height),GTextOverflowModeWordWrap,GTextAlignmentLeft,NULL);
  if(row.detail_height)graphics_draw_text(ctx,row.detail,font_at(4),GRect(40,top+row.title_height+4,119,row.detail_height),
      GTextOverflowModeTrailingEllipsis,GTextAlignmentLeft,NULL);
}
static uint16_t collection_count(MenuLayer *menu,uint16_t section,void *context){
  (void)menu;(void)section;paint_begin((unsigned)(uintptr_t)context);unsigned count=(*s_paint_state).snapshot.count;paint_begin(s_current_screen);return count;
}
static int16_t collection_height(MenuLayer *menu,MenuIndex *index,void *context){
  (void)menu;paint_begin((unsigned)(uintptr_t)context);int16_t height=list_row_height(&(*s_paint_state).snapshot.items[index->row]);paint_begin(s_current_screen);return height;
}
static void collection_draw(GContext *ctx,const Layer *cell,MenuIndex *index,void *context){
  paint_begin((unsigned)(uintptr_t)context);const bool selected=menu_cell_layer_is_highlighted(cell)&&!(*s_paint_state).selection_lost;
  const GRect bounds=layer_get_bounds(cell);
  fill(ctx,bounds,selected?foreground():background(),0);
  list_row(ctx,&(*s_paint_state).snapshot.items[index->row],0,bounds.size.h,selected?background():foreground());paint_begin(s_current_screen);
}
static void sync_native_ui(bool animated){
  sync_snapshot(animated);sync_secondary();sync_action_menu(animated);
  static int16_t cached_heights[2][DB_MAX_ITEMS];static unsigned counts[2];
  static uint16_t offsets[2];static bool dark[2];
  for(unsigned i=0;i<2;++i){
    MenuLayer *menu=s_collection_menu[i];if(!menu)continue;
    if(s_current_screen!=i+1)continue;
    const bool visible=s_state.desired_mode==i+1&&!s_guide&&!s_command.confirmation&&
        s_state.ready&&!s_state.loading&&s_state.snapshot.count;
    layer_set_hidden(menu_layer_get_layer(menu),!visible);if(!visible)continue;
    bool changed=counts[i]!=s_state.snapshot.count||offsets[i]!=s_state.snapshot.offset;
    counts[i]=s_state.snapshot.count;offsets[i]=s_state.snapshot.offset;
    for(unsigned row=0;row<counts[i];++row){
      const int16_t height=list_row_height(&s_state.snapshot.items[row]);
      if(cached_heights[i][row]!=height){cached_heights[i][row]=height;changed=true;}
    }
    if(changed)menu_layer_reload_data(menu);
    if(changed||dark[i]!=s_state.snapshot.dark){
      dark[i]=s_state.snapshot.dark;
      menu_layer_set_normal_colors(menu,background(),foreground());
      menu_layer_set_highlight_colors(menu,foreground(),background());
    }
    unsigned row=s_state.selected_index-s_state.snapshot.offset;if(row>=counts[i])row=0;
    if(changed||menu_layer_get_selected_index(menu).row!=row){
      int top=0;for(unsigned n=0;n<row;++n)top+=cached_heights[i][n];
      const int offset=scroll_layer_get_content_offset(menu_layer_get_scroll_layer(menu)).y;
      const int height=layer_get_frame(menu_layer_get_layer(menu)).size.h;
      const MenuRowAlign align=top+offset<0?MenuRowAlignTop:
          top+offset+cached_heights[i][row]>height?MenuRowAlignBottom:MenuRowAlignNone;
      menu_layer_set_selected_index(menu,(MenuIndex){.row=row},align,animated&&!changed);
    }
    layer_mark_dirty(menu_layer_get_layer(menu));
  }
}
static XoceUiIcon playback_symbol(unsigned index,bool paused){
  return index==0?XOCE_ICON_PREVIOUS_TRACK:index==2?XOCE_ICON_NEXT_TRACK:
      paused?XOCE_ICON_PLAY:XOCE_ICON_PAUSE;
}
static void playback_icon(GContext *ctx,unsigned index,bool paused,int x,int y,GColor color){
  xoce_ui_draw_icon(ctx,playback_symbol(index,paused),GPoint(x+10,y+10),20,color);
}
static void media_view(GContext *ctx){
  const DbItem *item=db_selected(&(*s_paint_state));
  if(!item||!db_item_current(item,utc_now())){empty_message(ctx,app_text("Activity unavailable"),app_text("Back returns to your list"),66);return;}
  if(item->flags&DB_IS_MEDIA){
    char title[193];clean_text(title,sizeof(title),item->title);
    unsigned split=0;char first[193]="",second[193]="";
    if(width_of(title,5)>CONTENT_W-20){for(unsigned i=0;title[i];i++)if(title[i]==' '){char saved=title[i];title[i]=0;if(width_of(title,5)<=CONTENT_W-20)split=i;title[i]=saved;}}
    if(split){memcpy(first,title,split);first[split]=0;snprintf(second,sizeof(second),"%s",title+split+1);int first_height=ink_height(first,5,CONTENT_W-20),height=first_height+4+ink_height(second,5,CONTENT_W-20),top=38+(59-height)/2;text_top(ctx,first,5,9,top,CONTENT_W-20,foreground(),GTextAlignmentLeft);text_top(ctx,second,5,9,top+first_height+4,CONTENT_W-20,foreground(),GTextAlignmentLeft);}
    else text_box(ctx,title,5,GRect(9,38,CONTENT_W-20,59),foreground(),GTextAlignmentLeft);
    const char *status=item->value[0]?app_text(item->value):item->flags&DB_PAUSED?app_text("Paused"):"";int artist_height=ink_height(item->subtitle,4,CONTENT_W-68),detail_height=artist_height+4+ink_height(status,4,CONTENT_W-68),detail_y=105+(40-detail_height)/2;
    picture(ctx,item,9,105,40,accent());text_top(ctx,item->subtitle,4,58,detail_y,CONTENT_W-68,foreground(),GTextAlignmentLeft);text_top(ctx,status,4,58,detail_y+artist_height+4,CONTENT_W-68,muted(),GTextAlignmentLeft);
    for(unsigned i=0;i<3;i++){
      bool available=control_available(item,i),selected=(*s_paint_state).focus==i;GColor ink=selected?background():available?foreground():muted();int x=5+i*53;
      if(selected)fill(ctx,GRect(x,163,50,37),foreground(),3);else edge(ctx,GRect(x,163,50,37),stroke(),3);
      playback_icon(ctx,i,(item->flags&DB_PAUSED)!=0,x+15,171,ink);
    }
  } /* Non-media commands use their measured MenuLayer below the header. */
}

static unsigned control_for_row(const DbItem *item,unsigned row){
  if(!item)return 3;
  for(unsigned i=0;i<3;++i)if(db_control_present(item,i)){if(!row)return i;--row;}
  return 3;
}
static int action_context(GContext *ctx){
  const DbItem *item=db_selected(s_paint_state);if(!item)return 0;
  char value[64];item_value(item,value,sizeof(value));
  const char *lines[]={item->title[0]?item->title:item->name,value[0]?value:item->subtitle};
  int top=4;
  for(unsigned i=0;i<2;++i){
    if(!lines[i][0])continue;
    const int height=text_size(lines[i],i?4:5,150).h;
    if(ctx){graphics_context_set_text_color(ctx,i?muted():foreground());graphics_draw_text(ctx,lines[i],font_at(i?4:5),GRect(8,top,150,height),GTextOverflowModeWordWrap,GTextAlignmentLeft,NULL);}
    top+=height+6;
  }
  return top+2;
}
static uint16_t action_rows(MenuLayer *menu,uint16_t section,void *context){
  (void)menu;(void)section;(void)context;paint_begin(DB_MEDIA);const DbItem *item=db_selected(s_paint_state);unsigned count=0;
  for(unsigned i=0;i<3;++i)if(db_control_present(item,i))++count;
  paint_begin(s_current_screen);return count;
}
static int16_t action_header_height(MenuLayer *menu,uint16_t section,void *context){
  (void)menu;(void)section;(void)context;paint_begin(DB_MEDIA);const int height=action_context(NULL);paint_begin(s_current_screen);return height;
}
static int16_t action_row_height(MenuLayer *menu,MenuIndex *index,void *context){
  (void)menu;(void)context;paint_begin(DB_MEDIA);const DbItem *item=db_selected(s_paint_state);const unsigned control=control_for_row(item,index->row);
  const char *label=control<3&&item->controls[control][0]?item->controls[control]:app_text("Action");
  const int height=text_size(label,5,150).h+12;paint_begin(s_current_screen);return height;
}
static void action_header_draw(GContext *ctx,const Layer *cell,uint16_t section,void *context){
  (void)cell;(void)section;(void)context;paint_begin(DB_MEDIA);action_context(ctx);paint_begin(s_current_screen);
}
static void action_row_draw(GContext *ctx,const Layer *cell,MenuIndex *index,void *context){
  (void)context;paint_begin(DB_MEDIA);const DbItem *item=db_selected(s_paint_state);const unsigned control=control_for_row(item,index->row);
  const GRect bounds=layer_get_bounds(cell);const bool selected=menu_cell_layer_is_highlighted(cell);
  fill(ctx,bounds,selected?foreground():background(),0);
  if(control<3){
    const GColor ink=selected?background():foreground();
    const char *label=item->controls[control][0]?item->controls[control]:app_text("Action");const int height=text_size(label,5,150).h;
    graphics_context_set_text_color(ctx,ink);graphics_draw_text(ctx,label,font_at(5),GRect(8,(bounds.size.h-height)/2,150,height),GTextOverflowModeWordWrap,GTextAlignmentLeft,NULL);
  }
  paint_begin(s_current_screen);
}
static void sync_action_menu(bool animated){
  if(!s_action_menu||s_current_screen!=DB_MEDIA)return;
  const DbItem *item=db_selected(&s_state);
  const bool visible=item&&s_state.ready&&!s_state.loading&&!(item->flags&DB_IS_MEDIA);
  layer_set_hidden(menu_layer_get_layer(s_action_menu),!visible);if(!visible)return;
  static int geometry[4];static unsigned previous_count;static bool dark;
  const int header=action_context(NULL);bool changed=geometry[0]!=header;geometry[0]=header;
  unsigned count=0,row=0;
  for(unsigned i=0;i<3;++i)if(db_control_present(item,i)){
    if(i==s_state.focus)row=count;
    const int height=text_size(item->controls[i][0]?item->controls[i]:app_text("Action"),5,150).h+12;
    if(geometry[count+1]!=height){geometry[count+1]=height;changed=true;}++count;
  }
  if(count!=previous_count){previous_count=count;changed=true;}
  if(changed)menu_layer_reload_data(s_action_menu);
  if(changed||dark!=s_state.snapshot.dark){dark=s_state.snapshot.dark;menu_layer_set_normal_colors(s_action_menu,background(),foreground());menu_layer_set_highlight_colors(s_action_menu,foreground(),background());}
  if(count&&(changed||menu_layer_get_selected_index(s_action_menu).row!=row)){
    int top=header;for(unsigned i=0;i<row;++i)top+=geometry[i+1];
    const int offset=scroll_layer_get_content_offset(menu_layer_get_scroll_layer(s_action_menu)).y;
    const MenuRowAlign align=top+offset<0?MenuRowAlignTop:top+offset+geometry[row+1]>SCREEN_H-36?MenuRowAlignBottom:MenuRowAlignNone;
    menu_layer_set_selected_index(s_action_menu,(MenuIndex){.row=row},align,animated&&!changed);
  }
  layer_mark_dirty(menu_layer_get_layer(s_action_menu));
}
static XoceUiIcon action_symbol(const DbItem *item,unsigned action){
  if(item->flags&DB_IS_MEDIA)return playback_symbol(action,(item->flags&DB_PAUSED)!=0);
  if(item->kind==DB_LIGHT)return XOCE_ICON_POWER;
  if(item->kind==DB_FIND)return XOCE_ICON_FIND;
  return XOCE_ICON_CHECK;
}
static void action_bar(GContext *ctx){
  XoceUiIcon icons[]={XOCE_ICON_NONE,XOCE_ICON_NONE,XOCE_ICON_NONE};
  if(s_paint_guide){
    icons[1]=XOCE_ICON_CHECK;
    if(s_guide_scroll){const int offset=scroll_layer_get_content_offset(s_guide_scroll).y;if(offset<0)icons[0]=XOCE_ICON_UP;if(offset+layer_get_frame(s_guide_body).size.h>SCREEN_H-36)icons[2]=XOCE_ICON_DOWN;}
    goto draw;
  }
  if(!(*s_paint_command).confirmation){icons[0]=XOCE_ICON_UP;icons[2]=XOCE_ICON_DOWN;}
  if((*s_paint_state).loading||!(*s_paint_state).ready)goto draw;
  const DbItem *item=db_selected(&(*s_paint_state));
  if(!s_has_connection||!db_item_capability_current(item,utc_now()))goto draw;
  if(preview_item()){icons[1]=XOCE_ICON_LAUNCH;goto draw;}
  if((*s_paint_command).active&&(*s_paint_command).result==DB_PENDING){icons[1]=XOCE_ICON_MORE;goto draw;}
  if((*s_paint_command).confirmation){
    if(s_confirm_accept){icons[0]=XOCE_ICON_UP;icons[1]=action_symbol(item,(*s_paint_command).action);}
    else{icons[1]=XOCE_ICON_CHECK;icons[2]=XOCE_ICON_DOWN;}
    goto draw;
  }
  if((*s_paint_command).active&&(*s_paint_command).result==DB_SUCCESS){icons[1]=XOCE_ICON_CHECK;goto draw;}
  if((*s_paint_state).desired_mode==DB_MEDIA){if(control_available(item,(*s_paint_state).focus))icons[1]=action_symbol(item,(*s_paint_state).focus);}
  else if(item->flags&DB_NOTIFICATION){if(item->flags&DB_APP)icons[1]=XOCE_ICON_NOTIFICATION;}
  else if(item->role==DB_ROLE_ACTIVITY&&(item->flags&DB_IS_MEDIA)){if(db_item_direct_action(item,utc_now())==1)icons[1]=action_symbol(item,1);}
  else if(db_item_actionable(item,utc_now())){
    icons[1]=item->role==DB_ROLE_ACTIVITY?XOCE_ICON_MORE:action_symbol(item,0);
  }
 draw:;
  const int8_t offsets[]={-(int)s_buttons[0].offset,-(int)s_buttons[1].offset,-(int)s_buttons[2].offset};
  xoce_ui_draw_action_bar(ctx,GRect(CONTENT_W,0,ACTION_BAR_WIDTH,SCREEN_H),icons,offsets,foreground(),background());
}
static int confirmation_context(GContext *ctx){
  const DbItem *item=db_selected(s_paint_state);
  const char *lines[]={item&&item->action_label[0]?item->action_label:app_text("Run action?"),
      item?(item->title[0]?item->title:item->name):app_text("Selected item"),app_text("Back cancels")};
  const unsigned fonts[]={5,4,0};int top=4;
  for(unsigned i=0;i<3;++i){
    const int height=text_size(lines[i],fonts[i],150).h;
    if(ctx){graphics_context_set_text_color(ctx,i==2?muted():foreground());graphics_draw_text(ctx,lines[i],font_at(fonts[i]),GRect(8,top,150,height),GTextOverflowModeWordWrap,GTextAlignmentLeft,NULL);}
    top+=height+6;
  }
  return top+2;
}
static uint16_t confirmation_rows(MenuLayer *menu,uint16_t section,void *context){(void)menu;(void)section;(void)context;return 2;}
static int16_t confirmation_header_height(MenuLayer *menu,uint16_t section,void *context){
  (void)menu;(void)section;(void)context;paint_begin(SCREEN_CONFIRM);const int height=confirmation_context(NULL);paint_begin(s_current_screen);return height;
}
static int16_t confirmation_row_height(MenuLayer *menu,MenuIndex *index,void *context){
  (void)menu;(void)context;return text_size(app_text(index->row?"Run action":"Cancel"),5,150).h+12;
}
static void confirmation_header_draw(GContext *ctx,const Layer *cell,uint16_t section,void *context){
  (void)cell;(void)section;(void)context;paint_begin(SCREEN_CONFIRM);confirmation_context(ctx);paint_begin(s_current_screen);
}
static void confirmation_row_draw(GContext *ctx,const Layer *cell,MenuIndex *index,void *context){
  (void)context;paint_begin(SCREEN_CONFIRM);const bool selected=menu_cell_layer_is_highlighted(cell);
  const GRect bounds=layer_get_bounds(cell);const GColor ink=selected?background():foreground();
  fill(ctx,bounds,selected?foreground():background(),0);graphics_context_set_text_color(ctx,ink);
  const char *label=app_text(index->row?"Run action":"Cancel");const int height=text_size(label,5,150).h;
  graphics_draw_text(ctx,label,font_at(5),GRect(8,(bounds.size.h-height)/2,150,height),GTextOverflowModeWordWrap,GTextAlignmentLeft,NULL);paint_begin(s_current_screen);
}
static const char *guide_line(unsigned index){
  static const char *const keys[]={"Up / Down: move","Hold Up: activity","Hold Down: pins","Select: action","Hold Select: app","Back: return","Select to start"};
  return app_text(keys[index]);
}
static int guide_body(GContext *ctx){
  int top=4;
  for(unsigned i=0;i<7;++i){
    const char *line=guide_line(i);const int height=text_size(line,0,150).h+6;
    if(ctx){
      if(i==6)fill(ctx,GRect(0,top,CONTENT_W,height),foreground(),0);
      graphics_context_set_text_color(ctx,i==6?background():foreground());
      graphics_draw_text(ctx,line,font_at(0),GRect(8,top,150,height),GTextOverflowModeWordWrap,GTextAlignmentLeft,NULL);
    }
    top+=height;
  }
  return top+4;
}
static void guide_body_draw(Layer *layer,GContext *ctx){paint_begin(SCREEN_GUIDE);fill(ctx,layer_get_bounds(layer),background(),0);guide_body(ctx);paint_begin(s_current_screen);}
static void sync_secondary(void){
  if(s_current_screen==SCREEN_GUIDE&&s_guide_scroll){
    const int height=guide_body(NULL);if(layer_get_frame(s_guide_body).size.h!=height){layer_set_frame(s_guide_body,GRect(0,0,CONTENT_W,height));scroll_layer_set_content_size(s_guide_scroll,GSize(CONTENT_W,height));}
    layer_mark_dirty(s_guide_body);
  }
  if(s_current_screen==SCREEN_CONFIRM&&s_confirm_menu){
    static int header,rows[2];const int next=confirmation_context(NULL);
    bool changed=header!=next;header=next;
    for(unsigned i=0;i<2;++i){const int height=text_size(app_text(i?"Run action":"Cancel"),5,150).h+12;if(rows[i]!=height){rows[i]=height;changed=true;}}
    if(changed)menu_layer_reload_data(s_confirm_menu);
    menu_layer_set_normal_colors(s_confirm_menu,background(),foreground());menu_layer_set_highlight_colors(s_confirm_menu,foreground(),background());
    const unsigned row=s_confirm_accept?1:0;
    if(changed||menu_layer_get_selected_index(s_confirm_menu).row!=row)menu_layer_set_selected_index(s_confirm_menu,(MenuIndex){.row=row},MenuRowAlignBottom,false);
    layer_mark_dirty(menu_layer_get_layer(s_confirm_menu));
  }
}
static void guide_step(int direction){
  const GPoint offset=scroll_layer_get_content_offset(s_guide_scroll);
  scroll_layer_set_content_offset(s_guide_scroll,GPoint(0,offset.y-direction*50),true);repaint();
}
static void confirmation_step(bool up){
  ScrollLayer *scroll=menu_layer_get_scroll_layer(s_confirm_menu);const GPoint offset=scroll_layer_get_content_offset(scroll);
  if(!s_confirm_accept&&up&&offset.y<0){scroll_layer_set_content_offset(scroll,GPoint(0,offset.y+60>0?0:offset.y+60),true);return;}
  if(!s_confirm_accept&&!up&&confirmation_context(NULL)+text_size(app_text("Cancel"),5,150).h+12+offset.y>SCREEN_H-36){menu_layer_set_selected_index(s_confirm_menu,(MenuIndex){0,0},MenuRowAlignBottom,true);return;}
  s_confirm_accept=!up;menu_layer_set_selected_index(s_confirm_menu,(MenuIndex){.row=s_confirm_accept?1:0},MenuRowAlignBottom,true);
}
static void update(Layer *layer,GContext *ctx){
  const unsigned screen=*(unsigned *)layer_get_data(layer);paint_begin(screen);
  fill(ctx,GRect(0,0,SCREEN_W,SCREEN_H),background(),0);
  if(s_paint_guide||screen==SCREEN_CONFIRM){header(ctx);action_bar(ctx);paint_begin(s_current_screen);return;}
  header(ctx);
  if((*s_paint_state).loading||!(*s_paint_state).ready)empty_message(ctx,s_has_connection?app_text("Loading…"):app_text("Phone disconnected"),s_has_connection?app_text("Waiting for data"):app_text("Reconnect your phone"),66);
  else if((*s_paint_state).snapshot.status>=DB_OFFLINE&&!(*s_paint_state).snapshot.count)empty_message(ctx,status_text(),(*s_paint_state).snapshot.status==DB_PERMISSION?app_text("Open phone settings"):app_text("Back is available"),66);
  else if((*s_paint_state).desired_mode==DB_OVERVIEW){ /* ScrollLayer owns the measured Snapshot body. */ }
  else if((*s_paint_state).desired_mode==DB_MEDIA)media_view(ctx);
  else if(!(*s_paint_state).snapshot.count)empty_message(ctx,(*s_paint_state).desired_mode==DB_ACTIVITIES?app_text("Nothing active"):app_text("No pinned items"),(*s_paint_state).desired_mode==DB_PINNED?app_text("Choose items on phone"):"",66);
  action_bar(ctx);paint_begin(s_current_screen);
}
static bool read_uint(DictionaryIterator *dict,uint32_t key,uint32_t *value){
  Tuple *t=dict_find(dict,key);if(!t||(t->type!=TUPLE_UINT&&t->type!=TUPLE_INT))return false;
  if(t->length==1){if(t->type==TUPLE_INT&&t->value->int8<0)return false;*value=t->value->uint8;}
  else if(t->length==2){if(t->type==TUPLE_INT&&t->value->int16<0)return false;*value=t->value->uint16;}
  else if(t->length==4){if(t->type==TUPLE_INT&&t->value->int32<0)return false;*value=t->value->uint32;}
  else return false;
  return true;
}
static void view_failed(void *context){(void)context;s_view_timeout=NULL;if(!s_state.loading)return;stop_repeat();db_state_fail_view(&s_state,s_has_connection?DB_ERROR:DB_OFFLINE);update_ticks();repaint();}
static void clear_feedback(void *context){(void)context;s_action_timeout=NULL;memset(&s_command,0,sizeof(s_command));repaint();}
static void finish_feedback(void){
  if(s_action_timeout){app_timer_cancel(s_action_timeout);s_action_timeout=NULL;}
  if(s_command.result==DB_SUCCESS)s_action_timeout=app_timer_register(1000,clear_feedback,NULL);
}
static void acknowledge_feedback(void){
  if(s_command.active&&s_command.ended){if(s_action_timeout){app_timer_cancel(s_action_timeout);s_action_timeout=NULL;}memset(&s_command,0,sizeof(s_command));repaint();}
}
static void action_failed(void *context){(void)context;s_action_timeout=NULL;if(s_command.active){s_command.result=DB_FAILED;s_command.confirmation=false;s_command.ended=true;snprintf(s_command.text,sizeof(s_command.text),"%s",app_text("No response"));finish_feedback();repaint();}}
static void ui_reply(const DashboardUiPreferences *value,uint8_t status,uint8_t flags){
  dashboard_ui_preferences_encode(value,status,flags,s_ui_reply);++s_ui_generation;
  s_ui_attempts=0;s_ui_pending=true;
}
static void apply_ui_preferences(const DashboardUiPreferences *value){
  stop_repeat();cancel_hold_preview();cancel_motion();db_press_cancel(&s_press);
  s_select_down=false;s_hold_intent=false;s_ui_preferences=*value;s_ui_error=false;
  s_text_size=xoce_ui_effective_text_size(value->text_size,s_system_text_size);
  s_state.snapshot.dark=dashboard_ui_preferences_dark(value);
  for(unsigned i=0;i<SCREEN_COUNT;++i)if(s_windows[i])window_set_background_color(s_windows[i],background());
  repaint();
}
static void send_queued(void){
  if(s_sending)return;
  if(s_ui_pending&&s_ui_attempts<3&&s_has_connection){
    ++s_ui_attempts;DictionaryIterator *out;
    if(app_message_outbox_begin(&out)!=APP_MSG_OK)return;
    dict_write_data(out,DB_KEY_UI_PREFERENCES_RESULT,s_ui_reply,sizeof(s_ui_reply));dict_write_end(out);
    s_sending=true;s_ui_sending=true;s_ui_pending=false;s_ui_flight=s_ui_generation;
    if(app_message_outbox_send()!=APP_MSG_OK){s_sending=false;s_ui_sending=false;s_ui_pending=true;}
    return;
  }
  if(!s_queue_count)return;
  DictionaryIterator *dict;AppMessageResult error=app_message_outbox_begin(&dict);if(error!=APP_MSG_OK){s_queue_count=0;if(s_state.loading)view_failed(NULL);else action_failed(NULL);return;}
  Outbound item=s_queue[0];dict_write_uint8(dict,DB_KEY_OPERATION,item.op);dict_write_uint32(dict,DB_KEY_SESSION,s_state.session);dict_write_uint32(dict,DB_KEY_REQUEST,item.request);
  dict_write_uint8(dict,DB_KEY_MODE,item.mode);dict_write_uint16(dict,DB_KEY_OFFSET,item.offset);dict_write_uint16(dict,DB_KEY_INDEX,item.index);
  if(item.token){dict_write_uint32(dict,DB_KEY_TOKEN,item.token);dict_write_uint32(dict,DB_KEY_VERSION,item.version);}
  if(item.op==DB_OP_ACTION){dict_write_uint8(dict,DB_KEY_ACTION,item.action);dict_write_uint8(dict,DB_KEY_CONFIRM,item.confirm);}
  s_sending=true;
  if(app_message_outbox_send()!=APP_MSG_OK){s_sending=false;s_queue_count=0;if(s_state.loading)view_failed(NULL);else action_failed(NULL);}
}
static void queue_message(Outbound item){
  if(item.op==DB_OP_VIEW||item.op==DB_OP_HELLO){for(unsigned i=s_sending&&!s_ui_sending?1:0;i<s_queue_count;i++)if(s_queue[i].op==DB_OP_VIEW||s_queue[i].op==DB_OP_HELLO){s_queue[i]=item;send_queued();return;}}
  if(item.op==DB_OP_FOCUS){
    for(unsigned i=s_sending&&!s_ui_sending?1:0;i<s_queue_count;i++)if(s_queue[i].op==DB_OP_FOCUS&&s_queue[i].request==item.request){s_queue[i]=item;send_queued();return;}
    if(s_queue_count>=OUTBOX_CAPACITY)return;
  }
  if(s_queue_count>=OUTBOX_CAPACITY){if(s_state.loading)view_failed(NULL);else action_failed(NULL);return;}
  s_queue[s_queue_count++]=item;send_queued();
}
static void publish_focus(void){
  const DbItem *item=db_selected(&s_state);
  if(item&&s_state.snapshot.mode!=DB_MEDIA)queue_message((Outbound){.op=DB_OP_FOCUS,.mode=s_state.snapshot.mode,.request=s_state.view_request,.offset=s_state.snapshot.offset,.index=s_state.selected_index,.token=item->token,.version=item->version});
}
static void request_view(uint8_t mode,uint16_t offset,uint16_t index,uint32_t token,bool hello){


  db_press_cancel(&s_press);cancel_hold_preview();
  if(s_select_down)s_hold_intent=true;
  if(!hello)s_state.selection_lost=false; //Deliberate navigation can choose a new row.
  uint32_t request=next_request();db_state_expect(&s_state,request,mode,index,token);
  if(s_view_timeout)app_timer_cancel(s_view_timeout);
  s_view_timeout=app_timer_register(VIEW_TIMEOUT_MS,view_failed,NULL);
  queue_message((Outbound){.op=hello?DB_OP_HELLO:DB_OP_VIEW,.mode=mode,.offset=offset,.index=index,.token=token,.request=request});update_ticks();repaint();
}
static bool visually_equal(const DbSnapshot *a,const DbSnapshot *b){
  if(a->mode!=b->mode||a->status!=b->status||a->count!=b->count||a->dark!=b->dark||a->total!=b->total||a->offset!=b->offset)return false;
  for(unsigned i=0;i<a->count;i++){
    const DbItem *x=&a->items[i],*y=&b->items[i];
    if(x->token!=y->token||x->flags!=y->flags||x->kind!=y->kind||x->role!=y->role||x->clock_mode!=y->clock_mode||x->anchor!=y->anchor||x->base_seconds!=y->base_seconds||
      strcmp(x->title,y->title)||strcmp(x->subtitle,y->subtitle)||strcmp(x->value,y->value)||strcmp(x->app_label,y->app_label)||strcmp(x->action_label,y->action_label)||strcmp(x->name,y->name)||memcmp(x->controls,y->controls,sizeof(x->controls))||
      x->width!=y->width||x->height!=y->height||x->palette_length!=y->palette_length||x->pixel_length!=y->pixel_length||memcmp(x->palette,y->palette,sizeof(x->palette))||memcmp(x->pixels,y->pixels,x->pixel_length))return false;
  }
  return true;
}
static void inbox(DictionaryIterator *dict,void *context){
  (void)context;uint32_t operation;
  Tuple *ui=dict_find(dict,DB_KEY_UI_PREFERENCES);
  if(ui){
    DashboardUiPreferences requested,confirmed;uint8_t status,flags;
    if(ui->type==TUPLE_BYTE_ARRAY&&dashboard_ui_preferences_decode(ui->value->data,ui->length,&requested,&status,&flags)&&requested.revision&&!status&&!flags){
      if(dashboard_ui_preferences_save(&requested)&&dashboard_ui_preferences_load(&confirmed)){
        apply_ui_preferences(&confirmed);ui_reply(&confirmed,DASHBOARD_UI_APPLIED,0);
      }else{s_ui_error=true;repaint();ui_reply(&requested,DASHBOARD_UI_SAVE_FAILED,0);}
      send_queued();
    }
  }
  if(read_uint(dict,DB_KEY_OPERATION,&operation)&&operation==DB_OP_READY){
#ifndef DASHBOARD_FIXTURE
    // READY can come from a freshly restarted phone JS runtime whose sequence
    // starts at one. A new native epoch prevents old replies or capabilities
    // from being mistaken for this replacement runtime's state.
    uint32_t session=s_state.session>=INT32_MAX?1:s_state.session+1;bool dark=s_state.snapshot.dark;
    stop_repeat();cancel_hold_preview();cancel_motion();s_select_down=false;s_hold_intent=false;
    if(s_view_timeout){app_timer_cancel(s_view_timeout);s_view_timeout=NULL;}
    if(s_action_timeout){app_timer_cancel(s_action_timeout);s_action_timeout=NULL;}
    db_deadline_clear(&s_expiry);
    memset(&s_command,0,sizeof(s_command));db_press_cancel(&s_press);
    // The SDK still owns an already-sent dictionary. Keep that queue slot until
    // its ACK/NACK arrives; only unsent messages from the old epoch are dropped.
    s_queue_count=s_sending&&!s_ui_sending&&s_queue_count?1:0;
    db_state_init(&s_state,session);
    s_state.connected=s_has_connection;s_state.snapshot.dark=dark;
    request_view(DB_OVERVIEW,0,0,0,true);
#endif
    return;
  }
  uint32_t session;if(read_uint(dict,DB_KEY_SESSION,&session)&&session!=s_state.session)return;
  Tuple *data=dict_find(dict,DB_KEY_DATA);
  if(data&&data->type==TUPLE_BYTE_ARRAY){
    DbSnapshot *incoming=malloc(sizeof(*incoming));if(!incoming){view_failed(NULL);return;}
    if(db_decode((const uint8_t *)data->value,data->length,incoming)){
      if(s_ui_preferences.revision)incoming->dark=dashboard_ui_preferences_dark(&s_ui_preferences);
      else s_ui_preferences.appearance=s_ui_preferences.last_explicit=incoming->dark?DASHBOARD_UI_DARK:DASHBOARD_UI_LIGHT;
      bool was_loading=s_state.loading,theme_changed=s_state.snapshot.dark!=incoming->dark,redraw=s_state.loading||!s_state.ready||!visually_equal(&s_state.snapshot,incoming);uint32_t selected=s_state.selected_token;uint16_t selected_index=s_state.selected_index;
      if(db_state_apply(&s_state,incoming)){

        if(theme_changed)window_set_background_color(s_window,background());
#ifndef DASHBOARD_FIXTURE
        // Save only the accepted preference, never snapshot content or bindings.
        // Unchanged frames do not write flash; a failed write can retry later.
        if(s_saved_dark!=s_state.snapshot.dark&&persist_write_bool(THEME_DARK_KEY,s_state.snapshot.dark)>=0)s_saved_dark=s_state.snapshot.dark;
#endif
        if(s_view_timeout){app_timer_cancel(s_view_timeout);s_view_timeout=NULL;}
        if(s_state.snapshot.mode==DB_MEDIA&&s_state.focus>2)s_state.focus=1;
        if(s_select_down&&!pressed_item()){cancel_hold_preview();s_hold_intent=true;}
        bool redacted=db_state_redact(&s_state,utc_now(),!s_has_connection);update_ticks();if(redraw||redacted||selected!=s_state.selected_token||s_command.confirmation)repaint();
        if(was_loading||selected!=s_state.selected_token||selected_index!=s_state.selected_index)publish_focus();
      }
    }
    memset(incoming,0,sizeof(*incoming));free(incoming);
  }
  uint32_t result,request;
  if(read_uint(dict,DB_KEY_RESULT,&result)&&read_uint(dict,DB_KEY_SESSION,&session)&&session==s_state.session&&read_uint(dict,DB_KEY_REQUEST,&request)&&s_command.active&&!s_command.ended&&request==s_command.request&&result>=DB_PENDING&&result<=DB_CONFIRM){
    s_command.result=(uint8_t)result;s_command.confirmation=result==DB_CONFIRM;if(s_command.confirmation)s_confirm_accept=false;
    Tuple *label=dict_find(dict,DB_KEY_TEXT);s_command.text[0]=0;
    if(label&&label->type==TUPLE_CSTRING&&label->length&&label->length<=sizeof(s_command.text)){
      memcpy(s_command.text,(const void *)label->value,label->length);
      if(s_command.text[label->length-1])s_command.text[0]=0;
    }
    if(result!=DB_PENDING&&s_action_timeout){app_timer_cancel(s_action_timeout);s_action_timeout=NULL;}
    if(result!=DB_PENDING&&result!=DB_CONFIRM){s_command.ended=true;finish_feedback();}
    repaint();
  }
}
static void outbox_sent(DictionaryIterator *dict,void *context){(void)context;if(s_ui_sending||(dict&&dict_find(dict,DB_KEY_UI_PREFERENCES_RESULT))){s_sending=false;s_ui_sending=false;send_queued();return;}if(s_queue_count){s_queue_count--;memmove(s_queue,s_queue+1,s_queue_count*sizeof(*s_queue));}s_sending=false;send_queued();}
static void outbox_failed(DictionaryIterator *dict,AppMessageResult reason,void *context){
  (void)reason;(void)context;uint32_t session;
  if(s_ui_sending||(dict&&dict_find(dict,DB_KEY_UI_PREFERENCES_RESULT))){s_sending=false;s_ui_sending=false;if(s_ui_flight==s_ui_generation)s_ui_pending=true;send_queued();return;}
  if(dict&&read_uint(dict,DB_KEY_SESSION,&session)&&session!=s_state.session){
    if(s_queue_count){s_queue_count--;memmove(s_queue,s_queue+1,s_queue_count*sizeof(*s_queue));}
    s_sending=false;send_queued();return;
  }
  s_sending=false;s_queue_count=0;if(s_state.loading)view_failed(NULL);if(s_command.active&&s_command.result==DB_PENDING)action_failed(NULL);
}
static void inbox_dropped(AppMessageResult reason,void *context){(void)reason;(void)context;if(s_state.loading)view_failed(NULL);}
static void tick(struct tm *now,TimeUnits units){
  uint32_t timestamp=utc_now();
  // AppTimers are relative. Rebase after a wall-clock correction or a missed
  // tick, while leaving regular second/minute ticks allocation-free.
  if(!s_last_tick||timestamp-s_last_tick!=(s_tick_seconds==2?1u:60u))db_deadline_clear(&s_expiry);
  s_last_tick=timestamp;
  bool dirty=db_state_redact(&s_state,timestamp,!s_has_connection);unsigned minute=(unsigned)now->tm_hour*60+(unsigned)now->tm_min;
  if(minute!=s_last_minute){s_last_minute=minute;dirty=true;}
  // Paint the final00:00 once before update_ticks drops the second subscription.
  if(((units&SECOND_UNIT)||!units)&&s_tick_seconds==2)dirty=true;
  if(dirty)repaint();
  update_ticks();
}
static void expire_sources(void *context){
  (void)context;s_expiry.timer=NULL;s_expiry.at=0;
  if(db_state_redact(&s_state,utc_now(),!s_has_connection))repaint();
  update_ticks();
}
static void update_ticks(void){
  if(s_hold_preview&&!preview_item())cancel_hold_preview();
  uint8_t seconds=s_focused&&!s_guide&&db_state_running_clock(&s_state,utc_now())?1:0;
  if(s_tick_seconds!=seconds+1){s_tick_seconds=seconds+1;s_last_tick=0;tick_timer_service_unsubscribe();tick_timer_service_subscribe(seconds?SECOND_UNIT:MINUTE_UNIT,tick);}
  uint32_t now=utc_now(),next=db_state_next_expiry(&s_state,now);
  time_t seconds_now;uint16_t milliseconds;time_ms(&seconds_now,&milliseconds);
  db_deadline_update(&s_expiry,next,(uint64_t)seconds_now*1000u+milliseconds,expire_sources,NULL);
  if(s_command.confirmation){const DbItem *item=db_selected(&s_state);if(!db_item_actionable(item,now)||item->token!=s_command.token||item->version!=s_command.version){s_command.confirmation=false;s_command.result=DB_STALE;s_command.ended=true;s_command.text[0]=0;finish_feedback();repaint();}}
}
static void stop_repeat(void){s_repeat_held=false;if(s_repeat){app_timer_cancel(s_repeat);s_repeat=NULL;}}
static void move_selection(int delta){
  if(s_command.confirmation)return;
  const DbItem *selected_item=db_selected(&s_state);
  if(s_state.desired_mode==DB_MEDIA&&s_action_menu&&selected_item&&!(selected_item->flags&DB_IS_MEDIA)&&s_state.focus==control_for_row(selected_item,0)){
    ScrollLayer *scroll=menu_layer_get_scroll_layer(s_action_menu);const GPoint offset=scroll_layer_get_content_offset(scroll);
    if(delta<0&&offset.y<0){scroll_layer_set_content_offset(scroll,GPoint(0,offset.y+60>0?0:offset.y+60),true);return;}
    if(delta>0&&action_context(NULL)+text_size(selected_item->controls[s_state.focus],5,150).h+12+offset.y>SCREEN_H-36){menu_layer_set_selected_index(s_action_menu,(MenuIndex){0,0},MenuRowAlignBottom,true);return;}
  }
  uint16_t index=s_state.selected_index;uint8_t focus=s_state.focus;
  if(!db_state_move(&s_state,delta,&index))return;
  if(s_select_down){db_press_cancel(&s_press);cancel_hold_preview();s_hold_intent=true;}
  if(s_state.snapshot.mode==DB_MEDIA){if(focus!=s_state.focus){sync_native_ui(true);repaint();}return;}
  if(index<s_state.snapshot.offset||index>=s_state.snapshot.offset+s_state.snapshot.count){
    uint16_t offset=index>=3?index-3:0;if(s_state.snapshot.total>DB_PAGE_ITEMS&&offset>s_state.snapshot.total-DB_PAGE_ITEMS)offset=s_state.snapshot.total-DB_PAGE_ITEMS;
    request_view(s_state.snapshot.mode,offset,index,0,false);
  }else{

    sync_native_ui(true);
    publish_focus();
    repaint();
  }
}
static void repeated(void *context){
  (void)context;s_repeat=NULL;if(!s_repeat_held||!s_focused)return;
  uint16_t before=s_state.selected_index;uint8_t focus=s_state.focus;if(s_guide)guide_step(s_repeat_delta);else move_selection(s_repeat_delta);
  if(!s_guide&&!s_state.loading&&before==s_state.selected_index&&focus==s_state.focus){s_repeat_held=false;return;}
  if(s_repeat_held)s_repeat=app_timer_register(140,repeated,NULL);
}
static void direction_click(ClickRecognizerRef recognizer,void *context){
  (void)context;button_released(click_recognizer_get_button_id(recognizer));if(s_guide){guide_step(click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP?-1:1);return;}
  if(s_command.confirmation){if(s_select_down){db_press_cancel(&s_press);s_hold_intent=true;}confirmation_step(click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP);repaint();return;}
  acknowledge_feedback();cancel_hold_preview();move_selection(click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP?-1:1);
}
static void direction_hold(ClickRecognizerRef recognizer,void *context){
  (void)context;if(s_guide){stop_repeat();s_repeat_held=true;s_repeat_delta=click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP?-1:1;guide_step(s_repeat_delta);s_repeat=app_timer_register(140,repeated,NULL);return;}if(s_command.confirmation)return;acknowledge_feedback();cancel_hold_preview();int delta=click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP?-1:1;
  if(s_state.desired_mode==DB_OVERVIEW){if(s_state.loading)return;db_state_remember(&s_state);request_view(delta<0?DB_ACTIVITIES:DB_PINNED,0,0,0,false);return;}
  stop_repeat();s_repeat_held=true;s_repeat_delta=delta;move_selection(delta);s_repeat=app_timer_register(140,repeated,NULL);
}
static void direction_release(ClickRecognizerRef recognizer,void *context){(void)context;button_released(click_recognizer_get_button_id(recognizer));stop_repeat();}
static void up_pressed(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_pressed(BUTTON_ID_UP);}
static void up_released(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_released(BUTTON_ID_UP);}
static void down_pressed(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_pressed(BUTTON_ID_DOWN);}
static void down_released(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_released(BUTTON_ID_DOWN);}
static const DbItem *pressed_item(void){return db_press_matches(&s_press,&s_state)?db_selected(&s_state):NULL;}
static void show_hold_preview(void *context){
  (void)context;s_hold_timer=NULL;const DbItem *item=pressed_item();
  if(s_select_down&&!s_guide&&!s_command.confirmation&&s_has_connection&&db_item_capability_current(item,utc_now())&&(item->flags&DB_APP)&&!(s_command.active&&s_command.result==DB_PENDING)){s_hold_preview=true;s_hold_intent=true;repaint();}
}
static void select_raw(ClickRecognizerRef recognizer,void *context){
  (void)recognizer;(void)context;button_pressed(BUTTON_ID_SELECT);cancel_hold_preview();s_hold_intent=false;s_select_down=true;
  if(s_guide){db_press_cancel(&s_press);return;}
  acknowledge_feedback();const DbItem *item=db_selected(&s_state);db_press_capture(&s_press,&s_state);
  if(item&&(item->flags&DB_APP)&&!s_command.confirmation)s_hold_timer=app_timer_register(HOLD_PREVIEW_MS,show_hold_preview,NULL);
}
static void select_released(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_released(BUTTON_ID_SELECT);s_select_down=false;cancel_hold_preview();}
static void run_command(const DbItem *item,uint8_t operation,uint8_t action,bool confirmation){
  if(!s_has_connection||!db_item_capability_current(item,utc_now())||(operation==DB_OP_OPEN?!(item->flags&DB_APP):!db_item_actionable(item,utc_now())))return;
  if(s_command.active&&s_command.result==DB_PENDING)return;
  uint32_t request=confirmation?s_command.request:next_request();
  s_command=(Command){.request=request,.token=item->token,.version=item->version,.action=action,.active=true,.result=DB_PENDING};
  if(s_action_timeout)app_timer_cancel(s_action_timeout);
  s_action_timeout=app_timer_register(ACTION_TIMEOUT_MS,action_failed,NULL);
  queue_message((Outbound){.op=operation,.mode=s_state.desired_mode,.request=request,.token=item->token,.version=item->version,.action=action,.confirm=confirmation?1:0});repaint();
}
static void select_click(ClickRecognizerRef recognizer,void *context){
  (void)recognizer;(void)context;button_released(BUTTON_ID_SELECT);cancel_hold_preview();
  if(s_guide){s_guide=false;persist_write_bool(GUIDE_SEEN_KEY,true);db_press_cancel(&s_press);s_hold_intent=false;update_ticks();repaint();return;}
  if(s_hold_intent){s_hold_intent=false;return;}
  if(s_command.confirmation){if(!s_confirm_accept){memset(&s_command,0,sizeof(s_command));repaint();return;}const DbItem *item=pressed_item();if(db_press_take(&s_press,&s_state)&&item&&item->token==s_command.token&&item->version==s_command.version)run_command(item,DB_OP_ACTION,s_command.action,true);else{s_command.confirmation=false;s_command.result=DB_STALE;repaint();}return;}
  const DbItem *item=pressed_item();if(!db_press_take(&s_press,&s_state)||!s_has_connection||!db_item_capability_current(item,utc_now()))return;
  if(s_state.desired_mode==DB_MEDIA){if(control_available(item,s_state.focus))run_command(item,DB_OP_ACTION,s_state.focus,false);}
  else if(item->flags&DB_NOTIFICATION){if(item->flags&DB_APP)run_command(item,DB_OP_OPEN,0,false);}
  else if(item->role==DB_ROLE_ACTIVITY&&(item->flags&DB_IS_MEDIA)){if(db_item_direct_action(item,utc_now())==1)run_command(item,DB_OP_ACTION,1,false);}
  else if(item->role==DB_ROLE_ACTIVITY&&db_item_actionable(item,utc_now())&&(item->flags&(DB_MEDIA_PREVIOUS|DB_MEDIA_TOGGLE|DB_MEDIA_NEXT))){
    db_state_remember(&s_state);s_state.focus=(item->flags&DB_IS_MEDIA)&&control_available(item,1)?1:control_available(item,0)?0:control_available(item,1)?1:2;
    request_view(DB_MEDIA,0,0,item->token,false);
  }else if(item->role==DB_ROLE_PIN&&db_item_actionable(item,utc_now()))run_command(item,DB_OP_ACTION,0,false);
}
static void select_hold(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;cancel_hold_preview();if(s_guide||s_command.confirmation)return;const DbItem *item=pressed_item();if(db_press_take(&s_press,&s_state)&&item&&(item->flags&DB_APP))run_command(item,DB_OP_OPEN,0,false);}
static void back_click(ClickRecognizerRef recognizer,void *context){
  (void)recognizer;(void)context;stop_repeat();cancel_hold_preview();acknowledge_feedback();
  if(s_command.confirmation){memset(&s_command,0,sizeof(s_command));repaint();return;}
  DbReturn previous;if(db_state_back(&s_state,&previous)){s_state.focus=previous.focus;request_view(previous.mode,previous.offset,previous.index,previous.token,false);}
  else{queue_message((Outbound){.op=DB_OP_CANCEL,.request=next_request()});window_stack_pop_all(false);}
}
static void configure_clicks(void *context){
  (void)context;
  window_single_click_subscribe(BUTTON_ID_UP,direction_click);window_long_click_subscribe(BUTTON_ID_UP,600,direction_hold,direction_release);
  window_single_click_subscribe(BUTTON_ID_DOWN,direction_click);window_long_click_subscribe(BUTTON_ID_DOWN,600,direction_hold,direction_release);
  window_raw_click_subscribe(BUTTON_ID_UP,up_pressed,up_released,NULL);window_raw_click_subscribe(BUTTON_ID_DOWN,down_pressed,down_released,NULL);
  window_single_click_subscribe(BUTTON_ID_SELECT,select_click);window_long_click_subscribe(BUTTON_ID_SELECT,600,select_hold,select_released);window_raw_click_subscribe(BUTTON_ID_SELECT,select_raw,select_released,NULL);
  window_single_click_subscribe(BUTTON_ID_BACK,back_click);
}
static void connection_changed(bool connected){

  s_has_connection=connected;s_state.connected=connected;stop_repeat();cancel_hold_preview();cancel_motion();s_select_down=false;s_hold_intent=false;db_press_cancel(&s_press);
  if(!connected){db_state_redact(&s_state,utc_now(),true);if(s_state.loading)view_failed(NULL);if(s_command.active&&s_command.result==DB_PENDING)action_failed(NULL);}
  else {ui_reply(&s_ui_preferences,DASHBOARD_UI_APPLIED,DASHBOARD_UI_HELLO);request_view(s_state.desired_mode,s_state.snapshot.offset,s_state.selected_index,s_state.selected_token,true);}
  update_ticks();repaint();
}
static void focus_changed(bool focused){s_focused=focused;if(!focused){stop_repeat();cancel_hold_preview();cancel_motion();s_select_down=false;s_hold_intent=false;db_press_cancel(&s_press);}else{db_state_redact(&s_state,utc_now(),!s_has_connection);repaint();}update_ticks();}
static void battery_changed(BatteryChargeState value){(void)value;for(unsigned i=0;i<s_state.snapshot.count;i++)if(s_state.snapshot.items[i].flags&DB_LOCAL_WATCH){repaint();break;}}
static void paint_begin(unsigned screen){
  const bool outgoing=screen!=s_current_screen&&screen==s_outgoing_screen;
  if(outgoing)db_state_redact(s_outgoing_state,utc_now(),!s_has_connection);
  s_paint_state=outgoing?s_outgoing_state:&s_state;
  s_paint_command=outgoing?&s_outgoing_command:&s_command;
  s_paint_guide=screen==SCREEN_GUIDE;
}
static void cancel_navigation_input(void){
  stop_repeat();
  if(s_hold_timer){app_timer_cancel(s_hold_timer);s_hold_timer=NULL;}
  s_hold_preview=false;cancel_motion();
  db_press_cancel(&s_press);s_select_down=false;s_hold_intent=true;
}
static void window_disappear(Window *window){
  /* Animated removal may finish after the destination already owns a new
   * physical press. Ordinary navigation settles the old input synchronously;
   * a late outgoing callback must never cancel the destination's input. */
  if(window==s_windows[s_current_screen])cancel_navigation_input();
}
static void sync_native_windows(void){
  if(!s_window||!window_stack_contains_window(s_window))return;
  const unsigned target=s_guide?SCREEN_GUIDE:s_command.confirmation?SCREEN_CONFIRM:s_state.desired_mode;
  if(target==s_current_screen){paint_begin(target);return;}
  cancel_navigation_input();
  *s_outgoing_state=*s_presented_state;s_outgoing_command=s_presented_command;s_outgoing_screen=s_current_screen;
  unsigned path[6]={DB_OVERVIEW},count=1;
  if(target==SCREEN_GUIDE)path[count++]=SCREEN_GUIDE;
  else{
    for(unsigned i=0;i<s_state.depth;++i){
      const unsigned mode=s_state.back[i].mode;bool present=false;
      for(unsigned n=0;n<count;++n)if(path[n]==mode)present=true;
      if(!present)path[count++]=mode;
    }
    if(s_state.desired_mode!=DB_OVERVIEW)path[count++]=s_state.desired_mode;
    if(target==SCREEN_CONFIRM)path[count++]=SCREEN_CONFIRM;
  }
  bool wanted[SCREEN_COUNT]={false};for(unsigned i=0;i<count;++i)wanted[path[i]]=true;
  Window *old_top=window_stack_get_top_window();const bool existing=window_stack_contains_window(s_windows[target]);
  for(unsigned i=1;i+1<count;++i)if(!window_stack_contains_window(s_windows[path[i]]))window_stack_push(s_windows[path[i]],false);
  for(unsigned i=1;i<SCREEN_COUNT;++i)if(!wanted[i]&&s_windows[i]!=old_top&&window_stack_contains_window(s_windows[i]))window_stack_remove(s_windows[i],false);
  s_current_screen=target;s_canvas=s_canvases[target];paint_begin(target);
  UI_DIAG("ui heap=%u screen=%u",(unsigned)heap_bytes_free(),target);
  window_set_background_color(s_windows[target],background());
  if(existing){if(old_top!=s_windows[target]&&old_top!=s_window)window_stack_remove(old_top,true);}
  else{
    window_stack_push(s_windows[target],true);
    bool keep=false;for(unsigned i=0;i<count;++i)if(old_top==s_windows[path[i]])keep=true;
    if(!keep&&old_top!=s_window)window_stack_remove(old_top,false);
  }
}
static void init(void){
  time_t seconds;uint16_t milliseconds;time_ms(&seconds,&milliseconds);uint32_t session=((uint32_t)seconds^((uint32_t)milliseconds<<16)^0x44534831u)&INT32_MAX;if(!session)session=1;
  db_state_init(&s_state,session);
  s_system_text_size=preferred_content_size();
  s_ui_error=!dashboard_ui_preferences_load(&s_ui_preferences);
  s_text_size=xoce_ui_effective_text_size(s_ui_preferences.text_size,s_system_text_size);
  const WatchInfoVersion firmware=watch_info_get_firmware_version();
  s_modern_type=firmware.major>4||(firmware.major==4&&firmware.minor>=44);
  UI_DIAG("type os=%u effective=%u firmware=%u.%u",(unsigned)preferred_content_size(),s_text_size,firmware.major,firmware.minor);
#ifndef DASHBOARD_FIXTURE
  s_guide=!persist_read_bool(GUIDE_SEEN_KEY);
  s_saved_dark=dashboard_ui_preferences_dark(&s_ui_preferences);s_state.snapshot.dark=s_saved_dark;
#endif
  s_has_connection=connection_service_peek_pebble_app_connection();s_state.connected=s_has_connection;
  s_outgoing_state=calloc(1,sizeof(*s_outgoing_state));s_presented_state=calloc(1,sizeof(*s_presented_state));
  if(!s_outgoing_state||!s_presented_state)return;
  for(unsigned screen=0;screen<SCREEN_COUNT;++screen){
    s_windows[screen]=window_create();if(!s_windows[screen])return;
    s_canvases[screen]=layer_create_with_data(GRect(0,0,SCREEN_W,SCREEN_H),sizeof(unsigned));
    if(!s_canvases[screen])return;
    *(unsigned *)layer_get_data(s_canvases[screen])=screen;
    layer_set_update_proc(s_canvases[screen],update);
    layer_add_child(window_get_root_layer(s_windows[screen]),s_canvases[screen]);
    window_set_click_config_provider(s_windows[screen],configure_clicks);
    window_set_window_handlers(s_windows[screen],(WindowHandlers){.disappear=window_disappear});
  }
  s_window=s_windows[DB_OVERVIEW];s_canvas=s_canvases[DB_OVERVIEW];paint_begin(DB_OVERVIEW);
  s_snapshot_scroll=scroll_layer_create(GRect(0,32,CONTENT_W,SCREEN_H-32));
  s_snapshot_body=layer_create(GRect(0,0,CONTENT_W,SCREEN_H-32));
  if(!s_snapshot_scroll||!s_snapshot_body)return;
  layer_set_update_proc(s_snapshot_body,snapshot_body_draw);
  scroll_layer_add_child(s_snapshot_scroll,s_snapshot_body);
  layer_add_child(window_get_root_layer(s_windows[DB_OVERVIEW]),scroll_layer_get_layer(s_snapshot_scroll));
  layer_set_hidden(scroll_layer_get_layer(s_snapshot_scroll),true);
  for(unsigned i=0;i<2;++i){
    s_collection_menu[i]=menu_layer_create(GRect(0,36,CONTENT_W,SCREEN_H-36));
    if(!s_collection_menu[i])continue;
    menu_layer_set_center_focused(s_collection_menu[i],false);
    menu_layer_pad_bottom_enable(s_collection_menu[i],false);
    menu_layer_set_callbacks(s_collection_menu[i],(void *)(uintptr_t)(i+1),(MenuLayerCallbacks){
        .get_num_rows=collection_count,.get_cell_height=collection_height,.draw_row=collection_draw});
    layer_add_child(window_get_root_layer(s_windows[i+1]),menu_layer_get_layer(s_collection_menu[i]));
    layer_set_hidden(menu_layer_get_layer(s_collection_menu[i]),true);
  }
  s_guide_scroll=scroll_layer_create(GRect(0,36,CONTENT_W,SCREEN_H-36));
  s_guide_body=layer_create(GRect(0,0,CONTENT_W,SCREEN_H-36));
  if(!s_guide_scroll||!s_guide_body)return;
  layer_set_update_proc(s_guide_body,guide_body_draw);scroll_layer_add_child(s_guide_scroll,s_guide_body);
  layer_add_child(window_get_root_layer(s_windows[SCREEN_GUIDE]),scroll_layer_get_layer(s_guide_scroll));
  s_action_menu=menu_layer_create(GRect(0,36,CONTENT_W,SCREEN_H-36));if(!s_action_menu)return;
  menu_layer_set_center_focused(s_action_menu,false);menu_layer_pad_bottom_enable(s_action_menu,false);
  menu_layer_set_callbacks(s_action_menu,NULL,(MenuLayerCallbacks){.get_num_rows=action_rows,
      .get_cell_height=action_row_height,.get_header_height=action_header_height,.draw_row=action_row_draw,.draw_header=action_header_draw});
  layer_add_child(window_get_root_layer(s_windows[DB_MEDIA]),menu_layer_get_layer(s_action_menu));
  layer_set_hidden(menu_layer_get_layer(s_action_menu),true);
  s_confirm_menu=menu_layer_create(GRect(0,36,CONTENT_W,SCREEN_H-36));if(!s_confirm_menu)return;
  menu_layer_set_center_focused(s_confirm_menu,false);menu_layer_pad_bottom_enable(s_confirm_menu,false);
  menu_layer_set_callbacks(s_confirm_menu,NULL,(MenuLayerCallbacks){.get_num_rows=confirmation_rows,
      .get_cell_height=confirmation_row_height,.get_header_height=confirmation_header_height,
      .draw_row=confirmation_row_draw,.draw_header=confirmation_header_draw});
  layer_add_child(window_get_root_layer(s_windows[SCREEN_CONFIRM]),menu_layer_get_layer(s_confirm_menu));
  app_message_register_inbox_received(inbox);app_message_register_inbox_dropped(inbox_dropped);app_message_register_outbox_sent(outbox_sent);app_message_register_outbox_failed(outbox_failed);
  if(app_message_open(9216,256)!=APP_MSG_OK){s_state.ready=true;s_state.snapshot.status=DB_ERROR;}
  connection_service_subscribe((ConnectionHandlers){.pebble_app_connection_handler=connection_changed});app_focus_service_subscribe(focus_changed);battery_state_service_subscribe(battery_changed);
  ui_reply(&s_ui_preferences,DASHBOARD_UI_APPLIED,DASHBOARD_UI_HELLO);
  window_stack_push(s_window,false);update_ticks();request_view(DB_OVERVIEW,0,0,0,true);
#ifdef DASHBOARD_FIXTURE
#include "../../tests/native/fixture.h"
  DbSnapshot *fixture=malloc(sizeof(*fixture));
  if(fixture&&db_decode(DB_FIXTURE_DATA,DB_FIXTURE_LENGTH,fixture)){
    int64_t shift=(int64_t)utc_now()-fixture->now;
    for(unsigned i=0;i<fixture->count;i++){
      DbItem *item=&fixture->items[i];
      if(item->valid_until)item->valid_until=(uint32_t)((int64_t)item->valid_until+shift);
      if(item->anchor)item->anchor=(uint32_t)((int64_t)item->anchor+shift);
    }
    fixture->now=utc_now();
    s_state.session=fixture->session;db_state_expect(&s_state,fixture->request,fixture->mode,0,fixture->count?fixture->items[0].token:0);db_state_apply(&s_state,fixture);
    window_set_background_color(s_window,background());
    if(s_view_timeout){app_timer_cancel(s_view_timeout);s_view_timeout=NULL;}s_has_connection=true;update_ticks();repaint();
  }
  free(fixture);
#endif
}
static void deinit(void){
  cancel_motion();
  stop_repeat();cancel_hold_preview();if(s_view_timeout)app_timer_cancel(s_view_timeout);if(s_action_timeout)app_timer_cancel(s_action_timeout);db_deadline_clear(&s_expiry);tick_timer_service_unsubscribe();battery_state_service_unsubscribe();connection_service_unsubscribe();app_focus_service_unsubscribe();app_message_deregister_callbacks();
  for(unsigned i=0;i<2;++i)if(s_collection_menu[i])menu_layer_destroy(s_collection_menu[i]);
  if(s_action_menu)menu_layer_destroy(s_action_menu);
  if(s_confirm_menu)menu_layer_destroy(s_confirm_menu);
  if(s_guide_body)layer_destroy(s_guide_body);
  if(s_guide_scroll)scroll_layer_destroy(s_guide_scroll);
  if(s_snapshot_body)layer_destroy(s_snapshot_body);
  if(s_snapshot_scroll)scroll_layer_destroy(s_snapshot_scroll);
  for(unsigned screen=0;screen<SCREEN_COUNT;++screen){
    if(s_canvases[screen])layer_destroy(s_canvases[screen]);
    if(s_windows[screen])window_destroy(s_windows[screen]);
  }
  if(s_outgoing_state){memset(s_outgoing_state,0,sizeof(*s_outgoing_state));free(s_outgoing_state);}
  if(s_presented_state){memset(s_presented_state,0,sizeof(*s_presented_state));free(s_presented_state);}
  memset(&s_state,0,sizeof(s_state));memset(&s_command,0,sizeof(s_command));
}
int main(void){init();if(s_window&&s_canvas)app_event_loop();deinit();return 0;}
