#!/usr/bin/env python3
"""Коснуться N гибибайт постранично и напечатать код результата.

По умолчанию 1 ГиБ, чтобы случайный запуск не упирался в OOM.
На этой VM полный проход 14 ГиБ завершился успехом, 15 ГиБ был убит cgroup.
Повтор 14+ ГиБ снова может убить процесс.
"""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--gib", type=int, default=1)
    args = parser.parse_args()
    if args.gib < 1 or args.gib > 14:
        print("refusing gib outside 1..14", file=sys.stderr)
        return 2
    size = args.gib * 1024**3
    try:
        buf = bytearray(size)
    except MemoryError:
        print(f"ALLOC_FAIL {args.gib}")
        return 2
    for offset in range(0, size, 4096):
        buf[offset] = 1
    buf[-1] = 1
    print(f"TOUCHED {args.gib}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
