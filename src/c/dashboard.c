#include "dashboard.h"
#include <limits.h>
#include <stdio.h>
#include <string.h>

static uint16_t read16(const uint8_t *p){return (uint16_t)p[0]|(uint16_t)p[1]<<8;}
static uint32_t read32(const uint8_t *p){return (uint32_t)p[0]|(uint32_t)p[1]<<8|(uint32_t)p[2]<<16|(uint32_t)p[3]<<24;}
static bool utf8(const uint8_t *p,size_t length){
  size_t i=0;
  while(i<length){
    uint32_t c=p[i++];unsigned follow=0;
    if(c<0x80){if(!c||(c<32&&c!='\n'&&c!='\r'&&c!='\t')||c==127)return false;continue;}
    if(c>=0xc2&&c<=0xdf){follow=1;c&=0x1f;}
    else if(c>=0xe0&&c<=0xef){follow=2;c&=0x0f;}
    else if(c>=0xf0&&c<=0xf4){follow=3;c&=7;}
    else return false;
    if(length-i<follow)return false;
    for(unsigned j=0;j<follow;j++){uint8_t v=p[i++];if((v&0xc0)!=0x80)return false;c=c<<6|(v&63);}
    if((follow==1&&c<0x80)||(follow==2&&c<0x800)||(follow==3&&c<0x10000)||c>0x10ffff||(c>=0xd800&&c<=0xdfff))return false;
  }
  return true;
}
static bool take_text(const uint8_t **p,size_t *remaining,uint16_t length,char *out,size_t size){
  if(length>=size||length>*remaining||!utf8(*p,length))return false;
  memcpy(out,*p,length);out[length]=0;*p+=length;*remaining-=length;return true;
}
static bool notification_launcher(const DbItem *item){
  return item->role==DB_ROLE_NOTICE&&item->kind==DB_NOTICE&&(item->flags&~(DB_IS_PENDING|DB_IS_FAILED))==(DB_NOTIFICATION|DB_APP)&&
    !item->valid_until&&!item->clock_mode&&!item->anchor&&!item->base_seconds&&
    !item->value[0]&&!item->action_label[0]&&!item->width&&!item->height&&!item->palette_length&&!item->pixel_length&&
    !item->controls[0][0]&&!item->controls[1][0]&&!item->controls[2][0]&&
    !strcmp(item->title,"Notifications")&&!strcmp(item->name,"Notifications")&&!strcmp(item->app_label,"Notifications")&&
    (!strcmp(item->subtitle,"No notifications")||!strcmp(item->subtitle,"Open notifications"));
}
bool db_decode(const uint8_t *bytes,size_t length,DbSnapshot *out){
  if(!bytes||!out||length<32||length>DB_FRAME_MAX||memcmp(bytes,"DSH1",4))return false;
  memset(out,0,sizeof(*out));
  out->session=read32(bytes+4);out->request=read32(bytes+8);out->sequence=read32(bytes+12);out->now=read32(bytes+16);
  out->mode=bytes[20];out->status=bytes[21];out->count=bytes[22];out->dark=(bytes[23]&1)!=0;
  out->total=read16(bytes+24);out->offset=read16(bytes+26);out->activities_total=read16(bytes+28);out->pins_total=read16(bytes+30);
  if(!out->session||out->session>INT32_MAX||!out->request||out->request>INT32_MAX||!out->sequence||out->mode>DB_MEDIA||out->status>DB_ERROR||(bytes[23]&~1))return false;
  uint8_t maximum=out->mode==DB_OVERVIEW?DB_MAX_ITEMS:out->mode==DB_MEDIA?1:DB_PAGE_ITEMS;
  if(out->count>maximum||out->offset>out->total||(uint32_t)out->offset+out->count>out->total)return false;
  if((out->mode==DB_OVERVIEW||out->mode==DB_MEDIA)&&out->offset)return false;
  const uint8_t *p=bytes+32;size_t remaining=length-32,image_bytes=0;unsigned roles[3]={0,0,0};
  for(uint8_t n=0;n<out->count;n++){
    if(remaining<44)return false;
    DbItem *item=&out->items[n];
    item->token=read32(p);item->version=read32(p+4);item->valid_until=read32(p+8);item->flags=read16(p+12);
    item->kind=p[14];item->clock_mode=p[15];item->anchor=read32(p+16);item->base_seconds=read32(p+20);
    uint16_t lengths[6];for(unsigned i=0;i<6;i++)lengths[i]=read16(p+24+i*2);
    item->width=p[36];item->height=p[37];item->palette_length=p[38];item->role=p[39];item->pixel_length=read16(p+40);
    uint16_t controls_length=read16(p+42);
    if(controls_length>99||!item->token||!item->version||item->kind>DB_SCENE||item->clock_mode>2||item->role>DB_ROLE_PIN)return false;
    for(uint8_t j=0;j<n;j++)if(out->items[j].token==item->token)return false;
    if((item->clock_mode==1&&!(item->flags&DB_COUNTDOWN))||(item->clock_mode==2&&!(item->flags&DB_ELAPSED)))return false;
    if(!item->clock_mode&&(item->anchor||item->base_seconds))return false;
    if(item->clock_mode==2&&item->anchor>out->now)return false;
    if(item->role==DB_ROLE_NOTICE&&!(item->flags&DB_NOTIFICATION))return false;
    if((out->mode==DB_ACTIVITIES||out->mode==DB_MEDIA)&&item->role!=DB_ROLE_ACTIVITY)return false;
    if(out->mode==DB_PINNED&&item->role!=DB_ROLE_PIN)return false;
    if(out->mode==DB_MEDIA&&!(item->flags&DB_ACTION))return false;
    roles[item->role]++;
    p+=44;remaining-=44;
    char *strings[]={item->title,item->subtitle,item->value,item->app_label,item->action_label,item->name};
    const size_t sizes[]={sizeof(item->title),sizeof(item->subtitle),sizeof(item->value),sizeof(item->app_label),sizeof(item->action_label),sizeof(item->name)};
    for(unsigned i=0;i<6;i++)if(!take_text(&p,&remaining,lengths[i],strings[i],sizes[i]))return false;
    if(controls_length){
      if(controls_length>remaining)return false;
      const uint8_t *end=p+controls_length;
      for(unsigned i=0;i<3;i++){
        if(p>=end)return false;
        uint8_t control_length=*p++;remaining--;
        if(control_length>(size_t)(end-p)||!take_text(&p,&remaining,control_length,item->controls[i],sizeof(item->controls[i])))return false;
      }
      if(p!=end)return false;
    }
    bool static_pin=item->role==DB_ROLE_PIN&&!(item->flags&DB_PRIVATE)&&!item->value[0]&&!item->clock_mode;
    if(!item->valid_until&&!static_pin&&!notification_launcher(item)&&!(item->role==DB_ROLE_PIN&&(item->flags&(DB_ACTION|DB_APP|DB_LOCAL_WATCH))))return false;
    if(item->flags&DB_UNAVAILABLE){/* An unavailable row can retain its static label, never execute. */}
    else if(!(item->flags&DB_LOCAL_WATCH)&&item->value[0]&&!item->valid_until)return false;
    if((item->flags&DB_APP)&&!item->app_label[0])return false;
    if((item->flags&DB_ACTION)&&!item->action_label[0]&&!(item->flags&DB_IS_MEDIA))return false;
    if(item->width||item->height||item->palette_length||item->pixel_length){
      if(!item->width||!item->height||item->width>40||item->height>40||!item->palette_length||item->palette_length>16||
        item->pixel_length!=(uint16_t)(((item->width+1)/2)*item->height)||item->pixel_length>DB_IMAGE_BYTES)return false;
      size_t amount=item->palette_length+item->pixel_length;
      if(amount>remaining||image_bytes+amount>DB_IMAGE_BUDGET)return false;
      memcpy(item->palette,p,item->palette_length);p+=item->palette_length;
      memcpy(item->pixels,p,item->pixel_length);p+=item->pixel_length;remaining-=amount;image_bytes+=amount;
      const unsigned stride=(item->width+1)/2;
      for(unsigned y=0;y<item->height;y++)for(unsigned x=0;x<item->width;x++){
        uint8_t v=item->pixels[y*stride+x/2];v=x&1?v&15:v>>4;if(v>=item->palette_length)return false;
      }
    }
  }
  if(out->mode==DB_OVERVIEW&&(roles[0]>2||roles[1]>1||roles[2]>4))return false;
  return !remaining;
}
void db_state_init(DbState *state,uint32_t session){memset(state,0,sizeof(*state));state->session=session;state->connected=true;}
void db_state_expect(DbState *state,uint32_t request,uint8_t mode,uint16_t index,uint32_t token){
  state->view_request=request;state->desired_mode=mode;state->desired_index=index;state->selected_token=token;state->loading=true;
}
void db_state_fail_view(DbState *state,uint8_t status){
  bool dark=state->snapshot.dark;state->loading=false;state->ready=true;
  memset(&state->snapshot,0,sizeof(state->snapshot));state->snapshot.dark=dark;
  state->snapshot.mode=state->desired_mode;state->snapshot.status=status;
  // Retain only the opaque requested token, never old private content. A late
  // matching reply can restore that identity, not a different actionable row.
  state->selection_lost=state->selected_token!=0||state->selection_lost;
}
bool db_control_present(const DbItem *item,unsigned index){
  static const uint16_t bits[]={DB_MEDIA_PREVIOUS,DB_MEDIA_TOGGLE,DB_MEDIA_NEXT};
  return item&&index<3&&(item->controls[index][0]||(item->flags&bits[index]));
}
static void normalize_control_focus(DbState *state){
  if(state->snapshot.mode!=DB_MEDIA)return;
  const DbItem *item=db_selected(state);
  if(db_control_present(item,state->focus))return;
  for(unsigned i=state->focus;i<3;i++)if(db_control_present(item,i)){state->focus=(uint8_t)i;return;}
  for(int i=state->focus>2?2:(int)state->focus-1;i>=0;i--)if(db_control_present(item,(unsigned)i)){state->focus=(uint8_t)i;return;}
  state->focus=0;
}
bool db_state_apply(DbState *state,const DbSnapshot *snapshot){
  if(snapshot->session!=state->session||snapshot->request!=state->view_request||snapshot->mode!=state->desired_mode||
    (state->last_sequence&&(int32_t)(snapshot->sequence-state->last_sequence)<=0))return false;
  uint32_t token=state->selected_token;bool loading=state->loading,lost=state->selection_lost;
  state->snapshot=*snapshot;state->last_sequence=snapshot->sequence;state->loading=false;state->ready=true;
  int selected=-1;for(unsigned i=0;i<snapshot->count;i++)if(snapshot->items[i].token==token){selected=(int)i;break;}
  if(selected<0&&token&&snapshot->status==DB_LOADING&&(loading||state->selection_lost)){
    // Reconnect discovery can briefly omit the requested item. Keep that exact
    // focus inert through bootstrap instead of selecting an unrelated action.
    state->selection_lost=true;return true;
  }
  if(selected<0&&(token||(lost&&!loading))){
    // A missing selected/requested identity is not a request to select the
    // next row. Repeated updates keep it inert until deliberate navigation.
    state->selected_token=0;state->selection_lost=true;normalize_control_focus(state);return true;
  }
  if(selected<0&&snapshot->count){
    uint16_t desired=loading?state->desired_index:state->selected_index;
    if(desired<snapshot->offset)desired=snapshot->offset;
    if(desired>=snapshot->offset+snapshot->count)desired=snapshot->offset+snapshot->count-1;
    selected=(int)(desired-snapshot->offset);
  }
  state->selection_lost=false;
  if(selected>=0){state->selected_token=snapshot->items[selected].token;state->selected_index=snapshot->offset+(uint16_t)selected;}
  else{state->selected_token=0;state->selected_index=0;}
  normalize_control_focus(state);
  return true;
}
const DbItem *db_selected(const DbState *state){
  if(!state->ready||state->loading||state->selection_lost)return NULL;
  for(unsigned i=0;i<state->snapshot.count;i++)if(state->snapshot.items[i].token==state->selected_token)return &state->snapshot.items[i];
  return NULL;
}
bool db_item_current(const DbItem *item,uint32_t now){return item&&!(item->flags&DB_UNAVAILABLE)&&(!item->valid_until||now<item->valid_until);}
bool db_item_capability_current(const DbItem *item,uint32_t now){
  if(!item||(item->valid_until&&now>=item->valid_until))return false;
  return item->role==DB_ROLE_PIN||!(item->flags&DB_UNAVAILABLE);
}
bool db_item_actionable(const DbItem *item,uint32_t now){return db_item_capability_current(item,now)&&(item->flags&DB_ACTION)!=0;}
int db_item_direct_action(const DbItem *item,uint32_t now){
  if(!db_item_actionable(item,now))return -1;
  if(item->role==DB_ROLE_ACTIVITY&&(item->flags&DB_IS_MEDIA))return item->flags&DB_MEDIA_TOGGLE?1:-1;
  return item->role==DB_ROLE_PIN?0:-1;
}
void db_item_value(const DbItem *item,uint32_t now,char *buffer,size_t size){
  if(!buffer||!size)return;
  if(!db_item_current(item,now)){snprintf(buffer,size,"--");return;}
  if(!item->clock_mode){snprintf(buffer,size,"%s",item->value);return;}
  uint64_t seconds=item->base_seconds;
  if(item->clock_mode==1&&item->anchor)seconds=item->anchor>now?item->anchor-now:0;
  else if(item->clock_mode==2&&item->anchor&&now>item->anchor)seconds+=(uint64_t)(now-item->anchor);
  if(seconds>UINT32_MAX)seconds=UINT32_MAX;
  uint32_t h=(uint32_t)(seconds/3600),m=(uint32_t)(seconds/60%60),s=(uint32_t)(seconds%60);
  if(h)snprintf(buffer,size,"%lu:%02lu:%02lu",(unsigned long)h,(unsigned long)m,(unsigned long)s);
  else snprintf(buffer,size,"%02lu:%02lu",(unsigned long)m,(unsigned long)s);
}
bool db_state_move(DbState *state,int delta,uint16_t *index){
  if(state->loading||!state->ready)return false;
  if(state->snapshot.mode==DB_MEDIA){
    const DbItem *item=db_selected(state);if(!delta||!item)return false;
    int direction=delta<0?-1:1,next=state->focus;unsigned moves=delta<0?(unsigned)(-(int64_t)delta):(unsigned)delta;
    if(moves>3)moves=3;
    while(moves--){
      int candidate=next+direction;
      while(candidate>=0&&candidate<3&&!db_control_present(item,(unsigned)candidate))candidate+=direction;
      if(candidate<0||candidate>=3)break;
      next=candidate;
    }
    bool changed=next!=state->focus;state->focus=(uint8_t)next;return changed;
  }
  if(!state->snapshot.total)return false;
  int next=state->selection_lost?(delta<0?(int)state->snapshot.offset+(int)state->snapshot.count-1:(int)state->snapshot.offset):(int)state->selected_index+delta;
  if(next<0)next=0;
  if(next>=state->snapshot.total)next=state->snapshot.total-1;
  if(!state->selection_lost&&next==state->selected_index)return false;
  if(index)*index=(uint16_t)next;
  if(next<state->snapshot.offset||next>=state->snapshot.offset+state->snapshot.count)return true;
  state->selected_index=(uint16_t)next;state->selected_token=state->snapshot.items[next-state->snapshot.offset].token;state->selection_lost=false;return true;
}
void db_state_remember(DbState *state){
  if(state->depth>=DB_MAX_DEPTH)return;
  state->back[state->depth++]=(DbReturn){state->snapshot.mode,state->focus,state->selected_index,state->snapshot.offset,state->selected_token};
}
bool db_state_back(DbState *state,DbReturn *value){if(!state->depth)return false;*value=state->back[--state->depth];return true;}
bool db_state_redact(DbState *state,uint32_t now,bool disconnected){
  bool changed=false;
  for(unsigned i=0;i<state->snapshot.count;i++){
    DbItem *item=&state->snapshot.items[i];
    if((disconnected&&(item->flags&DB_PRIVATE))||(item->valid_until&&now>=item->valid_until)){
      bool dirty=!(item->flags&DB_UNAVAILABLE)||(item->flags&(DB_ACTION|DB_APP))||item->clock_mode||item->anchor||item->base_seconds||item->subtitle[0]||item->value[0]||item->width||item->height||item->palette_length||item->pixel_length;
      if(item->flags&DB_PRIVATE)dirty=dirty||item->title[0]||item->name[0]||item->app_label[0]||item->action_label[0]||item->controls[0][0]||item->controls[1][0]||item->controls[2][0];
      if(!dirty)continue;
      item->flags|=DB_UNAVAILABLE;item->flags&=~(DB_ACTION|DB_APP|DB_MEDIA_PREVIOUS|DB_MEDIA_TOGGLE|DB_MEDIA_NEXT);item->clock_mode=0;item->anchor=item->base_seconds=0;
      memset(item->subtitle,0,sizeof(item->subtitle));memset(item->value,0,sizeof(item->value));
      memset(item->pixels,0,sizeof(item->pixels));memset(item->palette,0,sizeof(item->palette));item->width=item->height=item->palette_length=0;item->pixel_length=0;
      if(item->flags&DB_PRIVATE){
        memset(item->title,0,sizeof(item->title));memset(item->name,0,sizeof(item->name));
        memset(item->controls,0,sizeof(item->controls));memset(item->action_label,0,sizeof(item->action_label));memset(item->app_label,0,sizeof(item->app_label));
      }
      changed=true;
    }
  }
  if(changed)normalize_control_focus(state);
  return changed;
}
void db_item_media_identity(const DbItem *item,char *buffer,size_t size){
  const char *identity=item->subtitle[0]?item->subtitle:item->name;
  if(item->flags&DB_PAUSED)snprintf(buffer,size,"Paused · %s",identity[0]?identity:"Music");
  else snprintf(buffer,size,"%s",identity);
}
bool db_state_running_clock(const DbState *state,uint32_t now){
  if(state->loading||!state->ready)return false;
  for(unsigned i=0;i<state->snapshot.count;i++){
    const DbItem *item=&state->snapshot.items[i];
    if(db_item_current(item,now)&&item->anchor&&
       (item->clock_mode==2||(item->clock_mode==1&&item->anchor>now)))return true;
  }
  return false;
}
uint32_t db_state_next_expiry(const DbState *state,uint32_t now){
  uint32_t next=0;
  for(unsigned i=0;i<state->snapshot.count;i++){
    const uint32_t at=state->snapshot.items[i].valid_until;
    // An unavailable reading can still have an independent action or app.
    // Its binding must expire at the same exact deadline as a visible value.
    if(at>now&&(!next||at<next))next=at;
  }
  return next;
}
