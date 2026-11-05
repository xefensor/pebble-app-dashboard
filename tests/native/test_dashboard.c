#include "dashboard.h"
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static unsigned checked;
static void put16(uint8_t *p,uint16_t value){p[0]=(uint8_t)value;p[1]=(uint8_t)(value>>8);}
static void put32(uint8_t *p,uint32_t value){for(unsigned i=0;i<4;i++)p[i]=(uint8_t)(value>>(i*8));}
static uint8_t *load(const char *path,size_t *length){
  FILE *file=fopen(path,"rb");assert(file);assert(!fseek(file,0,SEEK_END));long size=ftell(file);assert(size>=32&&size<=DB_FRAME_MAX);rewind(file);
  uint8_t *bytes=malloc((size_t)size+1);assert(bytes);assert(fread(bytes,1,(size_t)size,file)==(size_t)size);fclose(file);*length=(size_t)size;return bytes;
}
static void fixture(const char *path){
  size_t length;uint8_t *bytes=load(path,&length);DbSnapshot *snapshot=malloc(sizeof(*snapshot));assert(snapshot);assert(db_decode(bytes,length,snapshot));checked++;
  assert(!db_decode(NULL,length,snapshot));assert(!db_decode(bytes,length,NULL));
  for(size_t cut=0;cut<length;cut++)assert(!db_decode(bytes,cut,snapshot));
  assert(db_decode(bytes,length,snapshot));DbSnapshot valid=*snapshot;DbState state;db_state_init(&state,valid.session);db_state_expect(&state,valid.request,valid.mode,valid.offset,valid.count?valid.items[0].token:0);
  assert(db_state_apply(&state,&valid));assert(!db_state_apply(&state,&valid));
  DbSnapshot update=valid;update.sequence++;update.session++;assert(!db_state_apply(&state,&update));update.session=valid.session;update.request++;assert(!db_state_apply(&state,&update));
  update.request=valid.request;update.mode=(valid.mode+1)%4;assert(!db_state_apply(&state,&update));
  update=valid;update.sequence++;
  if(valid.count){
    assert(db_selected(&state));assert(db_selected(&state)->token==valid.items[0].token);
    if(valid.count>1){DbItem first=update.items[0];update.items[0]=update.items[1];update.items[1]=first;assert(db_state_apply(&state,&update));assert(db_selected(&state)->token==first.token);assert(state.selected_index==valid.offset+1);}
    else assert(db_state_apply(&state,&update));
    db_state_remember(&state);uint32_t token=state.selected_token;uint8_t focus=state.focus;DbReturn previous;assert(db_state_back(&state,&previous));assert(previous.token==token&&previous.focus==focus);assert(!db_state_back(&state,&previous));
    update.sequence++;update.count=0;update.total=0;update.offset=0;assert(db_state_apply(&state,&update));assert(!db_selected(&state));assert(!state.selected_token);
  }else{assert(!db_selected(&state));uint16_t index=0;assert(!db_state_move(&state,1,&index));}
  uint8_t old=bytes[0];bytes[0]='X';assert(!db_decode(bytes,length,snapshot));bytes[0]=old;
  old=bytes[20];bytes[20]=9;assert(!db_decode(bytes,length,snapshot));bytes[20]=old;
  old=bytes[21];bytes[21]=9;assert(!db_decode(bytes,length,snapshot));bytes[21]=old;
  old=bytes[22];bytes[22]=8;assert(!db_decode(bytes,length,snapshot));bytes[22]=old;
  bytes[length]=0;assert(!db_decode(bytes,length+1,snapshot));
  if(valid.count){
    old=bytes[32+24];bytes[32+24]=255;assert(!db_decode(bytes,length,snapshot));bytes[32+24]=old;
    old=bytes[32+39];bytes[32+39]=8;assert(!db_decode(bytes,length,snapshot));bytes[32+39]=old;
    // Zero tokens and invalid clock modes are rejected before copying payloads.
    uint8_t token[4];memcpy(token,bytes+32,4);memset(bytes+32,0,4);assert(!db_decode(bytes,length,snapshot));memcpy(bytes+32,token,4);
    old=bytes[47];bytes[47]=255;assert(!db_decode(bytes,length,snapshot));bytes[47]=old;
  }
  // Mutation smoke under ASan/UBSan: arbitrary byte changes may be valid,
  // but must never read or write beyond the explicitly bounded input/output.
  for(size_t i=0;i<length;i+=length/101+1){old=bytes[i];bytes[i]^=0xff;(void)db_decode(bytes,length,snapshot);bytes[i]=old;}
  assert(db_decode(bytes,length,snapshot));free(snapshot);free(bytes);
}
static void clocks(void){
  DbItem item={.token=1,.version=1,.valid_until=2000,.clock_mode=1,.anchor=1075,.flags=DB_COUNTDOWN};char text[64];
  db_item_value(&item,1000,text,sizeof(text));assert(!strcmp(text,"01:15"));db_item_value(&item,1100,text,sizeof(text));assert(!strcmp(text,"00:00"));
  item.anchor=0;item.base_seconds=45296;db_item_value(&item,1000,text,sizeof(text));assert(!strcmp(text,"12:34:56"));
  item.clock_mode=2;item.flags=DB_ELAPSED;item.anchor=970;item.base_seconds=90;db_item_value(&item,1000,text,sizeof(text));assert(!strcmp(text,"02:00"));
  item.valid_until=1000;db_item_value(&item,1000,text,sizeof(text));assert(!strcmp(text,"--"));assert(!db_item_current(&item,1000));
  item.valid_until=2000;item.flags=DB_ACTION;assert(db_item_actionable(&item,1000));item.flags|=DB_UNAVAILABLE;assert(!db_item_actionable(&item,1000));
  item.role=DB_ROLE_PIN;item.flags=DB_ACTION|DB_APP|DB_UNAVAILABLE;
  assert(!db_item_current(&item,1000)&&db_item_actionable(&item,1000)&&db_item_capability_current(&item,1000));
  db_item_value(&item,1000,text,sizeof(text));assert(!strcmp(text,"--"));
  item.valid_until=1000;assert(!db_item_actionable(&item,1000)&&!db_item_capability_current(&item,1000));
  DbState state={0};state.ready=true;state.snapshot.count=1;
  state.snapshot.items[0]=(DbItem){.token=1,.version=1,.valid_until=1200,.clock_mode=1,.anchor=1075,.flags=DB_COUNTDOWN};
  assert(db_state_running_clock(&state,1000));assert(db_state_next_expiry(&state,1000)==1200);
  assert(!db_state_running_clock(&state,1075));
  assert(state.snapshot.items[0].clock_mode==1&&state.snapshot.items[0].anchor==1075);
  state.snapshot.items[0].clock_mode=2;state.snapshot.items[0].anchor=1000;state.snapshot.items[0].flags=DB_ELAPSED;
  assert(db_state_running_clock(&state,1075));
  state.snapshot.count=2;state.snapshot.items[1]=(DbItem){.token=2,.version=1,.valid_until=1100,.role=DB_ROLE_PIN,.flags=DB_UNAVAILABLE|DB_ACTION|DB_APP};
  assert(db_state_next_expiry(&state,1075)==1100);
  assert(db_state_redact(&state,1100,false));
  assert(!(state.snapshot.items[1].flags&(DB_ACTION|DB_APP)));
  assert(db_state_next_expiry(&state,1100)==1200);
  assert(db_state_next_expiry(&state,1200)==0);
}
static void reconnect_focus(void){
  DbState state;db_state_init(&state,3);db_state_expect(&state,1,DB_OVERVIEW,0,7);
  DbSnapshot snapshot={.session=3,.request=1,.sequence=1,.mode=DB_OVERVIEW,.status=DB_READY,.count=2,.total=2};
  snapshot.items[0]=(DbItem){.token=7,.version=1,.role=DB_ROLE_ACTIVITY};
  snapshot.items[1]=(DbItem){.token=8,.version=1,.role=DB_ROLE_PIN,.flags=DB_ACTION};
  assert(db_state_apply(&state,&snapshot)&&db_selected(&state)->token==7);
  DbSnapshot pending=snapshot;pending.request=2;pending.sequence=2;pending.status=DB_LOADING;pending.count=pending.total=1;pending.items[0]=snapshot.items[1];
  db_state_expect(&state,2,DB_OVERVIEW,0,7);
  assert(db_state_apply(&state,&pending)&&state.selected_token==7&&state.selection_lost&&!db_selected(&state));
  pending.sequence++;assert(db_state_apply(&state,&pending)&&state.selected_token==7&&!db_selected(&state));
  snapshot.request=2;snapshot.sequence=4;
  assert(db_state_apply(&state,&snapshot)&&db_selected(&state)->token==7&&!state.selection_lost);
  db_state_expect(&state,3,DB_OVERVIEW,0,7);pending.request=3;pending.sequence=5;
  assert(db_state_apply(&state,&pending)&&!db_selected(&state));
  pending.sequence=6;pending.status=DB_READY;
  assert(db_state_apply(&state,&pending)&&!state.selected_token&&state.selection_lost&&!db_selected(&state));
  uint16_t index=0;assert(db_state_move(&state,1,&index)&&db_selected(&state)->token==8);
}
static void withdrawn_focus_stays_inert(void){
  DbState state;db_state_init(&state,4);db_state_expect(&state,1,DB_OVERVIEW,0,7);
  DbSnapshot frame={.session=4,.request=1,.sequence=1,.mode=DB_OVERVIEW,.status=DB_READY,.count=2,.total=2};
  frame.items[0]=(DbItem){.token=7,.version=1,.role=DB_ROLE_ACTIVITY,.flags=DB_APP};
  frame.items[1]=(DbItem){.token=8,.version=1,.role=DB_ROLE_PIN,.flags=DB_ACTION};
  assert(db_state_apply(&state,&frame)&&db_selected(&state)->token==7);
  frame.sequence++;frame.count=frame.total=1;frame.items[0]=frame.items[1];
  assert(db_state_apply(&state,&frame)&&state.selection_lost&&!db_selected(&state));
  frame.sequence++;
  assert(db_state_apply(&state,&frame)&&state.selection_lost&&!db_selected(&state));
  frame.sequence++;frame.items[0].token=9;
  assert(db_state_apply(&state,&frame)&&state.selection_lost&&!db_selected(&state));
  uint16_t index=0;assert(db_state_move(&state,1,&index)&&db_selected(&state)->token==9);
  // A ready reconnect/Back reply can omit the requested target without an
  // intermediate LOADING frame. It must not choose a different app/action.
  db_state_expect(&state,2,DB_OVERVIEW,0,7);frame.request=2;frame.sequence++;
  assert(db_state_apply(&state,&frame)&&state.selection_lost&&!db_selected(&state));
  db_state_expect(&state,3,DB_OVERVIEW,0,7);db_state_fail_view(&state,DB_ERROR);
  assert(state.selected_token==7&&state.selection_lost&&!db_selected(&state)&&!state.snapshot.count);
  frame.request=3;frame.sequence++;frame.items[0].token=7;
  assert(db_state_apply(&state,&frame)&&db_selected(&state)->token==7);
  db_state_expect(&state,4,DB_OVERVIEW,0,7);db_state_fail_view(&state,DB_ERROR);
  frame.request=4;frame.sequence++;frame.items[0].token=8;
  assert(db_state_apply(&state,&frame)&&state.selection_lost&&!db_selected(&state));
}
static void direct_media_action(void){
  DbItem media={.flags=DB_IS_MEDIA};char identity[144];
  snprintf(media.name,sizeof(media.name),"Music");snprintf(media.subtitle,sizeof(media.subtitle),"Samurai");
  db_item_media_identity(&media,identity,sizeof(identity));assert(!strcmp(identity,"Samurai"));
  media.flags|=DB_PAUSED;db_item_media_identity(&media,identity,sizeof(identity));assert(!strcmp(identity,"Paused · Samurai"));
  media.subtitle[0]=0;db_item_media_identity(&media,identity,sizeof(identity));assert(!strcmp(identity,"Paused · Music"));
  media.name[0]=0;db_item_media_identity(&media,identity,sizeof(identity));assert(!strcmp(identity,"Paused · Music"));
  DbItem item={.token=2,.version=1,.valid_until=2000,.role=DB_ROLE_ACTIVITY,.kind=DB_MUSIC,.flags=DB_ACTION|DB_IS_MEDIA|DB_MEDIA_PREVIOUS|DB_MEDIA_TOGGLE|DB_MEDIA_NEXT};
  assert(db_item_direct_action(&item,1000)==1);
  item.flags|=DB_PAUSED;assert(db_item_direct_action(&item,1000)==1);
  item.flags&=~DB_MEDIA_TOGGLE;assert(db_item_direct_action(&item,1000)==-1);
  item.flags|=DB_MEDIA_TOGGLE|DB_UNAVAILABLE;assert(db_item_direct_action(&item,1000)==-1);
  item.flags&=~DB_UNAVAILABLE;assert(db_item_direct_action(&item,2000)==-1);
  item.flags=DB_ACTION;item.kind=DB_LIGHT;item.role=DB_ROLE_PIN;assert(db_item_direct_action(&item,1000)==0);
  item.flags=DB_APP;assert(db_item_direct_action(&item,1000)==-1);
}
static void control_slots(void){
  DbState state;db_state_init(&state,5);db_state_expect(&state,7,DB_MEDIA,0,12);
  DbSnapshot frame={.session=5,.request=7,.sequence=1,.now=1000,.mode=DB_MEDIA,.status=DB_READY,.total=1,.count=1};
  frame.items[0]=(DbItem){.token=12,.version=1,.valid_until=2000,.role=DB_ROLE_ACTIVITY,.flags=DB_ACTION|DB_MEDIA_PREVIOUS|DB_MEDIA_NEXT};
  snprintf(frame.items[0].controls[0],33,"Track parcel");snprintf(frame.items[0].controls[2],33,"Contact");
  assert(!db_control_present(NULL,0)&&!db_control_present(&frame.items[0],3));
  assert(db_control_present(&frame.items[0],0)&&!db_control_present(&frame.items[0],1)&&db_control_present(&frame.items[0],2));
  assert(db_state_apply(&state,&frame)&&state.focus==0);
  uint16_t index=77;
  assert(db_state_move(&state,1,&index)&&state.focus==2&&index==77); // Original dispatch slot2, not compact row1.
  assert(!db_state_move(&state,1,NULL)&&state.focus==2);
  assert(db_state_move(&state,-1,NULL)&&state.focus==0&&!db_state_move(&state,-1,NULL));
  assert(!db_state_move(&state,0,NULL));
  // A named but disabled slot still exposes its reason; an absent slot does not.
  frame.sequence++;snprintf(frame.items[0].controls[1],33,"Contact unavailable");assert(db_state_apply(&state,&frame));
  assert(db_state_move(&state,1,NULL)&&state.focus==1);
  assert(!(db_selected(&state)->flags&DB_MEDIA_TOGGLE)&&db_control_present(db_selected(&state),1));
  // Live removal keeps the same item and selects a surviving original slot.
  frame.sequence++;frame.items[0].controls[1][0]=0;assert(db_state_apply(&state,&frame)&&state.focus==2&&state.selected_token==12);
  frame.sequence++;frame.items[0].controls[2][0]=0;frame.items[0].flags&=~DB_MEDIA_NEXT;
  assert(db_state_apply(&state,&frame)&&state.focus==0);
  // A provider with only middle slot1 never starts on an invented slot0.
  frame.sequence++;frame.items[0].controls[0][0]=0;frame.items[0].flags=DB_ACTION|DB_MEDIA_TOGGLE;
  snprintf(frame.items[0].controls[1],33,"Acknowledge");assert(db_state_apply(&state,&frame)&&state.focus==1);
  assert(!db_state_move(&state,1,NULL)&&!db_state_move(&state,-1,NULL));
  // Ordinary Music keeps all three physical slots and bounded navigation.
  frame.sequence++;frame.items[0].flags=DB_ACTION|DB_IS_MEDIA|DB_MEDIA_PREVIOUS|DB_MEDIA_TOGGLE|DB_MEDIA_NEXT;
  assert(db_state_apply(&state,&frame)&&state.focus==1);
  assert(db_state_move(&state,1,NULL)&&state.focus==2&&!db_state_move(&state,1,NULL));
  assert(db_state_move(&state,-1,NULL)&&state.focus==1&&db_state_move(&state,-1,NULL)&&state.focus==0);
  assert(db_state_move(&state,2,NULL)&&state.focus==2&&db_state_move(&state,-2,NULL)&&state.focus==0);
  // Withdrawal leaves no ghost controls even when the last frame had bits set.
  state.snapshot.items[0].flags|=DB_PRIVATE;assert(db_state_redact(&state,1000,true));
  for(unsigned i=0;i<3;i++)assert(!db_control_present(db_selected(&state),i));
  assert(state.focus==0&&!db_state_move(&state,1,NULL));
  frame.sequence++;frame.items[0].flags=DB_ACTION;memset(frame.items[0].controls,0,sizeof(frame.items[0].controls));
  assert(db_state_apply(&state,&frame)&&state.focus==0&&!db_state_move(&state,1,NULL));
}
static void identity_and_privacy(void){
  DbState state;db_state_init(&state,5);db_state_expect(&state,7,DB_PINNED,0,0);
  DbSnapshot frame={.session=5,.request=7,.sequence=1,.now=1000,.mode=DB_PINNED,.status=DB_READY,.total=12,.count=5};
  for(unsigned i=0;i<5;i++){frame.items[i]=(DbItem){.token=i+1,.version=1,.valid_until=2000,.role=DB_ROLE_PIN};snprintf(frame.items[i].title,sizeof(frame.items[i].title),"Pin %u",i+1);}
  assert(db_state_apply(&state,&frame));assert(state.selected_token==1);
  uint16_t index;assert(db_state_move(&state,1,&index)&&index==1&&state.selected_token==2);
  state.selected_index=4;state.selected_token=5;assert(db_state_move(&state,1,&index)&&index==5&&state.selected_token==5);
  frame.sequence++;frame.items[4].token=50;assert(db_state_apply(&state,&frame));assert(state.selection_lost&&!db_selected(&state));
  assert(db_state_move(&state,1,&index));assert(db_selected(&state));
  state.snapshot.items[0].flags=DB_PRIVATE|DB_ACTION|DB_APP|DB_UNAVAILABLE;snprintf(state.snapshot.items[0].title,193,"Private song");snprintf(state.snapshot.items[0].subtitle,129,"Private artist");
  snprintf(state.snapshot.items[0].controls[0],33,"Private action");snprintf(state.snapshot.items[0].action_label,33,"Private label");snprintf(state.snapshot.items[0].app_label,33,"Private app");
  state.snapshot.items[0].width=1;state.snapshot.items[0].pixels[0]=99;
  assert(db_state_redact(&state,1000,true));assert(!state.snapshot.items[0].title[0]&&!state.snapshot.items[0].subtitle[0]&&!state.snapshot.items[0].width&&!state.snapshot.items[0].pixels[0]);assert(!(state.snapshot.items[0].flags&(DB_ACTION|DB_APP)));
  assert(!state.snapshot.items[0].controls[0][0]&&!state.snapshot.items[0].action_label[0]&&!state.snapshot.items[0].app_label[0]);
  assert(!db_item_actionable(&state.snapshot.items[0],1000));
  assert(state.snapshot.items[1].title[0]);assert(db_state_redact(&state,2000,false));assert(state.snapshot.items[1].flags&DB_UNAVAILABLE);
  // A replacement phone runtime restarts at sequence1. Rotating the native
  // epoch clears old private content/selection/history and accepts that frame.
  DbSnapshot old=state.snapshot;old.session=5;old.request=7;old.sequence=500;
  db_state_remember(&state);db_state_init(&state,6);
  assert(!state.ready&&!state.selected_token&&!state.depth&&!state.last_sequence&&!state.snapshot.items[0].title[0]);
  db_state_expect(&state,8,DB_OVERVIEW,0,0);
  DbSnapshot restarted={.session=6,.request=8,.sequence=1,.mode=DB_OVERVIEW,.status=DB_READY,.total=0};
  assert(db_state_apply(&state,&restarted));assert(!db_state_apply(&state,&old));assert(state.snapshot.session==6&&state.last_sequence==1);
}
static void static_placeholder(void){
  uint8_t bytes[81]={0};memcpy(bytes,"DSH1",4);put32(bytes+4,1);put32(bytes+8,1);put32(bytes+12,1);put32(bytes+16,1000);bytes[20]=DB_PINNED;bytes[21]=DB_READY;bytes[22]=1;put16(bytes+24,1);
  uint8_t *item=bytes+32;put32(item,1);put32(item+4,1);item[39]=DB_ROLE_PIN;put16(item+24,4);memcpy(item+44,"Find",4);
  DbSnapshot frame;assert(db_decode(bytes,80,&frame));assert(!frame.items[0].valid_until);
  put16(item+12,DB_PRIVATE);assert(!db_decode(bytes,80,&frame));put16(item+12,DB_UNAVAILABLE);assert(db_decode(bytes,80,&frame));
  put16(item+28,1);bytes[80]='7';assert(!db_decode(bytes,81,&frame));put16(item+28,0);
  put16(item+12,DB_COUNTDOWN);item[15]=1;assert(!db_decode(bytes,80,&frame));
}
static size_t notification_bytes(uint8_t *bytes,const char *subtitle){
  memset(bytes,0,256);memcpy(bytes,"DSH1",4);put32(bytes+4,1);put32(bytes+8,1);put32(bytes+12,1);put32(bytes+16,1000);
  bytes[20]=DB_OVERVIEW;bytes[21]=DB_READY;bytes[22]=1;put16(bytes+24,1);
  uint8_t *item=bytes+32;put32(item,3);put32(item+4,1);put16(item+12,DB_NOTIFICATION|DB_APP);item[14]=DB_NOTICE;item[39]=DB_ROLE_NOTICE;
  const char *strings[]={"Notifications",subtitle,"","Notifications","","Notifications"};size_t length=76;
  for(unsigned i=0;i<6;i++){size_t n=strlen(strings[i]);put16(item+24+i*2,(uint16_t)n);memcpy(bytes+length,strings[i],n);length+=n;}
  return length;
}
static void notification_shortcut(void){
  uint8_t bytes[256];size_t length=notification_bytes(bytes,"No notifications");DbSnapshot frame;
  assert(db_decode(bytes,length,&frame));assert(!frame.items[0].valid_until&&db_item_capability_current(&frame.items[0],1000));
  const uint16_t allowed[]={DB_IS_PENDING,DB_IS_FAILED,DB_IS_PENDING|DB_IS_FAILED};
  for(unsigned i=0;i<sizeof(allowed)/sizeof(allowed[0]);i++){put16(bytes+44,DB_NOTIFICATION|DB_APP|allowed[i]);assert(db_decode(bytes,length,&frame));}
  const uint16_t forbidden[]={DB_PRIVATE,DB_UNAVAILABLE,DB_ACTION,DB_COUNTDOWN,DB_IS_MEDIA,DB_LOCAL_WATCH};
  for(unsigned i=0;i<sizeof(forbidden)/sizeof(forbidden[0]);i++){put16(bytes+44,DB_NOTIFICATION|DB_APP|forbidden[i]);assert(!db_decode(bytes,length,&frame));}
  put16(bytes+44,DB_NOTIFICATION|DB_APP);
  put16(bytes+74,4);bytes[length]=1;bytes[length+1]='X';bytes[length+2]=bytes[length+3]=0;assert(!db_decode(bytes,length+4,&frame));put16(bytes+74,0);
  bytes[46]=DB_GENERIC;assert(!db_decode(bytes,length,&frame));bytes[46]=DB_NOTICE;
  bytes[76]='X';assert(!db_decode(bytes,length,&frame));bytes[76]='N';
  // A readable value, custom action label/control, image or unrecognized state
  // must never acquire an unlimited lease through this public shortcut shape.
  put16(bytes+60,1);bytes[length]='7';assert(!db_decode(bytes,length+1,&frame));put16(bytes+60,0);
  bytes[68]=1;bytes[69]=1;bytes[70]=1;put16(bytes+72,1);bytes[length]=0xc0;bytes[length+1]=0;assert(!db_decode(bytes,length+2,&frame));bytes[68]=bytes[69]=bytes[70]=0;put16(bytes+72,0);
  length=notification_bytes(bytes,"Old private text");assert(!db_decode(bytes,length,&frame));
  length=notification_bytes(bytes,"Open notifications");assert(db_decode(bytes,length,&frame));
  DbSnapshot shell=frame;DbState state;db_state_init(&state,1);db_state_expect(&state,1,DB_OVERVIEW,0,3);
  frame.items[0].flags=DB_PRIVATE|DB_NOTIFICATION|DB_APP;frame.items[0].valid_until=1001;
  snprintf(frame.items[0].title,sizeof(frame.items[0].title),"Private sender");snprintf(frame.items[0].subtitle,sizeof(frame.items[0].subtitle),"Private message");
  assert(db_state_apply(&state,&frame));assert(db_selected(&state)->token==3);
  assert(db_state_redact(&state,1001,false));assert(db_selected(&state)->token==3);assert(!db_item_capability_current(db_selected(&state),1001));
  assert(!state.snapshot.items[0].title[0]&&!state.snapshot.items[0].subtitle[0]&&!(state.snapshot.items[0].flags&DB_APP));
  shell.sequence=2;shell.items[0].version=2;assert(db_state_apply(&state,&shell));assert(db_selected(&state)->token==3&&db_selected(&state)->version==2);
  assert(db_item_capability_current(db_selected(&state),1001)&&(db_selected(&state)->flags&DB_APP)&&!db_item_actionable(db_selected(&state),1001));
  assert(!db_state_redact(&state,1001,true)); // Public shortcut has no private preview to erase.
}
int main(int argc,char **argv){
  assert(argc>1);
  if(!strcmp(argv[1],"--decode-only")){
    assert(argc>2);DbSnapshot *frame=malloc(sizeof(*frame));assert(frame);
    for(int i=2;i<argc;i++){size_t length;uint8_t *bytes=load(argv[i],&length);if(!db_decode(bytes,length,frame)){fprintf(stderr,"C rejected runtime frame: %s\n",argv[i]);free(bytes);free(frame);return 1;}free(bytes);}
    free(frame);printf("C parser: %d actual runtime frames accepted\n",argc-2);return 0;
  }
  for(int i=1;i<argc;i++)fixture(argv[i]);
  clocks();reconnect_focus();withdrawn_focus_stays_inert();direct_media_action();control_slots();identity_and_privacy();static_placeholder();notification_shortcut();printf("native model: %u binary fixtures; malformed, stale, selection, privacy, sparse controls and clock checks passed\n",checked);return 0;
}
