#pragma once
#include <stddef.h>
#include <stdint.h>
typedef size_t (*AppTextReader)(uint32_t offset,uint8_t *buffer,size_t size);
const char *app_localized_text(const char *english,const char *locale,AppTextReader reader);
const char *app_text(const char *english);
const char *app_heading(const char *english);
