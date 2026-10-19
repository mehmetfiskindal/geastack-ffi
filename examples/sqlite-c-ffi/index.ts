// SPDX-License-Identifier: Apache-2.0
/**
 * Example: Standard C Dynamic Library Invocation with @geastack/ffi
 *
 * Demonstrates:
 * - Opening a C shared library (`libsqlite3.dylib` / `libsqlite3.so`)
 * - Working with pointers to pointers (`sqlite3** db`)
 * - Passing null-terminated C-strings
 * - Reading integer return codes
 */

import { Library, Pointer, Memory } from '../../dist/index.js';

// Define SQLite3 C API interface
export function openSqlite3() {
  const libsqlite = Library.open('libsqlite3', {
    sqlite3_open: {
      args: ['string', 'pointer'], // (const char *filename, sqlite3 **ppDb)
      returns: 'int32',
    },
    sqlite3_exec: {
      args: ['pointer', 'string', 'pointer', 'pointer', 'pointer'],
      returns: 'int32',
    },
    sqlite3_close: {
      args: ['pointer'],
      returns: 'int32',
    },
  });

  return libsqlite;
}
