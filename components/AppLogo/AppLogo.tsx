import React, { ReactElement } from 'react';

import { EuiText } from '@elastic/eui';
import { useOrchestratorTheme } from '@orchestrator-ui/orchestrator-ui-components';

import { getAppLogoStyles } from '@/components/AppLogo/styles';

// The generic build shows the Workflow Orchestrator wordmark. A deployment can override it with its
// own logo image by setting APP_LOGO_URL (threaded in from _app), e.g. an ANA logo.
export function getAppLogo(logoUrl?: string): ReactElement {
    const { logoStyle, logoImageStyle } = getAppLogoStyles();

    const AppLogo = () => {
        const { theme } = useOrchestratorTheme();

        if (logoUrl) {
            return <img css={logoImageStyle} src={logoUrl} alt="logo" />;
        }

        return (
            <div css={logoStyle}>
                <EuiText color={theme.colors.textGhost} size="xs">
                    Workflow
                </EuiText>
                <EuiText color={theme.colors.textGhost} size="xs">
                    Orchestrator
                </EuiText>
            </div>
        );
    };

    return <AppLogo />;
}
