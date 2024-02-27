import { deepEqual } from './fast-deep-equal.js'

const NEW_LINE_REGEX = /\n/g
const OBJ_TO_STRING = Object.prototype.toString
const AT_REGEX = new RegExp(
    // non-capturing group for 'at '
    '^(?:[^\\s]*\\s*\\bat\\s+)' +
    // captures function call description
    '(?:(.*)\\s+\\()?' +
    // captures file path plus line no
    '((?:\\/|[a-zA-Z]:\\\\)[^:\\)]+:(\\d+)(?::(\\d+))?)\\)$'
)

export class TestRunner {
    report:(line:string)=>void
    tests:Test[]  // eslint-disable-line
    onlyTests:Test[]  // eslint-disable-line
    scheduled:boolean
    _id:number
    completed:boolean
    rethrowExceptions:boolean
    strict:boolean
    _onFinishCallback:undefined|(({ total, success, fail })=>void)

    constructor (report?:(line:string)=>void) {
        this.report = report || printLine

        /** @type {Test[]} */
        this.tests = []
        /** @type {Test[]} */
        this.onlyTests = []
        /** @type {boolean} */
        this.scheduled = false
        /** @type {number} */
        this._id = 0
        /** @type {boolean} */
        this.completed = false
        /** @type {boolean} */
        this.rethrowExceptions = true
        /** @type {boolean} */
        this.strict = false
        /** @type {function | void} */
        this._onFinishCallback = undefined
    }

    /**
   * @returns {string}
   */
    nextId () {
        return String(++this._id)
    }

    /**
   * @param {string} name
   * @param {TestFn} fn
   * @param {boolean} only
   * @returns {void}
   */
    add (name, fn, only) {
        if (this.completed) {
            // TODO: calling add() after run()
            throw new Error('Cannot add() a test case after tests completed.')
        }
        const t = new Test(name, fn, this)
        const arr = only ? this.onlyTests : this.tests
        arr.push(t)
        if (!this.scheduled) {
            this.scheduled = true
            setTimeout(() => {
                const promise = this.run()
                if (this.rethrowExceptions) {
                    promise.then(null, rethrowImmediate)
                }
            }, 0)
        }
    }

    /**
   * @returns {Promise<void>}
   */
    async run () {
        const ts = this.onlyTests.length > 0
            ? this.onlyTests
            : this.tests

        this.report('TAP version 13')

        let total:number = 0
        let success:number = 0
        let fail:number = 0

        for (const test of ts) {
            // TODO: parallel execution
            const result = await test.run()

            total += result.fail + result.pass
            success += result.pass
            fail += result.fail
        }

        this.completed = true

        this.report('')
        this.report(`1..${total}`)
        this.report(`# tests ${total}`)
        this.report(`# pass  ${success}`)
        if (fail) {
            this.report(`# fail  ${fail}`)
        } else {
            this.report('')
            this.report('# ok')
        }

        if (this._onFinishCallback) {
            this._onFinishCallback({ total, success, fail })
        } else {
            if (typeof process !== 'undefined' &&
        typeof process.exit === 'function' &&
        typeof process.on === 'function' &&
        Reflect.get(process, 'browser') !== true
            ) {
                process.on('exit', function (code) {
                    // let the process exit cleanly.
                    if (typeof code === 'number' && code !== 0) {
                        return
                    }

                    if (fail) {
                        process.exit(1)
                    }
                })
            }
        }
    }

    /**
   * @param {(result: { total: number, success: number, fail: number }) => void} callback
   * @returns {void}
   */
    onFinish (callback) {
        if (typeof callback === 'function') {
            this._onFinishCallback = callback
        } else throw new Error('onFinish() expects a function')
    }
}

let CACHED_FILE:string

type TestFn = (t:Test) => (void | Promise<void>)  // eslint-disable-line

export class Test {
    name:string
    _planned:null|number
    _actual:null|number
    fn:TestFn
    runner:TestRunner|undefined
    _result:{ pass:number, fail:number }
    done:boolean
    strict:boolean

