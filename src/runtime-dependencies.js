/**
 * 진입점에서 주입하는 모듈 연결값을 시작 시점에 검증합니다.
 * 연결 누락을 실제 기능을 누를 때까지 숨기지 않고 즉시 드러내는 목적입니다.
 */
export function validateRuntimeDependencies(scope, dependencies, requirements) {
    if (!dependencies || typeof dependencies !== 'object') {
        throw new TypeError(`${scope}: runtime dependencies must be an object.`);
    }

    const invalidDependencies = Object.entries(requirements).flatMap(([name, expectedType]) => {
        const value = dependencies[name];
        return typeof value === expectedType ? [] : [`${name} (${expectedType})`];
    });

    if (invalidDependencies.length > 0) {
        throw new TypeError(`${scope}: invalid runtime dependencies: ${invalidDependencies.join(', ')}`);
    }

    return dependencies;
}
