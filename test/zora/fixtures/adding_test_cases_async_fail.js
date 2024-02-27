import { test } from '../../../src/index.js'

test('tester sync', async t => {
    t.ok(true, 'assert1')
})

setTimeout(() => {
    test('tester 2', async t => {
        t.ok(true, 'assert3')
    })
}, 10)
