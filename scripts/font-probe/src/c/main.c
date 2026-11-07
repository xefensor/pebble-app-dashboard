#include <pebble.h>
static Window *s_window;static Layer *s_canvas;static unsigned s_font,s_page;
static void utf8(char *out,unsigned c){if(c<128){out[0]=c;out[1]=0;}else if(c<2048){out[0]=0xc0|(c>>6);out[1]=0x80|(c&63);out[2]=0;}else{out[0]=0xe0|(c>>12);out[1]=0x80|((c>>6)&63);out[2]=0x80|(c&63);out[3]=0;}}
static void draw(Layer *layer,GContext *ctx){
 graphics_context_set_fill_color(ctx,GColorWhite);graphics_fill_rect(ctx,layer_get_bounds(layer),0,GCornerNone);graphics_context_set_text_color(ctx,GColorBlack);
 const char *keys[]={FONT_KEY_GOTHIC_18_BOLD,FONT_KEY_GOTHIC_24_BOLD,FONT_KEY_GOTHIC_28_BOLD};GFont font=fonts_get_system_font(keys[s_font]);
 for(unsigned i=0;i<36;i++){unsigned index=s_page*36+i,extra[]={0x2013,0x2014,0x2019,0x2026,0x2212,0x25af};if(index>=358)continue;unsigned c=index<352?32+index:extra[index-352];char text[5];utf8(text,c);graphics_draw_text(ctx,text,font,GRect(4+(i%6)*33,(i/6)*38,25,38),GTextOverflowModeFill,GTextAlignmentLeft,NULL);}
}
static void inbox(DictionaryIterator *d,void *context){(void)context;Tuple *f=dict_find(d,0),*p=dict_find(d,1);if(f&&p&&f->value->uint32<3&&p->value->uint32<10){s_font=f->value->uint32;s_page=p->value->uint32;layer_mark_dirty(s_canvas);}}
int main(void){s_window=window_create();s_canvas=layer_create(GRect(0,0,200,228));layer_set_update_proc(s_canvas,draw);layer_add_child(window_get_root_layer(s_window),s_canvas);app_message_register_inbox_received(inbox);app_message_open(64,64);window_stack_push(s_window,false);app_event_loop();app_message_deregister_callbacks();layer_destroy(s_canvas);window_destroy(s_window);}
