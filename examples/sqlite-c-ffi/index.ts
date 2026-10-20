// SPDX-License-Identifier: Apache-2.0
/**
 * Example: Standard C Dynamic Library Invocation with @geastack/ffi
 *
 * Sketch of a SQLite binding. This file is not part of the verified suite.
 * Library.open loads a real shared library and throws if libsqlite3 is absent.
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
