import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, TouchableOpacity, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTranslation } from 'react-i18next';
import { router } from 'expo-router';
import { PrefsDAL } from '@/lib/db';
import i18n, { type AppLanguage, getDeviceLanguage } from '@/lib/i18n';
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
  const { t } = useTranslation();
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
  const [language, setLanguage] = useState<AppLanguage>('device');

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
    PrefsDAL.get('language').then((v) => {
      if (v === 'device' || v === 'en' || v === 'es' || v === 'fr') setLanguage(v);
    });
  }, []);

  async function ensureSignedIn(): Promise<string | null> {
    try {
      if (user) return getAccessToken();
      const result = await signInWithGoogle();
      setUser(result.user);
      return result.accessToken;
    } catch {
      Alert.alert(t('settings.signInFailed'), t('settings.signInFailedMsg'));
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
      Alert.alert(t('settings.signInFailed'), e?.message ?? JSON.stringify(e));
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
      t('settings.backUpNowTitle'),
      t('settings.backUpNowMsg'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.backUpBtn'),
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
              Alert.alert(t('settings.backupComplete'), t('settings.backupCompleteMsg'));
            } catch (e: any) {
              Alert.alert(t('settings.backupFailed'), e.message);
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
      Alert.alert(t('settings.failedToLoadBackups'), e.message);
    } finally {
      setPickerLoading(false);
    }
  }

  async function confirmRestore(entry: BackupEntry) {
    setPickerVisible(false);
    const token = await ensureSignedIn();
    if (!token) return;

    Alert.alert(
      t('settings.restoreTitle'),
      `${formatDate(entry.createdTime)}\n\nThis will overwrite all local workout data. This cannot be undone.`,
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.restoreBtn'),
          style: 'destructive',
          onPress: async () => {
            setLoading('restore');
            try {
              const backup = await downloadFromDriveById(token, entry.id);
              await importData(backup);
              clearAllCaches();
              Alert.alert(t('settings.restoreComplete'), t('settings.restoreCompleteMsg'));
            } catch (e: any) {
              Alert.alert(t('settings.restoreFailed'), e.message);
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
        {t('settings.heading')}
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
          {t('settings.appearance')}
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
              <Text style={{ color: '#fff', fontWeight: '600' }}>{t('settings.bodyFigure')}</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                {t('settings.bodyFigureDesc')}
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
                    {g === 'male' ? t('settings.male') : t('settings.female')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: '#27272a',
              padding: 16,
              gap: 12,
            }}>
            <View>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{t('settings.language')}</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                {t('settings.languageDesc')}
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
                  ['device', t('settings.languageDevice')],
                  ['en', t('settings.languageEn')],
                  ['es', t('settings.languageEs')],
                  ['fr', t('settings.languageFr')],
                ] as [AppLanguage, string][]
              ).map(([val, label]) => (
                <TouchableOpacity
                  key={val}
                  onPress={() => {
                    setLanguage(val);
                    PrefsDAL.set('language', val);
                    const effective = val === 'device' ? getDeviceLanguage() : val;
                    i18n.changeLanguage(effective);
                  }}
                  style={{
                    flex: 1,
                    paddingHorizontal: 8,
                    paddingVertical: 7,
                    borderRadius: 6,
                    alignItems: 'center',
                    backgroundColor: language === val ? '#3f3f46' : 'transparent',
                  }}>
                  <Text
                    style={{
                      color: language === val ? '#fafafa' : '#71717a',
                      fontSize: 12,
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
          {t('settings.workout')}
        </Text>
        <View style={{ backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ padding: 16, gap: 12 }}>
            <View>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{t('settings.weightRepsPrefill')}</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                {t('settings.weightRepsPrefillDesc')}
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
                  ['last_set', t('settings.lastSet')],
                  ['first_set', t('settings.firstOfLastWorkout')],
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
              <Text style={{ color: '#fff', fontWeight: '600' }}>{t('settings.defaultWeightMode')}</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                {t('settings.defaultWeightModeDesc')}
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
                  ['total', t('settings.totalWeight')],
                  ['per_side', t('settings.perSideX2')],
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

      {/* AI Coaching */}
      <View style={{ marginBottom: 32 }}>
        <Text
          style={{
            color: '#71717a',
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: 1.2,
            marginBottom: 12,
          }}>
          {t('settings.aiCoaching')}
        </Text>
        <View style={{ backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden' }}>
          <TouchableOpacity
            onPress={() => router.push('/ai_export')}
            style={{
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: '#27272a',
            }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{t('settings.exportForAi')}</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                {t('settings.exportForAiDesc')}
              </Text>
            </View>
            <Text style={{ color: '#ea580c', fontWeight: '600', fontSize: 13 }}>{t('common.open')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => router.push('/ai_import')}
            style={{
              padding: 16,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: '#fff', fontWeight: '600' }}>{t('settings.importFromAi')}</Text>
              <Text style={{ color: '#71717a', fontSize: 12, marginTop: 2 }}>
                {t('settings.importFromAiDesc')}
              </Text>
            </View>
            <Text style={{ color: '#ea580c', fontWeight: '600', fontSize: 13 }}>{t('common.open')}</Text>
          </TouchableOpacity>
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
          {t('settings.googleAccount')}
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
              <Text style={{ color: '#f87171', fontWeight: '600', fontSize: 13 }}>{t('common.signOut')}</Text>
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
            <Text style={{ color: '#fff', fontWeight: '600' }}>{t('settings.signInGoogle')}</Text>
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
          {t('settings.googleDriveBackup')}
        </Text>
        <View style={{ backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden' }}>
          <TouchableOpacity
            onPress={handleBackup}
            disabled={loading !== null}
            style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#27272a' }}>
            <Text style={{ color: '#fff', fontWeight: '600' }}>{t('settings.backUpNow')}</Text>
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
            <Text style={{ color: '#ea580c', fontWeight: '600' }}>{t('settings.restoreFromDrive')}</Text>
            <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>
              {t('settings.restoreFromDriveDesc')}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {/* Backup/restore blocking loading modal */}
      <Modal visible={loading !== null} transparent animationType="fade" onRequestClose={() => {}}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', alignItems: 'center', gap: 20 }}>
          <ActivityIndicator size="large" color="#ea580c" />
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
            {loading === 'backup' ? t('settings.backingUp') : t('settings.restoring')}
          </Text>
          <TouchableOpacity
            onPress={() => setLoading(null)}
            style={{ marginTop: 8, paddingHorizontal: 24, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#52525b' }}>
            <Text style={{ color: '#a3a3a3', fontWeight: '600' }}>{t('common.cancel')}</Text>
          </TouchableOpacity>
        </View>
      </Modal>

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
                {t('settings.chooseBackup')}
              </Text>
              <TouchableOpacity onPress={() => setPickerVisible(false)}>
                <Text style={{ color: '#71717a', fontSize: 14 }}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>

            <ScrollView>
              {pickerLoading ? (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <ActivityIndicator color="#ea580c" />
                </View>
              ) : pickerEntries.length === 0 ? (
                <Text style={{ color: '#71717a', padding: 24, textAlign: 'center' }}>
                  {t('settings.noBackups')}
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
                      <Text style={{ color: '#22c55e', fontSize: 11, marginTop: 2 }}>{t('common.latest')}</Text>
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
