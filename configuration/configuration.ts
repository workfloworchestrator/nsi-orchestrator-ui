import {
    Environment,
    OrchestratorConfig,
    getEnvironmentVariables,
} from '@orchestrator-ui/orchestrator-ui-components';

const isTrue = (value?: string) => value?.toLowerCase() === 'true';

export const getInitialOrchestratorConfig = (): OrchestratorConfig => {
    const {
        USE_THEME_TOGGLE,
        ENVIRONMENT_NAME,
        ORCHESTRATOR_API_HOST,
        ORCHESTRATOR_API_PATH,
        ORCHESTRATOR_GRAPHQL_HOST,
        ORCHESTRATOR_GRAPHQL_PATH,
        ORCHESTRATOR_WEBSOCKET_URL,
        USE_WEB_SOCKETS,
        WORKFLOW_INFORMATION_LINK_URL,
        SHOW_WORKFLOW_INFORMATION_LINK,
        SHOW_WORKFLOW_USER_GUIDE,
        EXPAND_WORKFLOW_USER_GUIDE_ON_START,
        SHOW_BETA_WORKFLOW_LAYOUT_TOGGLE,
        OAUTH2_ACTIVE,
        ENABLE_SUPPORT_MENU_ITEM,
        SUPPORT_MENU_ITEM_URL,
        ENABLE_AO_STACK_STATUS,
        AO_STACK_STATUS_URL,
        START_WORKFLOW_FILTERS,
    } = getEnvironmentVariables([
        'USE_THEME_TOGGLE',
        'ENVIRONMENT_NAME',
        'ORCHESTRATOR_API_HOST',
        'ORCHESTRATOR_API_PATH',
        'ORCHESTRATOR_GRAPHQL_HOST',
        'ORCHESTRATOR_GRAPHQL_PATH',
        'ORCHESTRATOR_WEBSOCKET_URL',
        'USE_WEB_SOCKETS',
        'WORKFLOW_INFORMATION_LINK_URL',
        'SHOW_WORKFLOW_INFORMATION_LINK',
        'SHOW_WORKFLOW_USER_GUIDE',
        'EXPAND_WORKFLOW_USER_GUIDE_ON_START',
        'SHOW_BETA_WORKFLOW_LAYOUT_TOGGLE',
        'OAUTH2_ACTIVE',
        'ENABLE_SUPPORT_MENU_ITEM',
        'SUPPORT_MENU_ITEM_URL',
        'ENABLE_AO_STACK_STATUS',
        'AO_STACK_STATUS_URL',
        'START_WORKFLOW_FILTERS',
    ]);

    const graphqlEndpointCore = `${ORCHESTRATOR_GRAPHQL_HOST}${ORCHESTRATOR_GRAPHQL_PATH}`;
    const orchestratorApiBaseUrl = `${ORCHESTRATOR_API_HOST}${ORCHESTRATOR_API_PATH}`;
    const startWorkflowFilters = START_WORKFLOW_FILTERS?.trim()
        ? START_WORKFLOW_FILTERS.replaceAll('_', ' ').split('|')
        : undefined;

    return {
        orchestratorApiBaseUrl,
        graphqlEndpointCore,
        environmentName: ENVIRONMENT_NAME || Environment.DEVELOPMENT,
        orchestratorWebsocketUrl: ORCHESTRATOR_WEBSOCKET_URL,
        authActive: OAUTH2_ACTIVE?.toLowerCase() != 'false',
        useWebSockets: isTrue(USE_WEB_SOCKETS),
        useThemeToggle: isTrue(USE_THEME_TOGGLE),
        workflowInformationLinkUrl: WORKFLOW_INFORMATION_LINK_URL,
        showWorkflowInformationLink: isTrue(SHOW_WORKFLOW_INFORMATION_LINK),
        showWorkflowUserGuide: isTrue(SHOW_WORKFLOW_USER_GUIDE),
        expandWorkflowUserGuideOnStart: isTrue(
            EXPAND_WORKFLOW_USER_GUIDE_ON_START,
        ),
        showBetaWorkflowLayoutToggle: isTrue(SHOW_BETA_WORKFLOW_LAYOUT_TOGGLE),
        enableSupportMenuItem: isTrue(ENABLE_SUPPORT_MENU_ITEM),
        supportMenuItemUrl: SUPPORT_MENU_ITEM_URL,
        enableAoStackStatus: isTrue(ENABLE_AO_STACK_STATUS),
        aoStackStatusUrl: AO_STACK_STATUS_URL,
        startWorkflowFilters,
    };
};
