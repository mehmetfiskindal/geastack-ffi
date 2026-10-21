ENTRY(_start)

SECTIONS
{
  . = 0x80000000;
  .text : {
    KEEP(*(.text.init))
    *(.text*)
    *(.rodata*)
    . = ALIGN(4);
  }
  .data : {
    *(.data*)
    . = ALIGN(4);
  }
  .bss : {
    *(.bss*)
    *(COMMON)
    . = ALIGN(4);
  }
  . = ALIGN(16);
  _stack_top = 0x80100000;
}
