#include <pebble.h>
#include "localization.h"
#include <pebble-xoce-ui/pebble-xoce-ui.h>
#include "dashboard_layout.h"
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <limits.h>
#include "dashboard.h"
#include "dashboard_deadline.h"

#define SCREEN_W 200
#define SCREEN_H 228
#define CONTENT_W (SCREEN_W - ACTION_BAR_WIDTH)
#define FONT_COUNT 15
#define VIEW_TIMEOUT_MS 6000
#define ACTION_TIMEOUT_MS 12000
#define OUTBOX_CAPACITY 4
#define GUIDE_SEEN_KEY 1
#define THEME_DARK_KEY 2
#define HOLD_PREVIEW_MS 250

typedef struct {uint8_t op,mode,action,confirm;uint16_t offset,index;uint32_t request,token,version;} Outbound;
typedef struct {uint32_t request,token,version;uint8_t action,result;char text[65];bool active,confirmation,ended;} Command;
static Window *s_window;
static Layer *s_canvas;
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
static uint32_t s_press_token,s_press_version;
static uint8_t s_press_mode;
static GFont s_fonts[FONT_COUNT];
static uint8_t s_tick_seconds;
static unsigned s_last_minute;
static uint32_t s_last_tick;
static unsigned s_list_first;
static uint16_t s_list_offset;
static uint8_t s_list_mode;
typedef struct {uint32_t started;uint8_t offset;bool held,releasing;} ButtonMotion;
static AppTimer *s_button_motion_timer;
static ButtonMotion s_buttons[3];
static const uint8_t s_font_points[]={20,22,24,20,22,24,20,24,26,24,32,40,20,26,36};
static const uint32_t s_font_ids[]={RESOURCE_ID_FONT_BODY_20,RESOURCE_ID_FONT_BODY_22,RESOURCE_ID_FONT_BODY_24,
  RESOURCE_ID_FONT_BODY_20,RESOURCE_ID_FONT_BODY_22,RESOURCE_ID_FONT_BODY_24,
  RESOURCE_ID_FONT_CLOCK_20,RESOURCE_ID_FONT_CLOCK_24,RESOURCE_ID_FONT_CLOCK_26,
  RESOURCE_ID_FONT_BODY_24,RESOURCE_ID_FONT_CLOCK_32,RESOURCE_ID_FONT_CLOCK_40,RESOURCE_ID_FONT_BODY_20,RESOURCE_ID_FONT_BODY_26,RESOURCE_ID_FONT_CLOCK_36};

