#include "dashboard_deadline.h"

void db_deadline_clear(DbDeadline *deadline) {
  if (deadline->timer) app_timer_cancel(deadline->timer);
  deadline->timer = NULL;
  deadline->at = 0;
}

void db_deadline_update(DbDeadline *deadline, uint32_t at, uint64_t now_ms,
                        AppTimerCallback callback, void *context) {
  if (deadline->timer && deadline->at == at) return;
  db_deadline_clear(deadline);
  if (!at) return;
  const uint64_t due = (uint64_t)at * 1000u;
  const uint64_t delay = due > now_ms ? due - now_ms : 1;
  deadline->timer = app_timer_register(delay > UINT32_MAX ? UINT32_MAX : (uint32_t)delay,
                                     callback, context);
  if (deadline->timer) deadline->at = at;
}
