import { App } from 'octokit';
import dotenv from 'dotenv';

dotenv.config();

const GITHUB_APP_ID = process.env.GITHUB_APP_ID;
const GITHUB_APP_PRIVATE_KEY = process.env.GITHUB_APP_PRIVATE_KEY;
const GITHUB_APP_INSTALLATION_ID = process.env.GITHUB_APP_INSTALLATION_ID;

if (!GITHUB_APP_ID || !GITHUB_APP_PRIVATE_KEY || !GITHUB_APP_INSTALLATION_ID) {
  throw new Error('GitHub App environment variables are not set');
}

const app = new App({
  appId: GITHUB_APP_ID,
  privateKey: GITHUB_APP_PRIVATE_KEY,
});

/**
 * Generates an installation access token for the GitHub App.
 * This token can be used to authenticate on behalf of the installation.
 * @returns {Promise<string>} A promise that resolves to the installation access token.
 */
export async function getInstallationAccessToken(): Promise<string> {
  console.log('GitHub Appのインストールアクセストークン取得処理を開始します');
  try {
    console.log(`GITHUB_APP_ID: ${GITHUB_APP_ID}`);
    console.log(`GITHUB_APP_INSTALLATION_ID: ${GITHUB_APP_INSTALLATION_ID}`);
    const octokit = await app.getInstallationOctokit(Number(GITHUB_APP_INSTALLATION_ID));
    console.log('Octokitインスタンスを取得しました。アクセストークンをリクエストします...');
    const authResult = await octokit.auth({ type: 'installation' }) as { token: string };
    console.log('アクセストークンの取得に成功しました。先頭8文字:', authResult.token.substring(0, 8));
    return authResult.token;
  } catch (error) {
    console.error('インストールアクセストークンの取得中にエラーが発生しました:', error);
    throw error;
  }
}
