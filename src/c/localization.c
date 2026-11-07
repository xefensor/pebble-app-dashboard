#include "localization.h"
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#include "generated_localization.h"
#ifndef APP_LOCALIZATION_TEST
#include <pebble.h>
#endif
static char s_text[APP_TEXT_BYTES];
static uint16_t s_offsets[APP_TEXT_COUNT];
static int s_language=-1;
static bool s_valid;
static unsigned language_index(const char *locale) {
  if(!locale||!locale[0]||!locale[1])return 0;
  char a=locale[0],b=locale[1];
  if(a>='A'&&a<='Z')a+='a'-'A';
  if(b>='A'&&b<='Z')b+='a'-'A';
  if(locale[2]&&locale[2]!='_'&&locale[2]!='-'&&locale[2]!='.'&&locale[2]!='@')return 0;
  if(a=='n'&&(b=='b'||b=='n'))b='o';
  for(unsigned i=1;i<sizeof(app_languages)/sizeof(*app_languages);++i)
    if(a==app_languages[i][0]&&b==app_languages[i][1])return i;
  return 0;
}
const char *app_localized_text(const char *english,const char *locale,AppTextReader reader) {
  if(!english)return "";
  unsigned key=0;while(key<APP_TEXT_COUNT&&strcmp(english,app_english[key]))++key;
  if(key==APP_TEXT_COUNT)return english;
  const char *fallback=app_fallback[key];
  unsigned lang=language_index(locale);if(!lang||!reader)return fallback;
  if(s_language!=(int)lang) {
    s_language=(int)lang;s_valid=false;
    size_t length=app_text_ranges[lang][1];
    if(length>sizeof(s_text)||reader(app_text_ranges[lang][0],(uint8_t*)s_text,length)!=length)return fallback;
    size_t at=0;
    for(unsigned i=0;i<APP_TEXT_COUNT;++i) {
      if(at>=length)return fallback;
      const char *end=memchr(s_text+at,0,length-at);if(!end||end==s_text+at)return fallback;
      s_offsets[i]=(uint16_t)at;at=(size_t)(end-s_text)+1;
    }
    s_valid=at==length;
  }
  return s_valid?s_text+s_offsets[key]:fallback;
}
#ifndef APP_LOCALIZATION_TEST
static size_t read_text(uint32_t offset,uint8_t *buffer,size_t size) {
  return resource_load_byte_range(resource_get_handle(RESOURCE_ID_LOCALIZATION),offset,buffer,size);
}
const char *app_text(const char *english) {
  return app_localized_text(english,i18n_get_system_locale(),read_text);
}
#endif

const char *app_heading(const char *english) {
  if(!english)return "";
  char key[80];
  if(strlen(english)+9>=sizeof(key))return app_text(english);
  snprintf(key,sizeof(key),"@header:%s",english);
  const char *translated=app_text(key);
  return translated==key?app_text(english):translated;
}
