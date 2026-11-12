#pragma once

/* Full physical display bounds; round content uses circle-aware bands.
 * Fonts retain their selected Pebble sizes. No pixels or input coordinates
 * are scaled. Defaults keep SDK-independent geometry fixtures on Emery. */
#ifndef PBL_DISPLAY_WIDTH
#define PBL_DISPLAY_WIDTH 200
#endif
#ifndef PBL_DISPLAY_HEIGHT
#define PBL_DISPLAY_HEIGHT 228
#endif
#define APP_SCREEN_W PBL_DISPLAY_WIDTH
#define APP_SCREEN_H PBL_DISPLAY_HEIGHT
#ifdef PBL_ROUND
#define APP_HEADER_HEIGHT 72
#define APP_MENU_ALIGN MenuRowAlignCenter
#define APP_CENTER_FOCUSED true
#else
#define APP_HEADER_HEIGHT 32
#define APP_MENU_ALIGN MenuRowAlignBottom
#define APP_CENTER_FOCUSED false
#endif
#define APP_SCREEN_X ((PBL_DISPLAY_WIDTH - APP_SCREEN_W) / 2)
#define APP_SCREEN_Y ((PBL_DISPLAY_HEIGHT - APP_SCREEN_H) / 2)
#define APP_SCREEN_FRAME GRect(APP_SCREEN_X,APP_SCREEN_Y,APP_SCREEN_W,APP_SCREEN_H)
