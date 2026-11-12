"""Round collection titles retain source text until the final drawing band."""
from pathlib import Path
import os,subprocess,tempfile,unittest
ROOT=Path(__file__).resolve().parents[1]
class RoundCollection(unittest.TestCase):
 def test_title_is_not_shortened_to_the_old_rectangular_column(self):
  source=(ROOT/'src/c/main.c').read_text();start=source.index('typedef struct {\n  char title[265],detail[144];');part=source[start:source.index('static int list_row_height',start)]
  prelude=r'''
#include <assert.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>
#define PBL_ROUND 1
enum {DB_IS_MEDIA=1};
typedef struct {char title[265],name[265],value[144];unsigned flags;} DbItem;
typedef struct {int w,h;} GSize;
static void clean_text(char *out,size_t n,const char *s){snprintf(out,n,"%s",s);}
static int width_of(const char *s,unsigned font){(void)font;return strlen(s)*12;}
static GSize text_size(const char *s,unsigned f,int w){return (GSize){width_of(s,f),24*(1+(width_of(s,f)>w))};}
static void media_identity(const DbItem *i,char *s,size_t n){clean_text(s,n,i->value);}
static void item_value(const DbItem *i,char *s,size_t n){clean_text(s,n,i->value);}
static const char *app_text(const char *s){return s;}
'''
  cases=r'''
int main(void){
 DbItem item={.title="Morning walk",.value="10 min"};CollectionRow row;
 assert(width_of(item.title,5)>119&&width_of(item.title,5)<188);
 collection_layout(&item,&row);assert(!strcmp(row.title,item.title));assert(!strcmp(row.detail,"10 min"));
 strcpy(item.value,"123456789012345678901234567890 km");collection_layout(&item,&row);assert(!strcmp(row.detail,"Too long"));return 0;
}
'''
  with tempfile.TemporaryDirectory() as directory:
   p=Path(directory);(p/'test.c').write_text(prelude+part+cases)
   subprocess.run([os.environ.get('CC','cc'),'-std=c99','-Wall','-Wextra','-Werror',str(p/'test.c'),'-o',str(p/'test')],check=True);subprocess.run([str(p/'test')],check=True)
