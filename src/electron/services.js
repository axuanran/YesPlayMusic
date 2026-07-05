import clc from 'cli-color';
import '../utils/checkAuthToken';
import server from '@neteasecloudmusicapienhanced/api/server';
import generateConfig from '@neteasecloudmusicapienhanced/api/generateConfig';

export const NETEASE_API_PORT = 10754;

export async function startNeteaseMusicApi() {
  // Let user know that the service is starting
  console.log(`${clc.redBright('[NetEase API]')} initiating NCM API`);

  // Generate config (anonymous token, xEAPI key)
  try {
    await generateConfig();
  } catch (error) {
    console.error(
      `${clc.redBright('[NetEase API]')} config generation failed:`,
      error.message
    );
  }

  // Start the NCM API server
  await server.serveNcmApi({
    port: NETEASE_API_PORT,
  });
}
