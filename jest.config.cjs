const base = require('@orchestrator-ui/jest-config/jest-base.config.js');
const nextJest = require('next/jest');

const createJestConfig = nextJest({
    // Provide the path to your Next.js app to load next.config.js and .env files in your test environment
    dir: './',
});

const customJestConfig = {
    ...base,
    displayName: 'Wfo-UI Tests',
};

// Packages that ship ESM only and must be transformed: the library, EUI's uuid
// and the next-intl stack (mirrors esmDependencies in @orchestrator-ui/jest-config).
const esmDependencies = [
    '@orchestrator-ui/orchestrator-ui-components',
    'uuid',
    'next-intl',
    'use-intl',
    'intl-messageformat',
    '@formatjs/.*',
    '@apidevtools/json-schema-ref-parser',
];

// next/jest only appends to transformIgnorePatterns, and a file matching any
// pattern is skipped, so the list is replaced afterwards with a single one.
module.exports = async () => {
    const config = await createJestConfig(customJestConfig)();

    config.transformIgnorePatterns = [
        `/node_modules/(?!(${esmDependencies.join('|')})/)`,
        '^.+\\.module\\.(css|sass|scss)$',
    ];

    return config;
};
