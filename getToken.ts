import { getInstallationAccessToken } from './src/githubAuth.js';

async function main() {
  try {
    const token = await getInstallationAccessToken();
    console.log(token);
  } catch (error) {
    console.error('Failed to get GitHub token:', error);
    process.exit(1);
  }
}

main();
