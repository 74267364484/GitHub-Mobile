/* Compatibility for Android System WebView 83 (Android 11 stock) and older.
   marked@15 uses Array.prototype.at, which landed in Chrome 92.
   Cast the prototypes because the TS lib target is ES2020 (no typings for these APIs). */

const arrayProto = Array.prototype as any
if (!arrayProto.at) {
  Object.defineProperty(arrayProto, 'at', {
    value: function at(this: any[], index: number) {
      const length = this.length >>> 0
      let k = Math.trunc(Number(index)) || 0
      if (k < 0) k += length
      return k >= 0 && k < length ? this[k] : undefined
    },
    writable: true,
    configurable: true,
  })
}

const stringProto = String.prototype as any
if (!stringProto.at) {
  Object.defineProperty(stringProto, 'at', {
    value: function at(this: string, index: number) {
      const chars = Array.from(String(this))
      let k = Math.trunc(Number(index)) || 0
      if (k < 0) k += chars.length
      return k >= 0 && k < chars.length ? chars[k] : undefined
    },
    writable: true,
    configurable: true,
  })
}

if (!stringProto.replaceAll) {
  Object.defineProperty(stringProto, 'replaceAll', {
    value: function replaceAll(this: string, search: string | RegExp, replacement: string | ((...args: any[]) => string)) {
      if (search instanceof RegExp) return this.replace(search, replacement as any)
      const target = String(this)
      const needle = String(search)
      if (!needle) return target
      if (typeof replacement === 'function') {
        let out = ''
        let from = 0
        let at = target.indexOf(needle)
        while (at !== -1) {
          out += target.slice(from, at) + replacement(needle, at, target)
          from = at + needle.length
          at = target.indexOf(needle, from)
        }
        return out + target.slice(from)
      }
      return target.split(needle).join(String(replacement))
    },
    writable: true,
    configurable: true,
  })
}

const objectCtor = Object as any
if (!objectCtor.hasOwn) {
  Object.defineProperty(objectCtor, 'hasOwn', {
    value: function hasOwn(obj: object, key: PropertyKey) {
      return Object.prototype.hasOwnProperty.call(obj, key)
    },
    writable: true,
    configurable: true,
  })
}

export {}
