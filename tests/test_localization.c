#include "localization.h"
#include "generated_localization.h"
#include <assert.h>
#include <stdio.h>
#include <string.h>
static FILE *file;
static unsigned reads;
static unsigned fault;
static size_t read_text(uint32_t offset,uint8_t *buffer,size_t size) {
 ++reads;assert(fseek(file,(long)offset,SEEK_SET)==0);
 size_t length=fread(buffer,1,size,file);
 if(fault==1)return length?length-1:0;
 if(fault==2)memset(buffer,'x',length);
 return length;
}
const char *app_text(const char *english) { return app_localized_text(english,"en",read_text); }
int main(int argc,char **argv) {
 assert(argc==2);file=fopen(argv[1],"rb");assert(file);
 const char *key=app_english[0];
 assert(!strcmp(app_localized_text(key,"zz_ZZ",read_text),key));assert(reads==0);
 assert(!strcmp(app_localized_text("Provider-owned name","cs_CZ",read_text),"Provider-owned name"));assert(reads==0);
 for(unsigned lang=1;lang<sizeof(app_languages)/sizeof(*app_languages);++lang) {
  unsigned before=reads;
  for(unsigned i=0;i<APP_TEXT_COUNT;++i){const char *translated=app_localized_text(app_english[i],app_languages[lang],read_text);assert(translated&&translated[0]);assert(translated!=app_english[i]);}
  assert(reads==before+1);
 }
 fault=1;assert(!strcmp(app_localized_text(key,"cs-CZ",read_text),key));
 fault=2;assert(!strcmp(app_localized_text(key,"de_DE",read_text),key));
 fault=0;assert(app_localized_text(key,"CS_cz",read_text)!=key);
 const char *norwegian=app_localized_text(key,"no",read_text);unsigned before=reads;
 assert(app_localized_text(key,"nb_NO",read_text)==norwegian);
 assert(app_localized_text(key,"nn_NO",read_text)==norwegian);assert(reads==before);
 assert(!strcmp(app_localized_text(key,"english",read_text),key));
 assert(!strcmp(app_heading("1/8"),"1/8"));
 fclose(file);puts("Native localization: 17 locales, bounded reads, aliases, cache and corrupt/truncated resource fallback PASS");return 0;
}
