#include "dashboard_press.h"
#include <assert.h>
#include <stdio.h>

int main(void) {
  DbState state;db_state_init(&state,41);
  state.view_request=12;state.desired_mode=DB_ACTIVITIES;state.ready=true;
  state.snapshot.mode=DB_ACTIVITIES;state.snapshot.count=2;state.snapshot.total=2;
  state.snapshot.items[0]=(DbItem){.token=73,.version=4};
  state.snapshot.items[1]=(DbItem){.token=92,.version=8};
  state.selected_token=73;
  DbPress press;db_press_capture(&press,&state);
  assert(db_press_matches(&press,&state));assert(db_press_take(&press,&state));
  assert(!db_press_take(&press,&state)); /* One dispatch per physical press. */
  db_press_capture(&press,&state);state.snapshot.items[0].version++;
  assert(!db_press_matches(&press,&state));state.snapshot.items[0].version--;
  assert(!db_press_take(&press,&state)); /* A capability cannot reappear mid-press. */
  db_press_capture(&press,&state);state.selected_token=92;state.selected_index=1;
  assert(!db_press_matches(&press,&state));state.selected_token=73;state.selected_index=0;
  assert(!db_press_take(&press,&state));
  db_press_capture(&press,&state);state.view_request++;
  assert(!db_press_take(&press,&state));
  db_press_capture(&press,&state);state.focus++;
  assert(!db_press_matches(&press,&state));state.focus--;
  assert(!db_press_take(&press,&state)); /* A control change cannot retarget release. */
  db_press_capture(&press,&state);state.session++;
  assert(!db_press_take(&press,&state));
  db_press_capture(&press,&state);state.loading=true;
  assert(!db_press_take(&press,&state));state.loading=false;
  db_press_capture(&press,&state);db_press_cancel(&press);
  assert(!db_press_take(&press,&state));
  /* Reorder retains the original identity; a different row number alone does
   * not retarget a press, and native row motion never owns capability state. */
  db_press_capture(&press,&state);
  DbItem first=state.snapshot.items[0];state.snapshot.items[0]=state.snapshot.items[1];state.snapshot.items[1]=first;
  state.selected_index=1;
  assert(db_press_take(&press,&state));
  puts("Native press identity, version, view, cancellation and exactly-once dispatch: PASS");
}
