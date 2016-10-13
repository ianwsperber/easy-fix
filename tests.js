/* globals describe, beforeEach, afterEach, it */
'use strict';
/* eslint-disable max-nested-callbacks */

const sinon = require('sinon');
const domain = require('domain');
const expect = require('chai').expect;
const easyFix = require('./index');
const config = require('./test-config');

const ASYNC_DELAY = 1000;
const METHOD_TO_FIX = 'incStateNextTick';

const thingToTest = {
  state: 0,
  [METHOD_TO_FIX]: (stateArg, callback) => {
    thingToTest.state = stateArg.val;
    process.nextTick(() => {
      thingToTest.state += 1;
      callback(null, thingToTest.state);
    });
  },
  incStateAfterThreeSeconds: (stateArg, callback) => {
    thingToTest.state = stateArg.val;
    setTimeout(() => {
      thingToTest.state += 1;
      callback(null, thingToTest.state);
    }, ASYNC_DELAY);
  },
  resetState: () => {
    thingToTest.state = 0;
  }
};

const runSharedTests = (expectTargetFnCalls, options) => {
  let easyFixStub;

  describe('common tests', () => {
    beforeEach(() => {
      thingToTest.resetState();
      easyFixStub = easyFix.wrapAsyncMethod(
        thingToTest, METHOD_TO_FIX, options.easyFixOptions);
    });

    afterEach(() => {
      easyFixStub.restore();
    });

    it('falls back onto wrapped method', (done) => {
      thingToTest[METHOD_TO_FIX]({ val: 0 }, (err, state) => {
        expect(state).to.equal(1);
        const expectedTargetState = expectTargetFnCalls ? 1 : 0;
        expect(thingToTest.state).to.equal(expectedTargetState);
        expect(easyFixStub.callCount).to.equal(1);
        done();
      });
    });

    it('works with mulitple calls', (done) => {
      thingToTest[METHOD_TO_FIX]({ val: 0 }, (firstErr, firstState) => {
        thingToTest[METHOD_TO_FIX]({ val: firstState }, (secondErr, secondState) => {
          expect(secondState).to.equal(2);
          const expectedTargetState = expectTargetFnCalls ? 2 : 0;
          expect(thingToTest.state).to.equal(expectedTargetState);
          expect(easyFixStub.callCount).to.equal(2);
          done();
        });
      });
    });

    it('works with circular references', (done) => {
      const testObj = { val: 0 };
      testObj.circ = testObj;
      thingToTest[METHOD_TO_FIX](testObj, (err, state) => {
        expect(state).to.equal(1);
        const expectedTargetState = expectTargetFnCalls ? 1 : 0;
        expect(thingToTest.state).to.equal(expectedTargetState);
        expect(easyFixStub.callCount).to.equal(1);
        done();
      });
    });
  });
};

describe('wrapAsyncMethod (live mode)', () => {
  runSharedTests(true, {
    easyFixOptions: {
      mode: 'live',
      sinon,
      dir: 'tmp'
    }
  });
});

describe('wrapAsyncMethod (capture mode)', () => {
  runSharedTests(true, {
    easyFixOptions: {
      mode: 'capture',
      sinon,
      dir: 'tmp'
    }
  });
});

describe('wrapAsyncMethod (replay mode)', () => {
  const easyFixOptions = {
    mode: 'replay',
    sinon,
    dir: 'tmp'
  };

  runSharedTests(false, { easyFixOptions });

  describe('if no matching mock data is found', () => {
    let easyFixStub;

    beforeEach(() => {
      thingToTest.resetState();
      easyFixStub = easyFix.wrapAsyncMethod(
        thingToTest, METHOD_TO_FIX, easyFixOptions);
    });
    afterEach(() => {
      easyFixStub.restore();
    });

    const fnWithoutMocks = (cb) => {
      thingToTest[METHOD_TO_FIX]({
        foo: 'bar'
      }, () => { cb(new Error('Failed to throw')); });
    };

    it('should throw an error with details about the expected data', (done) => {
      const d = domain.create();
      d.on('error', (err) => {
        expect(err.message).to.eql(config.testErrorMessage);

        done();
      });
      d.run(() => {
        fnWithoutMocks(done);
      });
    });
  });
});
