import { css } from '@emotion/css';

export const getAppLogoStyles = () => {
    const logoStyle = css({
        display: 'flex',
        flexDirection: 'column',
    });

    const logoImageStyle = css({
        height: 40,
        width: 'auto',
    });

    return { logoStyle, logoImageStyle };
};
