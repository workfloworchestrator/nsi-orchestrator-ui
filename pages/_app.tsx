import React, { useEffect, useState } from 'react';

import _ from 'lodash';
import { SessionProvider } from 'next-auth/react';
import { NextAdapter } from 'next-query-params';
import App, { AppContext, AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { QueryParamProvider } from 'use-query-params';

import {
    EuiProvider,
    EuiSideNavItemType,
    EuiThemeColorMode,
} from '@elastic/eui';
import {
    ColorModes,
    ConfirmationDialogContextWrapper,
    OrchestratorConfig,
    OrchestratorConfigProvider,
    StoreProvider,
    WfoAuth,
    WfoErrorBoundary,
    WfoErrorMonitoring,
    WfoErrorMonitoringProvider,
    WfoLogoSpinner,
    WfoMenuItemLink,
    WfoPageTemplate,
    WfoToastsList,
    emptyOrchestratorConfig,
    getEnvironmentVariables,
    wfoThemeModifications,
} from '@orchestrator-ui/orchestrator-ui-components';

import { getAppLogo } from '@/components/AppLogo/AppLogo';
import { getInitialOrchestratorConfig } from '@/configuration';
import { TranslationsProvider } from '@/translations/translationsProvider';

import '../font/inter.css';

type AppOwnProps = {
    orchestratorConfig: OrchestratorConfig;
    appLogoUrl?: string | null;
    appName?: string | null;
};

function CustomApp({ Component, pageProps }: AppProps & AppOwnProps) {
    const router = useRouter();
    const { orchestratorConfig, appLogoUrl, appName } = pageProps;
    const [orchestratorLoadedConfig, setOrchestratorLoadedConfig] =
        useState<OrchestratorConfig | null>(null);
    // Resolved server-side (per deployment) and kept once set, mirroring the config above.
    // getInitialProps re-runs on client-side navigation where env vars are unavailable, so
    // these would otherwise revert to null when the user clicks a menu item.
    const [logoUrl, setLogoUrl] = useState<string | undefined>(undefined);
    const [name, setName] = useState<string | undefined>(undefined);
    const [colorMode, setColorMode] = useState<EuiThemeColorMode>(
        ColorModes.LIGHT,
    );

    useEffect(() => {
        if (
            orchestratorConfig &&
            !_.isEqual(orchestratorConfig, emptyOrchestratorConfig)
        ) {
            setOrchestratorLoadedConfig(orchestratorConfig);
        }
    }, [orchestratorConfig]);

    useEffect(() => {
        if (appLogoUrl) {
            setLogoUrl(appLogoUrl);
        }
    }, [appLogoUrl]);

    useEffect(() => {
        if (appName) {
            setName(appName);
        }
    }, [appName]);

    const addMenuItems = (
        defaultMenuItems: EuiSideNavItemType<object>[],
    ): EuiSideNavItemType<object>[] => [
        ...defaultMenuItems,
        {
            name: 'Search',
            id: '20',
            isSelected: router.pathname === '/search',
            href: '/search',
            renderItem: () => (
                <WfoMenuItemLink
                    path={'/search'}
                    translationString="Search"
                    isSelected={router.pathname === '/search'}
                />
            ),
        },
    ];

    const errorMonitoringHandler: WfoErrorMonitoring | undefined = {
        reportError: (error) => console.error(error),
        reportMessage: () => {},
    };

    if (!orchestratorLoadedConfig) return <WfoLogoSpinner />;

    return (
        <WfoErrorBoundary>
            <OrchestratorConfigProvider
                initialOrchestratorConfig={orchestratorLoadedConfig}
            >
                <StoreProvider
                    initialOrchestratorConfig={orchestratorLoadedConfig}
                >
                    <SessionProvider session={pageProps.session}>
                        <WfoErrorMonitoringProvider
                            errorMonitoringHandler={errorMonitoringHandler}
                        >
                            <WfoAuth>
                                <EuiProvider
                                    colorMode={colorMode}
                                    modify={wfoThemeModifications}
                                >
                                    <TranslationsProvider>
                                        <Head>
                                            <link
                                                rel="icon"
                                                href="/favicon.png"
                                            />
                                            <title>
                                                {name || 'NSI Orchestrator'}
                                            </title>
                                        </Head>
                                        <main className="app">
                                            <ConfirmationDialogContextWrapper>
                                                <WfoPageTemplate
                                                    getAppLogo={() =>
                                                        getAppLogo(
                                                            logoUrl,
                                                            name,
                                                        )
                                                    }
                                                    overrideMenuItems={
                                                        addMenuItems
                                                    }
                                                    colorMode={colorMode}
                                                    setColorMode={setColorMode}
                                                >
                                                    <QueryParamProvider
                                                        adapter={NextAdapter}
                                                        options={{
                                                            removeDefaultsFromUrl: false,
                                                            enableBatching: true,
                                                        }}
                                                    >
                                                        <Component
                                                            {...pageProps}
                                                        />
                                                    </QueryParamProvider>
                                                </WfoPageTemplate>
                                                <WfoToastsList />
                                            </ConfirmationDialogContextWrapper>
                                        </main>
                                    </TranslationsProvider>
                                </EuiProvider>
                            </WfoAuth>
                        </WfoErrorMonitoringProvider>
                    </SessionProvider>
                </StoreProvider>
            </OrchestratorConfigProvider>
        </WfoErrorBoundary>
    );
}

CustomApp.getInitialProps = async (context: AppContext) => {
    const isServerside = typeof window === 'undefined';
    const appProps = await App.getInitialProps(context);
    const { APP_LOGO_URL, APP_NAME } = isServerside
        ? getEnvironmentVariables(['APP_LOGO_URL', 'APP_NAME'])
        : { APP_LOGO_URL: null, APP_NAME: null };

    return {
        ...appProps,
        pageProps: {
            ...appProps.pageProps,
            orchestratorConfig: isServerside
                ? getInitialOrchestratorConfig()
                : null,
            appLogoUrl: APP_LOGO_URL ?? null,
            appName: APP_NAME ?? null,
        },
    };
};

export default CustomApp;