    /**
   * @constructor
   * @param {string} name
   * @param {TestFn} fn
   * @param {TestRunner} runner
   */
    constructor (name:string, fn:TestFn, runner?:TestRunner) {
        this.name = name
        this._planned = null
        this._actual = null
        this.fn = fn
        this.runner = runner
        this._result = {
            pass: 0,
            fail: 0
        }
        this.done = false
        this.strict = !!(runner && runner.strict)
    }

    comment (msg:string):void {
        this.runner && this.runner.report('# ' + msg)
    }

    /**
     * Plan the number of assertions.
     *
     * @param {number} n
     * @returns {void}
     */
    plan (n:number):void {
        this._planned = n
    }

    deepEqual<T> (actual:T, expected:T, msg?:string):void {
        if (this.strict && !msg) throw new Error('tapzero msg required')
        this._assert(
            deepEqual(actual, expected), actual, expected,
            msg || 'should be equivalent', 'deepEqual'
        )
    }

    notDeepEqual<T> (actual:T, expected:T, msg?:string):void {
        if (this.strict && !msg) throw new Error('tapzero msg required')
        this._assert(
            !deepEqual(actual, expected), actual, expected,
            msg || 'should not be equivalent', 'notDeepEqual'
        )
    }

    equal<T> (actual:T, expected:T, msg?:string):void {
        if (this.strict && !msg) throw new Error('tapzero msg required')
        this._assert(
            // eslint-disable-next-line eqeqeq
            actual == expected, actual, expected,
            msg || 'should be equal', 'equal'
        )
    }

    notEqual (actual:unknown, expected:unknown, msg?:string) {
        if (this.strict && !msg) throw new Error('tapzero msg required')
        this._assert(
            // eslint-disable-next-line eqeqeq
            actual != expected, actual, expected,
            msg || 'should not be equal', 'notEqual'
        )
    }

    fail (msg?:string):void {
        if (this.strict && !msg) throw new Error('tapzero msg required')
        this._assert(
            false, 'fail called', 'fail not called',
            msg || 'fail called', 'fail'
        )
    }

    ok (actual:unknown, msg?:string):void {
        if (this.strict && !msg) throw new Error('tapzero msg required')
        this._assert(
            !!actual, actual, 'truthy value',
            msg || 'should be truthy', 'ok'
        )
    }

    ifError (err:Error|null|undefined, msg?:string):void {
        if (this.strict && !msg) throw new Error('tapzero msg required')
        this._assert(
            !err, err, 'no error', msg || String(err), 'ifError'
        )
    }

    throws (fn:Function, expected:RegExp|any, message?:string):void {
        if (typeof expected === 'string') {
            message = expected
            expected = undefined
        }

        if (this.strict && !message) throw new Error('tapzero msg required')

        let caught:Error|null = null
        try {
            fn()
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            caught = (err as Error)
        }

        let pass = !!caught

        if (expected instanceof RegExp) {
            pass = !!(caught && expected.test(caught.message))
        } else if (expected) {
            throw new Error(`t.throws() not implemented for expected: ${typeof expected}`)
        }

        this._assert(
            pass, caught, expected, message || 'show throw', 'throws'
        )
    }

