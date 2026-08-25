export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // eslint-disable-next-line no-console
        console.log(
            `Starting nsi-orchestrator-ui ${process.env.APP_VERSION} using Node ${process.version}`,
        );
    }
}
