import { test } from '../../../src/index.js'

test('Execute fewer tests than planned', t => {
    t.plan(3)
    t.ok('example')
    t.ok('example 2')
})
