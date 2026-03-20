let GoogleSignin: any = null;
let statusCodes: any = {};

try {
  const mod = require('@react-native-google-signin/google-signin');
  GoogleSignin = mod.GoogleSignin;
  statusCodes = mod.statusCodes;
} catch {
  // Native module not available (e.g. Expo Go) — all calls will throw gracefully
}

export function configureGoogleSignIn(webClientId: string) {
  GoogleSignin?.configure({
    webClientId,
    scopes: ['https://www.googleapis.com/auth/drive.file'],
  });
}

export type GoogleUser = {
  email: string;
  name: string | null;
  photo: string | null;
};

export async function signInWithGoogle(): Promise<{ accessToken: string; user: GoogleUser }> {
  if (!GoogleSignin) throw new Error('Google Sign-In is not available in this build.');
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  const tokens = await GoogleSignin.getTokens();
  const userInfo = response.data?.user;
  return {
    accessToken: tokens.accessToken,
    user: {
      email: userInfo?.email ?? '',
      name: userInfo?.name ?? null,
      photo: userInfo?.photo ?? null,
    },
  };
}

export async function getAccessToken(): Promise<string> {
  if (!GoogleSignin) throw new Error('Google Sign-In is not available in this build.');
  const tokens = await GoogleSignin.getTokens();
  return tokens.accessToken;
}

export async function getCurrentUser(): Promise<GoogleUser | null> {
  if (!GoogleSignin) return null;
  const current = GoogleSignin.getCurrentUser();
  if (!current) return null;
  return {
    email: current.user.email,
    name: current.user.name ?? null,
    photo: current.user.photo ?? null,
  };
}

export async function signOutGoogle(): Promise<void> {
  if (!GoogleSignin) throw new Error('Google Sign-In is not available in this build.');
  await GoogleSignin.signOut();
}

export { statusCodes };
