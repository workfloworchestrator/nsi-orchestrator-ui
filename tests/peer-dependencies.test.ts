import fs from 'fs';
import path from 'path';
import semver from 'semver';

// This repo is a thin wrapper, so app and libraries must share one copy of each peer.
// Two copies of a context provider (next-intl, react) type-check and build, then throw
// in the browser because each copy has its own React context.

// Each entry is a resolution chain from the app root; pydantic-forms is only
// reachable through orchestrator-ui-components, which nests it.
const LIBRARIES = [
    ['@orchestrator-ui/orchestrator-ui-components'],
    ['@orchestrator-ui/orchestrator-ui-components', 'pydantic-forms'],
];

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

const manifestAt = (root: string) =>
    JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

const resolveChain = ([first, ...rest]: string[]): string =>
    rest.reduce((from, name) => packageRoot(name, from), packageRoot(first));

const cases = LIBRARIES.flatMap((chain) => {
    const libraryRoot = resolveChain(chain);
    const peers: Record<string, string> =
        manifestAt(libraryRoot).peerDependencies ?? {};

    return Object.entries(peers).map(([name, range]) => ({
        library: chain[chain.length - 1],
        name,
        range,
        appRoot: packageRoot(name),
        libraryCopy: packageRoot(name, libraryRoot),
    }));
});

describe('library peer dependencies', () => {
    it.each(LIBRARIES)('%s declares peers to check', (...chain) => {
        expect(
            cases.filter((c) => c.library === chain[chain.length - 1]),
        ).not.toHaveLength(0);
    });

    it.each(cases)(
        '$library: $name resolves to the copy the app uses',
        ({ appRoot, libraryCopy }) => {
            expect(libraryCopy).toBe(appRoot);
        },
    );

    it.each(cases)('$library: $name satisfies $range', ({ range, appRoot }) => {
        expect(semver.satisfies(manifestAt(appRoot).version, range)).toBe(true);
    });
});
