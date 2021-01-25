console.log('Holochrome is disabling the AWS Console force reload dialog');
window.dispatchEvent(new Event('cancel-auth-change-detect'));
