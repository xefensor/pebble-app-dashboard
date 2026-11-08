#pragma once
#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
typedef struct AppTimer AppTimer;
typedef void (*AppTimerCallback)(void *context);
AppTimer *app_timer_register(uint32_t timeout_ms, AppTimerCallback callback, void *context);
void app_timer_cancel(AppTimer *timer);

bool persist_exists(uint32_t key);
int persist_get_size(uint32_t key);
bool persist_read_bool(uint32_t key);
int persist_write_bool(uint32_t key,bool value);
int persist_read_data(uint32_t key,void *data,size_t size);
int persist_write_data(uint32_t key,const void *data,size_t size);
