#include <pebble.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
#include <limits.h>
#include "dashboard.h"

#define SCREEN_W 200
#define SCREEN_H 228
#define VIEW_TIMEOUT_MS 6000
#define ACTION_TIMEOUT_MS 12000
#define OUTBOX_CAPACITY 4

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
static AppTimer *s_view_timeout,*s_action_timeout,*s_expiry_timer,*s_repeat;
static int s_repeat_delta;
static bool s_repeat_held;
static uint32_t s_press_token,s_press_version;
static uint8_t s_press_mode;
static GFont s_fonts[9];
static uint8_t s_tick_seconds;
static unsigned s_last_minute;
static const uint8_t s_font_points[]={11,12,14,16,20,24,20,24,26};
static const uint32_t s_font_ids[]={RESOURCE_ID_FONT_BODY_11,RESOURCE_ID_FONT_BODY_12,RESOURCE_ID_FONT_BODY_14,
  RESOURCE_ID_FONT_BODY_16,RESOURCE_ID_FONT_BODY_20,RESOURCE_ID_FONT_BODY_24,
  RESOURCE_ID_FONT_CLOCK_20,RESOURCE_ID_FONT_CLOCK_24,RESOURCE_ID_FONT_CLOCK_26};

static uint32_t utc_now(void){return (uint32_t)time(NULL);}
static uint32_t next_request(void){s_counter=s_counter>=INT32_MAX?1:s_counter+1;return s_counter;}
static void repaint(void){if(s_canvas&&s_focused)layer_mark_dirty(s_canvas);}
static void update_ticks(void);
static void configure_clicks(void *context);
static void send_queued(void);
static void stop_repeat(void);
static void request_view(uint8_t mode,uint16_t offset,uint16_t index,uint32_t token,bool hello);
static GColor background(void){return s_state.snapshot.dark?GColorBlack:GColorWhite;}
static GColor foreground(void){return s_state.snapshot.dark?GColorWhite:GColorBlack;}
static GColor muted(void){return s_state.snapshot.dark?GColorLightGray:GColorDarkGray;}
static GColor stroke(void){return s_state.snapshot.dark?GColorDarkGray:GColorLightGray;}
static GColor accent(void){return GColorPictonBlue;}
static GFont font_at(unsigned index){
  if(index>=9)index=3;
  if(!s_fonts[index])s_fonts[index]=fonts_load_custom_font(resource_get_handle(s_font_ids[index]));
  return s_fonts[index]?s_fonts[index]:fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD);
}
static unsigned body_index(unsigned point){return point<=11?0:point<=12?1:point<=14?2:point<=16?3:point<=20?4:5;}
static int width_of(const char *value,unsigned index){
  return graphics_text_layout_get_content_size(value,font_at(index),GRect(0,0,2048,512),GTextOverflowModeFill,GTextAlignmentLeft).w;
}
static void pop_utf8(char *text){size_t n=strlen(text);if(!n)return;do{n--;}while(n&&((unsigned char)text[n]&0xc0)==0x80);text[n]=0;}
static void clean_text(char *out,size_t size,const char *value){
  if(!size)return;
  snprintf(out,size,"%s",value?value:"");
  for(char *p=out;*p;p++)if(*p=='\n'||*p=='\r'||*p=='\t')*p=' ';
}
static void draw_text(GContext *ctx,const char *value,unsigned index,int x,int baseline,int width,GColor color,GTextAlignment alignment){
  if(width<=0)return;
  char text[257];clean_text(text,sizeof(text),value);
  if(width_of(text,index)>width){
    while(text[0]){pop_utf8(text);size_t n=strlen(text);if(n+4>=sizeof(text))continue;memcpy(text+n,"…",4);
      if(width_of(text,index)<=width)break;
      text[n]=0;}
  }
  graphics_context_set_text_color(ctx,color);
  graphics_draw_text(ctx,text,font_at(index),GRect(x,baseline-s_font_points[index],width,s_font_points[index]+12),GTextOverflowModeFill,alignment,NULL);
}
static void text(GContext *ctx,const char *value,unsigned point,int x,int baseline,int width,GColor color){draw_text(ctx,value,body_index(point),x,baseline,width,color,GTextAlignmentLeft);}
static void centered(GContext *ctx,const char *value,unsigned point,int baseline,GColor color){draw_text(ctx,value,body_index(point),7,baseline,186,color,GTextAlignmentCenter);}
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
static void value_text(GContext *ctx,const char *value,int x,int baseline,int width,unsigned preferred,GColor color,GTextAlignment align){
  unsigned index=clock_chars(value)?preferred>=26?8:preferred>=24?7:6:body_index(preferred);
  if(width_of(value,index)>width&&index>=6)index=6;
  if(width_of(value,index)>width)index=3;
  while(index>0&&width_of(value,index)>width)index--;
  if(width_of(value,index)>width){text(ctx,"Too long",11,x,baseline,width,color);return;}
  draw_text(ctx,value,index,x,baseline,width,color,align);
}
static void fill(GContext *ctx,GRect bounds,GColor color,int radius){graphics_context_set_fill_color(ctx,color);graphics_fill_rect(ctx,bounds,radius,GCornersAll);}
static void edge(GContext *ctx,GRect bounds,GColor color,int radius){graphics_context_set_stroke_color(ctx,color);graphics_context_set_stroke_width(ctx,1);graphics_draw_round_rect(ctx,bounds,radius);}
static void segment(GContext *ctx,int x,int y,int x2,int y2,GColor color){graphics_context_set_stroke_color(ctx,color);graphics_context_set_stroke_width(ctx,1);graphics_draw_line(ctx,GPoint(x,y),GPoint(x2,y2));}
static bool item_selected(const DbItem *item){return item&&s_state.selected_token==item->token&&!s_state.loading&&!s_state.selection_lost;}
static GColor panel(GContext *ctx,const DbItem *item,GRect bounds,bool outlined){
  if(item_selected(item)){fill(ctx,bounds,foreground(),4);return background();}
  if(outlined)edge(ctx,bounds,stroke(),4);
  return foreground();
}
static void symbol(GContext *ctx,uint8_t kind,int x,int y,int size,GColor color){
  graphics_context_set_stroke_color(ctx,color);graphics_context_set_fill_color(ctx,color);graphics_context_set_stroke_width(ctx,size>=18?2:1);
  int a=size/5,b=size-a,c=size/2;
  switch(kind){
    case DB_TIMER:
      graphics_draw_line(ctx,GPoint(x+a,y+1),GPoint(x+b,y+1));graphics_draw_line(ctx,GPoint(x+a,y+size-1),GPoint(x+b,y+size-1));
      graphics_draw_line(ctx,GPoint(x+a,y+2),GPoint(x+a,y+size/4));graphics_draw_line(ctx,GPoint(x+b,y+2),GPoint(x+b,y+size/4));
      graphics_draw_line(ctx,GPoint(x+a,y+size/4),GPoint(x+b,y+size*3/4));graphics_draw_line(ctx,GPoint(x+b,y+size/4),GPoint(x+a,y+size*3/4));
      graphics_draw_line(ctx,GPoint(x+a,y+size*3/4),GPoint(x+a,y+size-2));graphics_draw_line(ctx,GPoint(x+b,y+size*3/4),GPoint(x+b,y+size-2));break;
    case DB_MUSIC:
      graphics_draw_line(ctx,GPoint(x+c-2,y+size*3/4),GPoint(x+c-2,y+3));graphics_draw_line(ctx,GPoint(x+c-2,y+3),GPoint(x+b,y+1));
      graphics_draw_line(ctx,GPoint(x+b,y+1),GPoint(x+b,y+size*2/3));graphics_fill_circle(ctx,GPoint(x+c-4,y+size*3/4),size/6);graphics_fill_circle(ctx,GPoint(x+b-2,y+size*2/3),size/6);break;
    case DB_PHONE:case DB_FIND:
      graphics_draw_round_rect(ctx,GRect(x+a,y+1,size-2*a,size-2),1);graphics_draw_line(ctx,GPoint(x+c-1,y+size-4),GPoint(x+c+1,y+size-4));
      if(kind==DB_FIND){graphics_draw_line(ctx,GPoint(x,y+a),GPoint(x,y+b));graphics_draw_line(ctx,GPoint(x+size,y+a),GPoint(x+size,y+b));}break;
    case DB_NOTICE:
      graphics_draw_rect(ctx,GRect(x+1,y+1,size-2,size*2/3));graphics_draw_line(ctx,GPoint(x+3,y+size*2/3),GPoint(x+3,y+size-1));graphics_draw_line(ctx,GPoint(x+3,y+size-1),GPoint(x+c,y+size*2/3));
      graphics_draw_line(ctx,GPoint(x+4,y+4),GPoint(x+size-4,y+4));break;
    case DB_WEATHER:
      graphics_draw_circle(ctx,GPoint(x+size/3,y+size/3),size/4);graphics_draw_round_rect(ctx,GRect(x+size/4,y+c,size*3/4,size/3),size/6);break;
    case DB_BATTERY:
      graphics_draw_rect(ctx,GRect(x,y+size/4,size-2,size/2));graphics_fill_rect(ctx,GRect(x+size-2,y+c-1,2,3),0,GCornerNone);
      graphics_fill_rect(ctx,GRect(x+3,y+size/4+3,size/2,size/2-5),0,GCornerNone);break;
    case DB_LIGHT:
      graphics_draw_circle(ctx,GPoint(x+c,y+size/3),size/3);graphics_draw_line(ctx,GPoint(x+size/3,y+size*2/3),GPoint(x+size*2/3,y+size*2/3));graphics_draw_line(ctx,GPoint(x+size/3,y+size-1),GPoint(x+size*2/3,y+size-1));break;
    case DB_NAVIGATION:
      graphics_draw_line(ctx,GPoint(x+a,y+b),GPoint(x+a,y+c));graphics_draw_line(ctx,GPoint(x+a,y+c),GPoint(x+b,y+c));graphics_draw_line(ctx,GPoint(x+c,y+a),GPoint(x+b,y+c));graphics_draw_line(ctx,GPoint(x+c,y+b),GPoint(x+b,y+c));break;
    case DB_CALENDAR:
      graphics_draw_rect(ctx,GRect(x+1,y+3,size-2,size-4));graphics_draw_line(ctx,GPoint(x+1,y+size/3),GPoint(x+size-1,y+size/3));break;
    case DB_WORKOUT:
      graphics_fill_circle(ctx,GPoint(x+c,y+2),2);graphics_draw_line(ctx,GPoint(x+c,y+5),GPoint(x+c-3,y+c+2));graphics_draw_line(ctx,GPoint(x+c-3,y+c+2),GPoint(x+b,y+size-1));graphics_draw_line(ctx,GPoint(x+c-3,y+c+2),GPoint(x+a,y+size-1));graphics_draw_line(ctx,GPoint(x+a,y+c),GPoint(x+b,y+c));break;
    default:
      graphics_draw_circle(ctx,GPoint(x+c,y+c),size/3);graphics_fill_circle(ctx,GPoint(x+c,y+c),size/7);break;
  }
  graphics_context_set_stroke_width(ctx,1);
}
static void picture(GContext *ctx,const DbItem *item,int x,int y,int size,GColor fallback){
  if(!item->width||!item->height||!db_item_current(item,utc_now())){symbol(ctx,item->kind,x,y,size,fallback);return;}
  unsigned stride=(item->width+1)/2;
  for(int row=0;row<size;row++){
    unsigned source_y=(unsigned)row*item->height/size;int start=0;uint8_t previous=0;
    for(int col=0;col<=size;col++){
      uint8_t color=0;
      if(col<size){unsigned source_x=(unsigned)col*item->width/size;uint8_t value=item->pixels[source_y*stride+source_x/2];unsigned index=source_x&1?value&15:value>>4;color=item->palette[index];}
      if(col==size||color!=previous){if(previous&0xc0)fill(ctx,GRect(x+start,y+row,col-start,1),(GColor){.argb=previous},0);previous=color;start=col;}
    }
  }
}
static const char *status_text(void){
  if(!s_has_connection)return "Connect your phone";
  switch(s_state.snapshot.status){case DB_PERMISSION:return "Allow access on phone";case DB_ERROR:return "Data unavailable";case DB_OFFLINE:return "Connect your phone";case DB_LOADING:return "Loading sources…";default:return "Nothing here yet";}
}
static void header(GContext *ctx){
  const char *title=s_state.desired_mode==DB_ACTIVITIES?"Activities":s_state.desired_mode==DB_PINNED?"Pinned":s_state.desired_mode==DB_MEDIA?(db_selected(&s_state)&&db_selected(&s_state)->kind==DB_MUSIC?"Music":"Controls"):"Dashboard";
  text(ctx,title,16,8,16,128,foreground());
  char right[24];
  if(s_state.desired_mode==DB_ACTIVITIES||s_state.desired_mode==DB_PINNED)snprintf(right,sizeof(right),"%u/%u",s_state.snapshot.total?s_state.selected_index+1:0,s_state.loading?0:s_state.snapshot.total);
  else{time_t now=time(NULL);struct tm *local=localtime(&now);strftime(right,sizeof(right),clock_is_24h_style()?"%H:%M":"%I:%M",local);if(!clock_is_24h_style()&&right[0]=='0')memmove(right,right+1,strlen(right));}
  draw_text(ctx,right,2,139,16,53,muted(),GTextAlignmentRight);segment(ctx,6,20,194,20,stroke());
}
static bool control_available(const DbItem *item,unsigned index){const uint16_t bits[]={DB_MEDIA_PREVIOUS,DB_MEDIA_TOGGLE,DB_MEDIA_NEXT};return item&&index<3&&(item->flags&bits[index])&&db_item_actionable(item,utc_now());}
static void footer(GContext *ctx){
  const DbItem *item=db_selected(&s_state);char action[65]="Select: —",hold[65]="";
  bool current=s_has_connection&&db_item_capability_current(item,utc_now());
  if(current){
    if(s_state.snapshot.mode==DB_MEDIA){if(control_available(item,s_state.focus))snprintf(action,sizeof(action),"Select: %s",item->controls[s_state.focus][0]?item->controls[s_state.focus]:s_state.focus==0?"Previous":s_state.focus==2?"Next":item->flags&DB_PAUSED?"Play":"Pause");}
    else if(item->flags&DB_NOTIFICATION)snprintf(action,sizeof(action),"Select: Notifications");
    else if(item->role==DB_ROLE_ACTIVITY&&(item->flags&(DB_MEDIA_PREVIOUS|DB_MEDIA_TOGGLE|DB_MEDIA_NEXT))&&db_item_actionable(item,utc_now()))snprintf(action,sizeof(action),"Select: Controls");
    else if(item->flags&DB_ACTION)snprintf(action,sizeof(action),"Select: %s",item->action_label);
    if(item->flags&DB_APP)snprintf(hold,sizeof(hold),"Hold: %s",item->app_label);
  }
  if(s_command.active&&item&&s_command.token==item->token)snprintf(action,sizeof(action),"%s",s_command.result==DB_PENDING?"Working…":s_command.result==DB_DENIED?"Allow on phone":s_command.result==DB_STALE?"Item changed":s_command.result==DB_SUCCESS?"Done":s_command.result==DB_FAILED?s_command.text[0]?s_command.text:"Action failed":action);
  if(!s_has_connection)snprintf(action,sizeof(action),"Phone disconnected");
  segment(ctx,6,204,194,204,stroke());text(ctx,action,12,8,215,113,muted());draw_text(ctx,hold,1,117,215,75,muted(),GTextAlignmentRight);
  centered(ctx,s_state.desired_mode==DB_OVERVIEW?"Hold Up: Activities · Down: Pinned":s_state.desired_mode==DB_MEDIA?"Up / Down: choose control":"Hold Up / Down to scroll",11,227,muted());
}
static void item_value(const DbItem *item,char *value,size_t size){
  if(item->flags&DB_LOCAL_WATCH){BatteryChargeState battery=battery_state_service_peek();snprintf(value,size,"%u%%",battery.charge_percent);return;}
  db_item_value(item,utc_now(),value,size);
}
static void activity_row(GContext *ctx,const DbItem *item,int y){
  GColor ink=panel(ctx,item,GRect(4,y+2,192,32),false),secondary=item_selected(item)?(s_state.snapshot.dark?GColorDarkGray:GColorLightGray):muted();
  if(!db_item_current(item,utc_now())){text(ctx,"Activity unavailable",16,10,y+25,180,secondary);return;}
  if(item->flags&DB_IS_MEDIA){picture(ctx,item,9,y+6,24,item_selected(item)?ink:accent());text(ctx,item->title,16,40,y+17,148,ink);text(ctx,item->subtitle[0]?item->subtitle:item->name,14,40,y+32,148,secondary);}
  else{
    picture(ctx,item,9,y+8,20,item_selected(item)?ink:accent());char value[64];item_value(item,value,sizeof(value));
    int value_width=width_of(value,clock_chars(value)?8:5);if(value_width>152)value_width=152;
    int label_width=190-value_width-43;
    if(label_width>=35)text(ctx,item->title[0]?item->title:item->name,16,36,y+26,label_width,ink);
    value_text(ctx,value,36,y+27,154,item->clock_mode?26:24,ink,GTextAlignmentRight);
    if(!value[0])text(ctx,item->title[0]?item->title:item->name,16,36,y+26,153,ink);
  }
}
static void pin_tile(GContext *ctx,const DbItem *item,int x,int y,int h){
  GColor ink=panel(ctx,item,GRect(x,y,94,h),true),secondary=item_selected(item)?(s_state.snapshot.dark?GColorDarkGray:GColorLightGray):muted();
  char value[64];item_value(item,value,sizeof(value));
  if(value[0]){
    picture(ctx,item,x+7,y+3,12,item_selected(item)?ink:accent());text(ctx,item->title,11,x+25,y+13,64,secondary);
    value_text(ctx,value,x+8,y+h-2,78,20,ink,GTextAlignmentLeft);
  }else{
    picture(ctx,item,x+6,y+(h-15)/2,15,item_selected(item)?ink:accent());text(ctx,item->title,14,x+25,y+h/2+7,64,ink);
  }
}
static void notice(GContext *ctx,const DbItem *item){
  GColor ink=panel(ctx,item,GRect(4,92,192,38),true),secondary=item_selected(item)?(s_state.snapshot.dark?GColorDarkGray:GColorLightGray):muted();
  if(!db_item_current(item,utc_now())){text(ctx,"No recent notification",14,10,116,180,secondary);return;}
  picture(ctx,item,10,99,16,item_selected(item)?ink:accent());text(ctx,item->title,16,32,108,107,ink);draw_text(ctx,item->name,1,140,108,50,secondary,GTextAlignmentRight);text(ctx,item->subtitle[0]?item->subtitle:"New notification",16,10,127,178,ink);
}
static void empty_message(GContext *ctx,const char *title,const char *detail,int y){symbol(ctx,DB_TIMER,88,y,24,muted());centered(ctx,title,16,y+49,foreground());if(detail&&detail[0])centered(ctx,detail,12,y+70,muted());}
static void snapshot(GContext *ctx){
  unsigned activities=0,pins=0;const DbItem *notification=NULL;
  for(unsigned i=0;i<s_state.snapshot.count;i++){
    const DbItem *item=&s_state.snapshot.items[i];
    if(item->role==DB_ROLE_ACTIVITY&&activities<2)activity_row(ctx,item,20+36*(int)activities++);
    else if(item->role==DB_ROLE_NOTICE)notification=item;
  }
  bool compact=activities||notification;
  if(!activities){centered(ctx,"No live activities",16,63,muted());if(!notification)centered(ctx,"Your pinned items are ready",12,85,muted());}
  if(notification)notice(ctx,notification);
  else if(compact){edge(ctx,GRect(4,92,192,38),stroke(),4);symbol(ctx,DB_NOTICE,12,103,16,muted());text(ctx,"No recent notification",14,36,117,150,muted());}
  for(unsigned i=0;i<s_state.snapshot.count;i++)if(s_state.snapshot.items[i].role==DB_ROLE_PIN&&pins<4){pin_tile(ctx,&s_state.snapshot.items[i],4+(pins%2)*98,(compact?134:108)+(pins/2)*(compact?35:48),compact?32:44);pins++;}
  if(!pins)centered(ctx,"Choose pins in phone settings",12,174,muted());
}
static void list_row(GContext *ctx,const DbItem *item,int y){
  if(item->role==DB_ROLE_ACTIVITY){activity_row(ctx,item,y);return;}
  GColor ink=panel(ctx,item,GRect(4,y+2,188,32),false);char value[64];item_value(item,value,sizeof(value));picture(ctx,item,10,y+9,18,item_selected(item)?ink:accent());
  if(value[0]){int value_width=width_of(value,clock_chars(value)?7:5);if(value_width>75)value_width=75;int label_width=140-value_width;if(label_width<45)label_width=45;text(ctx,item->title,16,37,y+26,label_width,ink);value_text(ctx,value,117,y+28,68,24,ink,GTextAlignmentRight);}
  else text(ctx,item->title,20,37,y+27,146,ink);
}
static void list_view(GContext *ctx){
  if(!s_state.snapshot.count){empty_message(ctx,s_state.desired_mode==DB_ACTIVITIES?"No live activities":"No pinned items",s_state.desired_mode==DB_PINNED?"Choose items in phone settings":"",66);return;}
  for(unsigned i=0;i<s_state.snapshot.count;i++)list_row(ctx,&s_state.snapshot.items[i],23+(int)i*36);
  if(s_state.snapshot.total>5){int thumb=168*5/s_state.snapshot.total;if(thumb<8)thumb=8;int top=27;if(s_state.snapshot.total>5)top+=(168-thumb)*s_state.snapshot.offset/(s_state.snapshot.total-5);fill(ctx,GRect(197,27,2,168),stroke(),0);fill(ctx,GRect(197,top,2,thumb),foreground(),0);}
}
static void playback_icon(GContext *ctx,unsigned index,bool paused,int x,int y,GColor color){
  graphics_context_set_fill_color(ctx,color);graphics_context_set_stroke_color(ctx,color);
  if(index==1&&!paused){fill(ctx,GRect(x+2,y+2,4,16),color,0);fill(ctx,GRect(x+11,y+2,4,16),color,0);return;}
  GPoint points[3];
  if(index==0){points[0]=GPoint(x+16,y+2);points[1]=GPoint(x+3,y+10);points[2]=GPoint(x+16,y+18);fill(ctx,GRect(x,y+2,2,16),color,0);}
  else{points[0]=GPoint(x+2,y+2);points[1]=GPoint(x+16,y+10);points[2]=GPoint(x+2,y+18);if(index==2)fill(ctx,GRect(x+18,y+2,2,16),color,0);}
  GPathInfo info={3,points};GPath *path=gpath_create(&info);if(path){gpath_draw_filled(ctx,path);gpath_destroy(path);}
}
static void media_view(GContext *ctx){
  const DbItem *item=db_selected(&s_state);
  if(!item||!db_item_current(item,utc_now())){empty_message(ctx,"Activity unavailable","Back returns to your list",66);return;}
  if(item->flags&DB_IS_MEDIA){
    char title[193];clean_text(title,sizeof(title),item->title);
    unsigned split=0;char first[193]="",second[193]="";
    if(width_of(title,5)>182){for(unsigned i=0;title[i];i++)if(title[i]==' '){char saved=title[i];title[i]=0;if(width_of(title,5)<=182)split=i;title[i]=saved;}}
    if(split){memcpy(first,title,split);first[split]=0;snprintf(second,sizeof(second),"%s",title+split+1);text(ctx,first,24,9,67,182,foreground());text(ctx,second,24,9,93,182,foreground());}
    else text(ctx,title,24,9,93,182,foreground());
    picture(ctx,item,9,105,40,accent());text(ctx,item->subtitle,16,58,121,132,foreground());text(ctx,item->value[0]?item->value:item->flags&DB_PAUSED?"Paused":"",14,58,141,132,muted());
    for(unsigned i=0;i<3;i++){
      bool available=control_available(item,i),selected=s_state.focus==i;GColor ink=selected?background():available?foreground():muted();int x=5+i*65;
      if(selected)fill(ctx,GRect(x,163,60,37),foreground(),5);else edge(ctx,GRect(x,163,60,37),stroke(),5);
      playback_icon(ctx,i,(item->flags&DB_PAUSED)!=0,x+20,171,ink);
    }
  }else{
    text(ctx,item->title,20,9,49,182,foreground());char value[64];item_value(item,value,sizeof(value));text(ctx,value[0]?value:item->subtitle,16,9,73,182,muted());
    for(unsigned i=0;i<3;i++){
      bool available=control_available(item,i),selected=s_state.focus==i;int y=87+i*38;
      if(selected)fill(ctx,GRect(6,y,188,33),foreground(),4);else if(available)edge(ctx,GRect(6,y,188,33),stroke(),4);
      text(ctx,item->controls[i][0]?item->controls[i]:"Unavailable",16,14,y+25,172,selected?background():available?foreground():muted());
    }
  }
}
static void confirm_overlay(GContext *ctx){
  fill(ctx,GRect(8,58,184,128),background(),6);edge(ctx,GRect(8,58,184,128),foreground(),6);centered(ctx,"Confirm action?",20,88,foreground());
  text(ctx,s_command.text[0]?s_command.text:"Run this action",14,17,113,166,muted());centered(ctx,"Select: confirm",16,145,foreground());centered(ctx,"Back: cancel",14,170,muted());
}
static void update(Layer *layer,GContext *ctx){
  (void)layer;fill(ctx,GRect(0,0,SCREEN_W,SCREEN_H),background(),0);header(ctx);
  if(s_state.loading||!s_state.ready)empty_message(ctx,s_has_connection?"Loading…":"Phone disconnected",s_has_connection?"Waiting for plugin data":"Reconnect to load your items",66);
  else if(s_state.snapshot.status>=DB_OFFLINE&&!s_state.snapshot.count)empty_message(ctx,status_text(),s_state.snapshot.status==DB_PERMISSION?"Open Dashboard in the phone app":"Back is always available",66);
  else if(s_state.desired_mode==DB_OVERVIEW)snapshot(ctx);
  else if(s_state.desired_mode==DB_MEDIA)media_view(ctx);
  else list_view(ctx);
  footer(ctx);if(s_command.confirmation)confirm_overlay(ctx);
}
static bool read_uint(DictionaryIterator *dict,uint32_t key,uint32_t *value){
  Tuple *t=dict_find(dict,key);if(!t||(t->type!=TUPLE_UINT&&t->type!=TUPLE_INT))return false;
  if(t->length==1){if(t->type==TUPLE_INT&&t->value->int8<0)return false;*value=t->value->uint8;}
  else if(t->length==2){if(t->type==TUPLE_INT&&t->value->int16<0)return false;*value=t->value->uint16;}
  else if(t->length==4){if(t->type==TUPLE_INT&&t->value->int32<0)return false;*value=t->value->uint32;}
  else return false;
  return true;
}
static void view_failed(void *context){(void)context;s_view_timeout=NULL;if(!s_state.loading)return;stop_repeat();bool dark=s_state.snapshot.dark;s_state.loading=false;s_state.ready=true;memset(&s_state.snapshot,0,sizeof(s_state.snapshot));s_state.snapshot.dark=dark;s_state.snapshot.mode=s_state.desired_mode;s_state.snapshot.status=s_has_connection?DB_ERROR:DB_OFFLINE;s_state.selected_token=0;update_ticks();repaint();}
static void clear_feedback(void *context){(void)context;s_action_timeout=NULL;memset(&s_command,0,sizeof(s_command));repaint();}
static void finish_feedback(void){if(s_action_timeout)app_timer_cancel(s_action_timeout);s_action_timeout=app_timer_register(2000,clear_feedback,NULL);}
static void action_failed(void *context){(void)context;s_action_timeout=NULL;if(s_command.active){s_command.result=DB_FAILED;s_command.confirmation=false;s_command.ended=true;snprintf(s_command.text,sizeof(s_command.text),"No response");finish_feedback();repaint();}}
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
    stop_repeat();
    if(s_view_timeout){app_timer_cancel(s_view_timeout);s_view_timeout=NULL;}
    if(s_action_timeout){app_timer_cancel(s_action_timeout);s_action_timeout=NULL;}
    if(s_expiry_timer){app_timer_cancel(s_expiry_timer);s_expiry_timer=NULL;}
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
      bool was_loading=s_state.loading,redraw=s_state.loading||!s_state.ready||!visually_equal(&s_state.snapshot,incoming);uint32_t selected=s_state.selected_token;uint16_t selected_index=s_state.selected_index;
      if(db_state_apply(&s_state,incoming)){
        if(s_view_timeout){app_timer_cancel(s_view_timeout);s_view_timeout=NULL;}
        if(s_state.snapshot.mode==DB_MEDIA&&s_state.focus>2)s_state.focus=1;
        bool redacted=db_state_redact(&s_state,utc_now(),!s_has_connection);update_ticks();if(redraw||redacted||selected!=s_state.selected_token)repaint();
        if(was_loading||selected!=s_state.selected_token||selected_index!=s_state.selected_index)publish_focus();
      }
    }
    memset(incoming,0,sizeof(*incoming));free(incoming);
  }
  uint32_t result,request;
  if(read_uint(dict,DB_KEY_RESULT,&result)&&read_uint(dict,DB_KEY_SESSION,&session)&&session==s_state.session&&read_uint(dict,DB_KEY_REQUEST,&request)&&s_command.active&&!s_command.ended&&request==s_command.request&&result>=DB_PENDING&&result<=DB_CONFIRM){
    s_command.result=(uint8_t)result;s_command.confirmation=result==DB_CONFIRM;
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
  bool dirty=db_state_redact(&s_state,utc_now(),!s_has_connection);unsigned minute=(unsigned)now->tm_hour*60+(unsigned)now->tm_min;
  if(minute!=s_last_minute){s_last_minute=minute;dirty=true;}
  if((units&SECOND_UNIT)&&db_state_running_clock(&s_state,utc_now()))dirty=true;
  if(dirty)repaint();
  update_ticks();
}
static void expire_sources(void *context){
  (void)context;s_expiry_timer=NULL;
  if(db_state_redact(&s_state,utc_now(),!s_has_connection))repaint();
  update_ticks();
}
static void update_ticks(void){
  uint8_t seconds=s_focused&&db_state_running_clock(&s_state,utc_now())?1:0;
  if(s_tick_seconds!=seconds+1){s_tick_seconds=seconds+1;tick_timer_service_unsubscribe();tick_timer_service_subscribe(seconds?SECOND_UNIT:MINUTE_UNIT,tick);}
  if(s_expiry_timer){app_timer_cancel(s_expiry_timer);s_expiry_timer=NULL;}
  uint32_t now=utc_now(),next=0;
  for(unsigned i=0;i<s_state.snapshot.count;i++){
    const DbItem *item=&s_state.snapshot.items[i];
    if(!(item->flags&DB_UNAVAILABLE)&&item->valid_until>now&&(!next||item->valid_until<next))next=item->valid_until;
  }
  if(next){time_t seconds_now;uint16_t milliseconds;time_ms(&seconds_now,&milliseconds);int64_t delay=(int64_t)next*1000-(int64_t)seconds_now*1000-milliseconds;
    if(delay<1)delay=1;
    if(delay>UINT32_MAX)delay=UINT32_MAX;
    s_expiry_timer=app_timer_register((uint32_t)delay,expire_sources,NULL);
  }
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
static void direction_click(ClickRecognizerRef recognizer,void *context){(void)context;move_selection(click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP?-1:1);}
static void direction_hold(ClickRecognizerRef recognizer,void *context){
  (void)context;if(s_command.confirmation)return;int delta=click_recognizer_get_button_id(recognizer)==BUTTON_ID_UP?-1:1;
  if(s_state.desired_mode==DB_OVERVIEW){if(s_state.loading)return;db_state_remember(&s_state);request_view(delta<0?DB_ACTIVITIES:DB_PINNED,0,0,0,false);return;}
  stop_repeat();s_repeat_held=true;s_repeat_delta=delta;move_selection(delta);s_repeat=app_timer_register(140,repeated,NULL);
}
static void direction_release(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;stop_repeat();}
static void select_raw(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;const DbItem *item=db_selected(&s_state);s_press_token=item?item->token:0;s_press_version=item?item->version:0;s_press_mode=s_state.desired_mode;}
static const DbItem *pressed_item(void){const DbItem *item=db_selected(&s_state);return item&&item->token==s_press_token&&item->version==s_press_version&&s_state.desired_mode==s_press_mode?item:NULL;}
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
  (void)recognizer;(void)context;
  if(s_command.confirmation){const DbItem *item=db_selected(&s_state);if(item&&item->token==s_command.token&&item->version==s_command.version)run_command(item,DB_OP_ACTION,s_command.action,true);else{s_command.confirmation=false;s_command.result=DB_STALE;repaint();}return;}
  const DbItem *item=pressed_item();if(!s_has_connection||!db_item_capability_current(item,utc_now()))return;
  if(s_state.desired_mode==DB_MEDIA){if(control_available(item,s_state.focus))run_command(item,DB_OP_ACTION,s_state.focus,false);}
  else if(item->flags&DB_NOTIFICATION){if(item->flags&DB_APP)run_command(item,DB_OP_OPEN,0,false);}
  else if(item->role==DB_ROLE_ACTIVITY&&db_item_actionable(item,utc_now())&&(item->flags&(DB_MEDIA_PREVIOUS|DB_MEDIA_TOGGLE|DB_MEDIA_NEXT))){
    db_state_remember(&s_state);s_state.focus=(item->flags&DB_IS_MEDIA)&&control_available(item,1)?1:control_available(item,0)?0:control_available(item,1)?1:2;
    request_view(DB_MEDIA,0,0,item->token,false);
  }else if(item->role==DB_ROLE_PIN&&db_item_actionable(item,utc_now()))run_command(item,DB_OP_ACTION,0,false);
}
static void select_hold(ClickRecognizerRef recognizer,void *context){(void)recognizer;(void)context;if(s_command.confirmation)return;const DbItem *item=pressed_item();if(item&&(item->flags&DB_APP))run_command(item,DB_OP_OPEN,0,false);}
static void back_click(ClickRecognizerRef recognizer,void *context){
  (void)recognizer;(void)context;stop_repeat();
  if(s_command.confirmation){memset(&s_command,0,sizeof(s_command));repaint();return;}
  DbReturn previous;if(db_state_back(&s_state,&previous)){s_state.focus=previous.focus;request_view(previous.mode,previous.offset,previous.index,previous.token,false);}
  else{queue_message((Outbound){.op=DB_OP_CANCEL,.request=next_request()});window_stack_pop_all(false);}
}
static void configure_clicks(void *context){
  (void)context;
  window_single_click_subscribe(BUTTON_ID_UP,direction_click);window_long_click_subscribe(BUTTON_ID_UP,600,direction_hold,direction_release);
  window_single_click_subscribe(BUTTON_ID_DOWN,direction_click);window_long_click_subscribe(BUTTON_ID_DOWN,600,direction_hold,direction_release);
  window_single_click_subscribe(BUTTON_ID_SELECT,select_click);window_long_click_subscribe(BUTTON_ID_SELECT,600,select_hold,NULL);window_raw_click_subscribe(BUTTON_ID_SELECT,select_raw,NULL,NULL);
  window_single_click_subscribe(BUTTON_ID_BACK,back_click);
}
static void connection_changed(bool connected){
  s_has_connection=connected;s_state.connected=connected;stop_repeat();
  if(!connected){db_state_redact(&s_state,utc_now(),true);if(s_state.loading)view_failed(NULL);if(s_command.active&&s_command.result==DB_PENDING)action_failed(NULL);}
  else request_view(s_state.desired_mode,s_state.snapshot.offset,s_state.selected_index,s_state.selected_token,true);
  update_ticks();repaint();
}
static void focus_changed(bool focused){s_focused=focused;if(!focused){stop_repeat();s_press_token=0;}else{db_state_redact(&s_state,utc_now(),!s_has_connection);repaint();}update_ticks();}
static void battery_changed(BatteryChargeState value){(void)value;for(unsigned i=0;i<s_state.snapshot.count;i++)if(s_state.snapshot.items[i].flags&DB_LOCAL_WATCH){repaint();break;}}
static void init(void){
  time_t seconds;uint16_t milliseconds;time_ms(&seconds,&milliseconds);uint32_t session=((uint32_t)seconds^((uint32_t)milliseconds<<16)^0x44534831u)&INT32_MAX;if(!session)session=1;
  db_state_init(&s_state,session);s_has_connection=connection_service_peek_pebble_app_connection();s_state.connected=s_has_connection;
  s_window=window_create();if(!s_window)return;s_canvas=layer_create(GRect(0,0,SCREEN_W,SCREEN_H));if(!s_canvas)return;
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
    if(s_view_timeout){app_timer_cancel(s_view_timeout);s_view_timeout=NULL;}s_has_connection=true;update_ticks();repaint();
  }
  free(fixture);
#endif
}
static void deinit(void){
  stop_repeat();if(s_view_timeout)app_timer_cancel(s_view_timeout);if(s_action_timeout)app_timer_cancel(s_action_timeout);if(s_expiry_timer)app_timer_cancel(s_expiry_timer);tick_timer_service_unsubscribe();battery_state_service_unsubscribe();connection_service_unsubscribe();app_focus_service_unsubscribe();app_message_deregister_callbacks();
  if(s_canvas)layer_destroy(s_canvas);
  if(s_window)window_destroy(s_window);
  for(unsigned i=0;i<9;i++)if(s_fonts[i])fonts_unload_custom_font(s_fonts[i]);
  memset(&s_state,0,sizeof(s_state));memset(&s_command,0,sizeof(s_command));
}
int main(void){init();if(s_window&&s_canvas)app_event_loop();deinit();return 0;}
