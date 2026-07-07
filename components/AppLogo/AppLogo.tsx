import React, { ReactElement } from 'react';

import { EuiText } from '@elastic/eui';
import { useOrchestratorTheme } from '@orchestrator-ui/orchestrator-ui-components';

import { getAppLogoStyles } from '@/components/AppLogo/styles';

// Per-deployment branding, driven by env vars threaded in from _app:
//   APP_LOGO_URL — a logo image, shown beside the built-in Workflow Orchestrator icon.
//   APP_NAME     — the wordmark text (also the page title, wired in _app); whitespace splits it
//                  into stacked lines, matching the default "Workflow" / "Orchestrator" look.
// Both are optional and render next to the library's fixed header icon (never replacing it):
//   neither          → the default "Workflow" / "Orchestrator" wordmark
//   APP_NAME only    → the custom text
//   APP_LOGO_URL only→ the custom logo image (no text)
//   both             → the custom logo image followed by the custom text
const DEFAULT_WORDMARK = ['Workflow', 'Orchestrator'];

type AppLogoProps = {
    logoUrl?: string;
    appName?: string;
};

// Defined at module scope so its component identity is stable across renders. Defining it inside
// getAppLogo gave it a fresh type on every navigation, remounting the <img> and flickering the bar.
const AppLogo = ({ logoUrl, appName }: AppLogoProps): ReactElement => {
    const { theme } = useOrchestratorTheme();
    const { logoContainerStyle, logoStyle, logoImageStyle } =
        getAppLogoStyles();

    // getEnvironmentVariables yields "" for unset vars, so treat empty/whitespace as absent.
    const name = appName?.trim();
    const wordmark = name
        ? name.split(/\s+/).filter(Boolean)
        : logoUrl
          ? []
          : DEFAULT_WORDMARK;

    return (
        <div className={logoContainerStyle}>
            {logoUrl && (
                <img
                    className={logoImageStyle}
                    src={logoUrl}
                    alt={name || 'logo'}
                />
            )}
            {wordmark.length > 0 && (
                <div className={logoStyle}>
                    {wordmark.map((line, index) => (
                        <EuiText
                            key={index}
                            color={theme.colors.textGhost}
                            size="xs"
                        >
                            {line}
                        </EuiText>
                    ))}
                </div>
            )}
        </div>
    );
};

export function getAppLogo(logoUrl?: string, appName?: string): ReactElement {
    return <AppLogo logoUrl={logoUrl} appName={appName} />;
}
