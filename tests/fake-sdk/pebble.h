#pragma once
#include <stdint.h>
#include <stddef.h>
typedef struct AppTimer AppTimer;
typedef void (*AppTimerCallback)(void *context);
AppTimer *app_timer_register(uint32_t timeout_ms, AppTimerCallback callback, void *context);
void app_timer_cancel(AppTimer *timer);
