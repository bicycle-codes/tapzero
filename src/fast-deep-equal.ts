// Copied from fast-deep-equal@3.1.1.

export function deepEqual (a, b) {
    if (a === b) return true

    if (a && b && typeof a === 'object' && typeof b === 'object') {
        if (a.constructor !== b.constructor) return false

        let length, i
        if (Array.isArray(a)) {
            length = a.length
            if (length !== b.length) return false
            for (i = length; i-- !== 0;) { if (!deepEqual(a[i], b[i])) return false }
            return true
        }

        if (a.constructor === RegExp) return a.source === b.source && a.flags === b.flags
        if (a.valueOf !== Object.prototype.valueOf) return a.valueOf() === b.valueOf()
        if (a.toString !== Object.prototype.toString) return a.toString() === b.toString()

        const keys = Object.keys(a)
        length = keys.length
        if (length !== Object.keys(b).length) return false

        for (i = length; i-- !== 0;) { if (!Object.prototype.hasOwnProperty.call(b, keys[i])) return false }

        for (i = length; i-- !== 0;) {
            const key = keys[i]

            if (!deepEqual(a[key], b[key])) return false
        }

        return true
    }

    return a !== a && b !== b  // eslint-disable-line
};