static uint32_t utc_now(void){return (uint32_t)time(NULL);}
static uint32_t next_request(void){s_counter=s_counter>=INT32_MAX?1:s_counter+1;return s_counter;}
static void repaint(void){if(s_canvas&&s_focused)layer_mark_dirty(s_canvas);}
// Only physical button feedback animates. Full-width selection is immediate;
// no decorative state can obscure a fitted label or delay a capability check.
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
  return s_hold_preview&&s_select_down&&!s_guide&&!s_command.confirmation&&s_has_connection&&
    db_item_capability_current(item,utc_now())&&(item->flags&DB_APP)?item:NULL;
}
static GColor background(void){return s_state.snapshot.dark?GColorBlack:GColorWhite;}
static GColor foreground(void){return s_state.snapshot.dark?GColorWhite:GColorBlack;}
static GColor muted(void){return s_state.snapshot.dark?GColorLightGray:GColorDarkGray;}
static GColor stroke(void){return s_state.snapshot.dark?GColorDarkGray:GColorLightGray;}
static GColor accent(void){return s_state.snapshot.dark?GColorTiffanyBlue:GColorJaegerGreen;}
static unsigned font_storage(unsigned index){return index==3||index==12?0:index==4?1:index==5||index==9?2:index;}
static GFont font_at(unsigned index){
  if(index>=FONT_COUNT)index=3;
  index=font_storage(index);
  if(!s_fonts[index])s_fonts[index]=fonts_load_custom_font(resource_get_handle(s_font_ids[index]));
  return s_fonts[index]?s_fonts[index]:fonts_get_system_font(index==0?FONT_KEY_GOTHIC_24_BOLD:FONT_KEY_GOTHIC_28_BOLD);
}
static unsigned body_index(unsigned point){return point<=XOCE_UI_SECONDARY_POINT?4:point>=XOCE_UI_HEADER_POINT?13:5;}
static int width_of(const char *value,unsigned index){
  return graphics_text_layout_get_content_size(value,font_at(index),GRect(0,0,2048,512),GTextOverflowModeFill,GTextAlignmentLeft).w;
}
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
static void paint_text(GContext *ctx,const char *text,unsigned index,int x,int baseline,int width,GColor color,GTextAlignment alignment){
  graphics_context_set_text_color(ctx,color);
  int height=s_font_points[index];
  // Explicit advance anchoring avoids the current Emery custom-font right-
  // alignment path dropping leading clock glyphs. Keep the full fitted string.
  if(alignment!=GTextAlignmentLeft){
    int measured=width_of(text,index);x+=alignment==GTextAlignmentRight?width-measured:(width-measured)/2;
    width=measured+2;alignment=GTextAlignmentLeft;
  }
  graphics_draw_text(ctx,text,font_at(index),GRect(x,baseline-height,width,height+12),GTextOverflowModeFill,alignment,NULL);
}
static void draw_text(GContext *ctx,const char *value,unsigned index,int x,int baseline,int width,GColor color,GTextAlignment alignment){
  if(width<=0)return;
  char text[265];fit_text(text,value,index,width);paint_text(ctx,text,index,x,baseline,width,color,alignment);
}
static void text(GContext *ctx,const char *value,unsigned point,int x,int baseline,int width,GColor color){draw_text(ctx,value,body_index(point),x,baseline,width,color,GTextAlignmentLeft);}
// Nominal point sizes are not visible ink. Use measured per-glyph bounds for
// the fitted string, including accents, descenders and the actual ellipsis.
static DbTextInk text_ink(const char *value,unsigned index){
  unsigned storage=font_storage(index);
  if(s_fonts[storage]&&(storage<=2||storage==13))return db_layout_body_ink(value,storage==13?3:storage);
  int gothic=storage==0?1:2;
  int clock=index==6?0:index==7?1:index==8?2:index==10?3:index==11?4:index==14?5:-1;
  if(clock>=0)gothic=-1;
  return db_layout_ink(value,gothic,clock);
}
static int ink_height(const char *value,unsigned index,int width){
  char text[265];fit_text(text,value,index,width);DbTextInk ink=text_ink(text,index);return ink.visible?ink.bottom-ink.top+1:0;
}
static void text_top(GContext *ctx,const char *value,unsigned index,int x,int top,int width,GColor color,GTextAlignment align){
  if(width<=0)return;
  char fitted[265];fit_text(fitted,value,index,width);DbTextInk ink=text_ink(fitted,index);
  int line_height=s_font_points[index];
  paint_text(ctx,fitted,index,x,top-ink.top+line_height,width,color,align);
}
static void text_box(GContext *ctx,const char *value,unsigned index,GRect bounds,GColor color,GTextAlignment align){
  if(bounds.size.w<=0)return;
  char fitted[265];fit_text(fitted,value,index,bounds.size.w);DbTextInk ink=text_ink(fitted,index);
  int line_height=s_font_points[index];
  paint_text(ctx,fitted,index,bounds.origin.x,xoce_ui_text_origin_y(bounds,ink.top,ink.bottom)+line_height,bounds.size.w,color,align);
}
static bool clock_chars(const char *text){
  const unsigned char *p=(const unsigned char *)text;
  while(*p){
    if((*p>='0'&&*p<='9')||*p==':'||*p=='.'||*p==','||*p=='%'||*p=='-'||*p=='+'||*p=='C'||*p=='F'){p++;continue;}
    if(p[0]==0xc2&&p[1]==0xb0){p+=2;continue;}
    if(p[0]==0xe2&&p[1]&&p[1]==0x88&&p[2]==0x92){p+=3;continue;}
    return false;
  }
  return true;
}
static unsigned value_index(const char *value,int width,unsigned preferred){
  static const unsigned clocks[]={11,14,10,8,7},bodies[]={13,9,5,4};
  const unsigned *choices=clock_chars(value)?clocks:bodies;unsigned count=clock_chars(value)?5:4;
  for(unsigned i=0;i<count;i++){unsigned index=choices[i];if(s_font_points[index]<=preferred&&width_of(value,index)<=width)return index;}
  return 4;
}
static const char *value_label(const char *value,unsigned index,int width){return width_of(value,index)<=width?value:app_text("Too long");}
static void fill(GContext *ctx,GRect bounds,GColor color,int radius){graphics_context_set_fill_color(ctx,color);graphics_fill_rect(ctx,bounds,radius,GCornersAll);}
static void edge(GContext *ctx,GRect bounds,GColor color,int radius){graphics_context_set_stroke_color(ctx,color);graphics_context_set_stroke_width(ctx,1);graphics_draw_round_rect(ctx,bounds,radius);}
static void segment(GContext *ctx,int x,int y,int x2,int y2,GColor color){graphics_context_set_stroke_color(ctx,color);graphics_context_set_stroke_width(ctx,1);graphics_draw_line(ctx,GPoint(x,y),GPoint(x2,y2));}
static bool item_selected(const DbItem *item){return item&&s_state.selected_token==item->token&&!s_state.loading&&!s_state.selection_lost;}
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
  switch(s_state.snapshot.status){case DB_PERMISSION:return app_text("Allow access on phone");case DB_ERROR:return app_text("Data unavailable");case DB_OFFLINE:return app_text("Connect your phone");case DB_LOADING:return app_text("Loading sources…");default:return app_text("Nothing here yet");}
}
static const char *command_error(void){
  if(!s_command.active||s_command.confirmation)return NULL;
  switch(s_command.result){
    case DB_DENIED:return app_text("Allow access");
    case DB_STALE:return app_text("Item changed");
    case DB_FAILED:return s_command.text[0]?app_text(s_command.text):app_text("Action failed");
    case DB_CANCELLED:return app_text("Cancelled");
    default:return NULL;
  }
}
static void header_text(GContext *ctx,const char *value,int point,GRect bounds,
                        GColor color,GTextAlignment align,void *context){
  (void)context;unsigned index=point>=XOCE_UI_HEADER_POINT?13:body_index(point);
  text_box(ctx,value,index,bounds,color,align);
}
static void header(GContext *ctx){
  const DbItem *preview=preview_item(),*item=db_selected(&s_state);const char *status=NULL;
  char context[72];context[0]=0;
  if(preview)status=preview->app_label;
  else if(!s_has_connection||s_state.snapshot.status==DB_OFFLINE)status=app_text("Offline");
  else if(command_error())status=command_error();
  else if(item&&item->role==DB_ROLE_PIN&&!db_item_current(item,utc_now()))status=(item->flags&DB_UNAVAILABLE)&&item->subtitle[0]?app_text(item->subtitle):app_text("No data");
  else if(item&&s_state.desired_mode==DB_MEDIA&&db_control_present(item,s_state.focus)&&!control_available(item,s_state.focus))status=app_text("Unavailable");
  const char *title=s_guide?"Buttons":s_command.confirmation?"Action":s_state.desired_mode==DB_ACTIVITIES?"Activities":s_state.desired_mode==DB_PINNED?"Pinned":s_state.desired_mode==DB_MEDIA?"Action":"Dashboard";
  bool collection=!status&&(s_state.desired_mode==DB_ACTIVITIES||s_state.desired_mode==DB_PINNED);
  if(collection){
    if(s_state.loading)snprintf(context,sizeof(context),"%s…",app_text(title));
    else snprintf(context,sizeof(context),"%u/%u",s_state.snapshot.total?s_state.selected_index+1:0,s_state.snapshot.total);
    status=context;
  }
  // Collection position is more useful than repeating the collection title.
  const char *compact=!strcmp(title,"Dashboard")?"Home":!strcmp(title,"Activities")?"Activity":title;
  const char *left=collection&&!s_state.loading?context:status?status:app_heading(compact);
  char right[16];time_t now=time(NULL);struct tm *local=localtime(&now);
  strftime(right,sizeof(right),clock_is_24h_style()?"%H:%M":"%I:%M",local);
  if(!clock_is_24h_style()&&right[0]=='0')memmove(right,right+1,strlen(right));
  xoce_ui_draw_header(ctx,CONTENT_W,left,right,foreground(),stroke(),header_text,NULL);
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
static void activity_main(GContext *ctx,const DbItem *item,int height){
  GColor ink=panel(ctx,item,GRect(0,33,CONTENT_W,height),false);
  if(!db_item_current(item,utc_now())){text_box(ctx,app_text("Activity unavailable"),5,GRect(10,33,CONTENT_W-20,height),ink,GTextAlignmentLeft);return;}
  if(item->flags&DB_IS_MEDIA){
    char title[193],identity[144];clean_text(title,sizeof(title),item->title);media_identity(item,identity,sizeof(identity));unsigned split=0;
    // Snapshot uses one title and one artist line at the same readable roles.
    char first[193];if(split){memcpy(first,title,split);first[split]=0;if(ink_height(first,5,CONTENT_W-20)+4+ink_height(title+split+1,5,CONTENT_W-20)+6+20>height-4)split=0;}
    int picture_size=24,first_height=ink_height(split?first:title,5,CONTENT_W-20),title_height=split?first_height+4+ink_height(title+split+1,5,CONTENT_W-20):first_height;
    if(title_height+6+picture_size>height-6)picture_size=24;
    int detail_height=ink_height(identity,4,119);if(detail_height<picture_size)detail_height=picture_size;
    const char *artist=identity;if(title_height+6+detail_height>height){artist="…";detail_height=picture_size;}
    int top=33+(height-title_height-6-detail_height)/2,detail_y=top+title_height+6;
    if(split){text_top(ctx,first,5,10,top,CONTENT_W-20,ink,GTextAlignmentLeft);text_top(ctx,title+split+1,5,10,top+first_height+4,CONTENT_W-20,ink,GTextAlignmentLeft);}
    else text_top(ctx,title,5,10,top,CONTENT_W-20,ink,GTextAlignmentLeft);
    picture(ctx,item,9,detail_y+(detail_height-picture_size)/2,picture_size,ink);
    text_box(ctx,artist,4,GRect(39,detail_y,119,detail_height),ink,GTextAlignmentLeft);
  }else{
    char value[64];item_value(item,value,sizeof(value));
    const char *title=item->title[0]?item->title:item->name,*caption=value[0]?title:item->subtitle;
    if(!value[0]&&!caption[0]){picture(ctx,item,10,33+(height-28)/2,28,ink);text_box(ctx,title,13,GRect(46,33,CONTENT_W-56,height),ink,GTextAlignmentLeft);return;}
    unsigned index=value[0]?value_index(value,CONTENT_W-20,36):13;const char *shown=value[0]?value_label(value,index,CONTENT_W-20):title;
    int value_height=ink_height(shown,index,CONTENT_W-20),detail_height=ink_height(caption,4,CONTENT_W-51),gap=height<64?4:6;if(detail_height<24)detail_height=24;
    if(value_height+gap+detail_height>height-4){caption="…";detail_height=24;}
    int top=33+(height-value_height-gap-detail_height)/2,detail_y=top+value_height+gap;
    text_top(ctx,shown,index,10,top,CONTENT_W-20,ink,GTextAlignmentLeft);
    picture(ctx,item,10,detail_y+(detail_height-24)/2,24,ink);text_box(ctx,caption,4,GRect(41,detail_y,CONTENT_W-51,detail_height),ink,GTextAlignmentLeft);
  }
}
static bool redundant_pin_label(const DbItem *item){
  if(item->kind==DB_WEATHER&&!strcmp(item->title,"Weather"))return true;
  if(item->kind==DB_PHONE&&(!strcmp(item->title,"Phone")||!strcmp(item->title,"Phone battery")))return true;
  return item->kind==DB_BATTERY&&(!strcmp(item->title,"Watch")||!strcmp(item->title,"Watch battery"));
}
static void pin_row(GContext *ctx,const DbItem *item,int y){
  GColor ink=panel(ctx,item,GRect(0,y,CONTENT_W,32),false);char value[64];item_value(item,value,sizeof(value));
  picture(ctx,item,9,y+4,24,ink);
  if(value[0]){
    if(redundant_pin_label(item)){unsigned index=value_index(value,120,26);text_box(ctx,value_label(value,index,120),index,GRect(39,y,120,32),ink,GTextAlignmentLeft);}
    else{unsigned index=clock_chars(value)?8:5;int value_width=width_of(value,index);if(value_width>CONTENT_W-89)value_width=CONTENT_W-89;
      index=value_index(value,value_width,26);text_box(ctx,item->title,4,GRect(39,y,116-value_width,32),ink,GTextAlignmentLeft);text_box(ctx,value_label(value,index,value_width),index,GRect(159-value_width,y,value_width,32),ink,GTextAlignmentRight);}
  }else text_box(ctx,item->title,5,GRect(39,y,120,32),ink,GTextAlignmentLeft);
}
static int notice_layout(const DbItem *item,char heading[265],const char **message,int *heading_height,int maximum,bool *hint){
  *hint=false;
  if(!db_item_current(item,utc_now())){snprintf(heading,265,"%s",app_text("Notifications"));*message=app_text("No preview");}
  else if(item->role==DB_ROLE_NOTICE&&!(item->flags&DB_PRIVATE)) {
    snprintf(heading,265,"%s",app_text("Notifications"));*message=app_text(item->subtitle);
  }else{
    if(item->name[0]&&strcmp(item->name,item->title))snprintf(heading,265,"%s · %s",item->title,item->name);else snprintf(heading,265,"%s",item->title[0]?item->title:item->name);
    *message=item->subtitle[0]?item->subtitle:app_text("New notification");
  }
  *heading_height=ink_height(heading,4,CONTENT_W-51);if(*heading_height<24)*heading_height=24;
  int needed=*heading_height+3+ink_height(*message,5,CONTENT_W-16)+6;
  if(needed>maximum){*message=app_text("Open to read");*hint=true;needed=*heading_height+3+ink_height(*message,4,CONTENT_W-16)+6;}
  return needed<52?52:needed;
}
static void notice(GContext *ctx,const DbItem *item,int y,int height,int maximum){
  GColor ink=panel(ctx,item,GRect(0,y,CONTENT_W,height),false);char heading[265];const char *message;int heading_height;bool hint;
  notice_layout(item,heading,&message,&heading_height,maximum,&hint);unsigned body=hint?4:5;
  int top=y+(height-heading_height-3-ink_height(message,body,CONTENT_W-16))/2;
  picture(ctx,item,10,top+(heading_height-24)/2,24,ink);text_box(ctx,heading,4,GRect(41,top,CONTENT_W-51,heading_height),ink,GTextAlignmentLeft);
  text_top(ctx,message,body,8,top+heading_height+3,CONTENT_W-16,ink,GTextAlignmentLeft);
}
static void empty_message(GContext *ctx,const char *title,const char *detail,int y){
  (void)y;bool has_detail=detail&&detail[0];int title_height=ink_height(title,4,CONTENT_W-12),height=28+16+title_height+(has_detail?8+ink_height(detail,4,CONTENT_W-12):0),top=XOCE_UI_HEADER_HEIGHT+(SCREEN_H-XOCE_UI_HEADER_HEIGHT-height)/2;
  symbol(ctx,DB_GENERIC,(CONTENT_W-28)/2,top,28,muted());
  text_top(ctx,title,4,6,top+44,CONTENT_W-12,foreground(),GTextAlignmentCenter);
  if(has_detail)text_top(ctx,detail,4,6,top+44+title_height+8,CONTENT_W-12,muted(),GTextAlignmentCenter);
}
static void snapshot(GContext *ctx){
  const DbItem *activity=NULL,*notification=NULL;unsigned pins=0;
  for(unsigned i=0;i<s_state.snapshot.count;i++){const DbItem *item=&s_state.snapshot.items[i];if(item->role==DB_ROLE_ACTIVITY&&!activity)activity=item;else if(item->role==DB_ROLE_NOTICE&&!notification)notification=item;}
  bool large_primary=false;if(activity){char value[64];item_value(activity,value,sizeof(value));large_primary=(activity->flags&DB_IS_MEDIA)||(value[0]&&!clock_chars(value))||(!value[0]&&activity->subtitle[0]);}
  int notice_maximum=large_primary?53:62,notice_height=52;if(notification){char heading[265];const char *message;int heading_height;bool hint;notice_height=notice_layout(notification,heading,&message,&heading_height,notice_maximum,&hint);}
  int notice_y=157-notice_height,primary_height=notice_y-3-33;
  if(activity)activity_main(ctx,activity,primary_height);else text_box(ctx,app_text("Nothing active"),5,GRect(6,33,CONTENT_W-12,primary_height),muted(),GTextAlignmentCenter);
  segment(ctx,8,notice_y-2,CONTENT_W-8,notice_y-2,stroke());
  if(notification)notice(ctx,notification,notice_y,notice_height,notice_maximum);else{symbol(ctx,DB_NOTICE,10,notice_y+(notice_height-24)/2,24,muted());text_box(ctx,app_text("No notifications"),5,GRect(41,notice_y,CONTENT_W-51,notice_height),muted(),GTextAlignmentLeft);}
  segment(ctx,8,158,CONTENT_W-8,158,stroke());segment(ctx,8,193,CONTENT_W-8,193,stroke());
  for(unsigned i=0;i<s_state.snapshot.count;i++)if(s_state.snapshot.items[i].role==DB_ROLE_PIN&&pins<2)pin_row(ctx,&s_state.snapshot.items[i],160+35*(int)pins++);
  if(!pins){
    text_box(ctx,app_text("Choose pins"),5,GRect(8,160,CONTENT_W-16,32),muted(),GTextAlignmentLeft);
    text_box(ctx,app_text("on phone"),4,GRect(8,195,CONTENT_W-16,32),muted(),GTextAlignmentLeft);
  }
}
static int list_row_height(const DbItem *item){
  char value[64],identity[144];item_value(item,value,sizeof(value));
  if(!(item->flags&DB_IS_MEDIA)&&!value[0])return 39;
  media_identity(item,identity,sizeof(identity));
  const char *title=item->title[0]?item->title:item->name,*detail=(item->flags&DB_IS_MEDIA)?identity:value;
  unsigned index=(item->flags&DB_IS_MEDIA)?4:value_index(value,119,26);
  if(!(item->flags&DB_IS_MEDIA))detail=value_label(detail,index,119);
  int height=ink_height(title,5,119)+4+ink_height(detail,index,119)+6;
  return height<48?48:height;
}
static void list_row(GContext *ctx,const DbItem *item,int y,int height){
  GColor ink=panel(ctx,item,GRect(0,y,CONTENT_W,height),false);char value[64];item_value(item,value,sizeof(value));picture(ctx,item,9,y+(height-26)/2,26,ink);
  if((item->flags&DB_IS_MEDIA)||value[0]){
    char identity[144];media_identity(item,identity,sizeof(identity));
    unsigned index=(item->flags&DB_IS_MEDIA)?4:value_index(value,119,26);
    const char *title=item->title[0]?item->title:item->name,*detail=(item->flags&DB_IS_MEDIA)?identity:value;
    if(!(item->flags&DB_IS_MEDIA))detail=value_label(detail,index,119);
    int title_height=ink_height(title,5,119),detail_height=ink_height(detail,index,119),gap=4;
    int top=y+(height-title_height-gap-detail_height)/2;
    text_top(ctx,title,5,40,top,119,ink,GTextAlignmentLeft);
    text_top(ctx,detail,index,40,top+title_height+gap,119,ink,GTextAlignmentLeft);
  }else text_box(ctx,item->title[0]?item->title:item->name,5,GRect(40,y,119,height),ink,GTextAlignmentLeft);
}
static void list_view(GContext *ctx){
  if(!s_state.snapshot.count){empty_message(ctx,s_state.desired_mode==DB_ACTIVITIES?app_text("Nothing active"):app_text("No pinned items"),s_state.desired_mode==DB_PINNED?app_text("Choose items on phone"):"",66);return;}
  if(s_list_mode!=s_state.snapshot.mode||s_list_offset!=s_state.snapshot.offset){s_list_first=0;s_list_mode=s_state.snapshot.mode;s_list_offset=s_state.snapshot.offset;}
  int heights[DB_PAGE_ITEMS];unsigned selected=s_list_first<s_state.snapshot.count?s_list_first:0;
  for(unsigned i=0;i<s_state.snapshot.count;i++){heights[i]=list_row_height(&s_state.snapshot.items[i]);if(item_selected(&s_state.snapshot.items[i]))selected=i;}
  DbListWindow window=db_layout_window(heights,s_state.snapshot.count,selected,s_list_first,SCREEN_H-XOCE_UI_HEADER_HEIGHT);s_list_first=window.first;
  int y=XOCE_UI_HEADER_HEIGHT;for(unsigned i=window.first;i<window.first+window.count;i++){list_row(ctx,&s_state.snapshot.items[i],y,heights[i]);y+=heights[i];}
  if(s_state.snapshot.total>window.count){int thumb=(SCREEN_H-XOCE_UI_HEADER_HEIGHT)*window.count/s_state.snapshot.total;if(thumb<8)thumb=8;int top=XOCE_UI_HEADER_HEIGHT+(SCREEN_H-XOCE_UI_HEADER_HEIGHT-thumb)*(s_state.snapshot.offset+window.first)/(s_state.snapshot.total-window.count);fill(ctx,GRect(CONTENT_W-4,XOCE_UI_HEADER_HEIGHT,2,SCREEN_H-XOCE_UI_HEADER_HEIGHT),stroke(),0);fill(ctx,GRect(CONTENT_W-4,top,2,thumb),foreground(),0);}
}
static XoceUiIcon playback_symbol(unsigned index,bool paused){
  return index==0?XOCE_ICON_PREVIOUS_TRACK:index==2?XOCE_ICON_NEXT_TRACK:
      paused?XOCE_ICON_PLAY:XOCE_ICON_PAUSE;
}
static void playback_icon(GContext *ctx,unsigned index,bool paused,int x,int y,GColor color){
  xoce_ui_draw_icon(ctx,playback_symbol(index,paused),GPoint(x+10,y+10),20,color);
}
static void media_view(GContext *ctx){
  const DbItem *item=db_selected(&s_state);
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
      bool available=control_available(item,i),selected=s_state.focus==i;GColor ink=selected?background():available?foreground():muted();int x=5+i*53;
      if(selected)fill(ctx,GRect(x,163,50,37),foreground(),3);else edge(ctx,GRect(x,163,50,37),stroke(),3);
      playback_icon(ctx,i,(item->flags&DB_PAUSED)!=0,x+15,171,ink);
    }
  }else{
    text(ctx,item->title,24,9,57,CONTENT_W-20,foreground());char value[64];item_value(item,value,sizeof(value));text(ctx,value[0]?value:item->subtitle,24,9,86,CONTENT_W-20,muted());
    unsigned count=0;for(unsigned i=0;i<3;i++)if(db_control_present(item,i))count++;
    int height=count==1?72:count==2?56:38,gap=count==3?5:8,top=count==1?116:102;unsigned row=0;
    for(unsigned i=0;i<3;i++)if(db_control_present(item,i)){
      bool available=control_available(item,i),selected=s_state.focus==i;int y=top+(int)row++*(height+gap);
      if(selected)fill(ctx,GRect(0,y,CONTENT_W,height),foreground(),0);else edge(ctx,GRect(0,y,CONTENT_W,height),stroke(),0);
      GColor ink=selected?(available?background():(s_state.snapshot.dark?GColorDarkGray:GColorLightGray)):(available?foreground():muted());
      text_box(ctx,item->controls[i][0]?(item->flags&DB_IS_MEDIA?app_text(item->controls[i]):item->controls[i]):app_text("Action"),5,GRect(8,y,CONTENT_W-16,height),ink,GTextAlignmentLeft);
    }
  }
}
static XoceUiIcon action_symbol(const DbItem *item,unsigned action){
  if(item->flags&DB_IS_MEDIA)return playback_symbol(action,(item->flags&DB_PAUSED)!=0);
  if(item->kind==DB_LIGHT)return XOCE_ICON_POWER;
  if(item->kind==DB_FIND)return XOCE_ICON_FIND;
  return XOCE_ICON_CHECK;
}
static void action_bar(GContext *ctx){
  XoceUiIcon icons[]={XOCE_ICON_NONE,XOCE_ICON_NONE,XOCE_ICON_NONE};
  if(s_guide){icons[1]=XOCE_ICON_CHECK;goto draw;}
  if(!s_command.confirmation){icons[0]=XOCE_ICON_UP;icons[2]=XOCE_ICON_DOWN;}
  if(s_state.loading||!s_state.ready)goto draw;
  const DbItem *item=db_selected(&s_state);
  if(!s_has_connection||!db_item_capability_current(item,utc_now()))goto draw;
  if(preview_item()){icons[1]=XOCE_ICON_LAUNCH;goto draw;}
  if(s_command.active&&s_command.result==DB_PENDING){icons[1]=XOCE_ICON_MORE;goto draw;}
  if(s_command.confirmation){
    if(s_confirm_accept){icons[0]=XOCE_ICON_UP;icons[1]=action_symbol(item,s_command.action);}
    else{icons[1]=XOCE_ICON_CHECK;icons[2]=XOCE_ICON_DOWN;}
    goto draw;
  }
  if(s_command.active&&s_command.result==DB_SUCCESS){icons[1]=XOCE_ICON_CHECK;goto draw;}
  if(s_state.desired_mode==DB_MEDIA){if(control_available(item,s_state.focus))icons[1]=action_symbol(item,s_state.focus);}
  else if(item->flags&DB_NOTIFICATION){if(item->flags&DB_APP)icons[1]=XOCE_ICON_NOTIFICATION;}
  else if(item->role==DB_ROLE_ACTIVITY&&(item->flags&DB_IS_MEDIA)){if(db_item_direct_action(item,utc_now())==1)icons[1]=action_symbol(item,1);}
  else if(db_item_actionable(item,utc_now())){
    icons[1]=item->role==DB_ROLE_ACTIVITY?XOCE_ICON_MORE:action_symbol(item,0);
  }
 draw:;
  const int8_t offsets[]={-(int)s_buttons[0].offset,-(int)s_buttons[1].offset,-(int)s_buttons[2].offset};
  xoce_ui_draw_action_bar(ctx,GRect(CONTENT_W,0,ACTION_BAR_WIDTH,SCREEN_H),icons,offsets,foreground(),background());
}
static void confirm_overlay(GContext *ctx){
  const DbItem *item=db_selected(&s_state);
  fill(ctx,GRect(0,XOCE_UI_HEADER_HEIGHT,CONTENT_W,SCREEN_H-XOCE_UI_HEADER_HEIGHT),background(),0);
  text_box(ctx,item&&item->action_label[0]?item->action_label:app_text("Run action?"),13,GRect(8,43,CONTENT_W-16,36),foreground(),GTextAlignmentLeft);
  text_box(ctx,item?(item->title[0]?item->title:item->name):app_text("Selected item"),5,GRect(8,85,CONTENT_W-16,34),foreground(),GTextAlignmentLeft);
  text_box(ctx,app_text("Back cancels"),4,GRect(8,132,CONTENT_W-16,24),muted(),GTextAlignmentLeft);
  const int first=160,second=first+XOCE_UI_CHOICE_STRIDE;
  fill(ctx,GRect(0,first,CONTENT_W,XOCE_UI_CHOICE_HEIGHT),s_confirm_accept?background():foreground(),0);
  text_box(ctx,app_text("Cancel"),5,GRect(8,first,CONTENT_W-16,XOCE_UI_CHOICE_HEIGHT),s_confirm_accept?foreground():background(),GTextAlignmentLeft);
  fill(ctx,GRect(0,second,CONTENT_W,XOCE_UI_CHOICE_HEIGHT),s_confirm_accept?foreground():background(),0);
  text_box(ctx,app_text("Run action"),5,GRect(8,second,CONTENT_W-16,XOCE_UI_CHOICE_HEIGHT),s_confirm_accept?background():foreground(),GTextAlignmentLeft);
}
static void guide_view(GContext *ctx){
  header(ctx);
  // Complete instructions at the ordinary secondary size, without ellipses.
  const char *lines[]={app_text("Up / Down: move"),app_text("Hold Up: activity"),app_text("Hold Down: pins"),app_text("Select: action"),app_text("Hold Select: app"),app_text("Back: return")};
  for(unsigned i=0;i<6;i++)text_box(ctx,lines[i],4,GRect(8,40+(int)i*26,CONTENT_W-16,24),foreground(),GTextAlignmentLeft);
  fill(ctx,GRect(0,200,CONTENT_W,28),foreground(),0);text_box(ctx,app_text("Select to start"),4,GRect(8,200,CONTENT_W-16,28),background(),GTextAlignmentLeft);
}
static void update(Layer *layer,GContext *ctx){
  (void)layer;fill(ctx,GRect(0,0,SCREEN_W,SCREEN_H),background(),0);
  if(s_guide){guide_view(ctx);action_bar(ctx);return;}
  header(ctx);
  if(s_state.loading||!s_state.ready)empty_message(ctx,s_has_connection?app_text("Loading…"):app_text("Phone disconnected"),s_has_connection?app_text("Waiting for data"):app_text("Reconnect your phone"),66);
  else if(s_state.snapshot.status>=DB_OFFLINE&&!s_state.snapshot.count)empty_message(ctx,status_text(),s_state.snapshot.status==DB_PERMISSION?app_text("Open phone settings"):app_text("Back is available"),66);
  else if(s_state.desired_mode==DB_OVERVIEW)snapshot(ctx);
  else if(s_state.desired_mode==DB_MEDIA)media_view(ctx);
  else list_view(ctx);
  if(s_command.confirmation)confirm_overlay(ctx);
  action_bar(ctx);
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
static void send_queued(void){
  if(s_sending||!s_queue_count)return;
  DictionaryIterator *dict;AppMessageResult error=app_message_outbox_begin(&dict);if(error!=APP_MSG_OK){s_queue_count=0;if(s_state.loading)view_failed(NULL);else action_failed(NULL);return;}
  Outbound item=s_queue[0];dict_write_uint8(dict,DB_KEY_OPERATION,item.op);dict_write_uint32(dict,DB_KEY_SESSION,s_state.session);dict_write_uint32(dict,DB_KEY_REQUEST,item.request);
  dict_write_uint8(dict,DB_KEY_MODE,item.mode);dict_write_uint16(dict,DB_KEY_OFFSET,item.offset);dict_write_uint16(dict,DB_KEY_INDEX,item.index);
  if(item.token){dict_write_uint32(dict,DB_KEY_TOKEN,item.token);dict_write_uint32(dict,DB_KEY_VERSION,item.version);}
  if(item.op==DB_OP_ACTION){dict_write_uint8(dict,DB_KEY_ACTION,item.action);dict_write_uint8(dict,DB_KEY_CONFIRM,item.confirm);}
  s_sending=true;
  if(app_message_outbox_send()!=APP_MSG_OK){s_sending=false;s_queue_count=0;if(s_state.loading)view_failed(NULL);else action_failed(NULL);}
}
static void queue_message(Outbound item){
  if(item.op==DB_OP_VIEW||item.op==DB_OP_HELLO){for(unsigned i=s_sending?1:0;i<s_queue_count;i++)if(s_queue[i].op==DB_OP_VIEW||s_queue[i].op==DB_OP_HELLO){s_queue[i]=item;send_queued();return;}}
  if(item.op==DB_OP_FOCUS){
    for(unsigned i=s_sending?1:0;i<s_queue_count;i++)if(s_queue[i].op==DB_OP_FOCUS&&s_queue[i].request==item.request){s_queue[i]=item;send_queued();return;}
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
    memset(&s_command,0,sizeof(s_command));s_press_token=s_press_version=0;s_press_mode=DB_OVERVIEW;
    // The SDK still owns an already-sent dictionary. Keep that queue slot until
    // its ACK/NACK arrives; only unsent messages from the old epoch are dropped.
    s_queue_count=s_sending&&s_queue_count?1:0;
    db_state_init(&s_state,session);s_state.connected=s_has_connection;s_state.snapshot.dark=dark;
    request_view(DB_OVERVIEW,0,0,0,true);
#endif
    return;
  }
  uint32_t session;if(read_uint(dict,DB_KEY_SESSION,&session)&&session!=s_state.session)return;
  Tuple *data=dict_find(dict,DB_KEY_DATA);
  if(data&&data->type==TUPLE_BYTE_ARRAY){
    DbSnapshot *incoming=malloc(sizeof(*incoming));if(!incoming){view_failed(NULL);return;}
    if(db_decode((const uint8_t *)data->value,data->length,incoming)){
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
        if(s_select_down&&!pressed_item())cancel_hold_preview();
        bool redacted=db_state_redact(&s_state,utc_now(),!s_has_connection);update_ticks();if(redraw||redacted||selected!=s_state.selected_token)repaint();
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
static void outbox_sent(DictionaryIterator *dict,void *context){(void)dict;(void)context;if(s_queue_count){s_queue_count--;memmove(s_queue,s_queue+1,s_queue_count*sizeof(*s_queue));}s_sending=false;send_queued();}
static void outbox_failed(DictionaryIterator *dict,AppMessageResult reason,void *context){
  (void)reason;(void)context;uint32_t session;
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

  uint16_t index=s_state.selected_index;uint8_t focus=s_state.focus;
  if(!db_state_move(&s_state,delta,&index))return;
  if(s_state.snapshot.mode==DB_MEDIA){if(focus!=s_state.focus)repaint();return;}
  if(index<s_state.snapshot.offset||index>=s_state.snapshot.offset+s_state.snapshot.count){
    uint16_t offset=index>=3?index-3:0;if(s_state.snapshot.total>DB_PAGE_ITEMS&&offset>s_state.snapshot.total-DB_PAGE_ITEMS)offset=s_state.snapshot.total-DB_PAGE_ITEMS;
    request_view(s_state.snapshot.mode,offset,index,0,false);
  }else{

    publish_focus();
    repaint();
  }
}
static void repeated(void *context){
  (void)context;s_repeat=NULL;if(!s_repeat_held||!s_focused)return;
  uint16_t before=s_state.selected_index;uint8_t focus=s_state.focus;move_selection(s_repeat_delta);
  if(!s_state.loading&&before==s_state.selected_index&&focus==s_state.focus){s_repeat_held=false;return;}
  if(s_repeat_held)s_repeat=app_timer_register(140,repeated,NULL);
}
static void direction_click(ClickRecognizerRef recognizer,void *context){
  (void)context;button_released(click_recognizer_get_button_id(recognizer));if(s_guide)return;
  if(s_command.confirmation){s_confirm_accept=click_recognizer_get_button_id(recognizer)==BUTTON_ID_DOWN;repaint();return;}
  acknowledge_feedback();cancel_hold_preview();move_selection(click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP?-1:1);
}
static void direction_hold(ClickRecognizerRef recognizer,void *context){
  (void)context;if(s_guide||s_command.confirmation)return;acknowledge_feedback();cancel_hold_preview();int delta=click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP?-1:1;
  if(s_state.desired_mode==DB_OVERVIEW){if(s_state.loading)return;db_state_remember(&s_state);request_view(delta<0?DB_ACTIVITIES:DB_PINNED,0,0,0,false);return;}
  stop_repeat();s_repeat_held=true;s_repeat_delta=delta;move_selection(delta);s_repeat=app_timer_register(140,repeated,NULL);
}
static void direction_release(ClickRecognizerRef recognizer,void *context){(void)context;button_released(click_recognizer_get_button_id(recognizer));stop_repeat();}
static void up_pressed(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_pressed(BUTTON_ID_UP);}
static void up_released(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_released(BUTTON_ID_UP);}
static void down_pressed(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_pressed(BUTTON_ID_DOWN);}
static void down_released(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;button_released(BUTTON_ID_DOWN);}
static const DbItem *pressed_item(void){const DbItem *item=db_selected(&s_state);return item&&item->token==s_press_token&&item->version==s_press_version&&s_state.desired_mode==s_press_mode?item:NULL;}
static void show_hold_preview(void *context){
  (void)context;s_hold_timer=NULL;const DbItem *item=pressed_item();
  if(s_select_down&&!s_guide&&!s_command.confirmation&&s_has_connection&&db_item_capability_current(item,utc_now())&&(item->flags&DB_APP)&&!(s_command.active&&s_command.result==DB_PENDING)){s_hold_preview=true;s_hold_intent=true;repaint();}
}
static void select_raw(ClickRecognizerRef recognizer,void *context){
  (void)recognizer;(void)context;button_pressed(BUTTON_ID_SELECT);cancel_hold_preview();s_hold_intent=false;s_select_down=true;
  if(s_guide){s_press_token=s_press_version=0;return;}
  acknowledge_feedback();const DbItem *item=db_selected(&s_state);s_press_token=item?item->token:0;s_press_version=item?item->version:0;s_press_mode=s_state.desired_mode;
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
  if(s_guide){s_guide=false;persist_write_bool(GUIDE_SEEN_KEY,true);s_press_token=s_press_version=0;s_hold_intent=false;update_ticks();repaint();return;}
  if(s_hold_intent){s_hold_intent=false;return;}
  if(s_command.confirmation){if(!s_confirm_accept){memset(&s_command,0,sizeof(s_command));repaint();return;}const DbItem *item=db_selected(&s_state);if(item&&item->token==s_command.token&&item->version==s_command.version)run_command(item,DB_OP_ACTION,s_command.action,true);else{s_command.confirmation=false;s_command.result=DB_STALE;repaint();}return;}
  const DbItem *item=pressed_item();if(!s_has_connection||!db_item_capability_current(item,utc_now()))return;
  if(s_state.desired_mode==DB_MEDIA){if(control_available(item,s_state.focus))run_command(item,DB_OP_ACTION,s_state.focus,false);}
  else if(item->flags&DB_NOTIFICATION){if(item->flags&DB_APP)run_command(item,DB_OP_OPEN,0,false);}
  else if(item->role==DB_ROLE_ACTIVITY&&(item->flags&DB_IS_MEDIA)){if(db_item_direct_action(item,utc_now())==1)run_command(item,DB_OP_ACTION,1,false);}
  else if(item->role==DB_ROLE_ACTIVITY&&db_item_actionable(item,utc_now())&&(item->flags&(DB_MEDIA_PREVIOUS|DB_MEDIA_TOGGLE|DB_MEDIA_NEXT))){
    db_state_remember(&s_state);s_state.focus=(item->flags&DB_IS_MEDIA)&&control_available(item,1)?1:control_available(item,0)?0:control_available(item,1)?1:2;
    request_view(DB_MEDIA,0,0,item->token,false);
  }else if(item->role==DB_ROLE_PIN&&db_item_actionable(item,utc_now()))run_command(item,DB_OP_ACTION,0,false);
}
static void select_hold(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;cancel_hold_preview();if(s_guide||s_command.confirmation)return;const DbItem *item=pressed_item();if(item&&(item->flags&DB_APP))run_command(item,DB_OP_OPEN,0,false);}
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
  s_has_connection=connected;s_state.connected=connected;stop_repeat();cancel_hold_preview();cancel_motion();s_select_down=false;s_hold_intent=false;s_press_token=0;
  if(!connected){db_state_redact(&s_state,utc_now(),true);if(s_state.loading)view_failed(NULL);if(s_command.active&&s_command.result==DB_PENDING)action_failed(NULL);}
  else request_view(s_state.desired_mode,s_state.snapshot.offset,s_state.selected_index,s_state.selected_token,true);
  update_ticks();repaint();
}
static void focus_changed(bool focused){s_focused=focused;if(!focused){stop_repeat();cancel_hold_preview();cancel_motion();s_select_down=false;s_hold_intent=false;s_press_token=0;}else{db_state_redact(&s_state,utc_now(),!s_has_connection);repaint();}update_ticks();}
static void battery_changed(BatteryChargeState value){(void)value;for(unsigned i=0;i<s_state.snapshot.count;i++)if(s_state.snapshot.items[i].flags&DB_LOCAL_WATCH){repaint();break;}}
static void init(void){
  time_t seconds;uint16_t milliseconds;time_ms(&seconds,&milliseconds);uint32_t session=((uint32_t)seconds^((uint32_t)milliseconds<<16)^0x44534831u)&INT32_MAX;if(!session)session=1;
  db_state_init(&s_state,session);
#ifndef DASHBOARD_FIXTURE
  s_guide=!persist_read_bool(GUIDE_SEEN_KEY);
  s_saved_dark=persist_read_bool(THEME_DARK_KEY);s_state.snapshot.dark=s_saved_dark;
#endif
  s_has_connection=connection_service_peek_pebble_app_connection();s_state.connected=s_has_connection;
  s_window=window_create();if(!s_window)return;s_canvas=layer_create(GRect(0,0,SCREEN_W,SCREEN_H));if(!s_canvas)return;
  window_set_background_color(s_window,background());
  layer_set_update_proc(s_canvas,update);layer_add_child(window_get_root_layer(s_window),s_canvas);window_set_click_config_provider(s_window,configure_clicks);
  app_message_register_inbox_received(inbox);app_message_register_inbox_dropped(inbox_dropped);app_message_register_outbox_sent(outbox_sent);app_message_register_outbox_failed(outbox_failed);
  if(app_message_open(9216,256)!=APP_MSG_OK){s_state.ready=true;s_state.snapshot.status=DB_ERROR;}
  connection_service_subscribe((ConnectionHandlers){.pebble_app_connection_handler=connection_changed});app_focus_service_subscribe(focus_changed);battery_state_service_subscribe(battery_changed);
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
  if(s_canvas)layer_destroy(s_canvas);
  if(s_window)window_destroy(s_window);
  for(unsigned i=0;i<FONT_COUNT;i++)if(s_fonts[i])fonts_unload_custom_font(s_fonts[i]);
  memset(&s_state,0,sizeof(s_state));memset(&s_command,0,sizeof(s_command));
}
int main(void){init();if(s_window&&s_canvas)app_event_loop();deinit();return 0;}
