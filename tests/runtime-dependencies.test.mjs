import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRuntimeDependencies } from '../src/runtime-dependencies.js';

test('필수 런타임 연결이 모두 있으면 원본 연결 객체를 반환한다', () => {
    const dependencies = { render: () => {}, layerGroup: {} };
    const result = validateRuntimeDependencies('test-ui', dependencies, {
        render: 'function',
        layerGroup: 'object'
    });

    assert.equal(result, dependencies);
});

test('누락되거나 형식이 잘못된 연결은 모듈 이름과 함께 즉시 알린다', () => {
    assert.throws(
        () => validateRuntimeDependencies('test-ui', { render: null }, {
            render: 'function',
            save: 'function'
        }),
        error => {
            assert.match(error.message, /test-ui/);
            assert.match(error.message, /render \(function\)/);
            assert.match(error.message, /save \(function\)/);
            return true;
        }
    );
});
