#pragma once
#include "dashboard.h"

/* A physical press belongs to one capability and one view. Invalidation is
 * latched: changing back to the original row before release cannot revive it. */
typedef struct {
  uint32_t session,request,token,version;
  uint8_t mode,focus;
  bool active;
} DbPress;
static inline void db_press_cancel(DbPress *press) {press->active=false;}
static inline void db_press_capture(DbPress *press,const DbState *state) {
  const DbItem *item=db_selected(state);
  *press=(DbPress){.session=state->session,.request=state->view_request,.mode=state->desired_mode,.focus=state->focus,
      .token=item?item->token:0,.version=item?item->version:0,.active=item!=NULL};
}
static inline bool db_press_matches(DbPress *press,const DbState *state) {
  const DbItem *item=db_selected(state);
  const bool matches=press->active&&item&&press->session==state->session&&
      press->request==state->view_request&&press->mode==state->desired_mode&&press->focus==state->focus&&
      press->token==item->token&&press->version==item->version;
  if(!matches)db_press_cancel(press);
  return matches;
}
static inline bool db_press_take(DbPress *press,const DbState *state) {
  const bool matches=db_press_matches(press,state);db_press_cancel(press);return matches;
}
