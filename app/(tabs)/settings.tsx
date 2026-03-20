import React, { useEffect, useState } from 'react';
import { Alert, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/ui/text';
import {
  configureGoogleSignIn,
  getCurrentUser,
  getAccessToken,
  signInWithGoogle,
  signOutGoogle,
  type GoogleUser,
} from '@/lib/googleAuth';
import {
  downloadFromDrive,
  exportData,
  getBackupInfo,
  importData,
  uploadToDrive,
} from '@/lib/backup';

// Replace with your actual Web Client ID from Google Cloud Console
const WEB_CLIENT_ID = '245792984579-bsq4di63h6clvuv85bk11e706pp2u5ku.apps.googleusercontent.com';

configureGoogleSignIn(WEB_CLIENT_ID);

export default function Settings() {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [loading, setLoading] = useState<'backup' | 'restore' | null>(null);

  useEffect(() => {
    getCurrentUser().then(setUser);
  }, []);

  async function ensureSignedIn(): Promise<string | null> {
    try {
      if (user) return getAccessToken();
      const result = await signInWithGoogle();
      setUser(result.user);
      return result.accessToken;
    } catch {
      Alert.alert('Sign-in failed', 'Could not sign in with Google.');
      return null;
    }
  }

  async function handleSignIn() {
    try {
      const result = await signInWithGoogle();
      setUser(result.user);
      const info = await getBackupInfo(result.accessToken);
      if (info) setLastBackup(info.modifiedTime);
    } catch (e: any) {
      Alert.alert('Sign-in failed', e?.message ?? JSON.stringify(e));
    }
  }

  async function handleSignOut() {
    await signOutGoogle();
    setUser(null);
    setLastBackup(null);
  }

  async function handleBackup() {
    const token = await ensureSignedIn();
    if (!token) return;
    setLoading('backup');
    try {
      const data = await exportData();
      await uploadToDrive(token, data);
      const info = await getBackupInfo(token);
      if (info) setLastBackup(info.modifiedTime);
      Alert.alert('Backup complete', 'Your data has been saved to Google Drive.');
    } catch (e: any) {
      Alert.alert('Backup failed', e.message);
    } finally {
      setLoading(null);
    }
  }

  async function handleRestore() {
    const token = await ensureSignedIn();
    if (!token) return;

    Alert.alert(
      'Restore from Drive?',
      'This will overwrite all local workout data with your Drive backup. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setLoading('restore');
            try {
              const backup = await downloadFromDrive(token);
              await importData(backup);
              Alert.alert('Restore complete', 'Your data has been restored from Google Drive.');
            } catch (e: any) {
              Alert.alert('Restore failed', e.message);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  }

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: '#09090b' }}
      contentContainerStyle={{ padding: 24 }}>
      <Text style={{ color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 32 }}>
        Settings
      </Text>

      {/* Google Account */}
      <View style={{ marginBottom: 32 }}>
        <Text
          style={{
            color: '#71717a',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 12,
          }}>
          Google Account
        </Text>
        {user ? (
          <View style={{ backgroundColor: '#18181b', borderRadius: 12, padding: 16 }}>
            <Text style={{ color: '#fff', fontWeight: '600', marginBottom: 2 }}>
              {user.name ?? user.email}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 13, marginBottom: 16 }}>{user.email}</Text>
            <TouchableOpacity
              onPress={handleSignOut}
              style={{
                alignSelf: 'flex-start',
                backgroundColor: '#27272a',
                borderRadius: 8,
                paddingHorizontal: 14,
                paddingVertical: 8,
              }}>
              <Text style={{ color: '#f87171', fontWeight: '600', fontSize: 13 }}>Sign out</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            onPress={handleSignIn}
            style={{
              backgroundColor: '#18181b',
              borderRadius: 12,
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
            }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>Sign in with Google</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Backup & Restore */}
      <View>
        <Text
          style={{
            color: '#71717a',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 12,
          }}>
          Google Drive Backup
        </Text>
        <View style={{ backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden' }}>
          <TouchableOpacity
            onPress={handleBackup}
            disabled={loading !== null}
            style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#27272a' }}>
            <Text style={{ color: loading === 'backup' ? '#71717a' : '#fff', fontWeight: '600' }}>
              {loading === 'backup' ? 'Backing up…' : 'Back Up Now'}
            </Text>
            {lastBackup && (
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
                Last backup: {formatDate(lastBackup)}
              </Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleRestore}
            disabled={loading !== null}
            style={{ padding: 16 }}>
            <Text
              style={{ color: loading === 'restore' ? '#71717a' : '#ea580c', fontWeight: '600' }}>
              {loading === 'restore' ? 'Restoring…' : 'Restore from Drive'}
            </Text>
            <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
              Overwrites all local data
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}
