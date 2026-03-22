import React, { useEffect, useState } from 'react';
import { Alert, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { PrefsDAL } from '@/lib/db';
import {
  configureGoogleSignIn,
  getCurrentUser,
  getAccessToken,
  signInWithGoogle,
  signOutGoogle,
  type GoogleUser,
} from '@/lib/googleAuth';
import {
  type BackupEntry,
  downloadFromDriveById,
  exportData,
  getBackupInfo,
  importData,
  listBackups,
  uploadToDrive,
} from '@/lib/backup';
import { clearAllCaches } from '@/lib/queryClient';

// Replace with your actual Web Client ID from Google Cloud Console
const WEB_CLIENT_ID = '245792984579-bsq4di63h6clvuv85bk11e706pp2u5ku.apps.googleusercontent.com';

configureGoogleSignIn(WEB_CLIENT_ID);

export default function Settings() {
  const [user, setUser] = useState<GoogleUser | null>(null);
  const [lastBackup, setLastBackup] = useState<string | null>(null);
  const [backupCount, setBackupCount] = useState<number | null>(null);
  const [loading, setLoading] = useState<'backup' | 'restore' | null>(null);
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerEntries, setPickerEntries] = useState<BackupEntry[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [bodyGender, setBodyGender] = useState<'male' | 'female'>('male');
  const [weightPrefill, setWeightPrefill] = useState<'last_set' | 'first_set'>('last_set');
  const [defaultWeightMode, setDefaultWeightMode] = useState<'total' | 'per_side'>('total');

  useEffect(() => {
    getCurrentUser().then(setUser);
    PrefsDAL.get('bodyGender').then((v) => {
      if (v === 'male' || v === 'female') setBodyGender(v);
    });
    PrefsDAL.get('weightPrefill').then((v) => {
      if (v === 'last_set' || v === 'first_set') setWeightPrefill(v);
    });
    PrefsDAL.get('defaultWeightMode').then((v) => {
      if (v === 'total' || v === 'per_side') setDefaultWeightMode(v);
    });
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
      if (info) {
        setLastBackup(info.modifiedTime);
        setBackupCount(info.count);
      }
    } catch (e: any) {
      Alert.alert('Sign-in failed', e?.message ?? JSON.stringify(e));
    }
  }

  async function handleSignOut() {
    await signOutGoogle();
    setUser(null);
    setLastBackup(null);
    setBackupCount(null);
  }

  async function handleBackup() {
    const token = await ensureSignedIn();
    if (!token) return;

    Alert.alert(
      'Back Up Now?',
      'A new backup will be created on Google Drive. Old backups are kept (up to 10).',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Back Up',
          onPress: async () => {
            setLoading('backup');
            try {
              const data = await exportData();
              await uploadToDrive(token, data);
              const info = await getBackupInfo(token);
              if (info) {
                setLastBackup(info.modifiedTime);
                setBackupCount(info.count);
              }
              Alert.alert('Backup complete', 'Your data has been saved to Google Drive.');
            } catch (e: any) {
              Alert.alert('Backup failed', e.message);
            } finally {
              setLoading(null);
            }
          },
        },
      ]
    );
  }

  async function handleRestore() {
    const token = await ensureSignedIn();
    if (!token) return;

    setPickerLoading(true);
    setPickerVisible(true);
    try {
      const entries = await listBackups(token);
      setPickerEntries(entries);
    } catch (e: any) {
      setPickerVisible(false);
      Alert.alert('Failed to load backups', e.message);
    } finally {
      setPickerLoading(false);
    }
  }

  async function confirmRestore(entry: BackupEntry) {
    setPickerVisible(false);
    const token = await ensureSignedIn();
    if (!token) return;

    Alert.alert(
      'Restore this backup?',
      `${formatDate(entry.createdTime)}\n\nThis will overwrite all local workout data. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: async () => {
            setLoading('restore');
            try {
              const backup = await downloadFromDriveById(token, entry.id);
              await importData(backup);
              clearAllCaches();
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

      {/* Appearance */}
      <View style={{ marginBottom: 32 }}>
        <Text
          style={{
            color: '#71717a',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 12,
          }}>
          Appearance
        </Text>
        <View style={{ backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden' }}>
          <View
            style={{
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <View>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Body figure</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                Shown in the Muscles tab
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#27272a',
                borderRadius: 8,
                padding: 3,
                gap: 3,
              }}>
              {(['male', 'female'] as const).map((g) => (
                <TouchableOpacity
                  key={g}
                  onPress={() => {
                    setBodyGender(g);
                    PrefsDAL.set('bodyGender', g);
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 6,
                    backgroundColor: bodyGender === g ? '#3f3f46' : 'transparent',
                  }}>
                  <Text
                    style={{
                      color: bodyGender === g ? '#fafafa' : '#71717a',
                      fontSize: 13,
                      fontWeight: '600',
                    }}>
                    {g === 'male' ? '♂ Male' : '♀ Female'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Workout */}
      <View style={{ marginBottom: 32 }}>
        <Text
          style={{
            color: '#71717a',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 12,
          }}>
          Workout
        </Text>
        <View style={{ backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ padding: 16, gap: 12 }}>
            <View>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Weight &amp; reps prefill</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                Default values when starting the first set of an exercise
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#27272a',
                borderRadius: 8,
                padding: 3,
                gap: 3,
              }}>
              {(
                [
                  ['last_set', 'Last set'],
                  ['first_set', 'First of last workout'],
                ] as const
              ).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => {
                    setWeightPrefill(val);
                    PrefsDAL.set('weightPrefill', val);
                  }}
                  style={{
                    flex: 1,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 6,
                    alignItems: 'center',
                    backgroundColor: weightPrefill === val ? '#3f3f46' : 'transparent',
                  }}>
                  <Text
                    style={{
                      color: weightPrefill === val ? '#fafafa' : '#71717a',
                      fontSize: 13,
                      fontWeight: '600',
                    }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={{ borderTopWidth: 1, borderTopColor: '#27272a', padding: 16, gap: 12 }}>
            <View>
              <Text style={{ color: '#fff', fontWeight: '600' }}>Default weight mode</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                Per side: enter weight for one side — total is doubled (e.g. dumbbells). Can be
                overridden per exercise.
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                backgroundColor: '#27272a',
                borderRadius: 8,
                padding: 3,
                gap: 3,
              }}>
              {(
                [
                  ['total', 'Total weight'],
                  ['per_side', 'Per side (×2)'],
                ] as const
              ).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => {
                    setDefaultWeightMode(val);
                    PrefsDAL.set('defaultWeightMode', val);
                  }}
                  style={{
                    flex: 1,
                    paddingHorizontal: 12,
                    paddingVertical: 7,
                    borderRadius: 6,
                    alignItems: 'center',
                    backgroundColor: defaultWeightMode === val ? '#3f3f46' : 'transparent',
                  }}>
                  <Text
                    style={{
                      color: defaultWeightMode === val ? '#fafafa' : '#71717a',
                      fontSize: 13,
                      fontWeight: '600',
                    }}>
                    {label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      </View>

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
                {backupCount != null ? ` · ${backupCount}/10 saved` : ''}
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
      {/* Backup picker modal */}
      <Modal
        visible={pickerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerVisible(false)}>
        <View
          style={{
            flex: 1,
            justifyContent: 'flex-end',
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}>
          <View
            style={{
              backgroundColor: '#18181b',
              borderTopLeftRadius: 16,
              borderTopRightRadius: 16,
              maxHeight: '60%',
            }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: 16,
                borderBottomWidth: 1,
                borderBottomColor: '#27272a',
              }}>
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>
                Choose a backup
              </Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={{ color: '#71717a', fontSize: 14 }}>Cancel</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {pickerLoading ? (
                <Text style={{ color: '#71717a', padding: 24, textAlign: 'center' }}>
                  Loading backups…
                </Text>
              ) : pickerEntries.length === 0 ? (
                <Text style={{ color: '#71717a', padding: 24, textAlign: 'center' }}>
                  No backups found.
                </Text>
              ) : (
                pickerEntries.map((entry, i) => (
                  <TouchableOpacity
                    key={entry.id}
                    onPress={() => confirmRestore(entry)}
                    style={{
                      padding: 16,
                      borderBottomWidth: i < pickerEntries.length - 1 ? 1 : 0,
                      borderBottomColor: '#27272a',
                    }}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>
                      {formatDate(entry.createdTime)}
                    </Text>
                    {i === 0 && (
                      <Text style={{ color: '#22c55e', fontSize: 11, marginTop: 2 }}>Latest</Text>
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}
