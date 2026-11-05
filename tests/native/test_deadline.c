#include "dashboard_deadline.h"
#include <assert.h>
#include <stdbool.h>
#include <stdio.h>

struct AppTimer { bool active; AppTimerCallback callback; void *context; uint32_t delay; };
static struct AppTimer timer;
static unsigned registered,cancelled,fired;
static bool fail;
AppTimer *app_timer_register(uint32_t delay,AppTimerCallback callback,void *context){
  registered++;if(fail)return NULL;assert(!timer.active);
  timer=(struct AppTimer){true,callback,context,delay};return &timer;
}
void app_timer_cancel(AppTimer *value){assert(value==&timer&&timer.active);cancelled++;timer.active=false;}
static void callback(void *context){DbDeadline *deadline=context;deadline->timer=NULL;deadline->at=0;fired++;}
int main(void){
  DbDeadline deadline={0};
  db_deadline_update(&deadline,1060,1000000,callback,&deadline);
  assert(registered==1&&timer.delay==60000&&deadline.at==1060);
  for(uint64_t now=1001000;now<1060000;now+=1000)
    db_deadline_update(&deadline,1060,now,callback,&deadline);
  assert(registered==1&&!cancelled); //59 regular updates allocate no timers.
  timer.active=false;timer.callback(timer.context);assert(fired==1);
  db_deadline_update(&deadline,1090,1060001,callback,&deadline);
  assert(registered==2&&timer.delay==29999);
  db_deadline_update(&deadline,1080,1060500,callback,&deadline);
  assert(registered==3&&cancelled==1&&timer.delay==19500);
  // Main clears the relative timer on a wall-clock discontinuity, then updates
  // the same absolute deadline against the corrected current time.
  db_deadline_clear(&deadline);db_deadline_update(&deadline,1080,1079900,callback,&deadline);
  assert(timer.delay==100&&registered==4&&cancelled==2);
  db_deadline_update(&deadline,0,1080000,callback,&deadline);assert(!timer.active&&!deadline.at&&cancelled==3);
  fail=true;db_deadline_update(&deadline,1090,1080000,callback,&deadline);assert(!deadline.timer&&!deadline.at);
  fail=false;db_deadline_update(&deadline,1090,1080000,callback,&deadline);assert(timer.delay==10000&&deadline.at==1090);
  db_deadline_clear(&deadline);db_deadline_update(&deadline,1,2000,callback,&deadline);assert(timer.delay==1);
  db_deadline_clear(&deadline);db_deadline_update(&deadline,UINT32_MAX,0,callback,&deadline);assert(timer.delay==UINT32_MAX);
  db_deadline_clear(&deadline);
  puts("native deadline: 59 unchanged updates retain one timer; expiry, correction, replacement, cancellation and registration retry passed");
}
