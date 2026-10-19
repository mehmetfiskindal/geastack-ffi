# @geastack/ffi

> Foreign Function Interface (FFI) and Native Interop runtime for the [GeaStack](https://geastack.com) ecosystem.

`@geastack/ffi` provides a high-performance, type-safe bridge between GeaStack TypeScript/JSX applications and native platform libraries (C/C++, iOS Objective-C/Swift, Android JNI/Kotlin, and microcontroller AOT firmware for ESP32 / RP2350).

---

## 🎯 Neden @geastack/ffi? (Why FFI?)

GeaStack projelerinde TypeScript/JSX kodu `geatsc` (Gea Compiler) vasıtasıyla doğrudan C++ çıktısına derlenir (AOT). Ancak **Firebase, Play Integrity, DeviceCheck / AppAttest, Bluetooth, SQLite, Kamera ve Harici Donanım SDK'ları** gibi devasa işletim sistemi kütüphanelerini TypeScript'ten C++'a transpile etmeye çalışmak mantıksızdır. 

Bunun yerine mimaride **Separation of Concerns (Sorumlulukların Ayrılması)** uygulanır:
- **Uygulama Mantığı & Arayüz:** GeaStack (TypeScript / JSX / CSS)
- **C/C++ Dinamik Kütüphaneler:** Standart C FFI (`Library.open`, `dlopen`, `LoadLibrary`)
- **Apple (iOS / macOS):** Objective-C / Swift Runtime Köprüsü (`objc_msgSend`, Blocks, `NSString`)
- **Android:** Java Native Interface (`JNI`, `FindClass`, JVM Metot Çağrıları)
- **Mikrodenetleyiciler (ESP32 / RP2350):** Sıfır maliyetli Statik AOT Sembol Tablosu (`GEA_FFI_REGISTER_FUNCTION`)

---

## 📦 Kurulum

```bash
npm install @geastack/ffi
```

---

## 🚀 Temel Yetenekler ve Kullanım

### 1. Dinamik C Kütüphanesi Yükleme (Classic C FFI)

C fonksiyonlarını doğrudan dinamik kütüphanelerden (`.dylib`, `.so`, `.dll`) yükleyin ve tip güvenli çağırın:

```typescript
import { Library } from '@geastack/ffi';

const libm = Library.open('libm', {
  cos: { args: ['double'], returns: 'double' },
  sin: { args: ['double'], returns: 'double' },
  pow: { args: ['double', 'double'], returns: 'double' },
});

console.log(libm.symbols.cos(0.0)); // 1.0
console.log(libm.symbols.pow(2.0, 8.0)); // 256.0
libm.close();
```

---

### 2. C Struct Yapıları ve Bellek Hizalaması (Struct Layout & Alignment)

Standart C ABI hizalama (alignment) ve dolgu (padding) kurallarına tam uyumlu struct tanımları:

```typescript
import { defineStruct } from '@geastack/ffi';

const UserProfile = defineStruct('UserProfile', {
  id: 'uint32',
  age: 'uint8',
  balance: 'double',
});

// Bellek ayır ve alanları doldur
const user = UserProfile.alloc({
  id: 1001,
  age: 28,
  balance: 1499.50,
});

console.log(user.get('id'));      // 1001
console.log(user.get('balance')); // 1499.50

// Düz JavaScript nesnesine dönüştür
console.log(user.toObject());

// Belleği serbest bırak
user.free();
```

---

### 3. Apple (iOS & macOS) Objective-C / Swift Köprüsü

Apple SDK sınıflarını ve metotlarını (`objc_msgSend`) tip güvenli çağırın:

```typescript
import { ObjC } from '@geastack/ffi/apple';

// Objective-C sınıfını al
const UIDevice = ObjC.getClass('UIDevice');

// [UIDevice currentDevice]
const currentDevice = UIDevice.callStatic('currentDevice');

// [currentDevice systemVersion]
const systemVersion = currentDevice.call('systemVersion');
console.log('iOS Sürümü:', ObjC.fromNSString(systemVersion));

// Completion block oluşturma
const completionBlock = ObjC.createBlock((result, error) => {
  if (error) {
    console.error('Hata:', error);
  } else {
    console.log('Başarılı:', result);
  }
});
```

---

### 4. Android JNI (Java Native Interface) Köprüsü

Android platformunda Java/Kotlin sınıflarını doğrudan çağırın:

```typescript
import { JNI, JNISignature } from '@geastack/ffi/android';

// Java sınıfını bul
const Toast = JNI.findClass('android/widget/Toast');
const context = JNI.getApplicationContext();

// Toast.makeText(context, "Merhaba GeaStack!", Toast.LENGTH_SHORT).show()
const message = JNI.toJString('Merhaba GeaStack!');
const toastObj = Toast.callStaticMethod(
  'makeText',
  JNISignature.method('Landroid/widget/Toast;', 'Landroid/content/Context;', 'Ljava/lang/CharSequence;', 'I'),
  context,
  message,
  0
);

toastObj.callMethod('show', '()V');
```

---

### 5. Windows (Win32, Registry & COM / WinRT) Köprüsü

Windows masaüstü ve servis uygulamalarında Win32 DLL'lerini (`kernel32.dll`, `user32.dll`), UTF-16 (`LPCWSTR` / `wstring`) dizgileri, Windows Registry'yi ve COM nesnelerini doğrudan çağırın:

```typescript
import { Win32, WinRegistry, COM, HKEY } from '@geastack/ffi/windows';

// UTF-16LE (LPCWSTR) dizgi dönüşümü
const wideTitle = Win32.toWideString('GeaStack Windows Masaüstü');

// Registry okuma
const osName = WinRegistry.readString(
  HKEY.HKEY_LOCAL_MACHINE,
  'SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion',
  'ProductName'
);

// COM başlatma ve nesne oluşturma
COM.initialize('MTA');
const wmiLocator = COM.createInstance('{DC12A687-737F-11CF-884D-00AA004B2E24}');
```

---

### 6. Linux (POSIX, Sysfs/Procfs, ioctl & D-Bus) Köprüsü

Linux masaüstü ve gömülü Linux (Raspberry Pi vb.) sistemlerde D-Bus servislerini (`UPower`, `BlueZ`, `NetworkManager`), `/sys` çekirdek dosyalarını ve `ioctl` donanım çağrılarını kullanın:

```typescript
import { POSIX, Sysfs, DBus } from '@geastack/ffi/linux';

// /sys/class üzerinden doğrudan pil yüzdesi ve sıcaklık okuma
const batteryCap = Sysfs.readInt('/sys/class/power_supply/BAT0/capacity');

// D-Bus üzerinden UPower servisi ile iletişim
const upower = DBus.getProxy(
  'system',
  'org.freedesktop.UPower',
  '/org/freedesktop/UPower/devices/battery_BAT0',
  'org.freedesktop.UPower.Device'
);
const percentage = upower.getProperty<number>('Percentage');

// Gömülü Linux I2C/GPIO ioctl çağrısı
POSIX.ioctl(fd, 0x0703 /* I2C_SLAVE */, 0x76);
```

---

### 7. SailfishOS (Jolla / Mer / NemoMobile) Köprüsü

Linux mobil cihazlar (SailfishOS) için **MCE (`com.nokia.mce`)**, **NGFD (`libngf0` dokunsal geri bildirim)**, **DConf (Silica ambiyans ve sistem ayarları)** ve **Sailjail / Jolla Harbour** uyumluluk araçlarını kullanın:

```typescript
import { MCE, NGFD, DConf, Sailjail } from '@geastack/ffi/sailfishos';

// MCE üzerinden ekran ve pil durumunu sorgula, ekran kapanmasını (blanking) engelle
console.log('Ekran:', MCE.getDisplayStatus(), 'Pil:', MCE.getBatteryLevel());
MCE.setPreventBlanking(true);

// Silica Pulley Menu dokunsal titreşim (haptic feedback) tetikle
const eventId = NGFD.play('pulley_highlight');

// Silica Ambiyans (tema) vurgu rengini DConf'tan oku
const highlightColor = DConf.read<string>('/desktop/jolla/theme/color/highlight');

// Sailjail (.desktop) izin bloğu üret
const desktopPerms = Sailjail.generateDesktopSection({
  organizationName: 'com.geastack',
  applicationName: 'harbour-geaapp',
  permissions: ['Internet', 'Audio', 'Notifications', 'KeepAlive'],
});
```

---

### 8. Mikrodenetleyiciler ve AOT (ESP32, RP2350, geaos)

Dinamik kütüphane desteği olmayan gömülü cihazlarda sıfır ek yükle çalışan statik sembol tablosu:

#### C++ Donanım Sürücüsü Tarafı:
```cpp
#include "gea/ffi/gea_ffi.h"

int bme280_read_temperature() {
    return 24;
}

// Sembolü GeaStack FFI tablosuna kaydet
GEA_FFI_REGISTER_FUNCTION("bme280_read_temp", (void*)&bme280_read_temperature);
```

#### TypeScript Tarafı:
```typescript
import { NativeRegistry } from '@geastack/ffi/embedded';

if (NativeRegistry.has('bme280_read_temp')) {
  const temp = NativeRegistry.call<number>('bme280_read_temp');
  console.log('Sıcaklık:', temp, '°C');
}
```

---

### 9. Otomatik C / Obj-C++ / JNI / Win32 / Linux / SailfishOS Başlık ve Bağlayıcı Üretici (Codegen)

TypeScript FFI tanımlarınızdan otomatik olarak native başlık (`.h`), Objective-C++ (`.mm`), JNI (`.cpp`), Windows (`.cpp`), Linux (`.cpp`) ve SailfishOS (`.cpp`) kodları üretin:

```typescript
import {
  generateCHeader,
  generateAppleObjCpp,
  generateAndroidJni,
  generateWindowsBridge,
  generateLinuxBridge,
  generateSailfishBridge,
  defineStruct,
} from '@geastack/ffi/codegen';

const GeoPoint = defineStruct('GeoPoint', {
  latitude: 'double',
  longitude: 'double',
});

// C Header (.h) üret
const headerCode = generateCHeader({
  moduleName: 'gea_location',
  structs: { GeoPoint },
  functions: {
    get_current_location: { args: [], returns: GeoPoint },
  },
});
```

---

## 🛠️ GeaStack Entegrasyonu (`gea-plugin.json`)

Paketinizde `@geastack/ffi` kullanırken `gea-plugin.json` manifesti sayesinde `@geastack/cli` ve `@geastack/compiler` yerel derleme sürecini otomatik yönetir:

```json
{
  "name": "@geastack/firebase-app-check",
  "version": "1.0.0",
  "dependencies": {
    "@geastack/ffi": "^0.1.0"
  },
  "targets": {
    "ios": {
      "frameworks": ["FirebaseAppCheck"],
      "cpp_sources": ["src/native/apple_bridge.mm"]
    },
    "android": {
      "gradle_dependencies": [
        "com.google.firebase:firebase-appcheck-playintegrity:18.0.0"
      ],
      "cpp_sources": ["src/native/android_jni.cpp"]
    }
  }
}
```

---

## 📂 Proje Yapısı

```
@geastack:ffi/
├── include/gea/ffi/             # C/C++ Header dosyaları
│   ├── gea_ffi.h                # Ana şemsiye header
│   ├── gea_ffi_types.h          # Primitif ve varyant tipler
│   ├── gea_ffi_registry.h       # Gömülü/AOT statik kayıt tablosu
│   ├── gea_ffi_apple.h          # Apple Obj-C runtime köprüsü
│   ├── gea_ffi_android.h        # Android JNI köprüsü
│   ├── gea_ffi_windows.h        # Windows Win32 / UTF-16 / COM köprüsü
│   ├── gea_ffi_linux.h          # Linux POSIX / sysfs / ioctl köprüsü
│   └── gea_ffi_sailfishos.h     # SailfishOS (Jolla / NemoMobile) köprüsü
├── src/
│   ├── index.ts                 # Ana TypeScript export noktası
│   ├── types.ts                 # Tip tanımları ve boyut haritaları
│   ├── memory.ts                # Pointer ve ham bellek yönetimi (UTF-8 & UTF-16LE)
│   ├── struct.ts                # C struct hizalama ve serileştirme
│   ├── library.ts               # Dinamik kütüphane yükleyici (.dll, .so, .dylib)
│   ├── apple/index.ts           # Apple Objective-C / Swift köprüsü
│   ├── android/index.ts         # Android JNI köprüsü
│   ├── windows/index.ts         # Windows Win32, Registry ve COM köprüsü
│   ├── linux/index.ts           # Linux POSIX, Sysfs, ioctl ve D-Bus köprüsü
│   ├── sailfishos/index.ts      # SailfishOS MCE, NGFD, DConf ve Sailjail köprüsü
│   ├── embedded/index.ts        # Gömülü statik sembol tablosu
│   ├── codegen/index.ts         # Native başlık ve bağlayıcı üretici
│   ├── plugin/index.ts          # @geastack/compiler eklentisi
│   └── native/                  # C++ ve Obj-C++ kaynak dosyaları
│       ├── gea_ffi_core.cpp
│       ├── gea_ffi_apple.mm
│       ├── gea_ffi_android.cpp
│       ├── gea_ffi_windows.cpp
│       ├── gea_ffi_linux.cpp
│       ├── gea_ffi_sailfishos.cpp
│       ├── gea_ffi_embedded.cpp
│       └── CMakeLists.txt
├── examples/
│   ├── firebase-app-check/      # Örnek: iOS & Android Firebase AppCheck paketi
│   ├── sqlite-c-ffi/            # Örnek: C SQLite kütüphanesi çağrısı
│   └── esp32-sensor-driver/     # Örnek: ESP32 I2C sensör sürücüsü
├── test/                        # Tam kapsamlı test paketi
├── gea-plugin.json              # GeaStack CLI manifesti
├── package.json
└── tsconfig.json
```

---

## 🧪 Testleri Çalıştırma

```bash
npm run build
npm test
```

Tüm testler `node:test` ile anında ve harici bağımlılık gerektirmeden koşar.

---

## 📄 Lisans

Apache-2.0 - Açık kaynak ve GeaStack ekosistemi ile tam uyumlu.
