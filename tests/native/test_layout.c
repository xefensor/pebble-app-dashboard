#include <assert.h>
#include <stdio.h>
#include "dashboard_layout.h"

static void visible(DbListWindow window,unsigned selected,int height){
  assert(window.count&&selected>=window.first&&selected<window.first+window.count);
  assert(window.used<=height);
}
int main(void){
  // Exact bounds of the shipped Roboto PFOs, rather than nominal point sizes.
  DbTextInk ink=db_layout_body_ink("Tea",2);assert(ink.exact&&ink.top==7&&ink.bottom==23);
  ink=db_layout_body_ink("Signal",2);assert(ink.exact&&ink.top==5&&ink.bottom==28);
  ink=db_layout_body_ink("Čaj",2);assert(ink.exact&&ink.top==3&&ink.bottom==28);
  ink=db_layout_body_ink("Žluťoučký",1);assert(ink.exact&&ink.top==2&&ink.bottom==25);
  ink=db_layout_body_ink("ÁÉČŘŮžý",3);assert(ink.exact&&ink.top==1&&ink.bottom==30);
  ink=db_layout_body_ink("  ",1);assert(ink.exact&&!ink.visible);
  ink=db_layout_body_ink("a\xcc\x81",2);assert(ink.exact&&ink.visible&&ink.top==6&&ink.bottom==23);
  ink=db_layout_body_ink("\xf0\x9f\x8c\x9e",2);assert(!ink.exact&&ink.visible&&ink.top==7&&ink.bottom==23);
  ink=db_layout_ink("12:34",-1,5);assert(ink.exact&&ink.top==11&&ink.bottom==36);
  // A combining mark with negative bearing keeps its signed coordinate.
  bool negative=false;
  for(unsigned i=0;i<sizeof(db_body_ink)/sizeof(db_body_ink[0]);i++){
    if(db_body_ink[i].ink[3].top!=127&&(int8_t)db_body_ink[i].ink[3].top<0)negative=true;
  }
  assert(negative);
  const int ordinary[]={39,43,39,39,39};
  DbListWindow window=db_layout_window(ordinary,5,4,0,199);visible(window,4,199);assert(window.first==0&&window.count==5);
  const int accented[]={49,49,49,49,49};unsigned first=0;
  for(unsigned selected=0;selected<5;selected++){window=db_layout_window(accented,5,selected,first,199);visible(window,selected,199);first=window.first;}
  assert(window.first==1&&window.count==4);
  const int shorter[]={39,39,39,39,39};
  DbListWindow shrunk=db_layout_window(shorter,5,4,window.first,199);visible(shrunk,4,199);assert(shrunk.first==0&&shrunk.count==5&&shrunk.used==195);
  window=db_layout_window(accented,5,3,first,199);visible(window,3,199);assert(window.first==1); // Reverse keeps viewport anchored.
  window=db_layout_window(accented,5,0,window.first,199);visible(window,0,199);assert(window.first==0);
  const int mixed[]={55,55,55,55,55};
  for(unsigned selected=0;selected<5;selected++){window=db_layout_window(mixed,5,selected,0,199);visible(window,selected,199);assert(window.count<=3);}
  window=db_layout_window(accented,5,3,0,199);visible(window,3,199); // New wire page reset.
  unsigned remembered=window.first;window=db_layout_window(accented,5,3,remembered,199);visible(window,3,199);assert(window.first==remembered); // Back restores selection/window.
  window=db_layout_window(accented,0,0,0,199);assert(!window.count);
  puts("native layout: packaged font accents/descenders/signed bearings and wildcard, adaptive fifth selection, reverse/page/back, shrink backfill and empty window passed");
}