    _assert (
        pass:boolean, actual:unknown, expected:unknown,
        description:string, operator:string
    ):void {
        if (this.done) {
            throw new Error(
                'assertion occurred after test was finished: ' + this.name
            )
        }

        if (this._planned !== null) {
            this._actual = ((this._actual || 0) + 1)

            if (this._actual > this._planned) {
                throw new Error(`More tests than planned in TEST *${this.name}*`)
            }
        }

        const report = this.runner && this.runner.report

        if (report) {
            const prefix = pass ? 'ok' : 'not ok'
            const id = this.runner && this.runner.nextId()
            report(`${prefix} ${id} ${description}`)

            if (pass) {
                this._result.pass++
                return
            }

            const atErr = new Error(description)
            let err = atErr
            if (actual && OBJ_TO_STRING.call(actual) === '[object Error]') {
                err = (actual as Error)
                actual = err.message
            }

            this._result.fail++
            report('  ---')
            report(`    operator: ${operator}`)

            let ex = toJSON(expected)
            let ac = toJSON(actual)
            if (Math.max(ex.length, ac.length) > 65) {
                ex = ex.replace(NEW_LINE_REGEX, '\n      ')
                ac = ac.replace(NEW_LINE_REGEX, '\n      ')

                report(`    expected: |-\n      ${ex}`)
                report(`    actual:   |-\n      ${ac}`)
            } else {
                report(`    expected: ${ex}`)
                report(`    actual:   ${ac}`)
            }

            const at = findAtLineFromError(atErr)
            if (at) {
                report(`    at:       ${at}`)
            }

            report('    stack:    |-')
            const st = (err.stack || '').split('\n')
            for (const line of st) {
                report(`      ${line}`)
            }

            report('  ...')
        }
    }

    async run ():Promise<{ pass:number, fail:number }> {
        this.runner && this.runner.report('# ' + this.name)
        const maybeP = this.fn(this)
        if (maybeP && typeof maybeP.then === 'function') {
            await maybeP
        }

        this.done = true

        if (this._planned !== null) {
            if (this._planned > (this._actual || 0)) {
                throw new Error(`Test ended before the planned number
          planned: ${this._planned}
          actual: ${this._actual || 0}
          `
                )
            }
        }

        return this._result
    }
}

function getTapZeroFileName ():string {
    if (CACHED_FILE) return CACHED_FILE

    const e = new Error('temp')
    const lines = (e.stack || '').split('\n')

    for (const line of lines) {
        const m = AT_REGEX.exec(line)
        if (!m) {
            continue
        }

        let fileName = m[2]
        if (m[4] && fileName.endsWith(`:${m[4]}`)) {
            fileName = fileName.slice(0, fileName.length - m[4].length - 1)
        }
        if (m[3] && fileName.endsWith(`:${m[3]}`)) {
            fileName = fileName.slice(0, fileName.length - m[3].length - 1)
        }

        CACHED_FILE = fileName
        break
    }

    return CACHED_FILE || ''
}

function findAtLineFromError (err:Error):string {
    const lines = (err.stack || '').split('\n')
    const dir = getTapZeroFileName()

    for (const line of lines) {
        const m = AT_REGEX.exec(line)
        if (!m) {
            continue
        }

        if (m[2].slice(0, dir.length) === dir) {
            continue
        }

        return `${m[1] || '<anonymous>'} (${m[2]})`
    }
    return ''
}

function printLine (line:string):void {
    console.log(line)
}

export const GLOBAL_TEST_RUNNER = new TestRunner()

export function only (name:string, fn:TestFn):void {
    if (!fn) return
    GLOBAL_TEST_RUNNER.add(name, fn, true)
}

export function skip (_name:string, _fn:TestFn):void {}  // eslint-disable-line

export function setStrict (strict:boolean):void {
    GLOBAL_TEST_RUNNER.strict = strict
}

export function test (name:string, fn?:TestFn):void {
    if (!fn) return
    GLOBAL_TEST_RUNNER.add(name, fn, false)
}
test.only = only
test.skip = skip

/**
 * @param {Error} err
 * @returns {void}
 */
function rethrowImmediate (err:Error):void {
    setTimeout(rethrow, 0)

    function rethrow ():void { throw err }
}

/**
 * JSON.stringify `thing` while preserving `undefined` values in
 * the output.
 *
 * @param {unknown} thing
 * @returns {string}
 */
function toJSON (thing:unknown):string {
    /** @type {(_k: string, v: unknown) => unknown} */
    const replacer = (_k, v) => (v === undefined) ? '_tz_undefined_tz_' : v

    const json = JSON.stringify(thing, replacer, '  ') || 'undefined'
    return json.replace(/"_tz_undefined_tz_"/g, 'undefined')
}
