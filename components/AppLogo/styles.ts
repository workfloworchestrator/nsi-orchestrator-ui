import { css } from '@emotion/css';

export const getAppLogoStyles = () => {
    // Holds the optional logo image beside the stacked wordmark text.
    const logoContainerStyle = css({
        display: 'flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    });

    const logoStyle = css({
        display: 'flex',
        flexDirection: 'column',
    });

    const logoImageStyle = css({
        height: 40,
        width: 'auto',
    });

    return { logoContainerStyle, logoStyle, logoImageStyle };
};
