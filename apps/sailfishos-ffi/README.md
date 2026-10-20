# Sailfish FFI

GeaStack app id: `sailfishos-ffi`.

JSX and CSS application for the GeaStack `sailfishos` Linux target. It calls `libc.so.6` through `Library.open`, writes a Sailjail desktop section, and prints the Harbour paths for `harbour-geaffi`.

MCE, NGFD, and DConf are not part of this demo.

```sh
npm install
npm test
npm run check
npm run dev
```

`npm test` calls `libc.so.6` on Linux and expects the process id plus `strlen("geastack") === 8`. On other hosts the same call reports the loader error. `npm run dev` serves the same JSX in a browser. The Sailfish compile still uses `mount` from `@geastack/core`; the dev server swaps in a DOM preview and shows the FFI snapshot taken by the Vite process.
