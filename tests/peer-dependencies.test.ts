import fs from 'fs';
import path from 'path';
import semver from 'semver';

// This repo is a thin wrapper, so app and library must share one copy of each peer.
// Two copies of a context provider (next-intl, react) type-check and build, then throw
// in the browser because each copy has its own React context.

const LIBRARY = '@orchestrator-ui/orchestrator-ui-components';

const packageRoot = (name: string, from?: string): string => {
    const entry = require.resolve(name, from ? { paths: [from] } : undefined);
    const marker = `${path.sep}node_modules${path.sep}${name.split('/').join(path.sep)}`;
    const index = entry.lastIndexOf(marker);
    if (index < 0) {
        throw new Error(
            `Could not locate ${name} from ${from ?? 'the app root'}`,
        );
    }
    return entry.slice(0, index + marker.length);
};

const versionAt = (root: string): string =>
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
        .version;

const libraryRoot = packageRoot(LIBRARY);
const peerDependencies: Record<string, string> = JSON.parse(
    fs.readFileSync(path.join(libraryRoot, 'package.json'), 'utf8'),
).peerDependencies;

const cases = Object.entries(peerDependencies).map(([name, range]) => ({
    name,
    range,
    appRoot: packageRoot(name),
    libraryCopy: packageRoot(name, libraryRoot),
}));

describe(`${LIBRARY} peer dependencies`, () => {
    it('finds peers to check', () => {
        expect(cases.length).toBeGreaterThan(0);
    });

    it.each(cases)(
        '$name is a single copy shared with the library',
        ({ appRoot, libraryCopy }) => {
            expect(libraryCopy).toBe(appRoot);
        },
    );

    it.each(cases)('$name satisfies $range', ({ range, appRoot }) => {
        expect(semver.satisfies(versionAt(appRoot), range)).toBe(true);
    });
});
