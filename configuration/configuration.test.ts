import { Environment } from '@orchestrator-ui/orchestrator-ui-components';

import { getInitialOrchestratorConfig } from './configuration';

// Also pins the library's getEnvironmentVariables() contract: if it stops reading
// process.env, every value silently becomes '' and the app boots misconfigured.

const FULL_ENV: Record<string, string> = {
    ENVIRONMENT_NAME: 'STAGING',
    ORCHESTRATOR_API_HOST: 'https://api.example.net',
    ORCHESTRATOR_API_PATH: '/api',
    ORCHESTRATOR_GRAPHQL_HOST: 'https://api.example.net',
    ORCHESTRATOR_GRAPHQL_PATH: '/api/graphql',
    ORCHESTRATOR_WEBSOCKET_URL: 'wss://api.example.net/ws',
    USE_WEB_SOCKETS: 'true',
    USE_THEME_TOGGLE: 'true',
    WORKFLOW_INFORMATION_LINK_URL: 'https://docs.example.net',
    SHOW_WORKFLOW_INFORMATION_LINK: 'true',
    SHOW_WORKFLOW_USER_GUIDE: 'true',
    OAUTH2_ACTIVE: 'true',
    ENABLE_SUPPORT_MENU_ITEM: 'true',
    SUPPORT_MENU_ITEM_URL: 'https://support.example.net',
    ENABLE_AO_STACK_STATUS: 'true',
    AO_STACK_STATUS_URL: 'https://status.example.net',
    START_WORKFLOW_FILTERS: 'Create|Modify_Something|Terminate',
};

const withEnv = (overrides: Record<string, string> = {}) => {
    Object.assign(process.env, FULL_ENV, overrides);
    return getInitialOrchestratorConfig();
};

afterEach(() => {
    Object.keys(FULL_ENV).forEach((key) => delete process.env[key]);
});

describe('getInitialOrchestratorConfig', () => {
    it('maps every environment variable onto the orchestrator config', () => {
        expect(withEnv()).toEqual({
            environmentName: 'STAGING',
            orchestratorApiBaseUrl: 'https://api.example.net/api',
            graphqlEndpointCore: 'https://api.example.net/api/graphql',
            orchestratorWebsocketUrl: 'wss://api.example.net/ws',
            authActive: true,
            useWebSockets: true,
            useThemeToggle: true,
            workflowInformationLinkUrl: 'https://docs.example.net',
            showWorkflowInformationLink: true,
            showWorkflowUserGuide: true,
            enableSupportMenuItem: true,
            supportMenuItemUrl: 'https://support.example.net',
            enableAoStackStatus: true,
            aoStackStatusUrl: 'https://status.example.net',
            startWorkflowFilters: ['Create', 'Modify Something', 'Terminate'],
        });
    });

    it.each([
        ['STAGING', 'STAGING'],
        ['', Environment.DEVELOPMENT],
    ])('reads ENVIRONMENT_NAME=%p as %p', (value, expected) => {
        expect(withEnv({ ENVIRONMENT_NAME: value })).toMatchObject({
            environmentName: expected,
        });
    });

    it.each([
        ['true', true],
        ['TRUE', true],
        ['false', false],
        ['', false],
        ['yes', false],
    ])('reads SHOW_WORKFLOW_USER_GUIDE=%p as %p', (value, expected) => {
        expect(withEnv({ SHOW_WORKFLOW_USER_GUIDE: value })).toMatchObject({
            showWorkflowUserGuide: expected,
        });
    });

    // authActive is inverted: anything but "false" enables auth, so a typo fails
    // closed (login on) rather than open.
    it.each([
        ['false', false],
        ['FALSE', false],
        ['true', true],
        ['', true],
        ['flase', true],
    ])('reads OAUTH2_ACTIVE=%p as authActive %p', (value, expected) => {
        expect(withEnv({ OAUTH2_ACTIVE: value })).toMatchObject({
            authActive: expected,
        });
    });

    it.each([
        ['Create', ['Create']],
        ['Create|Terminate', ['Create', 'Terminate']],
        ['Modify_Note', ['Modify Note']],
        ['', undefined],
        ['   ', undefined],
    ])('parses START_WORKFLOW_FILTERS=%p into %p', (value, expected) => {
        expect(withEnv({ START_WORKFLOW_FILTERS: value })).toMatchObject({
            startWorkflowFilters: expected,
        });
    });
});
