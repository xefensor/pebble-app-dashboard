#pragma once

#include <pebble.h>

typedef struct { AppTimer *timer; uint32_t at; } DbDeadline;

/* Keep one absolute source-expiry callback; unrelated clock ticks do not move
 * its deadline. The caller clears the slot at callback entry. */
void db_deadline_clear(DbDeadline *deadline);
void db_deadline_update(DbDeadline *deadline, uint32_t at, uint64_t now_ms,
                        AppTimerCallback callback, void *context);
