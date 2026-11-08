#pragma once

#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

enum {
  DASHBOARD_UI_PREFERENCES_BYTES=20,
  DASHBOARD_UI_APPLIED=0,
  DASHBOARD_UI_SAVE_FAILED=1,
  DASHBOARD_UI_HELLO=1,
  DASHBOARD_UI_FOLLOW=0,
  DASHBOARD_UI_LIGHT=1,
  DASHBOARD_UI_DARK=2
};
typedef struct {
  uint32_t revision;
  uint8_t text_size,appearance,last_explicit;
} DashboardUiPreferences;

/* A local UI preference never belongs to a DSH1 snapshot or command receipt. */
DashboardUiPreferences dashboard_ui_preferences_defaults(bool legacy_dark);
bool dashboard_ui_preferences_valid(const DashboardUiPreferences *value);
void dashboard_ui_preferences_encode(const DashboardUiPreferences *value,uint8_t status,
    uint8_t flags,uint8_t bytes[DASHBOARD_UI_PREFERENCES_BYTES]);
bool dashboard_ui_preferences_decode(const uint8_t *bytes,size_t length,
    DashboardUiPreferences *value,uint8_t *status,uint8_t *flags);
bool dashboard_ui_preferences_dark(const DashboardUiPreferences *value);
bool dashboard_ui_preferences_load(DashboardUiPreferences *value);
bool dashboard_ui_preferences_save(const DashboardUiPreferences *value);
