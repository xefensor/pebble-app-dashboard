#pragma once

#include <stdbool.h>
#include <stdint.h>
#include <stddef.h>

typedef struct {uint8_t top,bottom;} DbGlyphInk;
typedef struct {uint16_t codepoint;DbGlyphInk ink[6];} DbClockGlyphInk;
typedef struct {uint16_t codepoint;DbGlyphInk ink[4];} DbBodyGlyphInk;
#include "generated_clock_ink.h"
#include "generated_body_ink.h"

typedef struct {int top,bottom;bool visible,exact;} DbTextInk;

static inline uint32_t db_layout_codepoint(const unsigned char **cursor){
  const unsigned char *p=*cursor;uint32_t code=*p++;
  if(code>=0xc2&&code<0xe0&&(p[0]&0xc0)==0x80){code=((code&31)<<6)|(p[0]&63);p++;}
  else if(code>=0xe0&&code<0xf0&&p[0]&&p[1]&&(p[0]&0xc0)==0x80&&(p[1]&0xc0)==0x80){code=((code&15)<<12)|((p[0]&63)<<6)|(p[1]&63);p+=2;}
  else if(code>=0xf0&&code<0xf5&&p[0]&&p[1]&&p[2]&&(p[0]&0xc0)==0x80&&(p[1]&0xc0)==0x80&&(p[2]&0xc0)==0x80){code=((code&7)<<18)|((p[0]&63)<<12)|((p[1]&63)<<6)|(p[2]&63);p+=3;}
  *cursor=p;return code;
}

static inline DbTextInk db_layout_ink(const char *text,int fallback_role,int clock_font){
  DbTextInk result={.top=255,.bottom=-128,.exact=true};
  if(clock_font<0){result.top=0;result.bottom=fallback_role==1?30:34;result.exact=false;result.visible=text[0]!=0;return result;}
  for(const unsigned char *p=(const unsigned char *)text;*p;){
    uint32_t code=db_layout_codepoint(&p);DbGlyphInk glyph={255,0};bool known=false;
    if(code==9||code==10||code==13)continue; // The painter normalizes these to space.
    for(unsigned i=0;i<sizeof(db_clock_ink)/sizeof(db_clock_ink[0]);i++)if(code==db_clock_ink[i].codepoint){glyph=db_clock_ink[i].ink[clock_font];known=true;break;}
    if(!known){
      // Unknown or combining characters keep conservative line bounds. They
      // still use the public SDK renderer; this is not a coverage guarantee.
      glyph=(DbGlyphInk){0,34};result.exact=false;
    }
    if(glyph.top==127)continue;
    int top=(int8_t)glyph.top,bottom=(int8_t)glyph.bottom;
    if(top<result.top)result.top=top;
    if(bottom>result.bottom)result.bottom=bottom;
    result.visible=true;
  }
  if(!result.visible)result.top=result.bottom=0;
  return result;
}

static inline DbTextInk db_layout_body_ink(const char *text,unsigned font){
  DbTextInk result={.top=255,.bottom=-128,.exact=true};
  for(const unsigned char *p=(const unsigned char *)text;*p;){
    uint32_t code=db_layout_codepoint(&p);if(code==9||code==10||code==13)continue;
    unsigned left=0,right=sizeof(db_body_ink)/sizeof(db_body_ink[0]);
    while(left<right){unsigned middle=(left+right)/2;if(db_body_ink[middle].codepoint<code)left=middle+1;else right=middle;}
    if(left>=sizeof(db_body_ink)/sizeof(db_body_ink[0])||db_body_ink[left].codepoint!=code){left=DB_BODY_FALLBACK_INDEX;result.exact=false;}
    DbGlyphInk glyph=db_body_ink[left].ink[font];if(glyph.top==127)continue;
    int top=(int8_t)glyph.top,bottom=(int8_t)glyph.bottom;
    if(top<result.top)result.top=top;
    if(bottom>result.bottom)result.bottom=bottom;
    result.visible=true;
  }
  if(!result.visible)result.top=result.bottom=0;
  return result;
}

// The wire page can hold five rows. A larger accented/multiline row can use a
// smaller native window without changing bindings, focus or transport offsets.
typedef struct {unsigned first,count;int used;} DbListWindow;
static inline DbListWindow db_layout_window(const int *heights,unsigned count,unsigned selected,unsigned previous_first,int available){
  DbListWindow window={0,0,0};if(!count)return window;
  if(selected>=count)selected=count-1;
  window.first=previous_first<count?previous_first:0;
  if(selected<window.first)window.first=selected;
  int used=0;for(unsigned i=window.first;i<=selected;i++)used+=heights[i];
  while(used>available&&window.first<selected)used-=heights[window.first++];
  for(unsigned i=window.first;i<count;i++){
    if(window.count&&window.used+heights[i]>available)break;
    window.used+=heights[i];window.count++;
  }
  while(window.first&&window.used+heights[window.first-1]<=available){
    window.first--;window.count++;window.used+=heights[window.first];
  }
  return window;
}
